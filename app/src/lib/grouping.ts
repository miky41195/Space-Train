import { t } from './i18n';
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
	{ label: t('Cartelle'), categories: ['dir'] },
	{ label: t('Documenti'), categories: ['doc', 'text', 'sheet', 'slide'] },
	{ label: t('Immagini'), categories: ['image'] },
	{ label: t('Video'), categories: ['video'] },
	{ label: t('Audio'), categories: ['audio'] },
	{ label: t('Archivi'), categories: ['archive'] },
	{ label: t('Programmi'), categories: ['exec'] },
	{ label: t('Codice e dati'), categories: ['code', 'markup', 'style', 'data', 'config'] },
	{ label: t('Caratteri'), categories: ['font'] },
	{ label: t('Altri file'), categories: ['plain'] }
];

function typeGroup(e: Entry): string {
	const category = e.kind === 'dir' ? 'dir' : categoryFor(e.name);
	return TYPE_GROUPS.find((g) => g.categories.includes(category))?.label ?? t('Altri file');
}

const DATE_GROUPS = [
	t('Oggi'),
	t('Ieri'),
	t('Questa settimana'),
	t('Questo mese'),
	t('Quest’anno'),
	t('Più di un anno fa'),
	t('Senza data')
] as const;

function dateGroup(e: Entry, now: number): string {
	if (e.modified === null) return t('Senza data');

	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const start = today.getTime();
	const day = 24 * 60 * 60 * 1000;

	if (e.modified >= start) return t('Oggi');
	if (e.modified >= start - day) return t('Ieri');
	if (e.modified >= start - 6 * day) return t('Questa settimana');
	if (e.modified >= start - 30 * day) return t('Questo mese');
	if (e.modified >= start - 365 * day) return t('Quest’anno');
	return t('Più di un anno fa');
}

const NAME_GROUPS = ['0–9', 'A–H', 'I–P', 'Q–Z', t('Altri')] as const;

/** Name ranges as in Explorer: by initial, in blocks. */
function nameGroup(e: Entry): string {
	const c = e.name.charAt(0).toUpperCase();
	if (c >= '0' && c <= '9') return '0–9';
	if (c >= 'A' && c <= 'H') return 'A–H';
	if (c >= 'I' && c <= 'P') return 'I–P';
	if (c >= 'Q' && c <= 'Z') return 'Q–Z';
	return t('Altri');
}

const SIZE_GROUPS = [
	t('Cartelle'),
	t('Vuoto'),
	t('Minuscolo (0–16 KB)'),
	t('Piccolo (16 KB–1 MB)'),
	t('Medio (1–128 MB)'),
	t('Grande (128 MB–1 GB)'),
	t('Enorme (1–4 GB)'),
	t('Gigantesco (> 4 GB)')
] as const;

/** The same size ranges as Explorer. */
function sizeGroup(e: Entry): string {
	if (e.kind === 'dir') return t('Cartelle');
	const kb = 1024;
	const mb = 1024 * kb;
	const gb = 1024 * mb;
	if (e.size === 0) return t('Vuoto');
	if (e.size < 16 * kb) return t('Minuscolo (0–16 KB)');
	if (e.size < mb) return t('Piccolo (16 KB–1 MB)');
	if (e.size < 128 * mb) return t('Medio (1–128 MB)');
	if (e.size < gb) return t('Grande (128 MB–1 GB)');
	if (e.size < 4 * gb) return t('Enorme (1–4 GB)');
	return t('Gigantesco (> 4 GB)');
}

/** The periods of the «Recenti» slider, in days. */
export const RECENT_PERIODS = [
	{ days: 1, name: t('Ultimo giorno') },
	{ days: 3, name: t('Ultimi 3 giorni') },
	{ days: 7, name: t('Ultima settimana') },
	{ days: 14, name: t('Ultime 2 settimane') },
	{ days: 30, name: t('Ultimo mese') },
	{ days: 90, name: t('Ultimi 3 mesi') },
	{ days: 180, name: t('Ultimi 6 mesi') },
	{ days: 365, name: t('Ultimo anno') }
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
	const zones: Zone[] = [{ label: t('Modificati di recente'), count: recent.length, tone: 'recent' }];
	if (base.zones.length > 0) zones.push(...base.zones);
	else if (rest.length > 0) zones.push({ label: t('Tutti gli altri'), count: rest.length });

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
				{ label: t('Preferiti'), count: above.length, tone: 'favorites' },
				{ label: t('Comuni'), count: below.length }
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
		zones.push({ label: t('Preferiti'), count: above.length, tone: 'favorites' });
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
		label: t('{0} ciascuna · recuperabili {1}', [formatBytes(g.size), formatBytes(g.size * (g.count - 1))]),
		count: g.count
	}));
}
