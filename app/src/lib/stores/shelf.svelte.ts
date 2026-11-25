import type { KeyValueStore } from './favorites.svelte';
import { onChangeOf } from './sync';
import { samePath } from '../locations';

const KEY = 'space-train.shelf';

/** Paths put aside from several folders, to move or copy together. Shared by every window. */
export class ShelfStore {
	items = $state<string[]>([]);

	constructor(private storage: KeyValueStore | null = defaultStorage()) {
		this.#read(storage?.getItem(KEY) ?? null);
		onChangeOf(KEY, (v) => this.#read(v));
	}

	#read(raw: string | null): void {
		try {
			const v: unknown = raw ? JSON.parse(raw) : [];
			this.items = Array.isArray(v) ? v.filter((p): p is string => typeof p === 'string') : [];
		} catch {
			this.items = [];
		}
	}

	/** Returns how many were not there yet. */
	add(paths: readonly string[]): number {
		const next = [...this.items];
		for (const p of paths) if (!next.some((x) => samePath(x, p))) next.push(p);
		const added = next.length - this.items.length;
		this.#write(next);
		return added;
	}

	remove(path: string): void {
		if (this.items.some((p) => samePath(p, path))) this.#write(this.items.filter((p) => !samePath(p, path)));
	}

	/** A shelved item was renamed or moved by other means: it stays on the shelf. */
	move(from: string, to: string): void {
		if (this.items.some((p) => samePath(p, from))) this.#write(this.items.map((p) => (samePath(p, from) ? to : p)));
	}

	clear(): void {
		this.#write([]);
	}

	#write(items: string[]): void {
		this.items = items;
		try {
			this.storage?.setItem(KEY, JSON.stringify(items));
		} catch {
			// Storage refused: the shelf lasts for this session.
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
