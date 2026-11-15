import { t } from '../i18n';
import type { KeyValueStore } from './favorites.svelte';
import { onChangeOf } from './sync';
import { NO_FILTERS, filtersFromStored, filtersToStored, type Filters } from '../filters';

// Saved key: unchanged so existing saved searches survive.
const KEY = 'space-train.ricerche';

/** A search kept as a stop in the sidebar: a smart folder. */
export interface SavedSearch {
	name: string;
	/** Where it searches; `null` = the folder open at the moment (ready-made ones). */
	folder: string | null;
	text: string;
	content: boolean;
	filters: Filters;
}

/** Always there, searching the folder you are in. */
export const READY_SEARCHES: SavedSearch[] = [
	{ name: t('Modificati questa settimana'), folder: null, text: '', content: false, filters: { ...NO_FILTERS, date: '7' } },
	{ name: t('File oltre 1 GB'), folder: null, text: '', content: false, filters: { ...NO_FILTERS, size: '1gb' } }
];

/** One saved search as earlier versions wrote it → in memory. */
function fromStored(x: Record<string, unknown>): SavedSearch | null {
	if (typeof x.nome !== 'string' || !x.filtri || typeof x.filtri !== 'object') return null;
	return {
		name: x.nome,
		folder: typeof x.cartella === 'string' ? x.cartella : null,
		text: typeof x.testo === 'string' ? x.testo : '',
		content: x.contenuto === true,
		filters: filtersFromStored(x.filtri as Record<string, unknown>)
	};
}

function toStored(s: SavedSearch): Record<string, unknown> {
	return { nome: s.name, cartella: s.folder, testo: s.text, contenuto: s.content, filtri: filtersToStored(s.filters) };
}

export class SearchesStore {
	items = $state<SavedSearch[]>([]);

	constructor(private storage: KeyValueStore | null = defaultStorage()) {
		this.#read(storage?.getItem(KEY) ?? null);
		onChangeOf(KEY, (v) => this.#read(v));
	}

	#read(raw: string | null): void {
		try {
			const v = raw ? JSON.parse(raw) : [];
			this.items = Array.isArray(v)
				? v.map((x) => (x && typeof x === 'object' ? fromStored(x) : null)).filter((s): s is SavedSearch => s !== null)
				: [];
		} catch {
			this.items = [];
		}
	}

	/** Saving the same name twice replaces the old one. */
	save(r: SavedSearch): void {
		this.#write([...this.items.filter((v) => v.name !== r.name), r]);
	}

	remove(name: string): void {
		this.#write(this.items.filter((v) => v.name !== name));
	}

	#write(items: SavedSearch[]): void {
		this.items = items;
		try {
			this.storage?.setItem(KEY, JSON.stringify(items.map(toStored)));
		} catch {
			// Storage refused: saved searches last for this session.
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
