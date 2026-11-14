import type { SortSpec } from '../ipc';
import { STORED_GROUP_MODES, type GroupMode } from '../grouping';
import { themeFromStored, themeToStored, type AccentId, type PersonalTheme } from '../themes';
import { clampSide, STORED_VIEW_NAMES, type View } from '../view';
import type { KeyValueStore } from './favorites.svelte';
import { onChangeOf } from './sync';
import { SYSTEM_ROOT } from '../platform';
import { customFromStored, customToStored, type CustomShortcuts } from '../custom-shortcuts';
import type { MediaKey } from '../media';

// Saved key: unchanged so existing settings survive.
const KEY = 'space-train.impostazioni';

export type { View };

export interface Columns {
	size: boolean;
	date: boolean;
	type: boolean;
	/** Photo/video/music columns of the open folder; never saved with the settings. */
	media?: readonly MediaKey[];
}

/** `never`: like Explorer; `open`: in the background for the open folder; `onRequest`: only when asked. */
export type FolderSizes = 'never' | 'open' | 'onRequest';

interface Values {
	view: View;
	/** Side of the icons in the «icone» view, in pixels. */
	side: number;
	/** Lower rows in the details view, like «Visualizzazione compatta». */
	compact: boolean;
	columns: Columns;
	grouping: GroupMode;
	extensions: boolean;
	preview: boolean;
	theme: string;
	accent: AccentId;
	/** Sort chosen for each folder, key in lowercase. */
	sorts: Record<string, SortSpec>;
	/** «Modificati di recente» zone on, and how many days it spans. */
	recent: boolean;
	recentDays: number;
	/** The train animation when the app opens. */
	introAnimation: boolean;
	/**
	 * Seconds of pause between one pass of the train (or the characters) and
	 * the next, from when it leaves the stage. -1: at rest it never passes.
	 */
	trainPause: number;
	/** The colour picked with the picker when the accent is «personalizzato». */
	accentColor: string;
	/** The themes made with the editor. */
	personalThemes: PersonalTheme[];
	/**
	 * What to open at startup when Windows passes no folder:
	 * `::pc`, `::ultima` (the last folder opened) or the path of a folder.
	 */
	startPage: string;
	/** The tabs open at closing reopen at startup. */
	session: boolean;
	/** Folders that always open at startup, each in a tab. */
	startupFolders: string[];
	/** Where disk cleanup looks for projects; `null` = never chosen (Desktop and Documents). */
	projectFolders: string[] | null;
	/** Reminder when a fixed drive has less than this percent free; 0 = never. */
	diskThreshold: number;
	/** When to compute the size of folders in the list. */
	folderSizes: FolderSizes;
	/** Ask for confirmation before moving to the Recycle Bin. */
	confirmTrash: boolean;
	/** Open with one click instead of a double click, like Explorer's option. */
	singleClick: boolean;
	/** Show git marks and branch in folders that are repositories. */
	git: boolean;
	/** Minutes without using an open vault before it locks itself. */
	vaultAutoLock: number;
	/** Custom shortcuts: action → key combinations, in place of its defaults. */
	shortcuts: CustomShortcuts;
}

const DEFAULTS: Values = {
	view: 'details',
	side: 96,
	compact: false,
	columns: { size: true, date: true, type: false },
	grouping: 'none',
	extensions: true,
	preview: false,
	theme: 'spazio',
	accent: 'tema',
	sorts: {},
	recent: false,
	recentDays: 14,
	introAnimation: false,
	trainPause: 30,
	accentColor: '#8b5cf6',
	personalThemes: [],
	startPage: SYSTEM_ROOT,
	session: false,
	startupFolders: [],
	projectFolders: null,
	diskThreshold: 10,
	folderSizes: 'never',
	confirmTrash: true,
	singleClick: false,
	git: true,
	vaultAutoLock: 5,
	shortcuts: {}
};

// ── The saved form ──
// Settings are saved with the names earlier versions wrote; they are
// converted here, in #read and #save, and nowhere else.
const STORED_KEYS: Record<Exclude<keyof Values, 'columns'>, string> & { columns: string } = {
	view: 'vista',
	side: 'lato',
	compact: 'compatta',
	columns: 'colonne',
	grouping: 'raggruppa',
	extensions: 'estensioni',
	preview: 'anteprima',
	theme: 'tema',
	accent: 'accento',
	sorts: 'ordinamenti',
	recent: 'recenti',
	recentDays: 'giorniRecenti',
	introAnimation: 'animazioneAvvio',
	trainPause: 'pausaTreno',
	accentColor: 'coloreAccento',
	personalThemes: 'temiPersonali',
	startPage: 'paginaIniziale',
	session: 'sessione',
	startupFolders: 'cartelleAvvio',
	projectFolders: 'cartelleProgetti',
	diskThreshold: 'sogliaDisco',
	folderSizes: 'dimensioneCartelle',
	confirmTrash: 'confermaCestino',
	singleClick: 'unClic',
	git: 'git',
	vaultAutoLock: 'chiusuraCassaforte',
	shortcuts: 'scorciatoie'
};
const STORED_COLUMNS = { size: 'dimensione', date: 'data', type: 'tipo' } as const;
const STORED_FOLDER_SIZES: Record<FolderSizes, string> = { never: 'mai', open: 'aperta', onRequest: 'richiesta' };

