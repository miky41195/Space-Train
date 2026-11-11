import type { Entry, MediaProps } from '../ipc';
import { autoMediaColumns, isMedia, MEDIA_COLUMNS, type MediaKey } from '../media';
import type { Archivio } from './preferiti.svelte';
import { alCambioDi } from './sincronizza';

const KEY = 'space-train.colonne-media';
const BATCH = 200;
/** Past this many cached files the cache starts over: details are cheap to ask again. */
const MAX_CACHED = 20_000;

type Fetch = (paths: string[]) => Promise<Array<MediaProps | null>>;

/**
 * Photo, video and music details of the files on screen, asked of the
 * backend in batches and kept until the file changes; plus the media
 * columns chosen by hand for a folder.
 */
export class MediaStore {
	#props = $state<Record<string, MediaProps | null>>({});
	#pending = new Set<string>();
	/** Folder (lowercase) → columns picked by hand; missing = automatic. */
	#chosen = $state<Record<string, MediaKey[]>>({});

	constructor(
		private fetch: Fetch,
		private archivio: Archivio | null = defaultStorage()
	) {
		this.#read(archivio?.getItem(KEY) ?? null);
		alCambioDi(KEY, (v) => this.#read(v));
	}

	/** Details of a file: undefined while unknown, null when it has none. */
	of(e: Entry): MediaProps | null | undefined {
		return this.#props[cacheKey(e)];
	}

	/** Asks for the details of the media files not known yet. */
	request(entries: readonly Entry[]): Promise<void> {
		const wanted = entries.filter((e) => isMedia(e) && !(cacheKey(e) in this.#props) && !this.#pending.has(cacheKey(e)));
		if (wanted.length === 0) return Promise.resolve();
		const batches: Entry[][] = [];
		for (let i = 0; i < wanted.length; i += BATCH) batches.push(wanted.slice(i, i + BATCH));
		for (const e of wanted) this.#pending.add(cacheKey(e));
		return Promise.all(
			batches.map(async (batch) => {
				const got = await this.fetch(batch.map((e) => e.path)).catch(() => batch.map(() => null));
				const next = Object.keys(this.#props).length > MAX_CACHED ? {} : { ...this.#props };
				batch.forEach((e, i) => {
					next[cacheKey(e)] = got[i] ?? null;
					this.#pending.delete(cacheKey(e));
				});
				this.#props = next;
			})
		).then(() => {});
	}

	/** The folder's media columns: the ones picked by hand, or the automatic set. */
	columnsFor(folder: string, entries: readonly Entry[]): MediaKey[] {
		return this.#chosen[folder.toLowerCase()] ?? autoMediaColumns(entries);
	}

	isChosen(folder: string): boolean {
		return folder.toLowerCase() in this.#chosen;
	}

	/** Shows or hides one media column in this folder, from then on by hand. */
	toggle(folder: string, key: MediaKey, entries: readonly Entry[]): void {
		const now = this.columnsFor(folder, entries);
		const next = now.includes(key) ? now.filter((k) => k !== key) : [...now, key];
		const order = MEDIA_COLUMNS.map((c) => c.key);
		this.#write({ ...this.#chosen, [folder.toLowerCase()]: next.sort((a, b) => order.indexOf(a) - order.indexOf(b)) });
	}

	/** Back to the automatic columns for this folder. */
	automatic(folder: string): void {
		const next = { ...this.#chosen };
		delete next[folder.toLowerCase()];
		this.#write(next);
	}

	#read(raw: string | null): void {
		const keys = new Set<string>(MEDIA_COLUMNS.map((c) => c.key));
		const out: Record<string, MediaKey[]> = {};
		try {
			const v: unknown = raw ? JSON.parse(raw) : {};
			if (v && typeof v === 'object') {
				for (const [k, list] of Object.entries(v)) {
					if (Array.isArray(list)) out[k] = list.filter((x): x is MediaKey => keys.has(x));
				}
			}
		} catch {
			// Unreadable: every folder goes back to automatic.
		}
		this.#chosen = out;
	}

	#write(next: Record<string, MediaKey[]>): void {
		this.#chosen = next;
		try {
			this.archivio?.setItem(KEY, JSON.stringify(next));
		} catch {
			// Storage denied: choices last for this session.
		}
	}
}

/** A changed file is a new key, so its details are asked again. */
function cacheKey(e: Entry): string {
	return `${e.path.toLowerCase()}|${e.modified ?? ''}|${e.size}`;
}

function defaultStorage(): Archivio | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
