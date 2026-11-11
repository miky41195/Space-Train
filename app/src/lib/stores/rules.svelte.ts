import type { Backend, Entry } from '../ipc';
import { nomeDi } from '../posizioni';
import { dayStart, matches, problem, samePath, settled, type Rule } from '../rules';
import { AnnullaStore, type Operazione } from './annulla.svelte';
import type { IdColore } from './colori.svelte';
import type { Archivio } from './preferiti.svelte';
import { alCambioDi } from './sincronizza';

const KEY = 'space-train.regole';
const MAX_LOG = 100;

interface Saved {
	rules: Rule[];
	/** Rule id → start of the day it last ran, for daily rules. */
	lastDaily: Record<string, number>;
}

export interface LogEntry {
	id: number;
	time: number;
	folder: string;
	text: string;
	/** Undoes the action; null when it failed or cannot be undone. */
	undo: (() => Promise<void>) | null;
	failed?: boolean;
	undone?: boolean;
}

/** What the rules need from the rest of the app, so tests can stand in for it. */
export interface RuleDeps {
	backend: Pick<Backend, 'listDir' | 'transfer' | 'moveToTrash' | 'navigate' | 'renameEntry' | 'trashRestoreOriginals' | 'imageRotate'>;
	labelOf: (path: string) => IdColore | undefined;
	setLabel: (paths: string[], color: IdColore | null) => void;
	labelName: (id: IdColore) => string;
}

/**
 * Automatic rules on folders: the list, its storage, and the engine that
 * looks at the folders and acts. Only the main window calls `tick`.
 */
export class RulesStore {
	rules = $state<Rule[]>([]);
	log = $state<LogEntry[]>([]);
	#lastDaily: Record<string, number> = {};
	/** Per folder: what the last look saw, and new files waiting to settle. */
	#looks = new Map<string, { seen: Map<string, string>; waiting: Map<string, string> }>();
	#running = false;
	#logId = 0;