const fromStored = <T extends string>(map: Record<T, string>, v: unknown): T | undefined =>
	(Object.keys(map) as T[]).find((k) => map[k] === v);

/** Views of earlier versions, translated into the current ones. */
const OLD_VIEWS: Record<string, { view: View; side?: number }> = {
	righe: { view: 'details' },
	griglia: { view: 'icons', side: 96 },
	piccole: { view: 'icons', side: 24 }
};

/**
 * Preferences that apply to the whole app and survive a restart.
 * Every change is saved at once.
 */
export class SettingsStore {
	view = $state<View>(DEFAULTS.view);
	side = $state(DEFAULTS.side);
	compact = $state(DEFAULTS.compact);
	columns = $state<Columns>({ ...DEFAULTS.columns });
	grouping = $state<GroupMode>(DEFAULTS.grouping);
	/** Shows file extensions in names. */
	extensions = $state(DEFAULTS.extensions);
	/** Preview pane open on the right. */
	preview = $state(DEFAULTS.preview);
	theme = $state(DEFAULTS.theme);
	accent = $state<AccentId>(DEFAULTS.accent);
	sorts = $state<Record<string, SortSpec>>({});
	recent = $state(DEFAULTS.recent);
	recentDays = $state(DEFAULTS.recentDays);
	introAnimation = $state(DEFAULTS.introAnimation);
	trainPause = $state(DEFAULTS.trainPause);
	accentColor = $state(DEFAULTS.accentColor);
	personalThemes = $state<PersonalTheme[]>([]);
	startPage = $state(DEFAULTS.startPage);
	session = $state(DEFAULTS.session);
	startupFolders = $state<string[]>([]);
	projectFolders = $state<string[] | null>(null);
	diskThreshold = $state(DEFAULTS.diskThreshold);
	shortcuts = $state<CustomShortcuts>({});
	folderSizes = $state<FolderSizes>(DEFAULTS.folderSizes);
	confirmTrash = $state(DEFAULTS.confirmTrash);
	singleClick = $state(DEFAULTS.singleClick);
	git = $state(DEFAULTS.git);
	vaultAutoLock = $state(DEFAULTS.vaultAutoLock);

	constructor(private storage: KeyValueStore | null = defaultStorage()) {
		this.#read(storage?.getItem(KEY) ?? null);
		// Another window changed theme or view: follow it here.
		onChangeOf(KEY, (v) => this.#read(v));
	}

	#read(raw: string | null): void {
		try {
			if (!raw) return;
			const stored = JSON.parse(raw) as Record<string, unknown>;
			const v = (key: keyof Values) => stored[STORED_KEYS[key]];

			const view = v('view');
			const old = typeof view === 'string' ? OLD_VIEWS[view] : undefined;
			if (old) {
				this.view = old.view;
				if (old.side) this.side = old.side;
			} else {
				const current = fromStored(STORED_VIEW_NAMES, view);
				if (current) this.view = current;
			}
			const side = v('side');
			if (typeof side === 'number') this.side = clampSide(side);
			const bool = (key: keyof Values) => (typeof v(key) === 'boolean' ? (v(key) as boolean) : undefined);
			this.compact = bool('compact') ?? this.compact;
			const cols = v('columns');
			if (cols && typeof cols === 'object') {
				const c = cols as Record<string, unknown>;
				const col = (k: keyof typeof STORED_COLUMNS) =>
					typeof c[STORED_COLUMNS[k]] === 'boolean' ? (c[STORED_COLUMNS[k]] as boolean) : DEFAULTS.columns[k];
				this.columns = { size: col('size'), date: col('date'), type: col('type') };
			}
			this.grouping = fromStored(STORED_GROUP_MODES, v('grouping')) ?? this.grouping;
			this.extensions = bool('extensions') ?? this.extensions;
			this.preview = bool('preview') ?? this.preview;
			if (typeof v('theme') === 'string') this.theme = v('theme') as string;
			if (typeof v('accent') === 'string') this.accent = v('accent') as AccentId;
			const sorts = v('sorts');
			if (sorts && typeof sorts === 'object') this.sorts = sorts as Record<string, SortSpec>;
			this.recent = bool('recent') ?? this.recent;
			if (typeof v('recentDays') === 'number') this.recentDays = v('recentDays') as number;
			this.introAnimation = bool('introAnimation') ?? this.introAnimation;
			const pause = v('trainPause');
			if (typeof pause === 'number' && pause >= -1) this.trainPause = pause;
			if (typeof v('accentColor') === 'string') this.accentColor = v('accentColor') as string;
			const themes = v('personalThemes');
			if (Array.isArray(themes)) this.personalThemes = themes.map(themeFromStored).filter((t): t is PersonalTheme => t !== null);
			const start = v('startPage');
			if (typeof start === 'string' && start) this.startPage = start;
			this.session = bool('session') ?? this.session;
			const strings = (x: unknown) => (Array.isArray(x) ? x.filter((c): c is string => typeof c === 'string') : undefined);
			this.startupFolders = strings(v('startupFolders')) ?? this.startupFolders;
			const threshold = v('diskThreshold');
			if (typeof threshold === 'number' && threshold >= 0 && threshold <= 50) this.diskThreshold = threshold;
			this.projectFolders = strings(v('projectFolders')) ?? this.projectFolders;
			this.folderSizes = fromStored(STORED_FOLDER_SIZES, v('folderSizes')) ?? this.folderSizes;
			this.confirmTrash = bool('confirmTrash') ?? this.confirmTrash;
			this.singleClick = bool('singleClick') ?? this.singleClick;
			this.git = bool('git') ?? this.git;
			const lock = v('vaultAutoLock');
			if (typeof lock === 'number' && lock >= 1 && lock <= 120) this.vaultAutoLock = lock;
			const shortcuts = v('shortcuts');
			if (shortcuts && typeof shortcuts === 'object') this.shortcuts = customFromStored(shortcuts as Record<string, unknown>);
		} catch {
			// Unreadable preferences: start from the defaults.
		}
	}

