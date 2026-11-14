import type { Entry } from './ipc';
import { categoryFor } from './icons';
import { formatBytes } from './locations';

export type GroupMode = 'none' | 'name' | 'type' | 'date' | 'size';

/** The group modes as saved by earlier versions: the settings keep writing these. */
export const STORED_GROUP_MODES: Record<GroupMode, string> = {
	none: 'nessuno',
	name: 'nome',
	type: 'tipo',
	date: 'data',
	size: 'dimensione'
};

export interface Zone {
	label: string;
	count: number;
	/** Favourites and recent files have a colour of their own; the other zones are neutral. */
	tone?: 'favorites' | 'recent';
}

export interface Layout {
	/** The items in the order they are drawn, zone after zone. */
	items: Entry[];
	/** Empty = undivided list, no headers. */
	zones: Zone[];
}

/** Groups by type, in the order they appear. */
const TYPE_GROUPS: Array<{ label: string; categories: string[] }> = [
	{ label: 'Cartelle', categories: ['dir'] },
	{ label: 'Documenti', categories: ['doc', 'text', 'sheet', 'slide'] },
	{ label: 'Immagini', categories: ['image'] },
	{ label: 'Video', categories: ['video'] },
	{ label: 'Audio', categories: ['audio'] },
	{ label: 'Archivi', categories: ['archive'] },
	{ label: 'Programmi', categories: ['exec'] },
	{ label: 'Codice e dati', categories: ['code', 'markup', 'style', 'data', 'config'] },
	{ label: 'Caratteri', categories: ['font'] },
	{ label: 'Altri file', categories: ['plain'] }
];

function typeGroup(e: Entry): string {
	const category = e.kind === 'dir' ? 'dir' : categoryFor(e.name);
	return TYPE_GROUPS.find((g) => g.categories.includes(category))?.label ?? 'Altri file';
}

const DATE_GROUPS = [
	'Oggi',
	'Ieri',
	'Questa settimana',
	'Questo mese',
	'Quest’anno',
	'Più di un anno fa',
	'Senza data'
] as const;

function dateGroup(e: Entry, now: number): string {
	if (e.modified === null) return 'Senza data';

	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const start = today.getTime();
	const day = 24 * 60 * 60 * 1000;

	if (e.modified >= start) return 'Oggi';
	if (e.modified >= start - day) return 'Ieri';
	if (e.modified >= start - 6 * day) return 'Questa settimana';
	if (e.modified >= start - 30 * day) return 'Questo mese';
	if (e.modified >= start - 365 * day) return 'Quest’anno';
	return 'Più di un anno fa';
}

const NAME_GROUPS = ['0–9', 'A–H', 'I–P', 'Q–Z', 'Altri'] as const;

/** Name ranges as in Explorer: by initial, in blocks. */
function nameGroup(e: Entry): string {
	const c = e.name.charAt(0).toUpperCase();
	if (c >= '0' && c <= '9') return '0–9';
	if (c >= 'A' && c <= 'H') return 'A–H';
	if (c >= 'I' && c <= 'P') return 'I–P';
	if (c >= 'Q' && c <= 'Z') return 'Q–Z';
	return 'Altri';
}

const SIZE_GROUPS = [
	'Cartelle',
	'Vuoto',
	'Minuscolo (0–16 KB)',
	'Piccolo (16 KB–1 MB)',
	'Medio (1–128 MB)',
	'Grande (128 MB–1 GB)',
	'Enorme (1–4 GB)',
	'Gigantesco (> 4 GB)'
] as const;

/** The same size ranges as Explorer. */
function sizeGroup(e: Entry): string {
	if (e.kind === 'dir') return 'Cartelle';
	const kb = 1024;
	const mb = 1024 * kb;
	const gb = 1024 * mb;
	if (e.size === 0) return 'Vuoto';
	if (e.size < 16 * kb) return 'Minuscolo (0–16 KB)';
	if (e.size < mb) return 'Piccolo (16 KB–1 MB)';
	if (e.size < 128 * mb) return 'Medio (1–128 MB)';
	if (e.size < gb) return 'Grande (128 MB–1 GB)';
	if (e.size < 4 * gb) return 'Enorme (1–4 GB)';
	return 'Gigantesco (> 4 GB)';
}

