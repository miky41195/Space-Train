<script lang="ts">
	import { t } from '$lib/i18n';
	import { invoke } from '@tauri-apps/api/core';
	import { tick, untrack } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { getCurrentWebview } from '@tauri-apps/api/webview';
	import {
		tauriBackend,
		type Entry,
		type FsError,
		type NewFileType,
		type LanStatus,
		type Peer,
		type SendRequest,
		type FriendsStatus,
		type GitStatus,
		type ServerConfig,
		type Version,
		type VersionsOverview
	} from '$lib/ipc';
	import { TabsStore } from '$lib/stores/tabs.svelte';
	import TitleBar from '$lib/components/TitleBar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import CommandBar from '$lib/components/CommandBar.svelte';
	import RecentBar from '$lib/components/RecentBar.svelte';
	import IncomingFiles from '$lib/components/IncomingFiles.svelte';
	import WhatsNewDialog from '$lib/components/WhatsNew.svelte';
	import FriendsDialog from '$lib/components/Friends.svelte';
	import { WHATS_NEW, whatsNewToShow, type WhatsNew } from '$lib/whats-new';
	import FileList from '$lib/components/FileList.svelte';
	import PassivePane from '$lib/components/PassivePane.svelte';
	import PaneHeader from '$lib/components/PaneHeader.svelte';
	import { followActive, otherPane, type Split } from '$lib/split';
	import { alignPlan, compareZones } from '$lib/comparison';
	import { innerOf, above } from '$lib/archive';
	import { NO_FILTERS, filterCriteria, describeSearch, filtersActive, type Filters } from '$lib/filters';
	import { READY_SEARCHES, SearchesStore, type SavedSearch } from '$lib/stores/searches.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import ConfirmTrash from '$lib/components/ConfirmTrash.svelte';
	import NameDialog from '$lib/components/NameDialog.svelte';
	import { WorkspacesStore, type Snapshot } from '$lib/stores/workspaces.svelte';
	import { MediaStore } from '$lib/stores/media.svelte';
	import { RulesStore } from '$lib/stores/rules.svelte';
	import RulesDialog from '$lib/components/RulesDialog.svelte';
	import DiskCleanup from '$lib/components/DiskCleanup.svelte';
	import FileCompare from '$lib/components/FileCompare.svelte';
	import type { Plan } from '$lib/cleanup';
	import { record, growthText, type Growth, type Measures } from '$lib/growth';
	import { dueReminder, QUIET, type Reminder, type ReminderState, type LastCleanup } from '$lib/disk-reminder';
	import VaultDialog from '$lib/components/VaultDialog.svelte';
	import ServerDialog from '$lib/components/ServerDialog.svelte';
	import { samePath as sameFolder } from '$lib/rules';
	import { sortByMedia, type MediaKey } from '$lib/media';
	import ChecksumDialog from '$lib/components/ChecksumDialog.svelte';
	import ImageConvert from '$lib/components/ImageConvert.svelte';
	import Palette from '$lib/components/Palette.svelte';
	import JobQueue from '$lib/components/JobQueue.svelte';
	import type { Command } from '$lib/palette';
	import { SHORTCUT_GROUPS, type KeyAction } from '$lib/shortcuts';
	import { THEMES } from '$lib/themes';
	import BatchRename from '$lib/components/BatchRename.svelte';
	import { renameSteps, type PlannedRename } from '$lib/batch-rename';
	import ConfirmConflicts from '$lib/components/ConfirmConflicts.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import type { ProgressMode } from '$lib/progress-mode';
	import Rail from '$lib/components/Rail.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Parade from '$lib/components/Parade.svelte';
	import { decode as decodeSprite, railSize } from '$lib/spritesheet';
	import Preview from '$lib/components/Preview.svelte';
	import { ClipboardStore } from '$lib/stores/clipboard.svelte';
	import { IconsStore } from '$lib/stores/icons.svelte';
	import { UpdatesStore, tauriSource, CHECK_INTERVAL } from '$lib/stores/updates.svelte';
	import { FavoritesStore } from '$lib/stores/favorites.svelte';
	import { QuickAccessStore } from '$lib/stores/quickAccess.svelte';
	import { SettingsStore, type Columns } from '$lib/stores/settings.svelte';
	import { UndoStore } from '$lib/stores/undo.svelte';
	import type { Deleted, ImageTarget, DeleteMode, ConflictPolicy, Progress, SortKey } from '$lib/ipc';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import ThemeGallery from '$lib/components/ThemeGallery.svelte';
	import SettingsWindow from '$lib/components/SettingsWindow.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FileGrid from '$lib/components/FileGrid.svelte';
	import Intro from '$lib/components/Intro.svelte';
	import TextEditor from '$lib/components/TextEditor.svelte';
	import TerminalPanel from '$lib/components/TerminalPanel.svelte';
	import Welcome from '$lib/components/Welcome.svelte';
	import { WELCOME_KEY } from '$lib/welcome';
	import { reducedMotion } from '$lib/reduced-motion';
	import { animateFolder, animationsOf } from '$lib/animations';
	import { appearanceOf } from '$lib/appearance';
	import { readMotion } from '$lib/motion';
	import {
		menuItems,
		viewItems,
		workspaceItems,
		sortItems,
		newItems,
		quickAccessItems,
		sidebarItems,
		type SidebarKind,
		columnItems,
		DEFAULT_START_PAGE,
		LAST_FOLDER_START_PAGE,
		type MenuAction,
		type MenuLocation,
		type MenuItem
	} from '$lib/menu';
	import { historyActionFor } from '$lib/mouse';
	import { filterEntries } from '$lib/fuzzy';
	import { layout, duplicateZones, type GroupMode } from '$lib/grouping';
	import { cellSize, zoom, SIDE_MIN, SIDE_MAX, type View } from '$lib/view';
	import { applyTheme, accentColor, folderStyleOf, textScale, themeById, CUSTOM_ACCENT, type AccentId, type PersonalTheme } from '$lib/themes';
	import ThemeEditor from '$lib/components/ThemeEditor.svelte';
	import { EDITOR_EVENT, type EditorMessage } from '$lib/editor-window';
	import { FOLDER_COLORS, ColorsStore, type ColorId } from '$lib/stores/colors.svelte';
	import { actionWithCustom, keysOf } from '$lib/custom-shortcuts';
	import {
		TRASH,
		THIS_PC,
		NETWORK,
		LAN,
		FRIENDS,
		NEW_TAB,
		setFriendNames,
		setServerNames,
		isServer,
		folderOf,
		isArchive,
		isLan,
		isVirtual,
		isInside,
		locationName,
		nameOf,
		formatBytes,
		samePath,
		sameVolume
	} from '$lib/locations';
	import { SYSTEM_ROOT, ON_LINUX } from '$lib/platform';
	import { sentText } from '$lib/server-backup';
	import { protectedFolderOf, versionWhen } from '$lib/versions';
	import VersionsDialog from '$lib/components/VersionsDialog.svelte';

	const settings = new SettingsStore();
	// Like Explorer, every folder remembers how the user sorted it.
	const store = new TabsStore(tauriBackend, {
		read: (folder) => settings.sortFor(folder),
		write: (folder, spec) => settings.rememberSort(folder, spec)
	});
	const favorites = new FavoritesStore();
	const colors = new ColorsStore();
	const workspaces = new WorkspacesStore();
	const media = new MediaStore((paths) => tauriBackend.mediaProps(paths));
	const rules = new RulesStore({
		backend: tauriBackend,
		labelOf: (p) => colors.idOf(p),
		setLabel: (paths, c) => colors.set(paths, c),
		labelName: (id) => colors.nameOf(id)
	});
	/** Folder whose rules are being edited. */
	let rulesOf = $state<string | null>(null);
	const quickAccess = new QuickAccessStore();
	const searches = new SearchesStore();

	/**
	 * Which window this is. «main» is the one opened at startup; the
	 * others are born with Ctrl+N and get the folder to open from Rust.
	 */
	const windowLabel = (() => {
		try {
			return getCurrentWindow().label;
		} catch {
			return 'main';
		}
	})();

	/** Listens to an event only if it is addressed to this window. */
	function onlyHere<T>(name: string, f: (payload: T) => void) {
		return listen<T>(name, (e) => f(e.payload), { target: { kind: 'WebviewWindow', label: windowLabel } });
	}

	async function newWindow(path: string | null) {
		try {
			await tauriBackend.newWindow(path);
		} catch (e) {
			opError = describeError(e);
		}
	}

	/**
	 * The chosen theme, among the built-in ones and those made with the
	 * editor.
	 */
	let activeTheme = $derived(themeById(settings.theme, settings.personalThemes));
	/** The theme the editor is showing live, before saving it. */
	let themePreview = $state<PersonalTheme | null>(null);
	// The editor's preview counts too: the folders change while the user picks a style.
	let folderStyle = $derived(folderStyleOf(themePreview ?? activeTheme));
	let parade = $derived(themePreview?.parade ?? activeTheme.parade);
	let animations = $derived(animationsOf((themePreview ?? activeTheme).animations));
	/**
	 * Extra space above the rail for enlarged characters: the train line is
	 * 40 px tall and sits at the bottom of the header; a taller sprite would
	 * stick out of the window. With normal characters nothing changes.
	 */
	let paradeSpace = $derived(
		Math.max(0, ...(parade ?? []).map((v) => {
			const sheet = decodeSprite(v);
			return sheet ? railSize(sheet).height + 10 - 40 : 0;
		}))
	);
	/** With larger text the rows get taller, so they are not cut off. */
	let rowHeight = $derived(
		Math.round((settings.compact ? 26 : 32) * Math.max(1, textScale(themePreview ?? activeTheme)))
	);
	/** The editor inside the page: only if its own window could not be opened. */
	let editorOpen = $state(false);

	/**
	 * The theme editor in a window of its own, which can also be moved outside
	 * the app. If it does not open (preview in the browser) it stays inside
	 * the page.
	 */
	async function openEditor() {
		try {
			await tauriBackend.openThemeEditor();
		} catch {
			editorOpen = true;
		}
	}

	/** What the editor does, from its window or from inside the page. */
	function fromEditor(m: EditorMessage) {
		if (m.kind === 'preview') {
			themePreview = m.theme;
			return;
		}
		if (m.kind === 'save') {
			settings.saveTheme(m.theme);
			settings.set('theme', m.theme.id);
			notify(t('Tema «{0}» salvato.', [m.theme.name]));
		} else if (m.kind === 'delete') {
			settings.deleteTheme(m.id);
		}
		themePreview = null;
		editorOpen = false;
	}
	let colorPicker = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (themePreview) {
			applyTheme(themePreview, themePreview.variables['--plasma']);
			return;
		}
		applyTheme(activeTheme, accentColor(activeTheme, settings.accent, settings.accentColor));
	});

	/** The colour the user gave a folder, if they gave it one. */
	function itemColor(e: Entry): string | undefined {
		return colors.of(e.path);
	}
	const undo = new UndoStore(tauriBackend);
	const clipboard = new ClipboardStore();
	const icons = new IconsStore(tauriBackend);
	const updates = new UpdatesStore(tauriSource);

	// Only the main window checks: with several windows open there is no
	// need for several downloads of the same update. Not in development:
	// there is no release to compare with.
	$effect(() => {
		if (windowLabel !== 'main' || import.meta.env.DEV) return;
		const first = setTimeout(() => void updates.check(), 5000);
		const cycle = setInterval(() => void updates.check(), CHECK_INTERVAL);
		return () => {
			clearTimeout(first);
			clearInterval(cycle);
		};
	});

	async function installUpdate() {
		try {
			await updates.install();
		} catch (e) {
			notify(e instanceof Error ? e.message : String(e));
		}
	}

	const NONE = new Set<string>();

	// ── Location and content ────────────────────────────────────────

	/**
	 * What kind of location the tab shows: it decides menus and
	 * operations.
	 */
	let location = $derived.by((): MenuLocation => {
		if (store.activeTab?.archive) return 'archive';
		const p = store.activeTab?.path ?? '';
		if (p === TRASH) return 'trash';
		if (p === THIS_PC) return 'pc';
		if (p === NETWORK || /^\\\\[^\\]+\\?$/.test(p)) return 'network';
		if (isServer(p)) return 'server';
		if (isLan(p)) return 'lan';
		return 'normal';
	});

	/** True if the tab shows the results of a search in the subfolders. */
	let inSearch = $derived(store.activeTab?.results != null);
	/** The file whose checksum dialog is open. */
	let checksumOf = $state<Entry | null>(null);
	/** Images waiting in the «Converti e ridimensiona» dialog. */
	let toConvert = $state<Entry[] | null>(null);

	// ── Command palette ──────────────────────────────────────────────
	let paletteOpen = $state(false);
	let knownFolders = $state<Array<{ label: string; path: string }>>([]);

	async function openPalette() {
		paletteOpen = true;
		if (knownFolders.length === 0) knownFolders = await tauriBackend.knownFolders().catch(() => []);
	}

	/** Everything the palette can do, actions first. Built when it opens. */
	function paletteCommands(): Command[] {
		const out: Command[] = [];
		for (const g of SHORTCUT_GROUPS) {
			for (const it of g.items) {
				const a = it.action;
				if (!a || typeof a === 'object' || a === 'palette') continue;
				out.push({ kind: 'action', name: it.label, keys: keysOf(a, settings.shortcuts)[0], run: () => void runKey(a) });
			}
		}
		const here = store.activeTab && location === 'normal' ? store.activeTab.path : null;
		if (here) {
			out.push({ kind: 'action', name: t('Analizza spazio'), detail: locationName(here), run: () => void analyzeSpace(here) });
			out.push({ kind: 'action', name: t('Trova duplicati qui'), detail: locationName(here), run: () => store.activeId !== null && void store.findDuplicates(store.activeId, store.showHidden) });
			out.push({ kind: 'action', name: t('Confronta con un’altra cartella'), run: () => void compareWith(here) });
		}
		const drive = here && /^[a-z]:\\/i.test(here) ? here.slice(0, 3) : SYSTEM_ROOT;
		out.push({ kind: 'action', name: t('Pulizia disco'), detail: drive, run: () => void openCleanup(drive) });
		out.push({ kind: 'action', name: t('Impostazioni'), run: () => (settingsOpen = true) });
		out.push({ kind: 'action', name: t('Editor dei temi'), run: () => void openEditor() });
		out.push({ kind: 'action', name: t('Guida di benvenuto'), run: () => (welcomeOpen = true) });
		const go = (path: string) => () => store.activeId !== null && void store.navigate(store.activeId, path);
		for (const p of quickAccess.folders) out.push({ kind: 'folder', name: nameOf(p), detail: p, run: go(p) });
		for (const f of knownFolders) out.push({ kind: 'folder', name: f.label, detail: f.path, run: go(f.path) });
		for (const r of [...READY_SEARCHES, ...searches.items]) out.push({ kind: 'search', name: r.name, run: () => void openSavedSearch(r) });
		for (const theme of [...THEMES, ...settings.personalThemes]) {
			out.push({ kind: 'theme', name: theme.name, detail: theme.id === settings.theme ? t('in uso') : undefined, run: () => settings.set('theme', theme.id) });
		}
		const toggles: Array<[string, 'extensions' | 'compact' | 'preview' | 'singleClick' | 'confirmTrash' | 'introAnimation']> = [
			[t('Mostra le estensioni dei file'), 'extensions'],
			[t('Vista compatta'), 'compact'],
			[t('Riquadro di anteprima'), 'preview'],
			[t('Apri con un clic'), 'singleClick'],
			[t('Conferma prima del Cestino'), 'confirmTrash'],
			[t('Animazione all’avvio'), 'introAnimation']
		];
		for (const [name, key] of toggles) {
			out.push({ kind: 'setting', name, detail: settings[key] ? 'attivo' : 'spento', run: () => settings.set(key, !settings[key]) });
		}
		out.push({ kind: 'setting', name: t('Mostra i file nascosti'), detail: store.showHidden ? 'attivo' : 'spento', run: () => void store.setShowHidden(!store.showHidden) });
		return out;
	}

	// ── Dual pane ────────────────────────────────────────────────────
	let split = $state<Split | null>(null);
	let lastActive: number | null = null;
	$effect(() => {
		const active = store.activeId;
		const ids = store.tabs.map((t) => t.id);
		const before = untrack(() => split);
		const after = followActive(before, active, lastActive, ids);
		if (after !== before) split = after;
		lastActive = active;
	});
	// ── Workspaces ───────────────────────────────────────────────────
	/** Name dialog for a workspace: saving the open tabs, or renaming the current one. */
	let workspaceName = $state<{ mode: 'new' | 'rename'; error: string | null } | null>(null);
	/** True while tabs are being swapped, so the half-open state is never saved. */
	let switchingWorkspace = false;

	function tabsSnapshot(): Snapshot {
		const ids = store.tabs.map((t) => t.id);
		return {
			tabs: store.tabs.map((t) => t.path),
			active: Math.max(ids.indexOf(store.activeId ?? -1), 0),
			split: split ? [ids.indexOf(split.left), ids.indexOf(split.right)] : null
		};
	}

	// The current area follows the tab bar (main window only, like the session).
	$effect(() => {
		const snapshot = tabsSnapshot();
		if (!started || windowLabel !== 'main' || switchingWorkspace || snapshot.tabs.length === 0) return;
		untrack(() => workspaces.update(snapshot));
	});

	async function openWorkspace(name: string) {
		const area = workspaces.get(name);
		if (!area || workspaces.current === name || switchingWorkspace) return;
		switchingWorkspace = true;
		try {
			const oldIds = store.tabs.map((t) => t.id);
			split = null;
			const ids = await Promise.all(area.tabs.map((p) => store.openTab(p)));
			for (const id of oldIds) store.closeTab(id);
			store.setActive(ids[area.active] ?? ids[0]);
			if (area.split) split = { left: ids[area.split[0]], right: ids[area.split[1]] };
			workspaces.setCurrent(name);
		} finally {
			switchingWorkspace = false;
		}
	}

	function confirmWorkspaceName(name: string) {
		if (!workspaceName) return;
		if (workspaceName.mode === 'new') {
			workspaces.create(name, tabsSnapshot());
			workspaceName = null;
		} else if (workspaces.current !== null) {
			if (workspaces.rename(workspaces.current, name)) workspaceName = null;
			else workspaceName = { mode: 'rename', error: t('Esiste già un\'area «{0}».', [name]) };
		}
	}

	/** The tab shown in the passive half, when the dual pane is open. */
	let otherTab = $derived(store.tabs.find((t) => t.id === otherPane(split, store.activeId)));
	/** The active pane sits on the right when its tab is the split's right one. */
	let activeOnRight = $derived(split !== null && store.activeId === split.right);

	async function toggleSplit() {
		const id = store.activeId;
		if (split || id === null) {
			split = null;
			return;
		}
		const created = await store.openTab(store.activeTab?.path ?? SYSTEM_ROOT);
		store.setActive(id);
		split = { left: id, right: created };
	}

	/** Copies or moves the selection into the folder of the other pane. */
	async function toOther(mode: 'copy' | 'move') {
		const dest = otherTab?.path;
		const sel = store.activeTab?.selection ?? [];
		if (!dest || isVirtual(dest) || sel.length === 0) return;
		await runTransfer([...sel], dest, mode);
	}

	/** Content search found text inside files: rows grow to show the found line. */
	let withSnippets = $derived(store.activeTab?.results?.some((e) => e.snippet) ?? false);

	/** You can create, paste, rename: a real folder, not results. */
	let editable = $derived(location === 'normal' && !inSearch);
	/** Paste, new folder, rename and drop also work on a remote server. */
	let writable = $derived(editable || (location === 'server' && store.activeTab?.path !== '::server' && !inSearch));

	let searchOpen = $state(false);
	let recursiveSearch = $state(false);
	let contentSearch = $state(false);
	/** Smart folder filters of the subfolder search. */
	let filters = $state<Filters>(NO_FILTERS);

	let results = $derived.by(() => {
		const tab = store.activeTab;
		if (!tab) return [];
		// Recursive results are already filtered by Rust: no second fuzzy
		// filter, which would drop the matches in the content.
		if (tab.results) return tab.results.map((item) => ({ item, positions: [] as number[] }));
		return filterEntries(tab.entries, tab.query);
	});
	let filtered = $derived(results.map((r) => r.item));

	// ── Photo, video and music columns ───────────────────────────────
	/** Media columns of the open folder: picked by hand, or chosen from what it holds. */
	let mediaColumns = $derived.by((): MediaKey[] => {
		const tab = store.activeTab;
		if (!tab || location !== 'normal' || tab.results) return [];
		return media.columnsFor(tab.path, tab.entries);
	});
	let viewColumns = $derived({ ...settings.columns, media: mediaColumns });
	/** Sorting by a media column, per tab; a click on another column ends it. */
	let mediaSorts = $state<Record<number, { key: MediaKey; ascending: boolean }>>({});
	let mediaSort = $derived.by(() => {
		const o = store.activeId === null ? undefined : mediaSorts[store.activeId];
		return o && mediaColumns.includes(o.key) ? o : null;
	});
	let sorted = $derived(
		mediaSort ? sortByMedia(filtered, mediaSort.key, mediaSort.ascending, (e) => media.of(e)) : filtered
	);

	$effect(() => {
		const tab = store.activeTab;
		if (tab && mediaColumns.length > 0) void media.request(tab.entries);
	});
	// The preview pane shows the details of the selected file too.
	$effect(() => {
		if (settings.preview && previewItem) void media.request([previewItem]);
	});

	// ── Remote servers ───────────────────────────────────────────────
	let savedServers = $state<ServerConfig[]>([]);
	let serverDialog = $state<{
		mode:
			| { kind: 'edit'; server: ServerConfig | null }
			| { kind: 'key'; server: ServerConfig; fingerprint: string; changed: boolean }
			| { kind: 'password'; server: ServerConfig };
		error: string | null;
		busy: boolean;
	} | null>(null);

	async function loadServers() {
		savedServers = await tauriBackend.serverList().catch(() => []);
		setServerNames(Object.fromEntries(savedServers.map((s) => [s.id, s.name])));
	}
	$effect(() => {
		void loadServers();
	});

	const serverOf = (path: string) => savedServers.find((s) => path === `::server\\${s.id}` || path.startsWith(`::server\\${s.id}\\`));

	// A server folder that needs a key confirmation or a password asks for it.
	$effect(() => {
		const tab = store.activeTab;
		const err = tab?.error;
		if (!tab || !err || serverDialog || (err.kind !== 'serverKey' && err.kind !== 'serverPassword')) return;
		const server = untrack(() => serverOf(tab.failedPath ?? tab.path));
		if (!server) return;
		serverDialog =
			err.kind === 'serverKey'
				? { mode: { kind: 'key', server, fingerprint: err.fingerprint, changed: err.changed }, error: null, busy: false }
				: { mode: { kind: 'password', server }, error: null, busy: false };
	});

	async function saveServer(config: ServerConfig, password: string | null) {
		const d = serverDialog;
		if (!d) return;
		serverDialog = { ...d, busy: true, error: null };
		try {
			const saved = await tauriBackend.serverPut(config, password);
			await loadServers();
			serverDialog = null;
			if (store.activeId !== null) await store.navigate(store.activeId, `::server\\${saved.id}`);
		} catch (err) {
			serverDialog = { ...d, busy: false, error: describeError(err) };
		}
	}

	/** Opens again the server folder that asked for a key or a password. */
	async function retryServer() {
		const tab = store.activeTab;
		if (!tab || store.activeId === null) return;
		if (tab.failedPath) await store.navigate(store.activeId, tab.failedPath);
		else await reload();
	}

	/** Saves the server and runs its backup now, on the transfer bar. */
	async function backUpServerNow(config: ServerConfig, password: string | null) {
		const d = serverDialog;
		if (!d) return;
		serverDialog = { ...d, busy: true, error: null };
		let saved: ServerConfig;
		try {
			saved = await tauriBackend.serverPut(config, password);
		} catch (err) {
			serverDialog = { ...d, busy: false, error: describeError(err) };
			return;
		}
		serverDialog = null;
		await loadServers();
		void enqueue(t('Backup su {0}', [saved.name]), async () => {
			const opId = nextOpId++;
			runningMode = 'backup';
			runningOp = opId;
			progress = { transferred: 0, total: 0 };
			try {
				const sent = await tauriBackend.serverBackup(opId, saved.id, (p) => (progress = p));
				notify(t('Backup su «{0}»: {1}.', [saved.name, sentText(sent)]));
			} catch (e) {
				opError = describeError(e);
			} finally {
				runningOp = null;
				progress = null;
				await loadServers();
			}
		});
	}

	async function removeServer(id: string) {
		await tauriBackend.serverRemove(id).catch((err) => (opError = describeError(err)));
		serverDialog = null;
		await loadServers();
		for (const t of store.tabs) if (t.path === `::server\\${id}` || t.path.startsWith(`::server\\${id}\\`)) await store.navigate(t.id, THIS_PC);
	}

	async function confirmServerKey() {
		const d = serverDialog;
		if (d?.mode.kind !== 'key') return;
		await tauriBackend.serverTrust(d.mode.server.id, d.mode.fingerprint);
		serverDialog = null;
		await loadServers();
		await retryServer();
	}

	async function submitServerPassword(password: string, remember: boolean) {
		const d = serverDialog;
		if (d?.mode.kind !== 'password') return;
		serverDialog = { ...d, busy: true, error: null };
		try {
			await tauriBackend.serverPassword(d.mode.server.id, password, remember);
			await tauriBackend.serverTest(d.mode.server.id);
			serverDialog = null;
			await retryServer();
		} catch (err) {
			const e = err as FsError;
			serverDialog = { ...d, busy: false, error: e?.kind === 'serverPassword' ? t('Password sbagliata.') : describeError(err) };
		}
	}

	// ── Vaults ───────────────────────────────────────────────────────
	let vaultDialog = $state<{
		mode: 'unlock' | 'create' | 'add';
		path: string;
		sources?: string[];
		error: string | null;
		busy: boolean;
	} | null>(null);
	/** Vaults deleting items: the confirmation shows them. */
	let vaultToDelete = $state<Entry[] | null>(null);
	/** Open vaults (lowercase path) → when they lock themselves. */
	let deadlines = $state<Record<string, number>>({});
	let now = $state(Date.now());

	const isVault = (e: Entry) => e.kind === 'dir' && /\.cassaforte$/i.test(e.name);

	/** Every use of a vault pushes its lock time back. */
	function touch(path: string) {
		deadlines = { ...deadlines, [path.toLowerCase()]: Date.now() + settings.vaultAutoLock * 60_000 };
		now = Date.now();
	}

	$effect(() => {
		if (Object.keys(deadlines).length === 0) return;
		const timer = setInterval(() => {
			now = Date.now();
			for (const [k, t] of Object.entries(deadlines)) if (t <= now) void lockVault(k);
		}, 1000);
		return () => clearInterval(timer);
	});

	let lockInHere = $derived.by(() => {
		const arc = store.activeTab?.archive;
		const t = arc?.vault ? deadlines[arc.file.toLowerCase()] : undefined;
		if (t === undefined) return null;
		const s = Math.max(0, Math.ceil((t - now) / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	});

	async function showVault(path: string, inner = '') {
		const id = store.activeId;
		if (id === null) return;
		const items = await tauriBackend.vaultList(path);
		touch(path);
		await store.showArchive(id, path, inner, items, true);
	}

	async function openVault(path: string) {
		try {
			if (await tauriBackend.vaultIsOpen(path)) await showVault(path);
			else vaultDialog = { mode: 'unlock', path, error: null, busy: false };
		} catch (err) {
			opError = describeError(err);
		}
	}

	async function unlockVault(password: string) {
		const d = vaultDialog;
		if (!d) return;
		vaultDialog = { ...d, busy: true, error: null };
		try {
			await tauriBackend.vaultUnlock(d.path, password);
			vaultDialog = null;
			await showVault(d.path);
		} catch (err) {
			vaultDialog = { ...d, busy: false, error: describeError(err) };
		}
	}

	async function createVault(name: string, password: string) {
		const d = vaultDialog;
		if (!d) return;
		vaultDialog = { ...d, busy: true, error: null };
		try {
			const path = await tauriBackend.vaultCreate(d.path, name, password);
			vaultDialog = null;
			await store.refreshFolder(d.path);
			await showVault(path);
		} catch (err) {
			vaultDialog = { ...d, busy: false, error: describeError(err) };
		}
	}

	/** Locks a vault: the key is forgotten and every tab showing it goes back to its folder. */
	async function lockVault(path: string) {
		const key = path.toLowerCase();
		const { [key]: _, ...rest } = deadlines;
		deadlines = rest;
		await tauriBackend.vaultLock(path).catch(() => {});
		for (const t of store.tabs) {
			if (t.archive?.vault && t.archive.file.toLowerCase() === key) await store.stopSearch(t.id);
		}
	}

	function addToVault(paths: string[]) {
		const arc = store.activeTab?.archive;
		if (!arc?.vault || paths.length === 0) return;
		if (paths.some((p) => isLan(p))) {
			opError = t('Prima scarica i file dall’altro PC, poi mettili nella cassaforte.');
			return;
		}
		vaultDialog = { mode: 'add', path: arc.file, sources: paths, error: null, busy: false };
	}

	async function confirmAdd(trashOriginals: boolean) {
		const d = vaultDialog;
		const arc = store.activeTab?.archive;
		if (!d?.sources || !arc?.vault) return;
		vaultDialog = { ...d, busy: true, error: null };
		try {
			await tauriBackend.vaultAdd(d.path, d.sources, arc.inner);
			vaultDialog = null;
			if (trashOriginals) {
				await tauriBackend.moveToTrash(d.sources);
				undo.record({ kind: 'trash', originals: d.sources });
			}
			await showVault(d.path, arc.inner);
		} catch (err) {
			vaultDialog = { ...d, busy: false, error: describeError(err) };
		}
	}

	async function pasteIntoVault() {
		const content = await toPaste();
		if (content) addToVault(content.paths);
	}

	function askDeleteFromVault() {
		const choices = selectedEntries();
		if (choices.length > 0) vaultToDelete = choices;
	}

	async function deleteFromVault() {
		const items = vaultToDelete;
		const arc = store.activeTab?.archive;
		vaultToDelete = null;
		if (!items || !arc?.vault) return;
		try {
			await tauriBackend.vaultDelete(arc.file, items.map((e) => innerOf(e.path)));
			await showVault(arc.file, arc.inner);
		} catch (err) {
			opError = describeError(err);
		}
	}

	// ── Automatic rules ──────────────────────────────────────────────
	// The main window looks at the folders with rules every 30 s; the others
	// would only do the same work twice.
	$effect(() => {
		if (!started || windowLabel !== 'main') return;
		void rules.tick();
		const timer = setInterval(() => void rules.tick(), 30_000);
		return () => clearInterval(timer);
	});

	async function undoRule(id: number) {
		try {
			await rules.undo(id);
		} catch (err) {
			opError = describeError(err);
		}
	}

	// ── Git ──────────────────────────────────────────────────────────
	/** Git status of the open folder, asked again whenever its items change. */
	let gitState = $state<{ path: string; status: GitStatus } | null>(null);
	let gitRequest = 0;
	$effect(() => {
		const tab = store.activeTab;
		const path = tab?.path;
		void tab?.entries;
		const n = ++gitRequest;
		if (!path || !settings.git || location !== 'normal') {
			gitState = null;
			return;
		}
		tauriBackend
			.gitStatus(path)
			.catch(() => null)
			.then((status) => {
				if (n === gitRequest) gitState = status ? { path, status } : null;
			});
	});
	let gitHere = $derived(
		gitState && store.activeTab && samePath(gitState.path, store.activeTab.path) && !store.activeTab.results
			? gitState.status
			: null
	);

	function sortByMediaKey(key: MediaKey) {
		const id = store.activeId;
		if (id === null) return;
		const now = mediaSort;
		// Dates and sizes start newest/largest first, names A to Z.
		const ascending = now?.key === key ? !now.ascending : key === 'artist' || key === 'album' || key === 'camera';
		mediaSorts = { ...mediaSorts, [id]: { key, ascending } };
	}

	function toggleMediaColumn(key: MediaKey) {
		const tab = store.activeTab;
		if (tab) media.toggle(tab.path, key, tab.entries);
	}

	/**
	 * Favourites on top and the groups chosen in the View menu. With an
	 * active filter the split is suspended: there the score counts, and
	 * the best match must stay first even if it is not a favourite.
	 */
	let laidOut = $derived.by(() => {
		const tab = store.activeTab;
		if (tab?.duplicates && tab.query === '') return { items: filtered, zones: duplicateZones(tab.duplicates.groups) };
		if (tab?.comparison && tab.query === '') return { items: filtered, zones: compareZones(tab.comparison) };
		if (tab?.space && !tab.results && location === 'normal') {
			const key = byGrowth
				? (e: Entry) => growths[e.path]?.delta ?? Number.NEGATIVE_INFINITY
				: itemSize;
			return { items: [...filtered].sort((a, b) => key(b) - key(a)), zones: [] };
		}
		if (!tab || tab.query !== '' || tab.results) return { items: filtered, zones: [] };
		const prefs = location === 'normal' ? favorites.of(tab.path) : NONE;
		// Recent items apply where the items have a real date: not in This
		// PC or in the Network, where the date says nothing.
		const recentSince =
			settings.recent && (location === 'normal' || location === 'trash')
				? Date.now() - settings.recentDays * 24 * 60 * 60 * 1000
				: null;
		return layout(sorted, prefs, settings.grouping, Date.now(), recentSince);
	});
	let visibleItems = $derived(laidOut.items);

	// ── Folder size ──
	//
	// One folder at a time is weighed, in the background. Changing folder
	// starts a new round: the backend stops the computations of the old round.
	let sizes = $state<Record<string, number | 'computing'>>({});
	let sizeRound = 0;
	let sizedFolder: string | undefined;

	function newSizeRound() {
		sizeRound++;
		sizes = {};
		void tauriBackend.sizeTurn(sizeRound).catch(() => {});
	}

	// ── Space view ───────────────────────────────────────────────────
	let inSpace = $derived(!!store.activeTab?.space && !store.activeTab.results && location === 'normal');
	/** Size used by the space view: folders once weighed (-1 while unknown), files as they are. */
	function itemSize(e: Entry): number {
		if (e.kind !== 'dir') return e.size;
		const d = sizes[e.path];
		return typeof d === 'number' ? d : -1;
	}
	let maxSpace = $derived(inSpace ? Math.max(1, ...visibleItems.map(itemSize)) : 1);
	let totalSpace = $derived(inSpace ? visibleItems.reduce((n, e) => n + Math.max(0, itemSize(e)), 0) : 0);
	let spaceComputing = $derived(inSpace ? visibleItems.filter((e) => sizes[e.path] === 'computing').length : 0);
	function itemShare(e: Entry): number | undefined {
		const p = itemSize(e);
		return p < 0 ? undefined : p / maxSpace;
	}

	async function analyzeSpace(folder: string) {
		const id = store.activeId;
		if (id === null) return;
		if (folder !== store.activeTab?.path) await store.navigate(id, folder);
		await store.setSpace(id, true);
	}

	// ── Disk cleanup ─────────────────────────────────────────────────
	/** Drive root the cleanup view is open on; it takes the list's place. */
	let cleanupOf = $state<string | null>(null);
	let defaultRoots = $state<string[]>([]);
	let projectRoots = $derived(settings.projectFolders ?? defaultRoots);
	// Going to another folder leaves the view.
	$effect(() => {
		if (cleanupOf && store.activeTab && !samePath(store.activeTab.path, cleanupOf)) cleanupOf = null;
	});

	// ── Two-file comparison ──────────────────────────────────────────
	/** Two files shown side by side in place of the list; `folder` = where it was opened. */
	let fileComparison = $state<{ a: Entry; b: Entry; folder: string } | null>(null);
	$effect(() => {
		if (fileComparison && store.activeTab && !samePath(store.activeTab.path, fileComparison.folder)) fileComparison = null;
	});
	// ── Previous versions ────────────────────────────────────────────
	let versionsOverview = $state<VersionsOverview | null>(null);
	/** The file whose versions are shown. */
	let versionsOf = $state<Entry | null>(null);
	const loadVersions = () =>
		tauriBackend
			.versionsOverview()
			.then((o) => (versionsOverview = o))
			.catch(() => {});
	$effect(() => {
		void loadVersions();
	});
	const isProtected = (path: string | null | undefined) => !!path && !!protectedFolderOf(path, versionsOverview?.protected ?? []);

	async function protectVersions(folder: string, on: boolean) {
		try {
			await tauriBackend.versionsProtect(folder, on);
			notify(
				on
					? t('«{0}» protetta: Space Train copia i file e da ora tiene ogni loro modifica.', [nameOf(folder)])
					: t('«{0}» non è più protetta. Le versioni già tenute restano finché scadono.', [nameOf(folder)])
			);
		} catch (e) {
			opError = describeError(e);
		}
		await loadVersions();
	}

	/** A version as a file in a temporary folder, as an entry for opening or comparing. */
	async function versionEntry(file: Entry, v: Version): Promise<Entry | null> {
		try {
			const tmp = await tauriBackend.versionExtract(file.path, v.id);
			const [e] = await tauriBackend.entriesFor([tmp]);
			return e ? { ...e, name: t('{0} ({1})', [file.name, versionWhen(v.at)]), modified: v.modified ?? v.at } : null;
		} catch (err) {
			opError = describeError(err);
			return null;
		}
	}

	async function openVersion(file: Entry, v: Version) {
		const e = await versionEntry(file, v);
		if (e) await tauriBackend.openEntry(e.path).catch((err) => (opError = describeError(err)));
	}

	async function compareVersion(file: Entry, v: Version) {
		const e = await versionEntry(file, v);
		if (!e) return;
		versionsOf = null;
		compareFiles(e, file);
	}

	function compareFiles(a: Entry, b: Entry) {
		// The older one on the left, as «before» and «after»; same date: the shorter name (the original, not «(copia)»).
		const [x, y] = [a, b].sort((p, q) => (p.modified ?? 0) - (q.modified ?? 0) || p.name.length - q.name.length);
		if (store.activeTab) fileComparison = { a: x, b: y, folder: store.activeTab.path };
	}

	// ── Quick text editing, integrated terminal ──────────────────────
	/** The text file open in the editor, over the app. */
	let editing = $state<{ path: string; name: string } | null>(null);
	/** Where the integrated terminal was opened; null = closed. */
	let terminalAt = $state<string | null>(null);
	function toggleTerminal(at?: string) {
		if (terminalAt !== null && at === undefined) terminalAt = null;
		else terminalAt = at ?? (store.activeTab && location === 'normal' ? store.activeTab.path : '');
	}

	async function openCleanup(drive: string) {
		const id = store.activeId;
		if (id === null) return;
		if (settings.projectFolders === null && defaultRoots.length === 0) {
			const note = await tauriBackend.knownFolders().catch(() => []);
			defaultRoots = note.filter((k) => k.icon === 'desktop' || k.icon === 'documents').map((k) => k.path);
		}
		if (!samePath(store.activeTab?.path ?? '', drive)) await store.navigate(id, drive);
		cleanupOf = drive;
	}

	// ── Low-disk reminder ──
	const REMINDER_KEY = 'space-train.promemoria-disco';
	const LAST_CLEANUP_KEY = 'space-train.ultima-pulizia';
	/**
	 * Saved JSON keeps the field names it was first written with: renames the
	 * fields of every record, one way when reading and the other when writing.
	 */
	function renameFields<T>(records: Record<string, object>, names: Record<string, string>): T {
		return Object.fromEntries(
			Object.entries(records).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([f, x]) => [names[f] ?? f, x]))])
		) as T;
	}
	const readReminderState = () => renameFields<ReminderState>(readJson(REMINDER_KEY), { visto: 'shown', zitto: 'quietUntil' });
	const writeReminderState = (s: ReminderState) => writeJson(REMINDER_KEY, renameFields(s, { shown: 'visto', quietUntil: 'zitto' }));
	const readLastCleanup = () => renameFields<LastCleanup>(readJson(LAST_CLEANUP_KEY), { byte: 'bytes' });
	function readJson<T>(key: string): T {
		try {
			return JSON.parse(localStorage.getItem(key) ?? '{}') as T;
		} catch {
			return {} as T;
		}
	}
	function writeJson(key: string, value: unknown) {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch {
			// Storage blocked: the reminder may come back sooner, nothing worse.
		}
	}
	let reminder = $state<Reminder | null>(null);
	$effect(() => {
		void drivesRefresh;
		const threshold = settings.diskThreshold;
		if (reminder || threshold === 0) return;
		void tauriBackend
			.drives()
			.then((d) => {
				const p = dueReminder(d, threshold, readReminderState(), readLastCleanup(), Date.now());
				if (!p || reminder) return;
				// Shown counts as reminded: other windows and the next refresh keep quiet today.
				const state = readReminderState();
				const k = p.drive.path.toLowerCase();
				writeReminderState({ ...state, [k]: { ...state[k], shown: Date.now() } });
				reminder = p;
			})
			.catch(() => {});
	});
	function snoozeReminder() {
		if (!reminder) return;
		const state = readReminderState();
		const k = reminder.drive.path.toLowerCase();
		writeReminderState({ ...state, [k]: { ...state[k], quietUntil: Date.now() + QUIET } });
		reminder = null;
	}
	function rememberCleanup(bytes: number) {
		if (!cleanupOf) return;
		const next: LastCleanup = { ...readLastCleanup(), [cleanupOf.toLowerCase()]: { bytes, at: Date.now() } };
		writeJson(LAST_CLEANUP_KEY, renameFields(next, { bytes: 'byte' }));
	}

	/** Free space of the cleanup drive, to tell what was really freed. */
	async function freeOn(drive: string): Promise<number | null> {
		const d = await tauriBackend.drives().catch(() => []);
		return d.find((x) => samePath(x.path, drive))?.free ?? null;
	}

	async function runCleanup(p: Plan) {
		const drive = cleanupOf;
		if (!drive) return;
		opError = null;
		const before = await freeOn(drive);
		const failures: Deleted['failed'] = [];
		if (p.permanent.length > 0) failures.push(...(await deleteWithBar('permanent', p.permanent)).failed);
		if (p.trash.length > 0) {
			const outcome = await deleteWithBar('trash', p.trash);
			if (outcome.done.length > 0) undo.record({ kind: 'trash', originals: outcome.done });
			failures.push(...outcome.failed);
		}
		if (p.emptyTrash) failures.push(...(await deleteWithBar('emptyTrash', [])).failed);
		reportFailed({ done: [], failed: failures });
		if (p.asAdmin.length > 0) await tauriBackend.cleanupRecycleLeftovers(p.asAdmin).catch((e) => (opError = describeError(e)));
		drivesRefresh++;
		const after = await freeOn(drive);
		if (before !== null && after !== null) notify(t('Liberati {0} su {1}.', [formatBytes(Math.max(0, after - before)), locationName(drive)]));
	}

	// ── Folder growth ──
	// Every weighed folder is remembered on this PC; the space view shows the change since an earlier day.
	const MEASURES_KEY = 'space-train.misure';
	let measures: Measures = (() => {
		try {
			return renameFields<Measures>(JSON.parse(localStorage.getItem(MEASURES_KEY) ?? '{}'), { ultima: 'last' });
		} catch {
			return {};
		}
	})();
	let growths = $state<Record<string, Growth>>({});
	let byGrowth = $state(false);
	function saveMeasures() {
		try {
			localStorage.setItem(MEASURES_KEY, JSON.stringify(renameFields(measures, { last: 'ultima' })));
		} catch {
			// Full or blocked storage: growth simply starts over next time.
		}
	}
	let totalGrowth = $derived.by(() => {
		if (!inSpace) return null;
		const seenPaths = visibleItems.map((e) => growths[e.path]).filter((c): c is Growth => !!c);
		if (seenPaths.length === 0) return null;
		return { delta: seenPaths.reduce((n, c) => n + c.delta, 0), since: Math.min(...seenPaths.map((c) => c.since)) };
	});

	async function weigh(folders: string[], turn = sizeRound) {
		let incoming = false;
		for (const c of folders) {
			if (turn !== sizeRound) break;
			if (sizes[c] !== undefined) continue;
			sizes[c] = 'computing';
			const n = await tauriBackend.folderSize(c, turn).catch(() => null);
			if (turn !== sizeRound) break;
			if (n === null) delete sizes[c];
			else {
				sizes[c] = n;
				const r = record(measures, c, n, Date.now());
				measures = r.measures;
				incoming = true;
				if (r.growth) growths[c] = r.growth;
			}
		}
		if (incoming) saveMeasures();
	}

	$effect(() => {
		const mode = settings.folderSizes;
		const path = store.activeTab?.path;
		const space = inSpace;
		const folders =
			location === 'normal' ? visibleItems.filter((e) => e.kind === 'dir').map((e) => e.path) : [];
		untrack(() => {
			if (path !== sizedFolder || (mode === 'never' && !space && Object.keys(sizes).length > 0)) {
				sizedFolder = path;
				newSizeRound();
			}
			// The space view weighs every folder whatever the setting says.
			if (mode === 'open' || space) void weigh(folders.filter((c) => sizes[c] === undefined));
		});
	});
	let highlights = $derived(new Map(results.map((r) => [r.item.path, r.positions])));

	let selection = $derived(store.activeTab?.selection ?? []);
	let selectionSet = $derived(new Set(selection));

	/**
	 * Position of the item acting as the cursor: the last one touched, not
	 * the first one selected. That is where the arrows start again from.
	 */
	let index = $derived(
		selection.length === 0
			? -1
			: visibleItems.findIndex((e) => e.path === selection[selection.length - 1])
	);

	/**
	 * Next to the name: the folder of the search results, the origin in the Recycle
	 * Bin.
	 */
	function itemFolder(e: Entry): string | undefined {
		if (location === 'trash') return e.origin;
		const c = store.activeTab?.comparison;
		if (c && store.activeTab) {
			// Comparison: only the subfolder below the compared folder, which is the same on both sides.
			const root = isInside(e.path, store.activeTab.path) ? store.activeTab.path : c.other;
			const cut = (p: string) => p.replace(/[\\/]+$/, '');
			return cut(folderOf(e.path)).slice(cut(root).length + 1) || undefined;
		}
		if (inSearch) return folderOf(e.path);
		return undefined;
	}

	// With the search open, every keystroke reshuffles the results: the
	// selection follows the first item, so Enter always opens the best match.
	$effect(() => {
		if (!searchOpen || store.activeId === null) return;
		visibleItems;
		if (index === -1 && visibleItems.length > 0) {
			store.select(store.activeId, visibleItems[0].path, visibleItems);
		}
	});

	function moveSelection(delta: number, extend = false) {
		if (store.activeId === null || visibleItems.length === 0) return;
		const current = index === -1 ? 0 : index;
		const next = Math.min(visibleItems.length - 1, Math.max(0, current + delta));
		store.select(store.activeId, visibleItems[next].path, visibleItems, {
			shift: extend
		});
	}

	// ── Search ──────────────────────────────────────────────────────

	function openSearch() {
		if (store.activeId !== null) searchOpen = true;
	}

	function closeSearch() {
		searchOpen = false;
		filters = NO_FILTERS;
		if (store.activeId === null) return;
		store.clearQuery(store.activeId);
		void store.stopSearch(store.activeId);
	}

	/**
	 * In the subfolders the search starts by itself after a short pause in
	 * typing: launching it at every key would redo the walk of the disk
	 * for each letter.
	 */
	$effect(() => {
		const tab = store.activeTab;
		if (!searchOpen || !recursiveSearch || !tab) return;
		const id = tab.id;
		const text = tab.query.trim();
		const content = contentSearch;
		const hidden = store.showHidden;
		const f = filters;

		if (text === '' && !filtersActive(f)) {
			void store.stopSearch(id);
			return;
		}
		const wait = setTimeout(() => {
			void store.searchRecursive(id, { text, content, hidden, ...filterCriteria(f) }).catch((e) => {
				opError = describeError(e);
			});
		}, 350);
		return () => clearTimeout(wait);
	});

	/** Opens a smart folder: its folder (or the one open), subfolder search with its text and filters. */
	async function openSavedSearch(r: SavedSearch) {
		const id = store.activeId;
		if (id === null) return;
		if (r.folder && r.folder !== store.activeTab?.path) await store.navigate(id, r.folder);
		if (store.activeTab && isVirtual(store.activeTab.path)) return;
		searchOpen = true;
		recursiveSearch = true;
		contentSearch = r.content;
		filters = { ...r.filters };
		store.setQuery(id, r.text);
	}

	function saveSearch() {
		const tab = store.activeTab;
		if (!tab) return;
		const text = tab.query.trim();
		searches.save({
			name: t('{0} in {1}', [describeSearch(text, filters), locationName(tab.path)]),
			folder: tab.path,
			text,
			content: contentSearch,
			filters: { ...filters }
		});
		notify(t('Ricerca salvata nella barra laterale.'));
	}

	function toggleRecursive() {
		recursiveSearch = !recursiveSearch;
		if (!recursiveSearch && store.activeId !== null) void store.stopSearch(store.activeId);
	}

	// ── State of the operations ──────────────────────────────────────

	let renaming = $state<string | null>(null);
	let toTrash = $state<Entry[]>([]);
	/** Items in the batch rename dialog; empty when it is closed. */
	let batchRename = $state<Entry[]>([]);
	// Photo and music details for the rename placeholders, even with the media columns hidden.
	$effect(() => {
		if (batchRename.length > 0) void media.request(batchRename);
	});
	/**
	 * Deletion with no way back: from the disk, from the Recycle Bin or by
	 * emptying it.
	 */
	let toDelete = $state<{ items: Entry[]; kind: 'permanent' | 'trash' | 'emptyTrash' | 'server' } | null>(null);
	let opError = $state<string | null>(null);
	/** Informational message that goes away by itself. */
	let notice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	function notify(text: string) {
		notice = text;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 4000);
	}

	/** The selected items, in the order they appear in the list. */
	function selectedEntries(): Entry[] {
		return visibleItems.filter((e) => selectionSet.has(e.path));
	}

	/** The single item that rename, open and preview act on. */
	function selectedEntry(): Entry | null {
		const choices = selectedEntries();
		const cursor = selection[selection.length - 1];
		return choices.find((e) => e.path === cursor) ?? choices[choices.length - 1] ?? null;
	}

	let previewItem = $derived.by(() => {
		selectionSet;
		visibleItems;
		return selectedEntry();
	});

	/** Backend errors arrive as FsError, not as Error. */
	function describeError(e: unknown): string {
		const err = e as FsError;
		if (err?.kind === 'io') return err.message;
		return errorMessage(err ?? null) || t('Operazione non riuscita.');
	}

	/**
	 * The space on the drives must be read again after every operation that
	 * changes it. Other programs change it too (downloads, updates): for
	 * those it is read again when the window comes back to the foreground
	 * and once a minute while it is visible.
	 */
	let drivesRefresh = $state(0);
	$effect(() => {
		const round = setInterval(() => {
			if (document.visibilityState === 'visible') drivesRefresh++;
		}, 60_000);
		return () => clearInterval(round);
	});

	async function reload() {
		if (store.activeId !== null) await store.refresh(store.activeId);
		drivesRefresh++;
	}

	// ── Rename, folders, recycle bin ─────────────────────────────────

	/** Groups found so far and the space their extra copies take. */
	let duplicateSummary = $derived.by(() => {
		const groups = store.activeTab?.duplicates?.groups ?? [];
		return { groups: groups.length, recoverable: groups.reduce((n, g) => n + g.size * (g.count - 1), 0) };
	});

	/** Every copy but the first of each group: the oldest, which Rust puts first. */
	function selectExtraCopies() {
		const tab = store.activeTab;
		if (!tab?.duplicates || !tab.results || store.activeId === null) return;
		const extra: string[] = [];
		let i = 0;
		for (const g of tab.duplicates.groups) {
			extra.push(...tab.results.slice(i + 1, i + g.count).map((e) => e.path));
			i += g.count;
		}
		store.selectPaths(store.activeId, extra);
	}

	// ── Archives opened like folders ─────────────────────────────────
	async function openArchive(file: string) {
		const id = store.activeId;
		if (id === null) return;
		try {
			const items = await tauriBackend.archiveList(file);
			await store.showArchive(id, file, '', items);
		} catch (err) {
			opError = describeError(err);
		}
	}

	/** One level up inside the archive; above its root, back to the folder. */
	function upInArchive(): boolean {
		const tab = store.activeTab;
		if (!tab?.archive || store.activeId === null) return false;
		const up = above(tab.archive.inner);
		if (up === null) void store.stopSearch(store.activeId);
		else void store.showArchive(store.activeId, tab.archive.file, up, tab.archive.items, tab.archive.vault);
		return true;
	}

	/** Extracts the selection (or everything) from the open archive into `dest`. */
	function extractFromArchive(dest: string) {
		const arc = store.activeTab?.archive;
		if (!arc) return;
		const choices = selectedEntries();
		const items = choices.length > 0 ? choices.map((e) => innerOf(e.path)) : (store.activeTab?.results ?? []).map((e) => innerOf(e.path));
		return enqueue(t('Estrai da «{0}» → {1}', [nameOf(arc.file), locationName(dest)]), () => extractFromArchiveNow(arc.file, items, dest));
	}

	async function extractFromArchiveNow(file: string, items: string[], dest: string) {
		const opId = nextOpId++;
		runningMode = 'extract';
		runningOp = opId;
		progress = { transferred: 0, total: 0 };
		opError = null;
		try {
			if (store.activeTab?.archive?.vault && store.activeTab.archive.file === file) {
				await tauriBackend.vaultExtract(file, items, dest);
				touch(file);
			} else await tauriBackend.archiveExtract({ opId, archive: file, items, dest, onProgress: (p) => (progress = p) });
			notify(t('Estratto in {0}.', [dest]));
			void store.refreshFolder(dest);
			drivesRefresh++;
		} catch (err) {
			opError = describeError(err);
		} finally {
			runningOp = null;
			progress = null;
		}
	}

	/** Every item carrying a colour label, wherever it is, in place of the folder. */
	async function showLabel(id: ColorId) {
		const c = FOLDER_COLORS.find((x) => x.id === id);
		if (!c || store.activeId === null) return;
		const items = await tauriBackend.entriesFor(colors.pathsOf(id)).catch(() => []);
		await store.showItems(store.activeId, items, colors.nameOf(id));
	}

	/** Folder comparison: starts it against the other pane, or a folder the user picks. */
	async function compareWith(folder: string) {
		const id = store.activeId;
		if (id === null) return;
		const other =
			otherTab && !isVirtual(otherTab.path)
				? otherTab.path
				: await tauriBackend.pickFolder(t('Confronta con…'), folder);
		if (!other) return;
		// One inside the other, «Allinea» would copy a folder into itself.
		if (isInside(other, folder) || isInside(folder, other)) {
			opError = t('Una cartella sta dentro l’altra: scegli due cartelle separate.');
			return;
		}
		if (folder !== store.activeTab?.path) await store.navigate(id, folder);
		await store.compare(id, other, false, store.showHidden).catch((e) => (opError = describeError(e)));
	}

	/** Copies what is missing or older on one side, then compares again. */
	async function align(direction: 'there' | 'here') {
		const tab = store.activeTab;
		const c = tab?.comparison;
		if (!tab || !c || !tab.results || store.activeId === null) return;
		const id = store.activeId;
		for (const g of alignPlan(c, tab.results, tab.path, direction)) {
			await run('overwrite', { sources: g.sources, dest: g.dest, mode: 'copy' });
		}
		await store.compare(id, c.other, c.content, store.showHidden).catch((e) => (opError = describeError(e)));
	}

	/** Same comparison, reading the files instead of trusting size and date. */
	function compareContent() {
		const c = store.activeTab?.comparison;
		if (!c || store.activeId === null) return;
		void store.compare(store.activeId, c.other, true, store.showHidden).catch((e) => (opError = describeError(e)));
	}

	/** F2, the menu and the command bar: one item renames in place, several open the batch dialog. */
	function startRename() {
		if (!writable) return;
		const choices = selectedEntries();
		if (choices.length > 1) batchRename = choices;
		else {
			const item = selectedEntry();
			if (item) renaming = item.path;
		}
	}

	async function runBatchRename(plan: PlannedRename[]) {
		batchRename = [];
		opError = null;
		const tabPath = store.activeTab?.path;
		// Original path → where it is now; a failure halfway still records what moved.
		const where = new Map(plan.map((p) => [p.item.path, p.item.path]));
		const steps: Array<[string, string]> = [];
		try {
			for (const step of renameSteps(plan)) {
				const arrived = await tauriBackend.renameEntry(step.from, step.to);
				steps.push([step.from, arrived]);
				for (const [origin, now] of where) if (now === step.from) where.set(origin, arrived);
			}
		} catch (e) {
			opError = describeError(e);
		}
		for (const [origin, now] of where) {
			if (origin === now) continue;
			if (tabPath) favorites.rename(tabPath, nameOf(origin), nameOf(now));
			colors.move(origin, now);
			quickAccess.move(origin, now);
		}
		undo.record({ kind: 'batchRename', steps });
		if (store.activeId !== null) {
			await store.reload(store.activeId);
			if (store.activeTab) store.activeTab.selection = [...where.values()];
		}
	}

	async function confirmRename(item: Entry, newName: string) {
		renaming = null;
		opError = null;
		try {
			const created = await tauriBackend.renameEntry(item.path, newName);
			if (store.activeTab) favorites.rename(store.activeTab.path, item.name, newName);
			colors.move(item.path, created);
			quickAccess.move(item.path, created);
			undo.record({ kind: 'rename', from: item.path, to: created });
			if (store.activeId !== null) {
				await store.reload(store.activeId);
				if (store.activeTab) store.activeTab.selection = [created];
			}
		} catch (e) {
			opError = describeError(e);
		}
	}

	/**
	 * Creates "Nuova cartella", numbering it if the name is taken. The
	 * numbering lives here because it concerns the name, not the path:
	 * building the path stays in Rust.
	 */
	async function newFolder() {
		if (!store.activeTab || store.activeId === null || !writable) return;
		opError = null;

		const parent = store.activeTab.path;

		for (let n = 1; n <= 100; n++) {
			const name = n === 1 ? t('Nuova cartella') : t('Nuova cartella ({0})', [n]);
			try {
				const createdFolder = await tauriBackend.createFolder(parent, name);
				undo.record({ kind: 'create', paths: [createdFolder], description: t('creazione di «{0}»', [name]) });
				await store.reload(store.activeId);
				if (store.activeTab) store.activeTab.selection = [createdFolder];
				renaming = createdFolder;
				return;
			} catch (e) {
				const err = e as FsError;
				// Name taken: try the next one. Any other error
				// (permissions, disk full) must be shown right away.
				if (err?.kind === 'io' && err.message.includes('Esiste già')) continue;
				opError = describeError(e);
				return;
			}
		}

		opError = t('Troppe cartelle con lo stesso nome.');
	}

	/** The types of the «Nuovo» menu: Windows is asked for them only once. */
	let newFileTypes = $state<NewFileType[]>([]);
	$effect(() => {
		tauriBackend
			.newFileTypes()
			.then((t) => (newFileTypes = t))
			.catch(() => {});
	});

	/**
	 * Creates a new file the way Explorer does: with the name of the type,
	 * numbered if taken, and immediately ready to be renamed.
	 */
	async function newFile(ext: string) {
		if (!store.activeTab || store.activeId === null || !editable) return;
		opError = null;
		try {
			const createdFile = await tauriBackend.createNewFile(store.activeTab.path, ext);
			undo.record({ kind: 'create', paths: [createdFile], description: t('creazione di «{0}»', [nameOf(createdFile)]) });
			await store.reload(store.activeId);
			store.selectPaths(store.activeId, [createdFile]);
			renaming = createdFile;
		} catch (e) {
			opError = describeError(e);
		}
	}

	function askTrash() {
		const choices = selectedEntries();
		if (choices.length === 0) return;
		// In the Recycle Bin «delete» can only be permanent.
		if (location === 'trash') toDelete = { items: choices, kind: 'trash' };
		else if (location === 'server' && writable) toDelete = { items: choices, kind: 'server' };
		else if (location === 'normal') {
			// Without confirmation, if the user turned it off: the recycle bin is still a possible
			// second thought.
			if (settings.confirmTrash) toTrash = choices;
			else void trash(choices);
		}
	}

	function askDeletePermanently() {
		const choices = selectedEntries();
		if (choices.length === 0) return;
		if (location === 'trash') toDelete = { items: choices, kind: 'trash' };
		else if (location === 'server' && writable) toDelete = { items: choices, kind: 'server' };
		else if (location === 'normal') toDelete = { items: choices, kind: 'permanent' };
	}

	/**
	 * Deletes with the same progress bar as transfers, counted in items.
	 * With a transfer already on the bar, the deletion runs without showing
	 * it. Returns the paths actually removed: the user can stop halfway.
	 */
	async function deleteWithBar(mode: DeleteMode, paths: string[]): Promise<Deleted> {
		const opId = nextOpId++;
		const show = runningOp === null;
		if (show) {
			runningMode = mode === 'trash' ? 'trash' : 'delete';
			runningOp = opId;
			progress = { transferred: 0, total: 0 };
		}
		try {
			return await tauriBackend.deleteItems({
				opId,
				mode,
				paths,
				onProgress: (p) => {
					if (show) progress = p;
				}
			});
		} finally {
			if (show) {
				runningOp = null;
				progress = null;
			}
		}
	}

	/** Items the deletion had to leave: named, with the reason, the rest went. */
	function reportFailed(outcome: Deleted) {
		if (outcome.failed.length === 0) return;
		const rows = outcome.failed.slice(0, 3).map((f) => t('«{0}»: {1}', [nameOf(f.path), describeError(f.error)]));
		const others = outcome.failed.length - rows.length;
		const title = outcome.failed.length === 1 ? t('1 elemento non eliminato') : t('{0} elementi non eliminati', [outcome.failed.length]);
		opError = t('{0} (gli altri sì). {1}{2}', [title, rows.join(' · '), others > 0 ? t(' e altri {0}', [others]) : '']);
	}

	async function trash(items = toTrash) {
		toTrash = [];
		opError = null;
		try {
			const outcome = await deleteWithBar('trash', items.map((v) => v.path));
			if (outcome.done.length > 0) undo.record({ kind: 'trash', originals: outcome.done });
			reportFailed(outcome);
			await reload();
		} catch (e) {
			opError = describeError(e);
			await reload();
		}
	}

	async function deletePermanently() {
		const request = toDelete;
		toDelete = null;
		if (!request) return;
		opError = null;
		try {
			const paths = request.items.map((v) => v.path);
			if (request.kind === 'server') {
				await tauriBackend.deletePermanently(paths);
				await reload();
				return;
			}
			const mode: DeleteMode =
				request.kind === 'permanent' ? 'permanent' : request.kind === 'trash' ? 'fromTrash' : 'emptyTrash';
			reportFailed(await deleteWithBar(mode, mode === 'emptyTrash' ? [] : paths));
			await reload();
		} catch (e) {
			opError = describeError(e);
			await reload();
		}
	}

	async function restore() {
		const choices = selectedEntries();
		if (choices.length === 0) return;
		try {
			await tauriBackend.trashRestore(choices.map((e) => e.path));
			notify(choices.length === 1 ? t('«{0}» ripristinato.', [choices[0].name]) : t('{0} elementi ripristinati.', [choices.length]));
			await reload();
		} catch (e) {
			opError = describeError(e);
		}
	}

	async function undoLast() {
		opError = null;
		try {
			const undone = await undo.undo();
			if (undone) {
				notify(t('Annullata: {0}.', [undone]));
				await reload();
			}
		} catch (e) {
			opError = describeError(e);
			await reload();
		}
	}

	// ── Clipboard and transfers ──────────────────────────────────────

	let progress = $state<Progress | null>(null);
	let runningMode = $state<ProgressMode>('copy');
	let runningOp = $state<number | null>(null);

	// ── Transfer queue ───────────────────────────────────────────────
	// Copies, moves, archives and LAN transfers run one at a time: a new one
	// waits its turn instead of fighting the running one for the bar.
	interface Job {
		id: number;
		title: string;
		start: () => Promise<unknown>;
		finished: (v: unknown) => void;
	}
	let queue = $state<Job[]>([]);
	let currentJob = $state<{ id: number; title: string } | null>(null);
	let queueOpen = $state(false);
	let paused = $state(false);
	let nextJobId = 1;
	let draining = false;

	/** Puts a job in the queue; resolves with its result when it has run. */
	function enqueue<T>(title: string, start: () => Promise<T>): Promise<T | undefined> {
		return new Promise((finished) => {
			queue = [...queue, { id: nextJobId++, title, start, finished: finished as (v: unknown) => void }];
			void drainQueue();
		});
	}

	async function drainQueue() {
		if (draining) return;
		draining = true;
		try {
			while (queue.length > 0) {
				const [job, ...rest] = queue;
				queue = rest;
				currentJob = { id: job.id, title: job.title };
				paused = false;
				let outcome: unknown;
				try {
					outcome = await job.start();
				} catch (e) {
					opError = describeError(e);
				}
				job.finished(outcome);
			}
		} finally {
			currentJob = null;
			queueOpen = false;
			draining = false;
		}
	}

	function removeFromQueue(id: number) {
		const l = queue.find((x) => x.id === id);
		queue = queue.filter((x) => x.id !== id);
		l?.finished(undefined);
	}

	function upInQueue(id: number) {
		const i = queue.findIndex((x) => x.id === id);
		if (i <= 0) return;
		const c = [...queue];
		[c[i - 1], c[i]] = [c[i], c[i - 1]];
		queue = c;
	}

	async function togglePause() {
		if (runningOp === null) return;
		const created = !paused;
		if (await tauriBackend.pauseTransfer(runningOp, created).catch(() => false)) paused = created;
	}

	function count(paths: readonly string[]): string {
		return paths.length === 1 ? t('«{0}»', [nameOf(paths[0])]) : t('{0} elementi', [paths.length]);
	}
	/** Transfer waiting for the user to resolve the name conflicts. */
	let pendingConflicts = $state<{ sources: string[]; dest: string; mode: 'copy' | 'move' } | null>(null);
	let conflicts = $state<string[]>([]);

	let nextOpId = 1;

	/**
	 * True when the system is actually moving data: a transfer in progress
	 * or a folder being read. It is the only thing that lights up the
	 * rails — without this hook they would be decoration.
	 */
	let loadingNow = $derived(
		runningOp !== null || (store.activeTab?.loading ?? false) || (store.activeTab?.searching ?? false)
	);
	/**
	 * The load the rails show: on only after it lasts a moment. A folder
	 * that reads in a blink (or a watcher refresh) used to flip it on and off,
	 * and each flip changed the animation speeds mid-run: the train and the
	 * current jumped back and forth.
	 */
	let underLoad = $state(false);
	$effect(() => {
		if (!loadingNow) {
			underLoad = false;
			return;
		}
		const t = setTimeout(() => (underLoad = true), 400);
		return () => clearTimeout(t);
	});

	/**
	 * Changes the sort column, or flips the direction if it is already
	 * that one.
	 *
	 * The sorting happens in Rust: the tab reloads. Name and type start
	 * ascending, size and date descending — the largest file and the most
	 * recent one are what you are looking for almost always.
	 */
	function sortBy(key: SortKey) {
		const tab = store.activeTab;
		if (!tab || store.activeId === null) return;

		if (mediaSort) {
			// Back from a media column: the clicked one takes over in its usual direction.
			const { [store.activeId]: _, ...rest } = mediaSorts;
			mediaSorts = rest;
		}
		const ascendingNow =
			tab.sort.key === key && !mediaSort ? !tab.sort.ascending : key === 'name' || key === 'kind';

		store.setSort(store.activeId, { key: key, ascending: ascendingNow });
	}

	/**
	 * Copy and cut write to the Windows clipboard, so you can also paste
	 * in Explorer or in another app. The internal copy stays to show the
	 * cut items faded.
	 */
	async function putOnClipboard(cut: boolean) {
		if (location === 'trash') return;
		const choices = selectedEntries();
		if (choices.length === 0) return;
		const paths = choices.map((e) => e.path);
		// The folder of another PC is read-only and Windows would not know
		// what to do with those paths: it is copied only to the internal
		// clipboard.
		if (location === 'lan') {
			clipboard.copy(paths);
			return;
		}
		if (cut) clipboard.cut(paths);
		else clipboard.copy(paths);
		try {
			await tauriBackend.clipboardWrite(paths, cut);
		} catch (e) {
			opError = describeError(e);
		}
	}

	/**
	 * What there is to paste: the Windows clipboard wins over the internal
	 * one.
	 */
	async function toPaste(): Promise<{ paths: string[]; mode: 'copy' | 'move' } | null> {
		// Items copied from another PC live only in the internal
		// clipboard.
		if (!clipboard.empty && isLan(clipboard.paths[0])) {
			return { paths: [...clipboard.paths], mode: 'copy' };
		}
		try {
			const platform = await tauriBackend.clipboardRead();
			if (platform && platform.paths.length > 0) {
				return { paths: platform.paths, mode: platform.cut ? 'move' : 'copy' };
			}
		} catch {
			// Unreadable clipboard: fall back on the internal one.
		}
		if (clipboard.empty) return null;
		return { paths: [...clipboard.paths], mode: clipboard.mode === 'cut' ? 'move' : 'copy' };
	}

	async function paste() {
		if (!store.activeTab || !writable) return;
		opError = null;
		const content = await toPaste();
		if (!content) return;
		await runTransfer(content.paths, store.activeTab.path, content.mode);
	}

	/**
	 * Copy or move in two steps: first the conflicts are looked for, and
	 * only if there are any it stops to ask. Without collisions no dialog
	 * appears and the operation starts right away.
	 */
	async function runTransfer(sources: string[], dest: string, mode: 'copy' | 'move') {
		// From another PC or a server it is always a copy, and taken names are
		// numbered by themselves; into a server it passes through this PC.
		if (sources.length > 0 && isLan(sources[0])) {
			await downloadFromNetwork(sources, dest);
			return;
		}
		try {
			const found = await tauriBackend.scanConflicts(sources, dest);
			if (found.length > 0) {
				pendingConflicts = { sources, dest, mode };
				conflicts = found;
				return;
			}
			await run('rename', { sources, dest, mode });
		} catch (e) {
			opError = describeError(e);
		}
	}

	function run(
		policy: ConflictPolicy,
		op: { sources: string[]; dest: string; mode: 'copy' | 'move' } | null = pendingConflicts
	) {
		conflicts = [];
		pendingConflicts = null;
		if (!op) return Promise.resolve(undefined);
		const title = t('{0} {1} → {2}', [op.mode === 'move' ? t('Sposta') : t('Copia'), count(op.sources), locationName(op.dest)]);
		return enqueue(title, () => runNow(policy, op));
	}

	async function runNow(policy: ConflictPolicy, op: { sources: string[]; dest: string; mode: 'copy' | 'move' }) {
		if (store.activeId === null) return;

		const { sources, dest, mode } = op;
		const opId = nextOpId++;

		runningMode = mode;
		runningOp = opId;
		progress = { transferred: 0, total: 0 };

		try {
			const outcome = await tauriBackend.transfer({
				opId,
				sources,
				dest,
				mode,
				policy,
				onProgress: (p) => (progress = p)
			});

			if (mode === 'move') {
				undo.record({ kind: 'move', pairs: outcome.pairs });
				for (const [from, a] of outcome.pairs) {
					colors.move(from, a);
					quickAccess.move(from, a);
				}
			}
			else
				undo.record({
					kind: 'create',
					paths: outcome.pairs.map((c) => c[1]),
					description: t('copia di {0}', [outcome.pairs.length === 1 ? t('1 elemento') : t('{0} elementi', [outcome.pairs.length])])
				});

			// Cutting uses up the clipboard, as in Explorer; copying does
			// not, so you can paste the same item in several folders in a
			// row.
			const fromClipboard =
				clipboard.paths.length > 0 && sources.every((s) => clipboard.paths.includes(s));
			if (mode === 'move' && !outcome.cancelled && (fromClipboard || clipboard.mode === 'cut')) {
				clipboard.clear();
				void tauriBackend.clipboardClear().catch(() => {});
			}

			if (outcome.cancelled) opError = t('Operazione annullata. I file già trasferiti restano.');
			else if (outcome.skipped > 0)
				opError = t('{0} {1}.', [outcome.skipped, outcome.skipped === 1 ? t('elemento saltato') : t('elementi saltati')]);

			await reload();
		} catch (e) {
			opError = describeError(e);
		} finally {
			runningOp = null;
			progress = null;
		}
	}

	/** Copies from the shared folder of another PC, with the progress bar. */
	function downloadFromNetwork(sources: string[], dest: string) {
		return enqueue(t('Scarica {0} → {1}', [count(sources), locationName(dest)]), () => downloadFromNetworkNow(sources, dest));
	}

	async function downloadFromNetworkNow(sources: string[], dest: string) {
		const opId = nextOpId++;
		runningMode = 'receive';
		runningOp = opId;
		progress = { transferred: 0, total: 0 };
		opError = null;
		try {
			const outcome = await tauriBackend.lanDownload({
				opId,
				sources,
				dest,
				onProgress: (p) => (progress = p)
			});
			// Undo moves copies to the Recycle Bin: a server has none.
			if (!isServer(dest))
				undo.record({
					kind: 'create',
					paths: outcome.pairs.map((c) => c[1]),
					description: t('copia di {0} dalla rete locale', [outcome.pairs.length === 1 ? t('1 elemento') : t('{0} elementi', [outcome.pairs.length])])
				});
			await reload();
			return outcome;
		} catch (e) {
			opError = describeError(e);
		} finally {
			runningOp = null;
			progress = null;
		}
	}

	/**
	 * Sends the selection to another PC: it starts only when the other
	 * accepts.
	 */
	function sendTo(peer: string) {
		const choices = selectedEntries();
		if (choices.length === 0) return;
		const name = recipients.find((p) => p.id === peer)?.name ?? peer;
		return enqueue(t('Invia {0} a {1}', [count(choices.map((e) => e.path)), name]), () => sendToNow(peer, name, choices));
	}

	async function sendToNow(peer: string, name: string, choices: Entry[]) {
		const opId = nextOpId++;
		runningMode = 'send';
		runningOp = opId;
		progress = { transferred: 0, total: 0 };
		opError = null;
		notify(t('In attesa che {0} accetti…', [name]));
		try {
			await tauriBackend.lanSend({
				opId,
				peer,
				paths: choices.map((e) => e.path),
				onProgress: (p) => (progress = p)
			});
			notify(
				t('{0} a {1}.', [choices.length === 1 ? t('«{0}» inviato', [choices[0].name]) : t('{0} elementi inviati', [choices.length]), name])
			);
		} catch (e) {
			opError = describeError(e);
		} finally {
			runningOp = null;
			progress = null;
		}
	}

	// ── Local network ──────────────────────────────────────────────────

	let lanState = $state<LanStatus | null>(null);
	let lanPeerList = $state<Peer[]>([]);
	/** Send requests waiting for an answer, the oldest first. */
	let lanRequests = $state<SendRequest[]>([]);

	$effect(() => {
		tauriBackend.lanStatus().then((s) => (lanState = s)).catch(() => {});
		tauriBackend.lanPeers().then((p) => (lanPeerList = p)).catch(() => {});
	});

	$effect(() => {
		const unmount: Array<() => void> = [];
		let active = true;
		// The list of PCs applies to all windows; consent and receiving
		// reach only the last one used, to which Rust addresses them.
		const listenHere = <T,>(name: string, f: (payload: T) => void) =>
			(name === 'lan-peers' || name === 'friends' ? listen<T>(name, (e) => f(e.payload)) : onlyHere<T>(name, f))
				.then((u) => (active ? unmount.push(u) : u()))
				.catch(() => {});

		void listenHere<Peer[]>('lan-peers', (p) => (lanPeerList = p));
		// A backup ran (by itself or from another window): outcome and date changed.
		void listen('server-backup', () => void loadServers()).then((u) => (active ? unmount.push(u) : u()), () => {});
		void listenHere<EditorMessage>(EDITOR_EVENT, fromEditor);
		void listenHere<FriendsStatus>('friends', (s) => {
			friendsState = s;
			// The «Amici» location lists the confirmed friends: it refreshes with
			// them.
			void store.refreshFolder(FRIENDS);
		});
		void listenHere<{ id: string; name: string }>('friend-request', (r) =>
			notify(t('{0} ti ha chiesto l’amicizia: rispondi da Amici nella barra laterale.', [r.name]))
		);
		void listenHere<{ id: string; name: string }>('friend-backup', (r) =>
			notify(t('{0} vuole tenere un backup su questo PC: rispondi da Amici nella barra laterale.', [r.name]))
		);
		void listenHere<SendRequest>('lan-request', (r) => (lanRequests = [...lanRequests, r]));
		void listenHere<{ id: number; done: number; total: number }>('lan-receiving', (r) => {
			if (runningOp !== null && runningMode !== 'receive') return;
			runningMode = 'receive';
			receiving = r.id;
			progress = { transferred: r.done, total: r.total };
		});
		void listenHere<{
			id: number;
			from: string;
			folder: string;
			count: number;
			error: string | null;
			cancelled?: boolean;
			blocked?: string | null;
		}>(
			'lan-received',
			(r) => {
				if (receiving === r.id) receiving = null;
				if (runningOp === null) progress = null;
				if (r.cancelled) notify(t('Ricezione da {0} annullata.', [r.from]));
				else if (r.error) opError = t('Ricezione da {0} interrotta: {1}', [r.from, r.error]);
				else if (r.blocked) opError = t('Ricezione da {0}: {1}', [r.from, r.blocked]);
				else notify(t('Ricevuti {0} da {1} in {2}.', [r.count === 1 ? t('1 elemento') : t('{0} elementi', [r.count]), r.from, r.folder]));
				void store.refreshFolder(r.folder);
			}
		);
		return () => {
			active = false;
			unmount.forEach((u) => u());
		};
	});

	// ── Friends ────────────────────────────────────────────────────────

	let friendsState = $state<FriendsStatus | null>(null);
	let friendsOpen = $state(false);

	$effect(() => {
		tauriBackend.friendsStatus().then((s) => (friendsState = s)).catch(() => {});
	});

	// Breadcrumbs and tabs show the friend's name, not their code.
	$effect(() => {
		setFriendNames(Object.fromEntries((friendsState?.friends ?? []).map((a) => [a.id, a.name])));
	});

	/**
	 * Who you can send to: the PCs on the local network and the confirmed
	 * friends. A friend has `@` in front of the code, to tell them apart
	 * from a PC at home.
	 */
	let recipients = $derived([
		...lanPeerList,
		...(friendsState?.friends ?? [])
			.filter((a) => a.status === 'confirmed')
			.map((a) => ({ id: '@' + a.id, name: a.name }))
	]);

	async function configureLan(editing: Partial<LanStatus>) {
		if (!lanState) return;
		try {
			const { visible, shared, received, addresses } = { ...lanState, ...editing };
			lanState = await tauriBackend.lanConfigure({ visible, shared, received, addresses: addresses ?? [] });
		} catch (e) {
			opError = describeError(e);
		}
	}

	/**
	 * Sharing also makes you visible: nobody would see a folder shared by an
	 * invisible PC, and the user would think of a fault.
	 */
	async function share(folder: string | null) {
		await configureLan(folder ? { shared: folder, visible: true } : { shared: null });
		if (folder) notify(t('«{0}» è condivisa in rete locale, in sola lettura.', [nameOf(folder)]));
	}

	function respondLan(accept: boolean, where: string | null) {
		const r = lanRequests[0];
		if (!r) return;
		lanRequests = lanRequests.slice(1);
		void tauriBackend.lanRespond(r.id, accept, where);
	}

	/**
	 * The receive from another PC being shown in the bar. It is not an
	 * operation started from here: it is stopped by its id, and the sender
	 * finds out when the connection closes.
	 */
	let receiving = $state<number | null>(null);

	async function cancelTransfer() {
		if (runningOp !== null) await tauriBackend.cancelTransfer(runningOp);
		else if (receiving !== null) await tauriBackend.lanCancelReceive(receiving);
	}

	/** Compresses or extracts with the same progress bar as the transfers. */
	function archive(kind: 'compress' | 'extract') {
		const tab = store.activeTab;
		const choices = selectedEntries();
		if (!tab || choices.length === 0) return;
		const title = kind === 'compress' ? t('Comprimi {0}', [count(choices.map((e) => e.path))]) : t('Estrai «{0}»', [choices[0].name]);
		return enqueue(title, () => archiveNow(kind, tab.path, choices));
	}

	async function rotateImages(clockwise: boolean) {
		const paths = selectedEntries().map((e) => e.path);
		if (paths.length === 0) return;
		opError = null;
		try {
			await tauriBackend.imageRotate(paths, clockwise);
			undo.record({ kind: 'rotate', paths, clockwise });
		} catch (e) {
			opError = describeError(e);
		}
		await reload();
	}

	function convertImages(items: Entry[], o: { target: ImageTarget; maxSide: number | null; quality: number }) {
		toConvert = null;
		const folder = store.activeTab?.path;
		if (!folder) return;
		return enqueue(t('Converti {0}', [count(items.map((e) => e.path))]), async () => {
			const opId = nextOpId++;
			runningMode = 'images';
			runningOp = opId;
			progress = { transferred: 0, total: items.length };
			opError = null;
			try {
				const createdFiles = await tauriBackend.imageConvert({
					opId,
					paths: items.map((e) => e.path),
					...o,
					onProgress: (p) => (progress = p)
				});
				undo.record({ kind: 'create', paths: createdFiles, description: t('conversione di {0}', [count(createdFiles)]) });
				if (store.activeId !== null && store.activeTab?.path === folder) {
					await store.reload(store.activeId);
					store.selectPaths(store.activeId, createdFiles);
				}
				drivesRefresh++;
			} catch (e) {
				opError = describeError(e);
			} finally {
				runningOp = null;
				progress = null;
			}
		});
	}

	async function archiveNow(kind: 'compress' | 'extract', folder: string, choices: Entry[]) {
		const opId = nextOpId++;
		runningMode = kind;
		runningOp = opId;
		progress = { transferred: 0, total: 0 };
		opError = null;
		try {
			const createdFile =
				kind === 'compress'
					? await tauriBackend.compress({
							opId,
							sources: choices.map((e) => e.path),
							dest: folder,
							onProgress: (p) => (progress = p)
						})
					: await tauriBackend.extract({
							opId,
							archive: choices[0].path,
							onProgress: (p) => (progress = p)
						});
			undo.record({
				kind: 'create',
				paths: [createdFile],
				description: kind === 'compress' ? t('compressione in «{0}»', [nameOf(createdFile)]) : t('estrazione in «{0}»', [nameOf(createdFile)])
			});
			if (store.activeId !== null) {
				await store.reload(store.activeId);
				store.selectPaths(store.activeId, [createdFile]);
			}
			drivesRefresh++;
		} catch (e) {
			opError = describeError(e);
		} finally {
			runningOp = null;
			progress = null;
		}
	}

	// ── Drag and drop ────────────────────────────────────────────────

	/** Folder under the pointer during a drag. */
	let dropTarget = $state<string | null>(null);

	/**
	 * The dragged item enters the selection if it was not there: you drag
	 * what you see highlighted. From here Windows takes over, which knows
	 * how to deliver the files to Explorer, to the desktop or to any other
	 * app.
	 */
	async function drag(item: Entry) {
		if (location === 'trash' || location === 'network' || location === 'pc') return;
		// Dragging to other apps goes through the Windows Shell.
		if (ON_LINUX) return;
		// The list of PCs on the local network: dragging one would mean
		// downloading its whole shared folder.
		if (location === 'lan' && store.activeTab?.path === LAN) return;
		if (!selectionSet.has(item.path)) select(item);
		let paths = selectionSet.has(item.path) ? selectedEntries().map((e) => e.path) : [item.path];
		try {
			// The files of the folder shared by another PC do not exist on
			// this disk: Windows accepts them only after they have been
			// downloaded.
			if (location === 'lan') {
				notify(t('Preparo i file da trascinare…'));
				paths = await tauriBackend.lanPrepareDrag(paths);
			}
			await tauriBackend.startDrag(paths);
		} catch (e) {
			opError = describeError(e);
		} finally {
			dropTarget = null;
		}
	}

	/**
	 * Destination folder for a point of the window, in CSS pixels. The
	 * free space between the tabs counts as `NEW_TAB`.
	 */
	function folderUnder(x: number, y: number): string | null {
		const below = document.elementFromPoint(x, y);
		const el = below?.closest<HTMLElement>('[data-folder]');
		if (el) return el.dataset.folder ?? null;
		return below?.closest('[data-new-tab]') ? NEW_TAB : null;
	}

	/** Every item dropped between the tabs opens in a tab of its own: a file, in its folder. */
	async function openInTabs(paths: string[]) {
		for (const p of paths) {
			try {
				await openDestination(await tauriBackend.resolvePath(p));
			} catch (e) {
				opError = describeError(e);
			}
		}
	}

	/**
	 * Files dropped on the window: from Explorer, from the desktop or from
	 * this same app. As in Explorer, on the same drive it moves and between
	 * different drives it copies; Ctrl forces the copy, Shift the move.
	 */
	async function release(paths: string[], x: number, y: number) {
		dropTarget = null;
		if (store.activeTab?.archive?.vault) return addToVault(paths);
		const above = folderUnder(x, y);
		if (above === NEW_TAB) return openInTabs(paths);
		const dest = above ?? (writable ? (store.activeTab?.path ?? null) : null);
		if (!dest || paths.length === 0) return;

		if (dest === TRASH) {
			const items = paths.map((p) => ({ name: nameOf(p), path: p }) as Entry);
			await trash(items);
			return;
		}
		// A folder inside itself, or items dropped where they already are.
		if (paths.some((p) => samePath(p, dest))) return;

		const keys = await tauriBackend.keyModifiers().catch(() => ({ ctrl: false, shift: false, alt: false }));
		const mode = keys.ctrl ? 'copy' : keys.shift ? 'move' : sameVolume(paths[0], dest) ? 'move' : 'copy';
		const alreadyHere = await Promise.all(
			paths.map((p) => tauriBackend.navigate(p, 'up').then((g) => samePath(g, dest)).catch(() => false))
		);
		if (mode === 'move' && alreadyHere.every(Boolean)) return;

		await runTransfer(paths, dest, mode);
	}

	$effect(() => {
		let unmount: (() => void) | undefined;
		let active = true;
		try {
			getCurrentWebview()
				.onDragDropEvent((event) => {
					const p = event.payload;
					const scale = window.devicePixelRatio || 1;
					if (p.type === 'over' || p.type === 'enter') {
						dropTarget = folderUnder(p.position.x / scale, p.position.y / scale);
					} else if (p.type === 'drop') {
						void release(p.paths, p.position.x / scale, p.position.y / scale);
					} else {
						dropTarget = null;
					}
				})
				.then((f) => (active ? (unmount = f) : f()))
				.catch(() => {});
		} catch {
			// Outside Tauri (preview in the browser) there is no file dragging.
		}
		return () => {
			active = false;
			unmount?.();
		};
	});

	// ── Automatic refresh ─────────────────────────────────────

	// Rust watches the folders open in the tabs; when one changes, it says
	// so.
	//
	// One request at a time, and after the running one only the last: opening
	// folders quickly, two requests in flight together could arrive in
	// reverse order and leave the old folder watched.
	let watchInFlight = false;
	let watchNext: string[] | null = null;

	async function observe(folders: string[]) {
		watchNext = folders;
		if (watchInFlight) return;
		watchInFlight = true;
		try {
			while (watchNext) {
				const now = watchNext;
				watchNext = null;
				await tauriBackend.watchDirs(now).catch(() => {});
			}
		} finally {
			watchInFlight = false;
		}
	}

	$effect(() => {
		void observe(store.tabs.map((t) => t.path));
	});

	$effect(() => {
		let unmount: (() => void) | undefined;
		let active = true;
		listen<string>('folder-changed', (e) => {
			void store.refreshFolder(e.payload);
		})
			.then((f) => (active ? (unmount = f) : f()))
			.catch(() => {});
		return () => {
			active = false;
			unmount?.();
		};
	});

	// ── Keyboard ─────────────────────────────────────────────────────

	let addressEditing = $state(false);

	function onKeyboard(e: KeyboardEvent) {
		if (store.activeId === null) return;

		// With a modal dialog open or a field being edited, the list
		// shortcuts must not fire.
		if (toTrash.length > 0 || toDelete || renaming !== null || conflicts.length > 0 || batchRename.length > 0 || checksumOf || paletteOpen || editing || welcomeOpen) return;

		// Inside a text field the keys are for typing. From the search field
		// only those that move the selection or close it get through.
		const field = e.target as HTMLElement | null;
		if (field && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA')) {
			const search = field.getAttribute('aria-label') === 'Filtra i file in questa cartella';
			const allowed = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'F3'];
			if (!search || !(allowed.includes(e.key) || (e.ctrlKey && e.key.toLowerCase() === 'f'))) return;
		}

		const action = actionWithCustom(e, settings.shortcuts);
		if (action !== null) {
			e.preventDefault();
			void runKey(action);
			return;
		}

		if (e.key === 'Escape' && searchOpen) {
			e.preventDefault();
			closeSearch();
			return;
		}

		// Esc leaves the duplicates or comparison view and goes back to the folder.
		if (e.key === 'Escape' && (cleanupOf || fileComparison)) {
			e.preventDefault();
			cleanupOf = null;
			fileComparison = null;
			return;
		}
		if (e.key === 'Escape' && store.activeTab?.space && !store.activeTab.results) {
			e.preventDefault();
			void store.setSpace(store.activeId, false);
			return;
		}
		if (e.key === 'Escape' && (store.activeTab?.duplicates || store.activeTab?.comparison || store.activeTab?.label || store.activeTab?.archive)) {
			e.preventDefault();
			void store.stopSearch(store.activeId);
			return;
		}

		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			// In the grid up and down jump a whole row, not a cell.
			const step = settings.view === 'details' ? 1 : columns;
			// With Shift the arrow extends instead of moving, as in any
			// system list.
			moveSelection(e.key === 'ArrowDown' ? step : -step, e.shiftKey);
			return;
		}

		if (settings.view !== 'details' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
			e.preventDefault();
			moveSelection(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey);
			return;
		}

		if (e.key === 'Enter' && index !== -1) {
			e.preventDefault();
			open(visibleItems[index]);
		}
	}

	async function runKey(action: KeyAction) {
		const id = store.activeId;
		if (id === null) return;

		if (typeof action === 'object') {
			if ('tab' in action) {
				store.activateIndex(action.tab);
				return;
			}
			// The same order as Explorer: four icon sizes, then list,
			// details, tiles and content.
			const seenPaths: Array<[View, number?]> = [
				['icons', 256],
				['icons', 128],
				['icons', 64],
				['icons', 24],
				['list'],
				['details'],
				['tiles'],
				['content']
			];
			const [view, side] = seenPaths[action.view] ?? seenPaths[5];
			settings.setView(view, side);
			return;
		}

		// Inside an archive nothing can be written, cut or deleted: its items are not real files.
		const typing = ['copy', 'cut', 'paste', 'rename', 'newFolder', 'trash', 'deletePermanently', 'copyToOtherPane', 'moveToOtherPane', 'favorite'];
		if (store.activeTab?.archive?.vault) {
			if (action === 'paste') return pasteIntoVault();
			if (action === 'trash' || action === 'deletePermanently') return askDeleteFromVault();
		}
		if (store.activeTab?.archive && typeof action === 'string' && typing.includes(action)) return;
		if (store.activeTab?.archive && (action === 'up' || action === 'back') && upInArchive()) return;

		switch (action) {
			case 'copy':
				return putOnClipboard(false);
			case 'cut':
				return putOnClipboard(true);
			case 'paste':
				return paste();
			case 'rename':
				return startRename();
			case 'newFolder':
				return newFolder();
			case 'trash':
				return askTrash();
			case 'deletePermanently':
				return askDeletePermanently();
			case 'search':
				return openSearch();
			case 'selectAll':
				return store.selectAll(id, visibleItems);
			case 'favorite':
				return toggleFavorite();
			case 'undo':
				return undoLast();
			case 'reload':
				return reload();
			case 'address':
				addressEditing = true;
				return;
			case 'newTab':
				await store.openTab(store.activeTab?.path ?? SYSTEM_ROOT);
				return;
			case 'newWindow':
				return newWindow(store.activeTab?.path ?? null);
			case 'closeTab':
				return store.closeTab(id);
			case 'nextTab':
				return store.activateAdjacent(1);
			case 'previousTab':
				return store.activateAdjacent(-1);
			case 'back':
				return store.goBack(id);
			case 'forward':
				return store.goForward(id);
			case 'up':
				return store.goUp(id);
			case 'properties':
				return ON_LINUX ? undefined : properties();
			case 'preview':
				return settings.set('preview', !settings.preview);
			case 'dualPane':
				return toggleSplit();
			case 'palette':
				return openPalette();
			case 'toggleTerminal':
				return toggleTerminal();
			case 'otherPane': {
				const other = otherPane(split, id);
				if (other !== null) store.setActive(other);
				return;
			}
			case 'copyToOtherPane':
				return toOther('copy');
			case 'moveToOtherPane':
				return toOther('move');
		}
	}

	/**
	 * At startup the folder Windows passed to the app is opened (double
	 * click on a folder when Space Train is the default), otherwise drive
	 * C:. Until it is known which one, no tab: opening one on C: and then
	 * changing it would make the wrong list flash.
	 */
	let started = $state(false);

	async function openDestination(dest: { folder: string; select: string | null }) {
		const id = await store.openTab(dest.folder);
		if (dest.select) store.selectPaths(id, [dest.select]);
	}

	/** Brings an already open tab to `dest`, with the item selected. */
	async function showDestination(id: number, dest: { folder: string; select: string | null }) {
		await store.navigate(id, dest.folder);
		if (dest.select) store.selectPaths(id, [dest.select]);
	}

	/** The last folder opened, for the start page «Ultima cartella aperta». */
	const LAST_FOLDER_KEY = 'space-train.ultima-cartella';

	$effect(() => {
		const path = store.activeTab?.path;
		if (!started || !path) return;
		try {
			localStorage.setItem(LAST_FOLDER_KEY, path);
		} catch {
			// Storage denied: at startup it falls back on drive C:.
		}
	});

	/**
	 * After an update, at the first opening, it tells what has changed.
	 * Only in the main window, once per version.
	 */
	const VERSION_KEY = 'space-train.versione-vista';
	let whatsNewOpen = $state<WhatsNew[]>([]);
	let currentVersion = $state('');

	/**
	 * The megaphone: the news of the installed version, the others on
	 * request.
	 */
	let whatsNewFromMegaphone = $state(false);
	/** The welcome guide: once, at the first start after a fresh install. */
	let welcomeOpen = $state(false);
	function closeWelcome() {
		welcomeOpen = false;
		try {
			localStorage.setItem(WELCOME_KEY, '1');
		} catch {
			// Storage denied: it may show again, never mind.
		}
	}
	function reopenWhatsNew() {
		const i = Math.max(0, WHATS_NEW.findIndex((n) => n.version === currentVersion));
		whatsNewFromMegaphone = true;
		whatsNewOpen = [WHATS_NEW[i]];
	}

	function closeWhatsNew() {
		whatsNewFromMegaphone = false;
		whatsNewOpen = [];
		try {
			localStorage.setItem(VERSION_KEY, currentVersion);
		} catch {
			// Storage denied: the news will be offered again, never mind.
		}
	}

	$effect(() => {
		if (!started || windowLabel !== 'main') return;
		// To try it in development: `VITE_TEST_WHATS_NEW=1` always opens it,
		// with the news of the most recent version in the list.
		if (import.meta.env.DEV && import.meta.env.VITE_TEST_WHATS_NEW === '1') {
			untrack(() => (whatsNewOpen = WHATS_NEW.slice(0, 1)));
			return;
		}
		untrack(() => {
			tauriBackend
				.appVersion()
				.then((v) => {
					if (typeof v !== 'string' || !v) return;
					currentVersion = v;
					let view: string | null = null;
					let alreadyUsed = false;
					try {
						view = localStorage.getItem(VERSION_KEY);
						alreadyUsed = localStorage.getItem('space-train.impostazioni') !== null;
					} catch {
						return;
					}
					const from = whatsNewToShow(view, v, alreadyUsed);
					if (from.length > 0) whatsNewOpen = from;
					// At the first install there is nothing new to tell: the
					// version is remembered, and the welcome guide shows instead.
					else if (view !== v) localStorage.setItem(VERSION_KEY, v);
					if (view === null && !alreadyUsed && localStorage.getItem(WELCOME_KEY) === null) welcomeOpen = true;
				})
				.catch(() => {});
		});
	});

	/** The open tabs, to pick them up again at the next startup. */
	const SESSION_KEY = 'space-train.sessione';

	interface Session {
		tabs: string[];
		active: number;
	}
	/** The session as saved: it keeps the field names it was first written with. */
	interface StoredSession {
		schede: string[];
		attiva: number;
	}

	// Only the main window: the others are closed and reopened at will,
	// and would overwrite the session with their few tabs.
	$effect(() => {
		const tabs = store.tabs.map((t) => t.path);
		const active = store.tabs.findIndex((t) => t.id === store.activeId);
		if (!started || windowLabel !== 'main' || tabs.length === 0) return;
		try {
			localStorage.setItem(SESSION_KEY, JSON.stringify({ schede: tabs, attiva: active } satisfies StoredSession));
		} catch {
			// Storage denied: the session will not be resumed.
		}
	});

	function savedSession(): Session | null {
		try {
			const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as StoredSession | null;
			return s && Array.isArray(s.schede) ? { tabs: s.schede, active: s.attiva } : null;
		} catch {
			return null;
		}
	}

	/**
	 * The tabs the app starts with when Windows does not ask for a folder:
	 * those of last time, if the user wants to resume them, plus the folders
	 * pinned for startup. Those that disappeared in the meantime are
	 * skipped; if nothing is left, the start page.
	 */
	async function initialTabs(): Promise<Session> {
		const saved = settings.session ? savedSession() : null;
		const candidate = [...(saved?.tabs ?? [])];
		for (const c of settings.startupFolders) {
			if (!candidate.some((p) => samePath(p, c))) candidate.push(c);
		}
		const exist = await Promise.all(
			candidate.map((p) =>
				p.startsWith('::')
					? Promise.resolve(p)
					: tauriBackend
							.resolvePath(p)
							.then((d) => (d.select === null ? d.folder : null))
							.catch(() => null)
			)
		);
		const tabs = exist.filter((p): p is string => p !== null);
		if (tabs.length === 0) return { tabs: [await startPage()], active: 0 };
		const active = saved ? Math.min(Math.max(saved.active, 0), tabs.length - 1) : 0;
		return { tabs, active };
	}

	/**
	 * The folder to open when Windows does not ask for one. A start page
	 * that disappeared in the meantime (drive unplugged, folder deleted)
	 * does not leave the user in front of an error: it goes back to drive
	 * C:.
	 */
	async function startPage(): Promise<string> {
		let choice = settings.startPage;
		if (choice === LAST_FOLDER_START_PAGE) {
			try {
				choice = localStorage.getItem(LAST_FOLDER_KEY) ?? DEFAULT_START_PAGE;
			} catch {
				choice = DEFAULT_START_PAGE;
			}
		}
		if (choice.startsWith('::')) return choice;
		return tauriBackend
			.resolvePath(choice)
			.then((d) => d.folder)
			.catch(() => DEFAULT_START_PAGE);
	}

	// Only once, at startup. `untrack` is essential: opening a tab changes the
	// list of tabs, and without it every tab opened here restarted the effect,
	// which opened another one, forever.
	$effect(() => {
		untrack(() => {
			if (windowLabel !== 'main') {
				const open = (window as unknown as { __SPACE_TRAIN_OPEN?: string | null }).__SPACE_TRAIN_OPEN;
				void store.openTab(open ?? SYSTEM_ROOT).then(() => (started = true));
				return;
			}
			tauriBackend
				.initialPath()
				.catch(() => null)
				.then(async (dest) => {
					if (dest) await openDestination(dest);
					else {
						const { tabs, active } = await initialTabs();
						// All together: the tabs enter in the right order straight
						// away, and their contents arrive in parallel.
						const ids = await Promise.all(tabs.map((p) => store.openTab(p)));
						// A folder that arrived from Windows in the meantime stays in
						// front.
						if (store.activeId !== null && ids.includes(store.activeId)) {
							store.setActive(ids[active] ?? ids[0]);
						}
					}
					started = true;
				});
		});
	});

	$effect(() => {
		if (started && store.tabs.length === 0) void startPage().then((p) => store.openTab(p));
	});

	// A folder opened from Windows while the app is already running arrives
	// here, as a new tab, instead of starting a second copy.
	$effect(() => {
		let unmount: (() => void) | undefined;
		let active = true;
		listen<{ window: string; dest: { folder: string; select: string | null } }>(
			'open-path',
			(e) => {
				// With several windows the folder goes only to the one chosen
				// by Rust.
				if (e.payload.window === windowLabel) void openDestination(e.payload.dest);
			}
		)
			.then((f) => (active ? (unmount = f) : f()))
			.catch(() => {});
		return () => {
			active = false;
			unmount?.();
		};
	});

	function open(e: Entry) {
		if (store.activeId === null || location === 'trash') return;
		const arc = store.activeTab?.archive;
		if (arc) {
			if (arc.vault) touch(arc.file);
			if (e.kind === 'dir') void store.showArchive(store.activeId, arc.file, innerOf(e.path), arc.items, arc.vault);
			else
				(arc.vault ? tauriBackend.vaultOpenItem(arc.file, innerOf(e.path)) : tauriBackend.archiveOpenItem(arc.file, innerOf(e.path)))
					.then((p) => tauriBackend.openEntry(p))
					.catch((err) => (opError = describeError(err)));
			return;
		}
		if (location === 'normal' && isVault(e)) {
			void openVault(e.path);
			return;
		}
		if (e.kind !== 'dir' && location === 'normal' && isArchive(e.name)) {
			void openArchive(e.path);
			return;
		}
		if (e.kind === 'dir') store.navigate(store.activeId, e.path);
		// A file of another PC is downloaded into a temporary folder and opened.
		else if (isLan(e.path))
			tauriBackend.lanOpen(e.path).catch((err) => (opError = describeError(err)));
		else tauriBackend.openEntry(e.path);
	}

	function select(e: Entry, modifiers: { ctrl?: boolean; shift?: boolean } = {}) {
		if (store.activeId === null) return;
		store.select(store.activeId, e.path, visibleItems, modifiers);
	}

	/**
	 * Click on empty space and selection marquee. With Ctrl or Shift the
	 * marquee is added to what was already selected when it started.
	 */
	let selectionBeforeMarquee: string[] = [];
	const marquee = {
		onstart: () => {
			selectionBeforeMarquee = [...(store.activeTab?.selection ?? [])];
		},
		onchange: (paths: string[], add: boolean) => {
			if (store.activeId === null) return;
			const choices = add ? [...new Set([...selectionBeforeMarquee, ...paths])] : paths;
			// In the order of the list, like every other selection.
			const inner = new Set(choices);
			store.selectPaths(
				store.activeId,
				visibleItems.filter((v) => inner.has(v.path)).map((v) => v.path)
			);
		},
		onempty: () => {
			if (store.activeId !== null) store.clearSelection(store.activeId);
		}
	};

	function toggleFavorite() {
		const choices = selectedEntries();
		if (choices.length === 0 || !store.activeTab || !editable) return;
		favorites.toggle(store.activeTab.path, choices.map((e) => e.name));
	}

	async function properties() {
		const tab = store.activeTab;
		if (!tab || location === 'trash' || location === 'network') return;
		const choices = selectedEntries().map((e) => e.path);
		const paths = choices.length > 0 ? choices : isVirtual(tab.path) ? [] : [tab.path];
		if (paths.length === 0) return;
		try {
			await tauriBackend.showProperties(paths);
		} catch (e) {
			opError = describeError(e);
		}
	}

	async function goToAddress(text: string) {
		if (store.activeId === null) return;
		opError = null;
		try {
			const dest = await tauriBackend.resolvePath(text);
			await store.navigate(store.activeId, dest.folder);
			if (dest.select) store.selectPaths(store.activeId, [dest.select]);
		} catch {
			opError = t('Impossibile trovare «{0}». Controlla di averlo scritto correttamente.', [text]);
		}
	}

	/**
	 * Which empty screen to show, or `null` if there is a list to see.
	 *
	 * The order matters: an error must be told before declaring empty a
	 * folder we did not even manage to read.
	 */
	let emptyState = $derived.by(() => {
		const tab = store.activeTab;
		if (!tab || tab.loading) return null;
		if (tab.results) {
			if (tab.results.length > 0 || tab.searching) return null;
			if (tab.comparison) return 'sameFolders' as const;
			return tab.duplicates ? ('noDuplicates' as const) : ('noResults' as const);
		}

		if (tab.entries.length === 0) {
			switch (tab.error?.kind) {
				case 'accessDenied':
					return 'accessDenied' as const;
				case 'deviceNotReady':
					return 'notReady' as const;
				case undefined:
					return 'emptyFolder' as const;
				default:
					return null;
			}
		}

		return visibleItems.length === 0 ? ('noResults' as const) : null;
	});

	let columns = $state(1);

	/**
	 * The intro is not even mounted if the user asked for less motion:
	 * hiding it with CSS would still leave the timers running.
	 */
	// Off by default: startup must be instant. Whoever wants it turns it
	// back on from the Appearance menu.
	// svelte-ignore state_referenced_locally
	let opening = $state(settings.introAnimation && animations.intro !== 'none' && !reducedMotion());

	// The folder animation plays when a folder has finished loading.
	let content = $state<HTMLElement | null>(null);
	let lastAnimated: string | null = null;
	$effect(() => {
		const tab = store.activeTab;
		if (!tab || tab.loading) return;
		const key = `${store.activeId}:${tab.path}`;
		if (key === lastAnimated) return;
		const before = lastAnimated;
		lastAnimated = key;
		// Not at startup, and not when the theme asks for none.
		const kind = untrack(() => animations.folder);
		if (before === null || kind === 'none' || reducedMotion()) return;
		void tick().then(() =>
			animateFolder(kind, content?.querySelector('.active-pane') ?? null, document.querySelector('.bar .line'))
		);
	});

	// ── Menu ─────────────────────────────────────────────────────────

	let menu = $state<{ items: MenuItem[]; x: number; y: number } | null>(null);

	/**
	 * The right click on an already selected item does not touch the
	 * selection: otherwise, after choosing ten files, the menu would act
	 * on one. On an item outside the selection, instead, it moves it
	 * there.
	 */
	function menuOnItem(e: Entry, event: MouseEvent) {
		if (!selectionSet.has(e.path)) select(e);
		void openMenu(event);
	}

	function menuOnEmpty(event: MouseEvent) {
		if (store.activeId !== null) store.clearSelection(store.activeId);
		void openMenu(event);
	}

	/** The folder the menu refers to: the selected one or the open one. */
	function menuFolder(choices: Entry[]): string | null {
		if (choices.length === 1 && choices[0].kind === 'dir') return choices[0].path;
		const tab = store.activeTab;
		return tab && !isVirtual(tab.path) ? tab.path : null;
	}

	/** The folder of the menu already opens at every startup. */
	function isAtStartup(choices: Entry[]): boolean {
		const folder = menuFolder(choices);
		return folder !== null && settings.startupFolders.some((c) => samePath(c, folder));
	}

	/** The folder of the menu is already the start page. */
	function isStartPageOf(choices: Entry[]): boolean {
		const page = settings.startPage;
		if (location === 'pc' && choices.length === 0) return page === '::pc';
		const folder = menuFolder(choices);
		return folder !== null && samePath(folder, page);
	}

	/** Quick Access item on which the sidebar menu was opened. */
	let quickAccessMenu = $state<string | null>(null);

	function openQuickAccessMenu(path: string, event: MouseEvent) {
		quickAccessMenu = path;
		const i = quickAccess.folders.findIndex((c) => samePath(c, path));
		menu = {
			items: quickAccessItems(i === 0, i === quickAccess.folders.length - 1),
			x: event.clientX,
			y: event.clientY
		};
	}

	function openSidebarMenu(path: string, kind: SidebarKind, event: MouseEvent) {
		quickAccessMenu = path;
		menu = { items: sidebarItems(kind), x: event.clientX, y: event.clientY };
	}

	async function openMenu(event: MouseEvent) {
		quickAccessMenu = null;
		const x = event.clientX;
		const y = event.clientY;
		const choices = selectedEntries();
		const inVault = !!store.activeTab?.archive?.vault;
		const full = writable || inVault ? (await toPaste()) !== null : false;
		menu = {
			items: menuItems({
				selection: choices,
				clipboardFull: full,
				alreadyFavorite:
					store.activeTab !== undefined &&
					favorites.all(store.activeTab.path, choices.map((e) => e.name)),
				location,
				search: inSearch,
				undoable: undo.next(),
				currentColor: commonColor(choices),
				vault: inVault,
				labelName: (id) => colors.nameOf(id),
				peers: recipients,
				shared: lanState?.shared ?? null,
				sharedHere:
					!!lanState?.shared &&
					store.activeTab !== undefined &&
					samePath(lanState.shared, store.activeTab.path),
				pinned: quickAccess.has(menuFolder(choices) ?? ''),
				isStartPage: isStartPageOf(choices),
				atStartup: isAtStartup(choices),
				otherPane: otherTab && !isVirtual(otherTab.path) ? otherTab.path : null,
				protectedFolder: isProtected(menuFolder(choices))
			}),
			x,
			y
		};
	}

	/** The bar menus open below their button, as in Explorer. */
	function belowButton(event: MouseEvent, items: MenuItem[]) {
		const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
		menu = { items, x: r.left, y: r.bottom + 4 };
	}

	function openViewMenu(event: MouseEvent) {
		belowButton(
			event,
			viewItems({
				view: settings.view,
				side: settings.side,
				compact: settings.compact,
				columns: settings.columns,
				extensions: settings.extensions,
				hidden: store.showHidden,
				preview: settings.preview,
				startPage: settings.startPage,
				session: settings.session
			})
		);
	}

	function openSortMenu(event: MouseEvent) {
		const tab = store.activeTab;
		if (!tab) return;
		belowButton(event, sortItems(tab.sort, settings.grouping));
	}

	function openNewMenu(event: MouseEvent) {
		if (!editable) return;
		belowButton(event, newItems(newFileTypes));
	}

	/** The theme gallery, opened below the Appearance button. */
	let gallery = $state<{ x: number; y: number } | null>(null);

	function openAppearanceMenu(event: MouseEvent) {
		const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
		gallery = { x: Math.max(8, window.innerWidth - r.right), y: r.bottom + 4 };
	}

	/**
	 * The gallery opened from inside the settings: below the Appearance
	 * button.
	 */
	function galleryFromSettings() {
		settingsOpen = false;
		const r = document.querySelector('[aria-label="Appearance"]')?.getBoundingClientRect();
		gallery = r ? { x: Math.max(8, window.innerWidth - r.right), y: r.bottom + 4 } : { x: 12, y: 84 };
	}

	let settingsOpen = $state(false);

	/**
	 * From the gallery: a theme or a colour is tried while staying there, the editor
	 * closes it.
	 */
	function fromGallery(action: MenuAction) {
		if (action === 'themeEditor') gallery = null;
		void runAction(action);
	}

	/**
	 * Common colour of the selected folders, or `null` if different or
	 * missing.
	 */
	function commonColor(choices: Entry[]): ColorId | null {
		const first = choices[0] ? colors.idOf(choices[0].path) : undefined;
		return first && choices.every((e) => colors.idOf(e.path) === first) ? first : null;
	}

	/**
	 * Actions with a parameter arrive as `kind:value`: sort by a column,
	 * group, view, icon side, theme, accent, colour.
	 */
	function runParametric(action: string, choices: Entry[]): boolean {
		const [kind, value] = action.split(':');
		if (value === undefined) return false;
		const id = store.activeId;
		const tab = store.activeTab;

		switch (kind) {
			case 'new':
				void newFile(value);
				return true;
			case 'send':
				void sendTo(value);
				return true;
			case 'sort':
				if (tab && id !== null) {
					const key = value as SortKey;
					// Like the headers: a new column starts in the direction
					// it is usually wanted in, the same one stays as it is.
					const ascendingNow =
						tab.sort.key === key ? tab.sort.ascending : key === 'name' || key === 'kind';
					void store.setSort(id, { key: key, ascending: ascendingNow });
				}
				return true;
			case 'group':
				settings.set('grouping', value as GroupMode);
				return true;
			case 'view':
				settings.setView(value as View);
				return true;
			case 'side':
				settings.setView('icons', Number(value));
				return true;
			case 'theme':
				settings.set('theme', value);
				return true;
			case 'pause':
				settings.set('trainPause', Number(value));
				return true;
			case 'start': {
				const choices: Record<string, string> = { pc: '::pc', c: DEFAULT_START_PAGE, last: LAST_FOLDER_START_PAGE };
				if (choices[value]) settings.set('startPage', choices[value]);
				if (value === 'pc') notify(t('Questo PC si aprirà all’avvio.'));
				return true;
			}
			case 'accent':
				settings.set('accent', value as AccentId);
				// The custom swatch opens the system colour picker.
				if (value === CUSTOM_ACCENT) colorPicker?.click();
				return true;
			case 'color':
				colors.set(
					choices.map((e) => e.path),
					value as ColorId
				);
				return true;
		}
		return false;
	}

	/** Ctrl+wheel zooms in and out, as in Explorer. */
	$effect(() => {
		function wheel(e: WheelEvent) {
			if (!e.ctrlKey || e.deltaY === 0) return;
			e.preventDefault();
			const s = zoom({ view: settings.view, side: settings.side }, e.deltaY < 0 ? 1 : -1);
			settings.setView(s.view, s.side);
		}
		// Not passive: without it, preventDefault does not stop the page zoom.
		window.addEventListener('wheel', wheel, { passive: false });
		return () => window.removeEventListener('wheel', wheel);
	});

	function openColumnsMenu(event: MouseEvent) {
		const tab = store.activeTab;
		const withMedia = tab && location === 'normal' && !tab.results;
		menu = {
			items: columnItems(
				settings.columns,
				withMedia ? { shown: mediaColumns, chosen: media.isChosen(tab.path) } : null
			),
			x: event.clientX,
			y: event.clientY
		};
	}

	const COLUMN_ACTIONS: Partial<Record<MenuAction, keyof Columns>> = {
		columnType: 'type',
		columnSize: 'size',
		columnDate: 'date'
	};

	async function runAction(action: MenuAction) {
		const point = menu ? { x: menu.x, y: menu.y } : { x: 0, y: 0 };
		menu = null;
		// From the Quick Access menu the target is the folder clicked in
		// the sidebar, not the selection in the list.
		const fromBar = quickAccessMenu;
		quickAccessMenu = null;
		if (fromBar) {
			switch (action) {
				case 'openNewTab':
					await store.openTab(fromBar);
					return;
				case 'openNewWindow':
					return newWindow(fromBar);
				case 'unpin':
					return quickAccess.unpin(fromBar);
				case 'quickAccessUp':
					return quickAccess.shift(fromBar, -1);
				case 'quickAccessDown':
					return quickAccess.shift(fromBar, 1);
				case 'cleanup':
					return openCleanup(fromBar);
				case 'space':
					return analyzeSpace(fromBar);
				case 'emptyTrash': {
					// The confirmation counts the items: read the bin, wherever the tab is.
					const bin = await tauriBackend.listDir(TRASH, { key: 'name', ascending: true }, true).catch(() => null);
					toDelete = { items: bin?.entries ?? [], kind: 'emptyTrash' };
					return;
				}
				case 'properties':
					return tauriBackend.showProperties([fromBar]).catch((e) => void (opError = describeError(e)));
			}
		}
		const choices = selectedEntries();
		const id = store.activeId;
		const tab = store.activeTab;

		// Area names may hold ':', so they never go through the split below.
		if (action.startsWith('workspace:')) return openWorkspace(action.slice('workspace:'.length));
		if (action.startsWith('media:')) return toggleMediaColumn(action.slice('media:'.length) as MediaKey);
		switch (action) {
			case 'mediaAuto':
				if (store.activeTab) media.automatic(store.activeTab.path);
				return;
			case 'workspaceNew':
				workspaceName = { mode: 'new', error: null };
				return;
			case 'workspaceRename':
				workspaceName = { mode: 'rename', error: null };
				return;
			case 'workspaceLeave':
				return workspaces.setCurrent(null);
			case 'workspaceDelete':
				if (workspaces.current !== null) workspaces.remove(workspaces.current);
				return;
		}

		const column = COLUMN_ACTIONS[action];
		if (column) return settings.toggleColumn(column);
		if (runParametric(action, choices)) return;

		try {
			switch (action) {
				case 'open':
					if (choices[0]) open(choices[0]);
					break;
				case 'openNewWindow':
					if (choices[0]) await newWindow(choices[0].path);
					break;
				case 'pin': {
					const folder = menuFolder(choices);
					if (folder) {
						quickAccess.pin(folder);
						notify(t('«{0}» fissata nella barra laterale.', [nameOf(folder)]));
					}
					break;
				}
				case 'unpin': {
					const folder = menuFolder(choices);
					if (folder) quickAccess.unpin(folder);
					break;
				}
				case 'openNewTab':
					if (choices[0]) await store.openTab(choices[0].path);
					break;
				case 'openWith':
					if (choices[0]) await tauriBackend.openWith(choices[0].path);
					break;
				case 'runAsAdmin':
					if (choices[0]) await tauriBackend.runAsAdmin(choices[0].path);
					break;
				case 'openFileLocation':
					if (choices[0] && id !== null) {
						const folder = await tauriBackend.navigate(choices[0].path, 'up');
						await store.navigate(id, folder);
						store.selectPaths(id, [choices[0].path]);
					}
					break;
				case 'rename':
					startRename();
					break;
				case 'copy':
					await putOnClipboard(false);
					break;
				case 'cut':
					await putOnClipboard(true);
					break;
				case 'paste':
					await paste();
					break;
				case 'trash':
					askTrash();
					break;
				case 'deletePermanently':
					askDeletePermanently();
					break;
				case 'newFolder':
					await newFolder();
					break;
				case 'favorite':
					toggleFavorite();
					break;
				case 'copyPath':
					await copyPaths(choices);
					break;
				case 'duplicates': {
					const folder = menuFolder(choices);
					if (folder && id !== null) {
						if (folder !== store.activeTab?.path) await store.navigate(id, folder);
						void store.findDuplicates(id, store.showHidden).catch((e) => (opError = describeError(e)));
					}
					break;
				}
				case 'extractHere': {
					const arc = store.activeTab?.archive;
					if (arc) await extractFromArchive(folderOf(arc.file));
					break;
				}
				case 'extractTo': {
					const arc = store.activeTab?.archive;
					const dest = arc ? await tauriBackend.pickFolder(t('Estrai in…'), folderOf(arc.file)) : null;
					if (dest) await extractFromArchive(dest);
					break;
				}
				case 'checksum':
					if (choices[0]) checksumOf = choices[0];
					break;
				case 'versions':
					if (choices[0]) versionsOf = choices[0];
					break;
				case 'protectVersions':
				case 'unprotectVersions': {
					const folder = menuFolder(choices);
					if (folder) await protectVersions(folder, action === 'protectVersions');
					break;
				}
				case 'cleanup':
					if (choices[0]) await openCleanup(choices[0].path);
					break;
				case 'compareFiles':
					if (choices.length === 2) compareFiles(choices[0], choices[1]);
					break;
				case 'compareFileOtherPane': {
					const twin = otherTab?.entries.find((e) => e.kind === 'file' && e.name.toLowerCase() === choices[0]?.name.toLowerCase());
					if (choices[0] && twin) compareFiles(choices[0], twin);
					else if (choices[0]) opError = t('Nell’altro pannello non c’è «{0}».', [choices[0].name]);
					break;
				}
				case 'space': {
					const folder = menuFolder(choices);
					if (folder) await analyzeSpace(folder);
					break;
				}
				case 'rules':
					rulesOf = menuFolder(choices);
					break;
				case 'newVault':
					if (tab && editable) vaultDialog = { mode: 'create', path: tab.path, error: null, busy: false };
					break;
				case 'addToVault':
					await pasteIntoVault();
					break;
				case 'deleteFromVault':
					askDeleteFromVault();
					break;
				case 'lockVault':
					if (tab?.archive?.vault) await lockVault(tab.archive.file);
					break;
				case 'compare': {
					const folder = menuFolder(choices);
					if (folder) await compareWith(folder);
					break;
				}
				case 'terminal': {
					const folder = menuFolder(choices);
					if (folder) await tauriBackend.openTerminal(folder);
					break;
				}
				case 'integratedTerminal': {
					const folder = menuFolder(choices);
					if (folder) toggleTerminal(folder);
					break;
				}
				case 'edit':
					if (choices[0]) editing = { path: choices[0].path, name: choices[0].name };
					break;
				case 'startupFolder': {
					const folder = menuFolder(choices);
					if (!folder) break;
					if (isAtStartup(choices)) {
						settings.set(
							'startupFolders',
							settings.startupFolders.filter((c) => !samePath(c, folder))
						);
					} else {
						settings.set('startupFolders', [...settings.startupFolders, folder]);
						notify(t('«{0}» si aprirà a ogni avvio, in una scheda sua.', [nameOf(folder)]));
					}
					break;
				}
				case 'session':
					settings.set('session', !settings.session);
					break;
				case 'setStartPage': {
					const folder = menuFolder(choices);
					if (folder) {
						settings.set('startPage', folder);
						notify(t('«{0}» si aprirà all’avvio.', [nameOf(folder)]));
					}
					break;
				}
				case 'revealInExplorer':
					if (choices[0]) await tauriBackend.revealInExplorer(choices[0].path);
					break;
				case 'compress':
					await archive('compress');
					break;
				case 'rotateRight':
				case 'rotateLeft':
					await rotateImages(action === 'rotateRight');
					break;
				case 'convertImages':
					toConvert = choices;
					break;
				case 'extract':
					await archive('extract');
					break;
				case 'properties':
					await properties();
					break;
				case 'moreOptions':
					if (tab) {
						const outcome = await tauriBackend.showShellMenu(
							choices.map((e) => e.path),
							isVirtual(tab.path) ? '' : tab.path,
							point.x,
							point.y
						);
						// «Apri percorso file» is run by the app: the folder opens here.
						if (outcome.open && id !== null) await showDestination(id, outcome.open);
						else if (outcome.executed) await reload();
					}
					break;
				case 'undo':
					await undoLast();
					break;
				case 'refresh':
					await reload();
					break;
				case 'restore':
					await restore();
					break;
				case 'emptyTrash':
					toDelete = { items: tab?.entries ?? [], kind: 'emptyTrash' };
					break;
				case 'share': {
					const folder = choices.length === 1 && choices[0].kind === 'dir' ? choices[0].path : tab?.path;
					if (folder && !isVirtual(folder)) await share(folder);
					break;
				}
				case 'stopSharing':
					await share(null);
					notify(t('La cartella non è più condivisa.'));
					break;
				case 'download':
					if (lanState) {
						const outcome = await downloadFromNetwork(choices.map((e) => e.path), lanState.receivedFolder);
						if (outcome) notify(t('Scaricato in {0}.', [lanState.receivedFolder]));
					}
					break;
				case 'newMenu':
					// From the menu on the background: the «Nuovo» menu opens in the
					// same spot.
					menu = { items: newItems(newFileTypes), x: point.x, y: point.y };
					break;
				case 'noColor':
					colors.set(
						choices.map((e) => e.path),
						null
					);
					break;
				case 'ascending':
				case 'descending':
					if (tab && id !== null) {
						await store.setSort(id, { key: tab.sort.key, ascending: action === 'ascending' });
					}
					break;
				case 'compact':
					settings.set('compact', !settings.compact);
					break;
				case 'themeEditor':
					void openEditor();
					break;
				case 'introAnimation':
					settings.set('introAnimation', !settings.introAnimation);
					break;
				case 'extensions':
					settings.set('extensions', !settings.extensions);
					break;
				case 'hidden':
					await store.setShowHidden(!store.showHidden);
					break;
				case 'preview':
					settings.set('preview', !settings.preview);
					break;
			}
		} catch (e) {
			opError = describeError(e);
		}
	}

	/** One path per line: it is the form you paste into a terminal. */
	async function copyPaths(choices: Entry[]) {
		if (choices.length === 0) return;
		try {
			await navigator.clipboard.writeText(choices.map((e) => e.path).join('\n'));
		} catch (e) {
			opError = describeError(e);
		}
	}

	/**
	 * The side buttons arrive on mousedown. preventDefault is needed because
	 * the WebView reads them as browser navigation, which does not exist
	 * here: without it, the gesture would be swallowed before reaching the
	 * store.
	 */
	function sideButtons(e: MouseEvent) {
		const action = historyActionFor(e.button);
		if (action === null || store.activeId === null) return;
		e.preventDefault();
		if (action === 'back') store.goBack(store.activeId);
		else store.goForward(store.activeId);
	}

	let isDefault = $state(false);
	let message = $state('');

	$effect(() => {
		invoke<boolean>('is_default').then((v) => (isDefault = v));
	});

	async function setAsDefault() {
		try {
			const backup = await invoke<string>('set_as_default');
			isDefault = true;
			message = t('Ora le cartelle si aprono con Space Train. Backup in {0}', [backup]);
		} catch (e) {
			// Before, the error was lost and the button seemed to have worked.
			opError = t('Impossibile impostare Space Train come predefinito: {0}', [describeError(e)]);
		}
	}

	async function restoreExplorer() {
		try {
			await invoke('restore_windows_explorer');
			isDefault = false;
			message = t('Esplora risorse di Windows ripristinato.');
		} catch (e) {
			opError = t('Impossibile ripristinare Esplora risorse: {0}', [describeError(e)]);
		}
	}

	function errorMessage(err: FsError | null): string {
		switch (err?.kind) {
			case 'accessDenied':
				return t('Accesso negato a questa cartella.');
			case 'notFound':
				return t('Cartella non trovata.');
			case 'notADirectory':
				return t('Questo elemento non è una cartella.');
			case 'deviceNotReady':
				return t('Unità non pronta. Controlla che il supporto sia inserito.');
			case 'io':
				return err.message;
			case 'serverKey':
				return err.changed ? t('La chiave del server è cambiata: Space Train non si collega.') : t('Conferma la chiave del server per collegarti.');
			case 'serverPassword':
				return t('Il server chiede la password.');
			case 'changed':
				return t('Il file è cambiato su disco nel frattempo.');
			default:
				return '';
		}
	}

	let pageContentKey = $derived(`${store.activeId}:${store.activeTab?.path}:${inSearch}`);