	set<K extends keyof Values>(key: K, value: Values[K]): void {
		(this as unknown as Values)[key] = value;
		this.#save();
	}

	/** Changes view and side together: it is what Ctrl+wheel does. */
	setView(view: View, side = this.side): void {
		this.view = view;
		this.side = clampSide(side);
		this.#save();
	}

	/** Saves an editor theme: new, or in place of the one with the same id. */
	saveTheme(theme: PersonalTheme): void {
		const others = this.personalThemes.filter((t) => t.id !== theme.id);
		this.personalThemes = [...others, theme];
		this.#save();
	}

	deleteTheme(id: string): void {
		this.personalThemes = this.personalThemes.filter((t) => t.id !== id);
		if (this.theme === id) this.theme = 'spazio';
		this.#save();
	}

	toggleColumn(c: keyof Columns): void {
		this.columns = { ...this.columns, [c]: !this.columns[c] };
		this.#save();
	}

	/** The sort the user chose for this folder, if any. */
	sortFor(folder: string): SortSpec | undefined {
		return this.sorts[folder.toLowerCase()];
	}

	rememberSort(folder: string, spec: SortSpec): void {
		this.sorts = { ...this.sorts, [folder.toLowerCase()]: { ...spec } };
		this.#save();
	}

	#save(): void {
		const values: Values = {
			view: this.view,
			side: this.side,
			compact: this.compact,
			columns: this.columns,
			grouping: this.grouping,
			extensions: this.extensions,
			preview: this.preview,
			theme: this.theme,
			accent: this.accent,
			sorts: this.sorts,
			recent: this.recent,
			recentDays: this.recentDays,
			introAnimation: this.introAnimation,
			trainPause: this.trainPause,
			accentColor: this.accentColor,
			personalThemes: this.personalThemes,
			startPage: this.startPage,
			session: this.session,
			startupFolders: this.startupFolders,
			projectFolders: this.projectFolders,
			diskThreshold: this.diskThreshold,
			folderSizes: this.folderSizes,
			confirmTrash: this.confirmTrash,
			singleClick: this.singleClick,
			git: this.git,
			vaultAutoLock: this.vaultAutoLock,
			shortcuts: this.shortcuts
		};
		const stored: Record<string, unknown> = {};
		for (const [k, value] of Object.entries(values) as Array<[keyof Values, unknown]>) stored[STORED_KEYS[k]] = value;
		stored[STORED_KEYS.view] = STORED_VIEW_NAMES[values.view];
		stored[STORED_KEYS.columns] = {
			[STORED_COLUMNS.size]: values.columns.size,
			[STORED_COLUMNS.date]: values.columns.date,
			[STORED_COLUMNS.type]: values.columns.type
		};
		stored[STORED_KEYS.grouping] = STORED_GROUP_MODES[values.grouping];
		stored[STORED_KEYS.personalThemes] = values.personalThemes.map(themeToStored);
		stored[STORED_KEYS.folderSizes] = STORED_FOLDER_SIZES[values.folderSizes];
		stored[STORED_KEYS.shortcuts] = customToStored(values.shortcuts);
		try {
			this.storage?.setItem(KEY, JSON.stringify(stored));
		} catch {
			// Storage refused: preferences last for this session.
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
