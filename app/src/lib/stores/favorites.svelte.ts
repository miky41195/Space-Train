import type { Entry } from '../ipc';
import { onChangeOf } from './sync';

// Saved key: unchanged so existing favourites survive.
const KEY = 'space-train.preferiti';

/** The least of Storage that is needed: in tests any object will do. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Favourites per folder: each folder keeps its own list of names to show
 * in the zone at the top, apart from the rest.
 *
 * Names are saved, not full paths: the favourite belongs to the folder it
 * was chosen in, and the parent's path is already the key. All lowercase
 * because on Windows `Foto` and `foto` are the same file.
 */
export class FavoritesStore {
	#map = $state<Record<string, string[]>>({});

	constructor(private storage: KeyValueStore | null = defaultStorage()) {
		this.#read(storage?.getItem(KEY) ?? null);
		onChangeOf(KEY, (v) => this.#read(v));
	}

	#read(raw: string | null): void {
		try {
			this.#map = raw ? JSON.parse(raw) : {};
		} catch {
			// Unreadable or corrupt storage: start over without favourites
			// instead of blocking startup.
		}
	}

	/** The folder's favourite names, already normalised. */
	of(folder: string): ReadonlySet<string> {
		return new Set(this.#map[keyOf(folder)] ?? []);
	}

	/** True when all the given items are already favourites. With zero items, false. */
	all(folder: string, names: readonly string[]): boolean {
		if (names.length === 0) return false;
		const set = this.of(folder);
		return names.every((n) => set.has(n.toLowerCase()));
	}

	/**
	 * If they are all favourites already it removes them, otherwise it adds
	 * them all. On a mixed selection adding wins: it is the gesture the user
	 * makes most often, and repeating it then removes them.
	 */
	toggle(folder: string, names: readonly string[]): void {
		if (names.length === 0) return;
		const set = new Set(this.of(folder));
		const remove = this.all(folder, names);

		for (const n of names) {
			if (remove) set.delete(n.toLowerCase());
			else set.add(n.toLowerCase());
		}

		this.#write(folder, set);
	}

	/** After a rename the favourite follows the file, instead of getting lost. */
	rename(folder: string, oldName: string, newName: string): void {
		const set = new Set(this.of(folder));
		if (!set.delete(oldName.toLowerCase())) return;
		set.add(newName.toLowerCase());
		this.#write(folder, set);
	}

	#write(folder: string, set: Set<string>): void {
		const k = keyOf(folder);
		const copy = { ...this.#map };

		if (set.size === 0) delete copy[k];
		else copy[k] = [...set];

		this.#map = copy;

		try {
			this.storage?.setItem(KEY, JSON.stringify(copy));
		} catch {
			// Quota full or storage refused: favourites stay valid for this
			// session.
		}
	}
}

/**
 * Splits the items into the two zones keeping the starting order: within
 * each zone the sort chosen with the headers applies.
 */
export function split(entries: readonly Entry[], favorites: ReadonlySet<string>): { favorites: Entry[]; common: Entry[] } {
	const above: Entry[] = [];
	const below: Entry[] = [];

	for (const e of entries) {
		if (favorites.has(e.name.toLowerCase())) above.push(e);
		else below.push(e);
	}

	return { favorites: above, common: below };
}

function keyOf(folder: string): string {
	return folder.toLowerCase();
}

function defaultStorage(): KeyValueStore | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
