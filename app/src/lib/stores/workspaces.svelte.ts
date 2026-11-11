import type { Archivio } from './preferiti.svelte';
import { alCambioDi } from './sincronizza';

const KEY = 'space-train.aree';
const MAX_NAME = 40;

/** A named set of tabs the user can come back to. */
export interface Workspace {
	name: string;
	tabs: string[];
	/** Index of the active tab. */
	active: number;
	/** Tab indexes shown side by side, if the dual pane was open. */
	split: [number, number] | null;
}

interface Saved {
	current: string | null;
	areas: Workspace[];
}

export type Snapshot = Omit<Workspace, 'name'>;

/**
 * Workspaces: named sets of tabs. The current one follows the tab bar, so
 * switching away saves what is open and switching back brings it back.
 */
export class WorkspacesStore {
	areas = $state<Workspace[]>([]);
	current = $state<string | null>(null);

	constructor(private archivio: Archivio | null = defaultStorage()) {
		this.#read(archivio?.getItem(KEY) ?? null);
		alCambioDi(KEY, (v) => this.#read(v));
	}

	get(name: string): Workspace | undefined {
		return this.areas.find((a) => a.name === name);
	}

	/** Saves the open tabs under a new name and makes it the current area. Returns the name used. */
	create(name: string, snap: Snapshot): string | null {
		const clean = cleanName(name);
		if (!clean) return null;
		const free = this.#freeName(clean);
		this.areas = [...this.areas, { name: free, ...normalize(snap) }];
		this.current = free;
		this.#write();
		return free;
	}

	/** Keeps the current area in step with the tab bar. */
	update(snap: Snapshot): void {
		const i = this.areas.findIndex((a) => a.name === this.current);
		if (i === -1) return;
		const next = { name: this.areas[i].name, ...normalize(snap) };
		if (JSON.stringify(next) === JSON.stringify(this.areas[i])) return;
		this.areas = this.areas.map((a, j) => (j === i ? next : a));
		this.#write();
	}

	setCurrent(name: string | null): void {
		this.current = name !== null && this.get(name) ? name : null;
		this.#write();
	}

	rename(from: string, to: string): boolean {
		const clean = cleanName(to);
		if (!clean || !this.get(from)) return false;
		if (clean !== from && this.get(clean)) return false;
		this.areas = this.areas.map((a) => (a.name === from ? { ...a, name: clean } : a));
		if (this.current === from) this.current = clean;
		this.#write();
		return true;
	}

	remove(name: string): void {
		this.areas = this.areas.filter((a) => a.name !== name);
		if (this.current === name) this.current = null;
		this.#write();
	}

	#freeName(name: string): string {
		if (!this.get(name)) return name;
		for (let n = 2; ; n++) {
			const candidate = `${name} (${n})`;
			if (!this.get(candidate)) return candidate;
		}
	}

	#read(raw: string | null): void {
		try {
			const v = (raw ? JSON.parse(raw) : null) as Partial<Saved> | null;
			const areas = Array.isArray(v?.areas) ? v.areas.filter(valid).map((a) => ({ ...a, ...normalize(a) })) : [];
			this.areas = areas;
			this.current = typeof v?.current === 'string' && areas.some((a) => a.name === v.current) ? v.current : null;
		} catch {
			this.areas = [];
			this.current = null;
		}
	}

	#write(): void {
		try {
			this.archivio?.setItem(KEY, JSON.stringify({ current: this.current, areas: this.areas } satisfies Saved));
		} catch {
			// Storage denied: areas last for this session.
		}
	}
}

function cleanName(name: string): string {
	return name.trim().slice(0, MAX_NAME);
}

function valid(a: unknown): a is Workspace {
	const w = a as Workspace;
	return (
		!!w &&
		typeof w.name === 'string' &&
		!!cleanName(w.name) &&
		Array.isArray(w.tabs) &&
		w.tabs.length > 0 &&
		w.tabs.every((t) => typeof t === 'string')
	);
}

/** Clamps indexes to the tabs that exist; a split needs two different tabs. */
function normalize(s: Snapshot): Snapshot {
	const n = s.tabs.length;
	const active = Number.isInteger(s.active) ? Math.min(Math.max(s.active, 0), Math.max(n - 1, 0)) : 0;
	const ok = (i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < n;
	const split =
		Array.isArray(s.split) && ok(s.split[0]) && ok(s.split[1]) && s.split[0] !== s.split[1]
			? ([s.split[0], s.split[1]] as [number, number])
			: null;
	return { tabs: [...s.tabs], active, split };
}

function defaultStorage(): Archivio | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
