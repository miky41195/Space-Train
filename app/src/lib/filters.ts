import { t } from './i18n';
import { extensionsOf } from './icons';
import type { SearchCriteria } from './ipc';

/** Smart folder filters chosen in the search bar. `null` = no limit. */
export interface Filters {
	type: TypeFilter | null;
	size: SizeFilter | null;
	date: DateFilter | null;
}

export const NO_FILTERS: Filters = { type: null, size: null, date: null };

export const TYPES = [
	{ id: 'videos', name: t('Video'), categories: ['video'] },
	{ id: 'images', name: t('Immagini'), categories: ['image'] },
	{ id: 'audio', name: t('Audio'), categories: ['audio'] },
	{ id: 'documents', name: t('Documenti'), categories: ['doc', 'sheet', 'slide', 'text'] },
	{ id: 'archives', name: t('Archivi'), categories: ['archive'] }
] as const;
export type TypeFilter = (typeof TYPES)[number]['id'];

const MB = 1024 * 1024;
export const SIZES = [
	{ id: '100mb', name: t('oltre 100 MB'), bytes: 100 * MB },
	{ id: '1gb', name: t('oltre 1 GB'), bytes: 1024 * MB }
] as const;
export type SizeFilter = (typeof SIZES)[number]['id'];

const DAY = 24 * 60 * 60 * 1000;
export const DATES = [
	{ id: 'today', name: 'oggi' },
	{ id: '7', name: t('negli ultimi 7 giorni') },
	{ id: '30', name: t('negli ultimi 30 giorni') },
	{ id: 'year', name: t('più di un anno fa') }
] as const;
export type DateFilter = (typeof DATES)[number]['id'];

export function filtersActive(f: Filters): boolean {
	return f.type !== null || f.size !== null || f.date !== null;
}

/** The filters as search criteria for Rust, with dates relative to `now`. */
export function filterCriteria(f: Filters, now: Date = new Date()): Partial<SearchCriteria> {
	const out: Partial<SearchCriteria> = {};
	const type = TYPES.find((t) => t.id === f.type);
	if (type) out.extensions = extensionsOf([...type.categories]);
	const size = SIZES.find((p) => p.id === f.size);
	if (size) out.minSize = size.bytes;
	if (f.date === 'today') out.modifiedAfter = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	else if (f.date === '7') out.modifiedAfter = now.getTime() - 7 * DAY;
	else if (f.date === '30') out.modifiedAfter = now.getTime() - 30 * DAY;
	else if (f.date === 'year') out.modifiedBefore = now.getTime() - 365 * DAY;
	return out;
}

/** A short name for a search: «Video oltre 1 GB», «“fattura” modificati oggi». */
export function describeSearch(text: string, f: Filters): string {
	const parts: string[] = [];
	const type = TYPES.find((t) => t.id === f.type);
	parts.push(type ? type.name : text ? t('«{0}»', [text]) : t('File'));
	if (type && text) parts.push(t('con «{0}»', [text]));
	const size = SIZES.find((p) => p.id === f.size);
	if (size) parts.push(size.name);
	const date = DATES.find((d) => d.id === f.date);
	if (date) parts.push(t('modificati {0}', [date.name]));
	return parts.join(' ');
}

// Saved searches keep the names earlier versions wrote: translated here, both ways.
const STORED_TYPES: Record<TypeFilter, string> = {
	videos: 'video',
	images: 'immagini',
	audio: 'audio',
	documents: 'documenti',
	archives: 'archivi'
};
const STORED_DATES: Record<DateFilter, string> = { today: 'oggi', '7': '7', '30': '30', year: 'anno' };
const back = <T extends string>(map: Record<T, string>, v: unknown): T | null =>
	(Object.keys(map) as T[]).find((k) => map[k] === v) ?? null;

/** Saved filters → in memory. Unknown values become «no limit». */
export function filtersFromStored(stored: Record<string, unknown>): Filters {
	const size = SIZES.find((s) => s.id === stored.peso)?.id ?? null;
	return { type: back(STORED_TYPES, stored.tipo), size, date: back(STORED_DATES, stored.data) };
}

/** In memory → saved filters. */
export function filtersToStored(f: Filters): Record<string, unknown> {
	return { tipo: f.type && STORED_TYPES[f.type], peso: f.size, data: f.date && STORED_DATES[f.date] };
}
