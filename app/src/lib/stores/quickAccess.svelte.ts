import type { KeyValueStore } from './favorites.svelte';
import { onChangeOf } from './sync';
import { samePath } from '../locations';

// Saved key: unchanged so existing Quick access lists survive.
const KEY = 'space-train.accesso-rapido';

/**
 * The folders the user pinned in Quick access, at the top of the sidebar.
 * The order is the one they were added in.
 */
export class QuickAccessStore {
	folders = $state<string[]>([]);

	constructor(private storage: KeyValueStore | null = defaultStorage()) {
		this.#read(storage?.getItem(KEY) ?? null);
		onChangeOf(KEY, (v) => this.#read(v));
	}

	#read(raw: string | null): void {
		try {
			const v = raw ? JSON.parse(raw) : [];
			this.folders = Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
		} catch {
			// Unreadable storage: Quick access starts over empty.
			this.folders = [];
		}
	}

	has(path: string): boolean {
		return this.folders.some((c) => samePath(c, path));
	}

	pin(path: string): void {
		if (this.has(path)) return;
		this.#write([...this.folders, path]);
	}

	unpin(path: string): void {
		this.#write(this.folders.filter((c) => !samePath(c, path)));
	}

	/** Renamed or moved: it stays pinned under the new path. */
	move(from: string, to: string): void {
		if (!this.has(from)) return;
		this.#write(this.folders.map((c) => (samePath(c, from) ? to : c)));
	}

	/** Moves an item by one place, to reorder from the menu. */
	shift(path: string, direction: -1 | 1): void {
		const i = this.folders.findIndex((c) => samePath(c, path));
		const j = i + direction;
		if (i === -1 || j < 0 || j >= this.folders.length) return;
		const next = [...this.folders];
		[next[i], next[j]] = [next[j], next[i]];
		this.#write(next);
	}

	#write(folders: string[]): void {
		this.folders = folders;
		try {
			this.storage?.setItem(KEY, JSON.stringify(folders));
		} catch {
			// Storage refused: Quick access lasts for this session.
		}
	}
}

function defaultStorage(): KeyValueStore | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
