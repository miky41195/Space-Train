import type { Entry } from './ipc';

/** One item as a visit remembers it: never the contents. */
export interface Seen {
	name: string;
	folder: boolean;
	size: number;
	modified: number;
}

export interface Visit {
	/** When it was seen, in ms. */
	at: number;
	entries: Seen[];
}

export interface FolderChanges {
	/** When the previous visit was. */
	since: number;
	added: Set<string>;
	modified: Set<string>;
	removed: Seen[];
}

export type ChangeMark = 'new' | 'modified';

/** Hidden items are left out: showing them or not must not look like a change. */
export function seenOf(entries: Entry[]): Seen[] {
	return entries
		.filter((e) => !e.hidden)
		.map((e) => ({ name: e.name, folder: e.kind === 'dir', size: e.size ?? 0, modified: e.modified ?? 0 }));
}

/**
 * What changed since `before`. A folder counts as changed only when it is
 * new or gone: its size and date move with whatever happens inside.
 * Names are compared ignoring case on Windows, like the file system does.
 */
export function folderChanges(before: Visit, entries: Entry[], ignoreCase = true): FolderChanges {
	const key = (n: string) => (ignoreCase ? n.toLowerCase() : n);
	const then = new Map(before.entries.map((s) => [key(s.name), s]));
	const now = seenOf(entries);
	const present = new Set(now.map((s) => key(s.name)));
	const added = new Set<string>();
	const modified = new Set<string>();
	for (const s of now) {
		const old = then.get(key(s.name));
		if (!old) added.add(s.name);
		else if (!s.folder && (old.size !== s.size || old.modified !== s.modified)) modified.add(s.name);
	}
	const removed = before.entries.filter((s) => !present.has(key(s.name)));
	return { since: before.at, added, modified, removed };
}

export function changeOf(c: FolderChanges | null, e: Entry): ChangeMark | undefined {
	if (!c) return undefined;
	if (c.added.has(e.name)) return 'new';
	if (c.modified.has(e.name)) return 'modified';
	return undefined;
}

export function changeCount(c: FolderChanges): number {
	return c.added.size + c.modified.size + c.removed.length;
}
