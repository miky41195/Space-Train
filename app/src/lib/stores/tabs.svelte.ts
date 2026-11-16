import type { ArchiveItem, Backend, Comparison, SearchCriteria, Entry, FsError, Progress, SortSpec } from '../ipc';
import { level } from '../archive';
import { samePath } from '../locations';

export interface Tab {
	id: number;
	path: string;
	entries: Entry[];
	sort: SortSpec;
	/** Selected paths, in the order they appear in the list. */
	selection: string[];
	/**
	 * Anchor point for Shift selection: the item the range starts from,
	 * which is not the last one clicked.
	 */
	anchor: string | null;
	/** Search filter applied to the items already loaded. Empty = no filter. */
	query: string;
	history: string[];
	historyIndex: number;
	/** Monotonic counter of the requests issued by this tab. */
	reqSeq: number;
	/** Number of the request whose result is on screen now. */
	lastApplied: number;
	error: FsError | null;
	/** The folder that failed to open, when it is not `path` (the tab stays where it was). */
	failedPath: string | null;
	loading: boolean;
	/**
	 * Results of the search in the subfolders. `null` = no recursive search:
	 * the list shows the folder's contents.
	 */
	results: Entry[] | null;
	searching: boolean;
	/** Search operation in progress, so it can be cancelled. */
	searchOp: number | null;
	/**
	 * Set when `results` holds duplicates: one entry per group, in the
	 * order of the results, plus the comparison progress.
	 */
	duplicates: { groups: Array<{ size: number; count: number }>; progress: Progress } | null;
	/**
	 * Set when `results` holds a folder comparison, in this order: only
	 * here, different (this side's copy), only in `other`.
	 */
	comparison: {
		other: string;
		content: boolean;
		onlyHere: number;
		onlyThere: number;
		different: Comparison['different'];
		/** The comparison is still running: counts are not known yet. */
		running: boolean;
	} | null;
	/** Set when `results` lists the items carrying a colour label: the colour's name. */
	label: string | null;
	/** An archive opened like a folder: its items, and the inner folder shown ('' = root). */
	archive: { file: string; inner: string; items: ArchiveItem[]; vault?: boolean } | null;
	/** «Analizza spazio»: the list is sorted by size with a bar; it stays on while browsing. */
	space: boolean;
}

/** Search ids stay far from the transfer ones. */
let nextSearch = 1_000_000;

const SORT_DEFAULT: SortSpec = { key: 'name', ascending: true };

export class TabsStore {
	tabs = $state<Tab[]>([]);
	activeId = $state<number | null>(null);
	showHidden = $state(false);

	#nextId = 1;

	/**
	 * Navigation commands in a queue, one per tab.
	 *
	 * «Up» and «Back» read the current location and then wait for the disk:
	 * pressed twice in a row, the second started from the old folder and
	 * went up one level only. Queued, each starts from where the previous
	 * one arrived.
	 */
	#queue = new Map<number, Promise<unknown>>();