/** The periods of the «Recenti» slider, in days. */
export const RECENT_PERIODS = [
	{ days: 1, name: 'Ultimo giorno' },
	{ days: 3, name: 'Ultimi 3 giorni' },
	{ days: 7, name: 'Ultima settimana' },
	{ days: 14, name: 'Ultime 2 settimane' },
	{ days: 30, name: 'Ultimo mese' },
	{ days: 90, name: 'Ultimi 3 mesi' },
	{ days: 180, name: 'Ultimi 6 mesi' },
	{ days: 365, name: 'Ultimo anno' }
] as const;

/**
 * Splits the items into zones: recent ones on top (if asked), then
 * favourites, then the chosen groups.
 *
 * `recentSince` is an instant in milliseconds: what was modified since then
 * rises into the «Modificati di recente» zone, newest first, and is not
 * repeated below — not even among the favourites.
 */
export function layout(
	items: readonly Entry[],
	favorites: ReadonlySet<string>,
	mode: GroupMode,
	now = Date.now(),
	recentSince: number | null = null
): Layout {
	if (recentSince === null) return baseLayout(items, favorites, mode, now);

	const recent = items
		.filter((e) => e.modified !== null && e.modified >= recentSince)
		.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
	const rest = items.filter((e) => !recent.includes(e));
	const base = baseLayout(rest, favorites, mode, now);

	// The recent zone is there even empty: it says nothing changed in the
	// chosen period, instead of making the button just pressed disappear.
	const zones: Zone[] = [{ label: 'Modificati di recente', count: recent.length, tone: 'recent' }];
	if (base.zones.length > 0) zones.push(...base.zones);
	else if (rest.length > 0) zones.push({ label: 'Tutti gli altri', count: rest.length });

	return { items: [...recent, ...base.items], zones };
}

function baseLayout(items: readonly Entry[], favorites: ReadonlySet<string>, mode: GroupMode, now: number): Layout {
	const above: Entry[] = [];
	const below: Entry[] = [];
	for (const e of items) {
		if (favorites.has(e.name.toLowerCase())) above.push(e);
		else below.push(e);
	}

	if (mode === 'none') {
		if (above.length === 0) return { items: [...items], zones: [] };
		return {
			items: [...above, ...below],
			zones: [
				{ label: 'Preferiti', count: above.length, tone: 'favorites' },
				{ label: 'Comuni', count: below.length }
			]
		};
	}

	const { order, key } = {
		name: { order: NAME_GROUPS as readonly string[], key: nameGroup },
		type: { order: TYPE_GROUPS.map((g) => g.label), key: typeGroup },
		date: { order: DATE_GROUPS as readonly string[], key: (e: Entry) => dateGroup(e, now) },
		size: { order: SIZE_GROUPS as readonly string[], key: sizeGroup }
	}[mode];

	const groups = new Map<string, Entry[]>(order.map((o) => [o, []]));
	for (const e of below) groups.get(key(e))!.push(e);

	const zones: Zone[] = [];
	const sorted: Entry[] = [];
	if (above.length > 0) {
		zones.push({ label: 'Preferiti', count: above.length, tone: 'favorites' });
		sorted.push(...above);
	}
	for (const [label, members] of groups) {
		if (members.length === 0) continue;
		zones.push({ label, count: members.length });
		sorted.push(...members);
	}

	return { items: sorted, zones };
}

/** One zone per group of identical files: size of each copy and the space the extra copies take. */
export function duplicateZones(groups: Array<{ size: number; count: number }>): Zone[] {
	return groups.map((g) => ({
		label: `${formatBytes(g.size)} ciascuna · recuperabili ${formatBytes(g.size * (g.count - 1))}`,
		count: g.count
	}));
}