	constructor(
		private deps: RuleDeps,
		private archivio: Archivio | null = defaultStorage()
	) {
		this.#read(archivio?.getItem(KEY) ?? null);
		alCambioDi(KEY, (v) => this.#read(v));
	}

	forFolder(folder: string): Rule[] {
		return this.rules.filter((r) => samePath(r.folder, folder));
	}

	hasRules(folder: string): boolean {
		return this.rules.some((r) => r.enabled && samePath(r.folder, folder));
	}

	/** Replaces the rules of one folder. Invalid rules are not saved. */
	saveFolder(folder: string, rules: Rule[]): void {
		const ok = rules.filter((r) => problem(r) === null).map((r) => ({ ...r, folder }));
		this.rules = [...this.rules.filter((r) => !samePath(r.folder, folder)), ...ok];
		const ids = new Set(this.rules.map((r) => r.id));
		this.#lastDaily = Object.fromEntries(Object.entries(this.#lastDaily).filter(([id]) => ids.has(id)));
		this.#write();
	}

	/** One look at every folder with rules; acts on what matches. */
	async tick(now = Date.now()): Promise<void> {
		if (this.#running) return;
		this.#running = true;
		try {
			const folders = [...new Set(this.rules.filter((r) => r.enabled).map((r) => r.folder.toLowerCase()))];
			for (const key of [...this.#looks.keys()]) if (!folders.includes(key)) this.#looks.delete(key);
			for (const key of folders) {
				const rules = this.rules.filter((r) => r.enabled && r.folder.toLowerCase() === key);
				await this.#look(rules[0].folder, rules, now);
			}
		} finally {
			this.#running = false;
		}
	}

	async #look(folder: string, rules: Rule[], now: number): Promise<void> {
		let files: Entry[];
		try {
			const listing = await this.deps.backend.listDir(folder, { key: 'name', ascending: true }, false);
			files = listing.entries.filter((e) => e.kind === 'file');
		} catch {
			return; // Folder gone or unreadable: try again next time.
		}
		const key = folder.toLowerCase();
		const before = this.#looks.get(key);
		const st = settled(before?.seen ?? null, before?.waiting ?? new Map(), files);
		this.#looks.set(key, { seen: st.seen, waiting: st.waiting });

		// Each file is handled by the first rule that takes it.
		const done = new Set<string>();
		for (const f of st.ready) {
			const r = rules.find((r) => r.when === 'arrival' && matches(r.if, f, now));
			if (r) {
				done.add(f.path);
				await this.#act(r, f);
			}
		}
		const today = dayStart(now);
		for (const r of rules.filter((r) => r.when === 'daily' && (this.#lastDaily[r.id] ?? 0) < today)) {
			this.#lastDaily[r.id] = today;
			this.#write();
			for (const f of files) {
				if (done.has(f.path) || !matches(r.if, f, now)) continue;
				done.add(f.path);
				await this.#act(r, f);
			}
		}
	}

	async #act(r: Rule, f: Entry): Promise<void> {
		const { backend } = this.deps;
		const text = logText(f.name, r, this.deps.labelName);
		try {
			let op: Operazione | null = null;
			let undoLabel: (() => Promise<void>) | null = null;
			switch (r.then.type) {
				case 'move':
				case 'copy': {
					const res = await backend.transfer({
						opId: 0,
						sources: [f.path],
						dest: r.then.dest,
						mode: r.then.type,
						policy: 'salta',
						onProgress: () => {}
					});
					if (res.saltati > 0 || res.coppie.length === 0) {
						this.#push(r.folder, `${f.name}: saltato, esiste già in ${nomeDi(r.then.dest)}`, null, true);
						return;
					}
					op = r.then.type === 'move' ? { tipo: 'sposta', coppie: res.coppie } : { tipo: 'crea', paths: res.coppie.map(([, to]) => to), descrizione: '' };
					break;
				}
				case 'trash':
					await backend.moveToTrash([f.path]);
					op = { tipo: 'cestino', originali: [f.path] };
					break;
				case 'label': {
					const previous = this.deps.labelOf(f.path) ?? null;
					this.deps.setLabel([f.path], r.then.color);
					undoLabel = async () => this.deps.setLabel([f.path], previous);
					break;
				}
			}
			const undo =
				undoLabel ??
				(op &&
					(async () => {
						const u = new AnnullaStore(backend as Backend);
						u.registra(op);
						await u.annulla();
					}));
			this.#push(r.folder, text, undo ?? null);
		} catch (err) {
			const msg = (err as { message?: string })?.message ?? String(err);
			this.#push(r.folder, `${f.name}: non riuscito (${msg})`, null, true);
		}
	}

	/** Undoes one logged action. Throws what the undo threw. */
	async undo(id: number): Promise<void> {
		const entry = this.log.find((l) => l.id === id);
		if (!entry?.undo || entry.undone) return;
		await entry.undo();
		this.log = this.log.map((l) => (l.id === id ? { ...l, undone: true } : l));
	}

	#push(folder: string, text: string, undo: LogEntry['undo'], failed = false): void {
		this.log = [{ id: ++this.#logId, time: Date.now(), folder, text, undo, failed }, ...this.log].slice(0, MAX_LOG);
	}

	#read(raw: string | null): void {
		try {
			const v = (raw ? JSON.parse(raw) : null) as Partial<Saved> | null;
			this.rules = Array.isArray(v?.rules) ? v.rules.filter(validShape) : [];
			this.#lastDaily = v?.lastDaily && typeof v.lastDaily === 'object' ? { ...v.lastDaily } : {};
		} catch {
			this.rules = [];
			this.#lastDaily = {};
		}
	}

	#write(): void {
		try {
			this.archivio?.setItem(KEY, JSON.stringify({ rules: this.rules, lastDaily: this.#lastDaily } satisfies Saved));
		} catch {
			// Storage denied: rules last for this session.
		}
	}
}

function logText(name: string, r: Rule, labelName: (id: IdColore) => string): string {
	switch (r.then.type) {
		case 'move':
			return `${name} spostato in ${nomeDi(r.then.dest)}`;
		case 'copy':
			return `${name} copiato in ${nomeDi(r.then.dest)}`;
		case 'trash':
			return `${name} nel cestino`;
		case 'label':
			return `${name}: etichetta ${labelName(r.then.color)}`;
	}
}

/** Saved rules are kept only when well formed and still valid. */
function validShape(r: unknown): r is Rule {
	const x = r as Rule;
	try {
		return (
			!!x &&
			typeof x.id === 'string' &&
			typeof x.folder === 'string' &&
			(x.when === 'arrival' || x.when === 'daily') &&
			typeof x.enabled === 'boolean' &&
			!!x.if &&
			!!x.then &&
			problem(x) === null
		);
	} catch {
		return false;
	}
}

function defaultStorage(): Archivio | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