	#queued<T>(id: number, work: () => Promise<T>): Promise<T> {
		const before = this.#queue.get(id) ?? Promise.resolve();
		const after = before.catch(() => {}).then(work);
		this.#queue.set(id, after);
		return after;
	}

	/**
	 * `sorts` remembers the sort chosen for each folder, as Explorer does.
	 * Without it, the sort stays the tab's whatever the folder.
	 */
	constructor(
		private backend: Backend,
		private sorts?: {
			read(folder: string): SortSpec | undefined;
			write(folder: string, spec: SortSpec): void;
		}
	) {}

	get activeTab(): Tab | undefined {
		return this.tabs.find((t) => t.id === this.activeId);
	}

	async openTab(path: string): Promise<number> {
		const tab: Tab = {
			id: this.#nextId++,
			path,
			entries: [],
			sort: { ...(this.sorts?.read(path) ?? SORT_DEFAULT) },
			selection: [],
			anchor: null,
			query: '',
			history: [path],
			historyIndex: 0,
			reqSeq: 0,
			lastApplied: 0,
			error: null,
			failedPath: null,
			loading: false,
			results: null,
			searching: false,
			searchOp: null,
			duplicates: null,
			comparison: null,
			label: null,
			archive: null,
			space: false
		};
		this.tabs.push(tab);

		// From here on we work on the proxy that lives in the array, not on
		// the raw object: writing to the latter updates the value but emits
		// no signal, and the interface stays on what it read at the start.
		const live = this.tabs[this.tabs.length - 1];

		this.activeId = live.id;
		await this.#load(live, path, { pushHistory: false });
		return live.id;
	}

	closeTab(id: number): void {
		const i = this.tabs.findIndex((t) => t.id === id);
		if (i === -1) return;

		this.tabs.splice(i, 1);

		if (this.activeId !== id) return;
		const neighbour = this.tabs[i - 1] ?? this.tabs[i];
		this.activeId = neighbour ? neighbour.id : null;
	}

	setActive(id: number): void {
		if (this.tabs.some((t) => t.id === id)) this.activeId = id;
	}

	/** Goes to the neighbouring tab, wrapping around like Ctrl+Tab in browsers. */
	activateAdjacent(delta: number): void {
		const n = this.tabs.length;
		if (n === 0) return;
		const i = this.tabs.findIndex((t) => t.id === this.activeId);
		this.activeId = this.tabs[(i + delta + n) % n].id;
	}

	/** Ctrl+1…8 go to the tab in that position; Ctrl+9 always to the last. */
	activateIndex(index: number): void {
		const tab = index >= 8 ? this.tabs[this.tabs.length - 1] : this.tabs[index];
		if (tab) this.activeId = tab.id;
	}

	/**
	 * Outside the queue: going to a given folder does not depend on where
	 * you are, and between two fast clicks the last must win, not the first.
	 */
	async navigate(id: number, path: string): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.#load(tab, path, { pushHistory: true });
	}

	goBack(id: number): Promise<void> {
		return this.#queued(id, async () => {
			const tab = this.#get(id);
			if (!tab || tab.historyIndex === 0) return;
			const target = tab.history[tab.historyIndex - 1];
			const ok = await this.#load(tab, target, { pushHistory: false });
			if (ok) tab.historyIndex -= 1;
		});
	}

	goForward(id: number): Promise<void> {
		return this.#queued(id, async () => {
			const tab = this.#get(id);
			if (!tab || tab.historyIndex >= tab.history.length - 1) return;
			const target = tab.history[tab.historyIndex + 1];
			const ok = await this.#load(tab, target, { pushHistory: false });
			if (ok) tab.historyIndex += 1;
		});
	}

	goUp(id: number): Promise<void> {
		return this.#queued(id, async () => {
			const tab = this.#get(id);
			if (!tab) return;
			try {
				const parent = await this.backend.navigate(tab.path, 'up');
				await this.#load(tab, parent, { pushHistory: true });
			} catch {
				// Already at a root: no parent, no change.
			}
		});
	}

	/**
	 * Reads the current folder again without touching the history.
	 * Needed after an operation that changed the contents on disk.
	 */
	async reload(id: number): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.#load(tab, tab.path, { pushHistory: false });
	}

	/**
	 * Reads again without disturbing: selection, search and results stay.
	 * It is the reload of automatic refresh and of F5, which must not make
	 * the user lose what they were doing.
	 */
	async refresh(id: number): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.#load(tab, tab.path, { pushHistory: false, keep: true });
	}

	/** Refreshes every tab that shows this folder. */
	async refreshFolder(path: string): Promise<void> {
		const affected = this.tabs.filter((t) => samePath(t.path, path) && t.results === null);
		await Promise.all(affected.map((t) => this.refresh(t.id)));
	}

	selectPaths(id: number, paths: string[]): void {
		const tab = this.#get(id);
		if (!tab) return;
		tab.selection = [...paths];
		tab.anchor = paths[paths.length - 1] ?? null;
	}

	/**
	 * Searches the subfolders of the current folder. Results arrive in
	 * batches and are added as they come: a new search cancels the one in
	 * progress.
	 */
	async searchRecursive(id: number, criteria: SearchCriteria): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.stopSearch(id, { keepResults: true });

		const op = nextSearch++;
		tab.searchOp = op;
		tab.results = [];
		tab.duplicates = null;
		tab.comparison = null;
		tab.label = null;
		tab.archive = null;
		tab.searching = true;
		tab.selection = [];
		tab.anchor = null;

		try {
			await this.backend.search({
				opId: op,
				root: tab.path,
				criteria,
				onResults: (batch) => {
					// A late batch of a search already replaced must not mix
					// with the results of the new one.
					if (tab.searchOp === op && tab.results) tab.results = [...tab.results, ...batch];
				}
			});
		} finally {
			if (tab.searchOp === op) {
				tab.searching = false;
				tab.searchOp = null;
			}
		}
	}

	/**
	 * Searches the whole-disk index («Ovunque»): an answer in milliseconds,
	 * so no batches. Returns how many names match in all.
	 */
	async searchIndex(id: number, text: string): Promise<number> {
		const tab = this.#get(id);
		if (!tab) return 0;
		await this.stopSearch(id, { keepResults: true });
		const op = nextSearch++;
		tab.searchOp = op;
		tab.duplicates = null;
		tab.comparison = null;
		tab.label = null;
		tab.archive = null;
		tab.searching = true;
		try {
			const found = await this.backend.indexSearch(text);
			if (tab.searchOp !== op) return 0;
			tab.results = found.entries;
			tab.selection = [];
			tab.anchor = null;
			return found.total;
		} finally {
			if (tab.searchOp === op) {
				tab.searching = false;
				tab.searchOp = null;
			}
		}
	}

	/**
	 * Looks for identical files under the tab's folder. Results replace the
	 * list like a recursive search, grouped by copy set as they are proven.
	 */
	async findDuplicates(id: number, hidden: boolean): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.stopSearch(id, { keepResults: true });

		const op = nextSearch++;
		tab.searchOp = op;
		tab.results = [];
		tab.duplicates = { groups: [], progress: { transferred: 0, total: 0 } };
		tab.comparison = null;
		tab.label = null;
		tab.archive = null;
		tab.searching = true;
		tab.query = '';
		tab.selection = [];
		tab.anchor = null;

		try {
			await this.backend.findDuplicates({
				opId: op,
				root: tab.path,
				hidden,
				onEvent: (e) => {
					if (tab.searchOp !== op || !tab.results || !tab.duplicates) return;
					if (e.kind === 'progress') tab.duplicates.progress = { transferred: e.done, total: e.total };
					else {
						tab.results = [...tab.results, ...e.entries];
						tab.duplicates.groups = [...tab.duplicates.groups, { size: e.size, count: e.entries.length }];
					}
				}
			});
		} finally {
			if (tab.searchOp === op) {
				tab.searching = false;
				tab.searchOp = null;
			}
		}
	}

	/** Turns the space view on or off; on, it leaves any search or special view. */
	async setSpace(id: number, on: boolean): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		if (on) await this.stopSearch(id);
		tab.space = on;
	}

	/** Shows one level of an archive in place of the folder. */
	async showArchive(id: number, file: string, inner: string, items: ArchiveItem[], vault = false): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		if (tab.archive?.file !== file) await this.stopSearch(id);
		tab.archive = { file, inner, items, vault };
		tab.results = level(items, inner, file);
		tab.query = '';
		tab.selection = [];
		tab.anchor = null;
	}

	/** Shows `items` in place of the folder, as a named view (a colour label). */
	async showItems(id: number, items: Entry[], label: string): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.stopSearch(id);
		tab.results = items;
		tab.label = label;
		tab.query = '';
		tab.selection = [];
		tab.anchor = null;
	}

	/** Compares the tab's folder with `other`; the differences replace the list. */
	async compare(id: number, other: string, content: boolean, hidden: boolean): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.stopSearch(id);

		const op = nextSearch++;
		tab.searchOp = op;
		tab.results = [];
		tab.searching = true;
		tab.query = '';
		tab.selection = [];
		tab.anchor = null;
		tab.comparison = { other, content, onlyHere: 0, onlyThere: 0, different: [], running: true };

		try {
			const c = await this.backend.compareFolders({ opId: op, here: tab.path, there: other, content, hidden });
			if (tab.searchOp !== op) return;
			tab.results = [...c.onlyHere, ...c.different.map((d) => d.here), ...c.onlyThere];
			tab.comparison = {
				other,
				content,
				onlyHere: c.onlyHere.length,
				onlyThere: c.onlyThere.length,
				different: c.different,
				running: false
			};
		} catch (e) {
			if (tab.searchOp === op) {
				tab.results = null;
				tab.comparison = null;
				tab.label = null;
				tab.archive = null;
			}
			throw e;
		} finally {
			if (tab.searchOp === op) {
				tab.searching = false;
				tab.searchOp = null;
			}
		}
	}

	/** Stops the search and, unless asked otherwise, goes back to the folder's contents. */
	async stopSearch(id: number, opts: { keepResults?: boolean } = {}): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		const op = tab.searchOp;
		tab.searchOp = null;
		tab.searching = false;
		if (!opts.keepResults) {
			tab.results = null;
			tab.duplicates = null;
			tab.comparison = null;
			tab.label = null;
			tab.archive = null;
		}
		if (op !== null) await this.backend.cancelTransfer(op);
	}

	/** Does not touch the backend: it filters the items already in memory. */
	setQuery(id: number, q: string): void {
		const tab = this.#get(id);
		if (tab) tab.query = q;
	}

	clearQuery(id: number): void {
		this.setQuery(id, '');
	}

	async setSort(id: number, spec: SortSpec): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		tab.sort = spec;
		this.sorts?.write(tab.path, spec);
		await this.#load(tab, tab.path, { pushHistory: false });
	}

	/**
	 * Applies a click on the item `path` within the list `visible`.
	 *
	 * `visible` is the list as the user sees it — already filtered by the
	 * search — because the Shift range must follow what is on screen, not
	 * the tab's internal order.
	 *
	 * - no modifiers: selects that item only
	 * - Ctrl: adds or removes, leaving the rest
	 * - Shift: selects from the anchor to here
	 */
	select(id: number, path: string, visible: readonly Entry[], modifiers: { ctrl?: boolean; shift?: boolean } = {}): void {
		const tab = this.#get(id);
		if (!tab) return;

		if (modifiers.shift && tab.anchor) {
			const from = visible.findIndex((e) => e.path === tab.anchor);
			const to = visible.findIndex((e) => e.path === path);

			if (from !== -1 && to !== -1) {
				const [start, end] = from <= to ? [from, to] : [to, from];
				tab.selection = visible.slice(start, end + 1).map((e) => e.path);
				// The anchor stays where it was: extending twice always starts
				// from the same end, as in any list.
				return;
			}
		}

		if (modifiers.ctrl) {
			tab.selection = tab.selection.includes(path) ? tab.selection.filter((p) => p !== path) : [...tab.selection, path];
			tab.anchor = path;
			return;
		}

		tab.selection = [path];
		tab.anchor = path;
	}

	selectAll(id: number, visible: readonly Entry[]): void {
		const tab = this.#get(id);
		if (!tab) return;
		tab.selection = visible.map((e) => e.path);
		tab.anchor = visible[0]?.path ?? null;
	}

	clearSelection(id: number): void {
		const tab = this.#get(id);
		if (!tab) return;
		tab.selection = [];
		tab.anchor = null;
	}

	/** Shows or hides system files, reloading the folder. */
	async setShowHidden(show: boolean): Promise<void> {
		this.showHidden = show;
		if (this.activeId !== null) await this.reload(this.activeId);
	}

	#get(id: number): Tab | undefined {
		return this.tabs.find((t) => t.id === id);
	}

	/**
	 * The only place where a tab changes contents.
	 *
	 * Each request gets a progressive number. On return, if a more recent
	 * request was applied meanwhile, the result is dropped: without this
	 * check two fast clicks can leave the tab in the wrong folder, with a
	 * bug that cannot be reproduced on demand.
	 *
	 * Returns true when the result was applied.
	 */
	async #load(tab: Tab, path: string, opts: { pushHistory: boolean; keep?: boolean }): Promise<boolean> {
		const req = ++tab.reqSeq;
		tab.loading = true;

		// Entering another folder its remembered sort applies, or the
		// default one if the user never chose one.
		const elsewhere = !samePath(path, tab.path);
		const sort = this.sorts && elsewhere ? (this.sorts.read(path) ?? { ...SORT_DEFAULT }) : tab.sort;

		try {
			const listing = await this.backend.listDir(path, sort, this.showHidden);

			if (req <= tab.lastApplied) return false;
			tab.lastApplied = req;

			tab.path = listing.path;
			tab.entries = listing.entries;
			tab.sort = sort;
			tab.error = null;
			tab.failedPath = null;
			tab.loading = false;

			if (opts.keep) {
				// Only the items that still exist stay selected.
				const present = new Set(listing.entries.map((e) => e.path));
				tab.selection = tab.selection.filter((p) => present.has(p));
				if (tab.anchor && !present.has(tab.anchor)) tab.anchor = null;
				return true;
			}

			tab.selection = [];
			tab.anchor = null;
			// New folder: an old search makes no sense.
			tab.query = '';
			if (tab.searchOp !== null) void this.backend.cancelTransfer(tab.searchOp);
			tab.searchOp = null;
			tab.searching = false;
			tab.results = null;
			tab.duplicates = null;
			tab.comparison = null;
			tab.label = null;
			tab.archive = null;

			if (opts.pushHistory) {
				tab.history = tab.history.slice(0, tab.historyIndex + 1);
				tab.history.push(listing.path);
				tab.historyIndex = tab.history.length - 1;
			}
			return true;
		} catch (e) {
			if (req <= tab.lastApplied) return false;
			tab.lastApplied = req;
			// The current path does not change: the user stays where they are.
			tab.error = e as FsError;
			tab.failedPath = path;
			tab.loading = false;
			return false;
		}
	}
}
