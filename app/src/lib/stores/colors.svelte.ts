import { t } from '../i18n';
import type { KeyValueStore } from './favorites.svelte';
import { onChangeOf } from './sync';

// Saved keys: unchanged so existing colours and names survive.
const KEY = 'space-train.colori';
const NAMES_KEY = 'space-train.nomi-colori';
const MAX_NAME = 40;

/** The colours a folder can get, in menu order. Ids are saved: they stay as they are. */
export const FOLDER_COLORS = [
	{ id: 'rosso', name: t('Rosso'), hex: '#ef4444' },
	{ id: 'arancione', name: t('Arancione'), hex: '#f97316' },
	{ id: 'giallo', name: t('Giallo'), hex: '#eab308' },
	{ id: 'verde', name: t('Verde'), hex: '#22c55e' },
	{ id: 'azzurro', name: t('Azzurro'), hex: '#06b6d4' },
	{ id: 'blu', name: t('Blu'), hex: '#3b82f6' },
	{ id: 'viola', name: t('Viola'), hex: '#a855f7' },
	{ id: 'rosa', name: t('Rosa'), hex: '#ec4899' },
	{ id: 'grigio', name: t('Grigio'), hex: '#9ca3af' }
] as const;

export type ColorId = (typeof FOLDER_COLORS)[number]['id'];

/**
 * The colour given to each folder, to recognise it at a glance.
 *
 * The key is the full path in lowercase: the colour follows the folder
 * wherever it shows (list, sidebar, search results), not only in the
 * folder where it was chosen.
 */
export class ColorsStore {
	#map = $state<Record<string, ColorId>>({});
	/** Names the user gave to colours ("Rosso" → "Lavoro"); missing = default name. */
	#names = $state<Partial<Record<ColorId, string>>>({});

	constructor(private storage: KeyValueStore | null = defaultStorage()) {
		this.#read(storage?.getItem(KEY) ?? null);
		this.#readNames(storage?.getItem(NAMES_KEY) ?? null);
		onChangeOf(KEY, (v) => this.#read(v));
		onChangeOf(NAMES_KEY, (v) => this.#readNames(v));
	}

	#readNames(raw: string | null): void {
		try {
			const parsed: unknown = raw ? JSON.parse(raw) : {};
			const names: Partial<Record<ColorId, string>> = {};
			if (parsed && typeof parsed === 'object') {
				for (const c of FOLDER_COLORS) {
					const v = (parsed as Record<string, unknown>)[c.id];
					if (typeof v === 'string' && v.trim()) names[c.id] = v.trim().slice(0, MAX_NAME);
				}
			}
			this.#names = names;
		} catch {
			this.#names = {};
		}
	}

	/** The label's name: the one the user chose, or the colour's own. */
	nameOf(id: ColorId): string {
		return this.#names[id] ?? FOLDER_COLORS.find((c) => c.id === id)?.name ?? id;
	}

	/** Blank restores the colour's own name. */
	rename(id: ColorId, name: string): void {
		const clean = name.trim().slice(0, MAX_NAME);
		const names = { ...this.#names };
		if (clean && clean !== FOLDER_COLORS.find((c) => c.id === id)?.name) names[id] = clean;
		else delete names[id];
		this.#names = names;
		try {
			this.storage?.setItem(NAMES_KEY, JSON.stringify(names));
		} catch {
			// Storage denied: names last for this session.
		}
	}

	#read(raw: string | null): void {
		try {
			this.#map = raw ? JSON.parse(raw) : {};
		} catch {
			// Unreadable storage: start over without colours.
		}
	}

	/** The folder's colour in hex, or `undefined`. */
	of(path: string): string | undefined {
		const id = this.#map[path.toLowerCase()];
		return FOLDER_COLORS.find((c) => c.id === id)?.hex;
	}

	/** Colours in use, in palette order, with how many items carry each. */
	get used(): Array<{ id: ColorId; name: string; hex: string; count: number }> {
		const values = Object.values(this.#map);
		return FOLDER_COLORS.map((c) => ({
			...c,
			name: this.nameOf(c.id),
			count: values.filter((v) => v === c.id).length
		})).filter((c) => c.count > 0);
	}

	/** Every path carrying `color`, in lowercase as stored. */
	pathsOf(color: ColorId): string[] {
		return Object.entries(this.#map)
			.filter(([, v]) => v === color)
			.map(([k]) => k);
	}

	idOf(path: string): ColorId | undefined {
		return this.#map[path.toLowerCase()];
	}

	/** `null` removes the colour. */
	set(paths: readonly string[], color: ColorId | null): void {
		const copy = { ...this.#map };
		for (const p of paths) {
			if (color === null) delete copy[p.toLowerCase()];
			else copy[p.toLowerCase()] = color;
		}
		this.#write(copy);
	}

	/**
	 * The folder was renamed or moved: the colour follows it, and with it
	 * the colour of its coloured subfolders.
	 */
	move(from: string, to: string): void {
		const oldKey = from.toLowerCase();
		const newKey = to.toLowerCase();
		let changed = false;
		const copy: Record<string, ColorId> = {};
		for (const [k, v] of Object.entries(this.#map)) {
			if (k === oldKey || k.startsWith(oldKey + (oldKey.startsWith('/') ? '/' : '\\'))) {
				copy[newKey + k.slice(oldKey.length)] = v;
				changed = true;
			} else {
				copy[k] = v;
			}
		}
		if (changed) this.#write(copy);
	}

	#write(map: Record<string, ColorId>): void {
		this.#map = map;
		try {
			this.storage?.setItem(KEY, JSON.stringify(map));
		} catch {
			// Storage denied: colours last for this session.
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