</script>

<svelte:window
	onfocus={() => drivesRefresh++}
	onmousedown={sideButtons}
	onauxclick={(e) => historyActionFor(e.button) !== null && e.preventDefault()}
	onkeydown={onKeyboard}
/>

{#if opening}
	<Intro
		onend={() => (opening = false)}
		kind={animations.intro === 'none' ? 'train' : animations.intro}
		figure={animations.figure ? appearanceOf(readMotion(animations.figure).item) : null}
		motion={animations.motion}
		duration={animations.duration}
	/>
{/if}

<div class="app">
	<TitleBar
		{store}
		dropTarget={dropTarget}
		onwhatsnew={reopenWhatsNew}
		onsettings={() => (settingsOpen = true)}
		area={workspaces.current}
		onareas={windowLabel === 'main' ? (e) => belowButton(e, workspaceItems(workspaces.areas, workspaces.current)) : undefined}
	/>

	<!-- The main line: it runs the whole width below the header. It lights
	     up when the system really moves something, and every now and then a
	     train passes over it. -->
	<div class="main-line" data-tauri-drag-region style:padding-top="{paradeSpace}px">
		<Rail active={underLoad} />
		<Parade
			active={underLoad}
			parade={parade}
			pause={settings.trainPause < 0 ? null : settings.trainPause * 1000}
		/>
	</div>

	<div class="body">
		<!-- The locations are stops: the vertical rail runs over the sidebar
		     and crosses its nodes. -->
		<div class="places">
		<Sidebar
			{store}
			backend={tauriBackend}
			dropTarget={dropTarget}
			refresh={drivesRefresh}
			colorOf={(p) => colors.of(p)}
			lan={lanState}
			peers={lanPeerList}
			ontogglevisible={() => configureLan({ visible: !lanState?.visible })}
			friends={friendsState}
			onopenfriends={() => (friendsOpen = true)}
			onaddresses={(addresses) =>
				// Whoever adds a distant PC wants to be found: it makes itself
				// visible.
				configureLan(addresses.length > (lanState?.addresses?.length ?? 0) ? { addresses, visible: true } : { addresses })}
			quickAccess={quickAccess.folders}
			onquickaccessmenu={openQuickAccessMenu}
			onitemmenu={openSidebarMenu}
			labels={colors.used}
			openLabel={store.activeTab?.label ?? null}
			onlabel={(id) => void showLabel(id)}
			servers={savedServers}
			onaddserver={() => (serverDialog = { mode: { kind: 'edit', server: null }, error: null, busy: false })}
			oneditserver={(s) => (serverDialog = { mode: { kind: 'edit', server: s }, error: null, busy: false })}
			onrenamelabel={(id, name) => {
				const before = colors.nameOf(id);
				colors.rename(id, name);
				// The open label view is titled with the old name: follow it.
				if (store.activeTab?.label === before) void showLabel(id);
			}}
			searches={[...READY_SEARCHES, ...searches.items]}
			onsearch={(r) => void openSavedSearch(r)}
			onremovesearch={(name) => searches.remove(name)}
		/>
		<Rail orientation="vertical" active={underLoad} />
		</div>
		<main>
			<Breadcrumb
				{store}
				bind:editing={addressEditing}
				onaddress={goToAddress}
				onsearch={openSearch}
				dropTarget={dropTarget}
				branchInfo={gitHere}
				lockIn={lockInHere}
				stop={cleanupOf ? t('Pulizia') : fileComparison ? t('Confronto') : null}
				onstop={() => {
					cleanupOf = null;
					fileComparison = null;
				}}
				onlock={() => {
					const arc = store.activeTab?.archive;
					if (arc?.vault) void lockVault(arc.file);
				}}
			/>
			<CommandBar
				hasSelection={selection.length > 0}
				editable={editable}
				showHidden={store.showHidden}
				preview={settings.preview}
				split={split !== null}
				ontogglesplit={() => void toggleSplit()}
				onnew={openNewMenu}
				oncut={() => putOnClipboard(true)}
				oncopy={() => putOnClipboard(false)}
				onpaste={paste}
				onrename={startRename}
				ondelete={askTrash}
				onsort={openSortMenu}
				onview={openViewMenu}
				onappearance={openAppearanceMenu}
				ontogglepreview={() => settings.set('preview', !settings.preview)}
				ontogglehidden={() => store.setShowHidden(!store.showHidden)}
				recent={settings.recent}
				ontogglerecent={() => settings.set('recent', !settings.recent)}
			/>
			{#if settings.recent}
				<RecentBar
					days={settings.recentDays}
					count={laidOut.zones.find((z) => z.tone === 'recent')?.count ?? 0}
					onchange={(g) => settings.set('recentDays', g)}
					onclose={() => settings.set('recent', false)}
				/>
			{/if}

			{#if searchOpen && store.activeTab}
				<SearchBar
					query={store.activeTab.query}
					results={visibleItems.length}
					total={store.activeTab.entries.length}
					position={index + 1}
					onchange={(q) => store.activeId !== null && store.setQuery(store.activeId, q)}
					onclose={closeSearch}
					subfolders={recursiveSearch}
					content={contentSearch}
					searching={store.activeTab.searching}
					ontogglesubfolders={location === 'normal' ? toggleRecursive : undefined}
					ontogglecontent={() => (contentSearch = !contentSearch)}
					filters={filters}
					onfilters={(f) => (filters = f)}
					onsave={saveSearch}
				/>
			{/if}

			<!-- The error also stays as a bar when there is already a list on
			     screen: replacing it would take away the context the user is
			     in. The full screen appears only if there is nothing. -->
			{#if store.activeTab?.error && store.activeTab.entries.length > 0}
				<div class="error">{errorMessage(store.activeTab.error)}</div>
			{/if}
			{#if store.activeTab?.duplicates && store.activeTab.searching}
				<ProgressBar
					progress={store.activeTab.duplicates.progress}
					mode="duplicates"
					oncancel={() => store.activeId !== null && store.stopSearch(store.activeId, { keepResults: true })}
				/>
			{/if}
			{#if duplicateSummary.groups > 0}
				<div class="duplicates-summary">
					<span><b>{duplicateSummary.groups}</b> {duplicateSummary.groups === 1 ? t('gruppo di copie') : t('gruppi di copie')}</span>
					<span><b>{formatBytes(duplicateSummary.recoverable)}</b> {t('recuperabili')}</span>
					<button onclick={selectExtraCopies} title={t('Tutte tranne la più vecchia di ogni gruppo')}>{t('Seleziona le copie in più')}</button>
				</div>
			{/if}
			{#if inSpace && store.activeTab}
				<div class="duplicates-summary" role="status">
					<span><b>{formatBytes(totalSpace)}</b> {t('in {0}', [locationName(store.activeTab.path)])}</span>
					{#if totalGrowth}
						<span
							><b class="total-growth">{growthText(totalGrowth.delta, formatBytes)}</b> {t('dal {0}', [new Date(totalGrowth.since).toLocaleDateString('it-IT', {
								day: 'numeric',
								month: 'long'
							})])}</span
						>
						<button class:on={byGrowth} aria-pressed={byGrowth} onclick={() => (byGrowth = !byGrowth)}
							>{byGrowth ? t('Ordina per peso') : t('Ordina per crescita')}</button
						>
					{/if}
					{#if spaceComputing > 0}<span>{t('pesando')} <b>{spaceComputing}</b> {spaceComputing === 1 ? 'cartella' : 'cartelle'}…</span>{/if}
					<button onclick={() => store.activeId !== null && store.setSpace(store.activeId, false)}>{t('Chiudi l’analisi')}</button>
				</div>
			{/if}
			{#if store.activeTab?.comparison}
				{@const c = store.activeTab.comparison}
				<div class="duplicates-summary" role="status">
					{#if c.running}
						<span>{t('Confronto in corso…')}</span>
					{:else}
						<span><b>{c.onlyHere}</b> {t('mancano in {0}', [locationName(c.other)])}</span>
						<span><b>{c.different.length}</b> {c.different.length === 1 ? 'diverso' : 'diversi'}</span>
						<span><b>{c.onlyThere}</b> {t('mancano qui')}</span>
						{#if !c.content}
							<button onclick={compareContent} title={t('Legge i file invece di guardare dimensione e data')}>{t('Controlla il contenuto')}</button>
						{/if}
						{#if c.onlyThere > 0 || c.different.some((d) => !d.newerHere)}
							<button onclick={() => void align('here')} title={t('Copia qui ciò che manca e le versioni più recenti')}>{t('Allinea qui')}</button>
						{/if}
						{#if c.onlyHere > 0 || c.different.some((d) => d.newerHere)}
							<button class="primary" onclick={() => void align('there')} title={t('Copia ciò che manca e le versioni più recenti; non cancella niente')}
								>{t('Allinea {0}', [locationName(c.other)])}</button
							>
						{/if}
					{/if}
				</div>
			{/if}
			{#if progress}
				<ProgressBar
					progress={progress}
					mode={runningMode}
					oncancel={cancelTransfer}
					paused={paused}
					onpause={currentJob ? togglePause : undefined}
					queued={queue.length}
					onqueue={() => (queueOpen = !queueOpen)}
				/>
				{#if queueOpen && currentJob}
					<JobQueue
						running={currentJob}
						queue={queue}
						paused={paused}
						onpause={togglePause}
						oncancelrunning={cancelTransfer}
						onup={upInQueue}
						onremove={removeFromQueue}
					/>
				{/if}
			{/if}

			{#if opError}
				<div class="error">
					{opError}
					<button class="close-error" onclick={() => (opError = null)} aria-label={t('Chiudi')}
						><Icon name="close" /></button
					>
				</div>
			{/if}
			{#if notice}
				<div class="notice" role="status">{notice}</div>
			{/if}

			{#if reminder}
				{@const p = reminder}
				<div class="notice update reminder" role="status">
					<span
						>{t('{0} ha', [locationName(p.drive.path)])} <b>{formatBytes(p.drive.free ?? 0)}</b> {t('liberi ({0}%).', [Math.round(p.share * 100)])}{#if p.found}{t('{0}La Pulizia ha trovato', [' '])} <b>{formatBytes(p.found)}</b> {t('da togliere.')}{/if}</span
					>
					<button onclick={snoozeReminder}>{t('Non ora')}</button>
					<button
						class="primary"
						onclick={() => {
							reminder = null;
							void openCleanup(p.drive.path);
						}}>{t('Apri la Pulizia')}</button
					>
				</div>
			{/if}
			{#if updates.visible}
				<div class="notice update" role="status">
					<span>
						{updates.state === 'downloading'
							? t('Scarico la versione {0} di Space Train…', [updates.version])
							: updates.state === 'installing'
								? t('Installo la versione {0}: Space Train si chiude e si riapre da solo.', [updates.version])
								: t('È pronta la versione {0} di Space Train.', [updates.version])}
					</span>
					{#if updates.state === 'downloading'}
						<span
							class="update-bar"
							role="progressbar"
							aria-label={t('Download dell’aggiornamento')}
							aria-valuemin="0"
							aria-valuemax="100"
							aria-valuenow={updates.progress === null ? undefined : Math.round(updates.progress * 100)}
						><span style:width="{(updates.progress ?? 0) * 100}%" class:unknown={updates.progress === null}></span></span>
						{#if updates.progress !== null}<span class="update-percent">{Math.round(updates.progress * 100)}%</span>{/if}
					{:else if updates.state === 'installing'}
						<span class="update-bar" aria-hidden="true"><span class="unknown"></span></span>
					{/if}
					{#if updates.state === 'ready'}
						<button onclick={() => updates.postpone()}>{t('Più tardi')}</button>
						<button class="primary" onclick={installUpdate}>{t('Riavvia e aggiorna')}</button>
					{/if}
				</div>
			{/if}

			<div class="content" bind:this={content}>
				<div class="active-pane" class:divided={otherTab} style:order={activeOnRight ? 2 : 0}>
				{#if otherTab && store.activeTab}<PaneHeader path={store.activeTab.path} active />{/if}
				{#if cleanupOf}
					<DiskCleanup
						drive={cleanupOf}
						roots={projectRoots}
						onroots={(r) => settings.set('projectFolders', r)}
						onfree={runCleanup}
						onclose={() => (cleanupOf = null)}
						describeError={describeError}
						onfound={rememberCleanup}
					/>
				{:else if fileComparison}
					<FileCompare a={fileComparison.a} b={fileComparison.b} onclose={() => (fileComparison = null)} describeError={describeError} />
				{:else if emptyState}
					<EmptyState
						variant={emptyState}
						action={emptyState === 'emptyFolder' && editable
							? t('Nuova cartella')
							: emptyState === 'noResults'
								? t('Azzera la ricerca')
								: undefined}
						onaction={emptyState === 'emptyFolder' && editable
							? newFolder
							: emptyState === 'noResults'
								? closeSearch
								: undefined}
					/>
				{:else if store.activeTab && settings.view !== 'details'}
					<FileGrid
						entries={visibleItems}
						zones={laidOut.zones}
						contentKey={pageContentKey}
						size={cellSize({ view: settings.view, side: settings.side })}
						colorOf={itemColor}
						hideExtension={!settings.extensions}
						dropTarget={dropTarget}
						selection={selectionSet}
						activeIndex={index}
						cutPaths={clipboard.mode === 'cut' ? clipboard.paths : undefined}
						icons={icons}
						onactivate={open}
						singleClick={settings.singleClick}
						{folderStyle}
						onselect={select}
						oncontext={menuOnItem}
						oncontextempty={menuOnEmpty}
						oncolumncount={(n) => (columns = n)}
						ondrag={drag}
						marquee={marquee}
					/>
				{:else if store.activeTab}
					<FileList
						entries={visibleItems}
						{sizes}
						oncompute={settings.folderSizes === 'onRequest' && location === 'normal'
							? (e: Entry) => void weigh([e.path])
							: undefined}
						zones={laidOut.zones}
						contentKey={pageContentKey}
						columns={viewColumns}
						mediaOf={(e) => media.of(e)}
						gitOf={gitHere ? (e) => gitHere?.items[e.name] : undefined}
						rulesOf={(e) => rules.hasRules(e.path)}
						mediaSort={mediaSort}
						onsortmedia={sortByMediaKey}
						hideExtension={!settings.extensions}
						folderOf={itemFolder}
						colorOf={itemColor}
						rowHeight={withSnippets ? Math.round(rowHeight * 1.55) : rowHeight}
						shareOf={inSpace ? itemShare : undefined}
						growthOf={inSpace ? (e: Entry) => growths[e.path] : undefined}
						dropTarget={dropTarget}
						selection={selectionSet}
						matches={store.activeTab.query === '' || inSearch ? undefined : highlights}
						activeIndex={index}
						renamingPath={renaming}
						cutPaths={clipboard.mode === 'cut' ? clipboard.paths : undefined}
						icons={icons}
						sort={store.activeTab.sort}
						onsort={sortBy}
						oncolumns={openColumnsMenu}
						onactivate={open}
						singleClick={settings.singleClick}
						{folderStyle}
						onselect={select}
						oncontext={menuOnItem}
						oncontextempty={menuOnEmpty}
						onrename={confirmRename}
						oncancelrename={() => (renaming = null)}
						ondrag={drag}
						marquee={marquee}
					/>
				{/if}
				</div>

				{#if otherTab}
					<PassivePane
						tab={otherTab}
						rowHeight={rowHeight}
						columns={settings.columns}
						hideExtension={!settings.extensions}
						colorOf={itemColor}
						icons={icons}
						{folderStyle}
						singleClick={settings.singleClick}
						dropTarget={dropTarget}
						onactivatepane={() => otherTab && store.setActive(otherTab.id)}
						onopen={open}
						onselect={select}
					/>
				{/if}

				{#if settings.preview}
					<Preview
						item={previewItem}
						count={selection.length}
						backend={tauriBackend}
						media={previewItem ? media.of(previewItem) : undefined}
					/>
				{/if}
			</div>
			{#if terminalAt !== null}
				{#key terminalAt}
					<TerminalPanel
						cwd={terminalAt}
						folder={store.activeTab && location === 'normal' ? store.activeTab.path : null}
						onclose={() => (terminalAt = null)}
					/>
				{/key}
			{/if}
		</main>
	</div>

	{#if settingsOpen}
		<SettingsWindow
			settings={settings}
			showHidden={store.showHidden}
			onhidden={() => void store.setShowHidden(!store.showHidden)}
			isDefault={isDefault}
			ondefault={() => void (isDefault ? restoreExplorer() : setAsDefault())}
			version={currentVersion}
			receivedFolder={lanState?.receivedFolder ?? ''}
			receivedChosen={lanState?.received != null}
			onreceived={(folder) => void configureLan({ received: folder })}
			onpickfolder={(title, from) => tauriBackend.pickFolder(title, from)}
			ontestshortcut={(acc) => tauriBackend.shortcutFree(acc)}
			onwhatsnew={() => {
				settingsOpen = false;
				reopenWhatsNew();
			}}
			ongallery={galleryFromSettings}
			oneditor={() => {
				settingsOpen = false;
				void openEditor();
			}}
			onclose={() => (settingsOpen = false)}
			versions={versionsOverview}
			onversionlimits={(days, max) =>
				void tauriBackend
					.versionsLimits(days, max)
					.catch((e) => (opError = describeError(e)))
					.then(loadVersions)}
			onunprotect={(f) => void protectVersions(f, false)}
		/>
	{/if}

	{#if gallery}
		<ThemeGallery
			theme={settings.theme}
			personal={settings.personalThemes}
			accent={settings.accent}
			accentColor={settings.accentColor}
			x={gallery.x}
			y={gallery.y}
			onpick={fromGallery}
			onclose={() => (gallery = null)}
		/>
	{/if}

	{#if menu}
		<ContextMenu
			items={menu.items}
			x={menu.x}
			y={menu.y}
			onpick={runAction}
			onclose={() => (menu = null)}
		/>
	{/if}

	{#if conflicts.length > 0}
		<ConfirmConflicts
			names={conflicts}
			mode={pendingConflicts?.mode ?? 'copy'}
			onpick={(p) => run(p)}
			oncancel={() => {
				conflicts = [];
				pendingConflicts = null;
			}}
		/>
	{/if}

	{#if versionsOf}
		{@const file = versionsOf}
		<VersionsDialog
			backend={tauriBackend}
			path={file.path}
			size={file.size}
			protectedFolder={protectedFolderOf(file.path, versionsOverview?.protected ?? [])}
			onopen={(v) => void openVersion(file, v)}
			oncompare={(v) => void compareVersion(file, v)}
			onrestored={() => {
				versionsOf = null;
				notify(t('«{0}» ripristinato. La versione di prima resta fra le versioni.', [file.name]));
				void reload();
			}}
			onprotect={() => void protectVersions(folderOf(file.path), true)}
			onclose={() => (versionsOf = null)}
		/>
	{/if}

	{#if serverDialog}
		<ServerDialog
			mode={serverDialog.mode}
			error={serverDialog.error}
			busy={serverDialog.busy}
			onsave={(c, pw) => void saveServer(c, pw)}
			onremove={(id) => void removeServer(id)}
			ontrust={() => void confirmServerKey()}
			onpassword={(pw, r) => void submitServerPassword(pw, r)}
			onpickfolder={(initial) => tauriBackend.pickFolder(t('Cartella da copiare sul server'), initial).catch(() => null)}
			onbackupnow={(c, pw) => void backUpServerNow(c, pw)}
			oncancel={() => (serverDialog = null)}
		/>
	{/if}

	{#if vaultDialog}
		{@const d = vaultDialog}
		<VaultDialog
			mode={d.mode}
			name={nameOf(d.path).replace(/\.cassaforte$/i, '')}
			count={d.sources?.length ?? 0}
			error={d.error}
			busy={d.busy}
			onunlock={(pw) => void unlockVault(pw)}
			oncreate={(n, pw) => void createVault(n, pw)}
			onadd={(t) => void confirmAdd(t)}
			oncancel={() => (vaultDialog = null)}
		/>
	{/if}

	{#if vaultToDelete}
		<ConfirmTrash
			items={vaultToDelete}
			permanent
			onconfirm={() => void deleteFromVault()}
			oncancel={() => (vaultToDelete = null)}
		/>
	{/if}

	{#if rulesOf}
		{@const folder = rulesOf}
		<RulesDialog
			folder={folder}
			rules={rules.forFolder(folder)}
			log={rules.log.filter((l) => sameFolder(l.folder, folder))}
			backend={tauriBackend}
			labelName={(id) => colors.nameOf(id)}
			onsave={(r) => {
				rules.saveFolder(folder, r);
				rulesOf = null;
			}}
			onclose={() => (rulesOf = null)}
			onundo={(id) => void undoRule(id)}
		/>
	{/if}

	{#if workspaceName}
		<NameDialog
			title={workspaceName.mode === 'new' ? t('Nuova area di lavoro') : t('Rinomina l’area')}
			label={t('Nome dell\'area')}
			value={workspaceName.mode === 'rename' ? (workspaces.current ?? '') : (store.activeTab ? locationName(store.activeTab.path) : '')}
			confirm={workspaceName.mode === 'new' ? t('Salva area') : t('Rinomina')}
			error={workspaceName.error}
			onconfirm={confirmWorkspaceName}
			oncancel={() => (workspaceName = null)}
		/>
	{/if}

	{#if toTrash.length > 0}
		<ConfirmTrash items={toTrash} onconfirm={() => trash()} oncancel={() => (toTrash = [])} />
	{/if}
	{#if paletteOpen}
		<Palette commands={paletteCommands()} onclose={() => (paletteOpen = false)} />
	{/if}
	{#if toConvert}
		{@const items = toConvert}
		<ImageConvert items={items} onconvert={(o) => void convertImages(items, o)} onclose={() => (toConvert = null)} />
	{/if}
	{#if checksumOf}
		<ChecksumDialog item={checksumOf} backend={tauriBackend} onclose={() => (checksumOf = null)} />
	{/if}

	{#if batchRename.length > 0}
		<BatchRename
			entries={batchRename}
			taken={new Set((store.activeTab?.entries ?? []).map((e) => e.name.toLowerCase()))}
			onconfirm={runBatchRename}
			oncancel={() => (batchRename = [])}
			mediaOf={(e) => media.of(e)}
		/>
	{/if}

	{#if friendsOpen && friendsState}
		<FriendsDialog
			backend={tauriBackend}
			status={friendsState}
			shared={lanState?.shared ?? null}
			onclose={() => (friendsOpen = false)}
			onerror={(e) => (opError = describeError(e))}
		/>
	{/if}

	{#if editing}
		<TextEditor
			path={editing.path}
			name={editing.name}
			onclose={() => (editing = null)}
			onsaved={() => void reload()}
			{describeError}
		/>
	{/if}

	{#if welcomeOpen}
		<Welcome onclose={closeWelcome} />
	{/if}

	{#if whatsNewOpen.length > 0}
		<WhatsNewDialog
			entries={whatsNewOpen}
			onclose={closeWhatsNew}
			installed={whatsNewFromMegaphone ? currentVersion || WHATS_NEW[0].version : undefined}
			previous={whatsNewFromMegaphone ? WHATS_NEW.filter((n) => n.version !== whatsNewOpen[0]?.version) : []}
		/>
	{/if}

	{#if lanRequests[0] && lanState}
		<!-- A new request starts again from the received folder, not from the
		     choice made for the one before. -->
		{#key lanRequests[0].id}
			<IncomingFiles
				request={lanRequests[0]}
				folder={lanState.receivedFolder}
				onpick={(from) => tauriBackend.pickFolder(t('Dove salvare i file in arrivo'), from)}
				onanswer={respondLan}
			/>
		{/key}
	{/if}

	{#if editorOpen}
		<ThemeEditor
			currentTheme={activeTheme}
			personal={settings.personalThemes}
			backend={tauriBackend}
			onpreview={(t) => fromEditor({ kind: 'preview', theme: t })}
			onsave={(t) => fromEditor({ kind: 'save', theme: t })}
			ondelete={(id) => fromEditor({ kind: 'delete', id })}
			onclose={() => fromEditor({ kind: 'close' })}
		/>
	{/if}

	<!-- The system colour picker for the custom highlight: hidden, it is
	     opened by the rainbow swatch of the Appearance menu. -->
	<input
		class="color-picker"
		type="color"
		bind:this={colorPicker}
		value={settings.accentColor}
		aria-label={t('Colore d\'evidenziazione personalizzato')}
		oninput={(e) => {
			settings.set('accentColor', e.currentTarget.value);
			settings.set('accent', CUSTOM_ACCENT);
		}}
	/>

	{#if toDelete}
		<ConfirmTrash
			items={toDelete.items}
			permanent
			onconfirm={deletePermanently}
			oncancel={() => (toDelete = null)}
		/>
	{/if}

	<footer class="settings">
		{#if isDefault}
			<button onclick={restoreExplorer}>{t('Ripristina Esplora risorse')}</button>
		{:else}
			<button onclick={setAsDefault}>{t('Imposta come predefinito')}</button>
		{/if}
		{#if message}<span class="note">{message}</span>{/if}
		<span class="state">
			<!-- A single expression: Svelte strips the trailing space of an {#if}
			     block, and the text became «1 selezionati ·10 elementi». --> {t('{0}{1} elementi', [selection.length > 0 ? t('{0} selezionati · ', [selection.length]) : '', visibleItems.length])} </span>
		<!-- As in Explorer's status bar: quick switch between details and
		     icons, plus a slider for the icon size. -->
		<div class="quick-view">
			{#if settings.view === 'icons'}
				<input
					class="cursor"
					type="range"
					min={SIDE_MIN}
					max={SIDE_MAX}
					value={settings.side}
					aria-label={t('Dimensione delle icone')}
					title={t('Dimensione delle icone (anche Ctrl+rotella)')}
					oninput={(e) => settings.setView('icons', Number(e.currentTarget.value))}
				/>
			{/if}
			<button
				class="quick"
				class:on={settings.view === 'details'}
				aria-pressed={settings.view === 'details'}
				aria-label={t('Dettagli')}
				title={t('Dettagli')}
				onclick={() => settings.setView('details')}
			>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<rect x="2" y="3" width="12" height="2" fill="currentColor" />
					<rect x="2" y="7" width="12" height="2" fill="currentColor" />
					<rect x="2" y="11" width="12" height="2" fill="currentColor" />
				</svg>
			</button>
			<button
				class="quick"
				class:on={settings.view === 'icons'}
				aria-pressed={settings.view === 'icons'}
				aria-label={t('Icone grandi')}
				title={t('Icone grandi')}
				onclick={() => settings.setView('icons', settings.view === 'icons' ? settings.side : 128)}
			>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<rect x="2" y="2" width="5" height="5" fill="currentColor" />
					<rect x="9" y="2" width="5" height="5" fill="currentColor" />
					<rect x="2" y="9" width="5" height="5" fill="currentColor" />
					<rect x="9" y="9" width="5" height="5" fill="currentColor" />
				</svg>
			</button>
		</div>
	</footer>
</div>

<style>
	/*
	 * It holds the rail and is the reference for the train, which
	 * overflows upwards over the header.
	 */
	/*
	 * The same sky as the header continues down to the rail; the tile is
	 * shifted so that the two strips do not repeat one below the other.
	 */
	.main-line {
		position: relative;
		flex-shrink: 0;
		z-index: 3;
		background: var(--stars, none) 210px 0 / var(--sky-size, 480px 40px) repeat, var(--bg);
	}
	/*
	 * The rail is decoration: the click passes to the container, which
	 * moves the window.
	 */
	.main-line > :global(*) {
		pointer-events: none;
	}
	.body {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	/*
	 * The background sits here and not on the bar: this way the rail passes
	 * between the two and the nodes of the stops sit above it, like
	 * stations on the line.
	 */
	.places {
		position: relative;
		display: flex;
		flex-shrink: 0;
		background: var(--surface-glass);
	}
	.places > :global(.rail) {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 13px;
		pointer-events: none;
	}
	.places > :global(.sidebar) {
		position: relative;
		z-index: 1;
		background: transparent;
	}
	main {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		border-left: 1px solid var(--border);
	}
	/* List and preview side by side: the list takes all the free space. */
	.content {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.content > :global(:first-child) {
		flex: 1;
		min-width: 0;
	}
	.active-pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.active-pane > :global(:last-child) {
		flex: 1;
		min-height: 0;
	}
	/* Dual pane: two equal halves split by a hairline; the passive one is order 1. */
	.content > :global(.pane.passive) {
		flex: 1;
		order: 1;
		border-inline: 1px solid var(--border);
	}
	.content > :global(.preview) {
		order: 3;
	}
	.active-pane.divided {
		background: color-mix(in srgb, var(--text) 2%, transparent);
	}
	.settings {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 34px;
		padding: 0 12px;
		background: var(--surface-glass);
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}
	.settings button {
		height: 24px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
	}
	.settings button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.note {
		color: var(--text-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.quick-view {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.settings .quick {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		padding: 0;
		border: none;
	}
	.settings .quick.on {
		color: var(--current);
		background: var(--accent-soft);
	}
	.cursor {
		width: 120px;
		margin-right: 6px;
		accent-color: var(--accent);
	}
	.state {
		margin-left: auto;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.color-picker {
		position: fixed;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.close-error {
		float: right;
		border: none;
		background: transparent;
		color: inherit;
		font-size: calc(15px * var(--text-scale, 1));
		cursor: default;
	}
	.error {
		padding: 10px 16px;
		background: rgba(196, 43, 28, 0.12);
		border-bottom: 1px solid rgba(196, 43, 28, 0.3);
		color: var(--error-text);
	}
	/* Duplicates summary: counts as timetable figures, one action at the end. */
	.duplicates-summary {
		display: flex;
		align-items: center;
		gap: 20px;
		min-height: 40px;
		padding: 0 12px 0 16px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		color: var(--text-dim);
	}
	.duplicates-summary b {
		margin-right: 4px;
		color: var(--text);
		font-family: var(--font-display);
		font-weight: 400;
		font-size: calc(15px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
	}
	.duplicates-summary button + button {
		margin-left: -12px;
	}
	.duplicates-summary button {
		margin-left: auto;
		height: 24px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	.duplicates-summary button:hover {
		background: var(--row-hover);
	}
	.duplicates-summary .total-growth {
		color: var(--signal, #ffb454);
	}
	.duplicates-summary button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.notice {
		padding: 8px 16px;
		background: color-mix(in srgb, var(--current) 10%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--current) 30%, transparent);
		color: var(--current);
	}
	.update {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	/* The download as a thin line of current, like the rail. */
	.update-bar {
		position: relative;
		flex: 0 1 180px;
		height: 4px;
		overflow: hidden;
		border-radius: 2px;
		background: color-mix(in srgb, var(--current) 20%, transparent);
	}
	.update-bar > span {
		position: absolute;
		inset-block: 0;
		left: 0;
		background: var(--current);
		box-shadow: 0 0 6px var(--current);
		transition: width 0.2s linear;
	}
	.update-bar > span.unknown {
		width: 30%;
		animation: update-sweep 1.2s ease-in-out infinite;
	}
	@keyframes update-sweep {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(340%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.update-bar > span.unknown {
			animation: none;
			width: 100%;
			opacity: 0.5;
		}
	}
	.update-percent {
		font-variant-numeric: tabular-nums;
		min-width: 4ch;
	}
	.update span {
		flex: 1;
	}
	.update button {
		padding: 4px 12px;
		border: 1px solid color-mix(in srgb, var(--current) 40%, transparent);
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.update button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	/* A full drive is a warning, not news: signal orange instead of the current's cyan. */
	.reminder {
		background: color-mix(in srgb, var(--signal, #ffb454) 8%, transparent);
		border-bottom-color: color-mix(in srgb, var(--signal, #ffb454) 30%, transparent);
		color: var(--signal, #ffb454);
	}
	.reminder b {
		font-family: var(--font-display);
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}
	.reminder button {
		border-color: color-mix(in srgb, var(--signal, #ffb454) 40%, transparent);
	}
</style>
