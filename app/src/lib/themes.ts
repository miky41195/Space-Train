import { animationsFromStored, animationsToStored, type Animations } from './animations';
/**
 * Themes: colours, shapes and characters.
 *
 * A theme rewrites the CSS variables of `app.css` on the document root:
 * components know nothing of themes, they only read the functional names
 * (`--surface`, `--radius`, `--font-ui`…). «World» themes also change the
 * shapes, the background and who travels on the rail.
 */
import { FIGURES, PARADES, figurePattern } from './figures';
import type { FolderStyle } from './icons';

export interface Shapes {
	/** Rounding of windows and panels, in pixels. */
	radius: number;
	/** Rounding of rows, buttons and menus. */
	radiusSmall: number;
	/** Body text font. */
	font: string;
	/** Font of titles, headers and labels. */
	titleFont: string;
	/**
	 * Size of normal text, in pixels. Notes and labels grow and shrink in
	 * the same proportion.
	 */
	size: number;
	/**
	 * Size of titles (everything that uses the title font), in pixels on the
	 * same base as the text. Missing = follows `size`.
	 */
	titleSize?: number;
	/** How corners end; the radius becomes the size of the cut. */
	corner: Corner;
	/** The profile of the tabs in the header. */
	tab: TabShape;
	/** The drawing in the sky of the header and of the main line. */
	sky: Sky;
	/** The window border. */
	frame: Frame;
	/** How folders are drawn. Missing = the default for the theme's category. */
	folder?: FolderStyle;
}

export type Corner = 'round' | 'bevel' | 'notch' | 'pill';
export type TabShape = 'roof' | 'trapezoid' | 'arch' | 'pill';
export type Sky = 'stars' | 'grid' | 'bubbles' | 'contours' | 'fans' | 'none';
export type Frame = 'thin' | 'double';

/** The shape choices with the name the editor shows. */
export const CORNERS: readonly { value: Corner; name: string }[] = [
	{ value: 'round', name: 'Arrotondati' },
	{ value: 'bevel', name: 'Smussati' },
	{ value: 'notch', name: 'A tacca' },
	{ value: 'pill', name: 'A pillola' }
];
export const TAB_SHAPES: readonly { value: TabShape; name: string }[] = [
	{ value: 'roof', name: 'A tetto' },
	{ value: 'trapezoid', name: 'A trapezio' },
	{ value: 'arch', name: 'Ad arco' },
	{ value: 'pill', name: 'A pillola' }
];
export const SKIES: readonly { value: Sky; name: string }[] = [
	{ value: 'stars', name: 'Stelle (solo temi scuri)' },
	{ value: 'grid', name: 'Griglia' },
	{ value: 'bubbles', name: 'Bolle' },
	{ value: 'contours', name: 'Curve di livello' },
	{ value: 'fans', name: 'Ventagli' },
	{ value: 'none', name: 'Nessuno' }
];
export const FRAMES: readonly { value: Frame; name: string }[] = [
	{ value: 'thin', name: 'Filo sottile' },
	{ value: 'double', name: 'Doppio filo' }
];

export const FOLDER_STYLES: readonly { value: FolderStyle; name: string }[] = [
	{ value: 'pixel', name: 'Pixel' },
	{ value: 'wagon', name: 'Vagone' },
	{ value: 'flat', name: 'Piatta' },
	{ value: 'outline', name: 'Contorno' },
	{ value: 'windows', name: 'Icona di Windows' }
];

/** The value when it is one of the allowed choices, otherwise the base one. */
function pick<T extends string>(value: unknown, allowed: readonly { value: T }[], base: T): T {
	return allowed.some((a) => a.value === value) ? (value as T) : base;
}

export interface Theme {
	id: string;
	name: string;
	/** Light or dark: it decides the derived colours. */
	light: boolean;
	/** «colors» changes only the palette; «world» also shapes and characters. */
	group: 'colors' | 'world' | 'personal';
	variables: Record<string, string>;
	shapes?: Partial<Shapes>;
	/**
	 * Who travels on the rail: figure ids or `img:<path>` for the user's
	 * images. Missing = the train.
	 */
	parade?: string[];
	/** Figure used as the list's decorative background. */
	pattern?: string;
	/** Startup and folder-opening animations. Missing = the train, no folder animation. */
	animations?: Partial<Animations>;
}

/** The categories of the theme gallery, in the order they appear. */
export const CATEGORIES = [
	{ id: 'dark', name: 'Scuri' },
	{ id: 'light', name: 'Chiari' },
	{ id: 'worlds', name: 'Mondi' },
	{ id: 'seasons', name: 'Stagioni' },
	{ id: 'holidays', name: 'Feste' },
	{ id: 'yours', name: 'I tuoi temi' }
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];

// Theme ids are saved in the settings: they stay as they are.
const SEASONS = new Set(['primavera', 'estate', 'autunno', 'inverno']);
const HOLIDAYS = new Set(['natale', 'capodanno', 'sanvalentino', 'carnevale', 'pasqua', 'halloween']);

export function categoryOf(theme: Theme): CategoryId {
	if (theme.group === 'personal') return 'yours';
	if (theme.group === 'colors') return theme.light ? 'light' : 'dark';
	if (SEASONS.has(theme.id)) return 'seasons';
	if (HOLIDAYS.has(theme.id)) return 'holidays';
	return 'worlds';
}

const OUTLINE_WORLDS = new Set(['cianografia', 'atlante']);

/** The folder style a theme asks for, or the one its category suggests. */
export function folderStyleOf(theme: Theme): FolderStyle {
	const chosen = theme.shapes?.folder;
	if (FOLDER_STYLES.some((f) => f.value === chosen)) return chosen as FolderStyle;
	if (theme.group === 'personal') return 'windows';
	if (theme.id === 'spazio') return 'pixel';
	if (theme.id === 'orient') return 'wagon';
	if (OUTLINE_WORLDS.has(theme.id)) return 'outline';
	switch (categoryOf(theme)) {
		case 'worlds':
		case 'holidays':
			return 'pixel';
		case 'dark':
		case 'seasons':
			return 'flat';
		default:
			// Light themes and the user's own: the Windows icon until they pick one.
			return 'windows';
	}
}

/** The personal theme as the editor saves it. */
export type PersonalTheme = Theme & { group: 'personal' };

export const BASE_SHAPES: Shapes = {
	radius: 12,
	radiusSmall: 8,
	font: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
	// Same as the FONTS entry: the editor recognises it only when the
	// string matches.
	titleFont: "'Bahnschrift', 'Segoe UI', sans-serif",
	size: 13,
	corner: 'round',
	tab: 'roof',
	sky: 'stars',
	frame: 'thin'
};

/** The limits of the text size that can be chosen, in pixels. */
export const TEXT_SIZE_MIN = 9;
export const TEXT_SIZE_MAX = 24;

/** How much larger (or smaller) the theme's text is than the base one. */
export function textScale(theme: Theme): number {
	return scale(theme.shapes?.size ?? BASE_SHAPES.size);
}

/** Like `textScale`, for titles; without a size of their own they follow the text. */
export function titleScale(theme: Theme): number {
	const d = theme.shapes?.titleSize;
	return d === undefined ? textScale(theme) : scale(d);
}

function scale(d: number): number {
	const valid = Number.isFinite(d) ? Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, d)) : BASE_SHAPES.size;
	return valid / BASE_SHAPES.size;
}

/** Fonts that ship with Windows, to choose from in the editor. */
export const FONTS = [
	{ name: 'Segoe UI', value: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif" },
	{ name: 'Bahnschrift (segnaletica)', value: "'Bahnschrift', 'Segoe UI', sans-serif" },
	{ name: 'Trebuchet (morbido)', value: "'Trebuchet MS', 'Segoe UI', sans-serif" },
	{ name: 'Comic Sans (giocoso)', value: "'Comic Sans MS', 'Segoe UI', sans-serif" },
	{ name: 'Segoe Print (a mano)', value: "'Segoe Print', 'Segoe UI', sans-serif" },
	{ name: 'Ink Free (pennarello)', value: "'Ink Free', 'Segoe UI', sans-serif" },
	{ name: 'Gabriola (elegante)', value: "'Gabriola', 'Georgia', serif" },
	{ name: 'Georgia (classico)', value: "'Georgia', serif" },
	{ name: 'Cascadia (monospazio)', value: "'Cascadia Code', 'Consolas', monospace" },
	{ name: 'Candara (rotondo)', value: "'Candara', 'Segoe UI', sans-serif" }
] as const;

const font = (name: string) => FONTS.find((c) => c.name.startsWith(name))!.value;

interface Palette {
	void: string;
	hull: string;
	rail: string;
	current: string;
	plasma: string;
	signal: string;
	text: string;
	dim: string;
	error?: string;
}

/** Every colour variable from a palette, light or dark. */
export function variablesFrom(t: Palette, light: boolean): Record<string, string> {
	return {
		'--void': t.void,
		'--hull': t.hull,
		'--hull-glass': withAlpha(t.hull, light ? 0.88 : 0.76),
		'--rail-metal': t.rail,
		'--current': t.current,
		'--plasma': t.plasma,
		'--signal': t.signal,
		'--text': t.text,
		'--text-dim': t.dim,
		'--border': light ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)',
		'--row-hover': light ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)',
		'--scroll': light ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.14)',
		'--error-text': t.error ?? (light ? '#b3261e' : '#ffb4ab')
	};
}

/**
 * The sky behind the header, where the convoy passes: stars of one or two
 * pixels, in a tile that repeats across. Only in dark themes: on a light
 * background they would look like dirt.
 */
export function stars(text: string, current: string, signal: string): string {
	const points: [number, number, number, string][] = [
		[18, 9, 2, 'a'], [61, 27, 1, 'b'], [104, 5, 2, 'c'], [139, 19, 1, 'b'],
		[177, 31, 2, 'a'], [214, 11, 1, 'a'], [252, 24, 2, 'b'], [293, 6, 1, 'd'],
		[331, 33, 1, 'a'], [368, 14, 2, 'b'], [402, 28, 1, 'a'], [447, 8, 2, 'a']
	];
	const tint = { a: [text, 0.55], b: [text, 0.25], c: [current, 0.8], d: [signal, 0.7] } as const;
	const rect = points
		.map(([x, y, l, k]) => {
			const [color, alpha] = tint[k as keyof typeof tint];
			return `<rect x='${x}' y='${y}' width='${l}' height='${l}' fill='${color}' fill-opacity='${alpha}'/>`;
		})
		.join('');
	const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='40' shape-rendering='crispEdges'>${rect}</svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const colorTheme = (id: string, name: string, light: boolean, t: Palette): Theme => ({
	id,
	name,
	light,
	group: 'colors',
	variables: variablesFrom(t, light)
});

const worldTheme = (id: string, name: string, light: boolean, t: Palette, shapes: Partial<Shapes>, pattern: string): Theme => ({
	id,
	name,
	light,
	group: 'world',
	variables: variablesFrom(t, light),
	shapes,
	parade: PARADES[id],
	pattern
});

export const THEMES: Theme[] = [
	// ── Colours only ──
	colorTheme('spazio', 'Spazio', false, {
		void: '#0c0a13', hull: '#171420', rail: '#3a3350', current: '#7cf5ff',
		plasma: '#8b5cf6', signal: '#ffb454', text: '#e9e6f0', dim: '#948da8'
	}),
	colorTheme('notte', 'Notte', false, {
		void: '#111214', hull: '#1c1d21', rail: '#3a3d45', current: '#60a5fa',
		plasma: '#60a5fa', signal: '#fbbf24', text: '#e8e8ea', dim: '#9a9ba3'
	}),
	colorTheme('oceano', 'Oceano', false, {
		void: '#06121c', hull: '#0d1e2c', rail: '#24435a', current: '#5ee6c8',
		plasma: '#22a6d6', signal: '#ffd166', text: '#e3f1fb', dim: '#8aa6bb'
	}),
	colorTheme('tramonto', 'Tramonto', false, {
		void: '#160c0e', hull: '#22141a', rail: '#4a2a33', current: '#ffb26b',
		plasma: '#f0607a', signal: '#ffd166', text: '#f6e9e6', dim: '#b0949a', error: '#ffc2b8'
	}),
	colorTheme('chiaro', 'Chiaro', true, {
		void: '#f3f3f6', hull: '#ffffff', rail: '#c9c9d4', current: '#0a84c6',
		plasma: '#6d4ae0', signal: '#c46a00', text: '#1d1d24', dim: '#6b6b78'
	}),
	colorTheme('sakura', 'Sakura', false, {
		void: '#1a0f16', hull: '#26161f', rail: '#53304a', current: '#ff9ad5',
		plasma: '#f472b6', signal: '#ffd1e8', text: '#fbe7f1', dim: '#c39bb2', error: '#ffc2d4'
	}),
	colorTheme('confetto', 'Confetto', true, {
		void: '#fdf1f6', hull: '#fff8fb', rail: '#efc6d8', current: '#d6337a',
		plasma: '#db2777', signal: '#b4235f', text: '#3b1d2e', dim: '#8a5c73'
	}),
	colorTheme('lavanda', 'Lavanda', true, {
		void: '#f4f1fb', hull: '#fbfaff', rail: '#d3cbe9', current: '#6d4ae0',
		plasma: '#8b5cf6', signal: '#a16207', text: '#231c3a', dim: '#6e6688'
	}),
	colorTheme('foresta', 'Foresta', false, {
		void: '#0b130e', hull: '#142019', rail: '#2c4636', current: '#86efac',
		plasma: '#22c55e', signal: '#facc15', text: '#e5f2e9', dim: '#8fab98'
	}),
	colorTheme('caffe', 'Caffè', false, {
		void: '#15100c', hull: '#211912', rail: '#4a3829', current: '#f2c38b',
		plasma: '#c08a5a', signal: '#ffd89c', text: '#f4ebe1', dim: '#ab9783', error: '#ffc2b0'
	}),
	colorTheme('neon', 'Neon', false, {
		void: '#07060d', hull: '#100e1c', rail: '#2d2850', current: '#00f0ff',
		plasma: '#ff2bd6', signal: '#fff200', text: '#f2f0ff', dim: '#9a94c2', error: '#ff8fa3'
	}),
	colorTheme('contrasto', 'Contrasto elevato', false, {
		void: '#000000', hull: '#000000', rail: '#ffffff', current: '#ffff00',
		plasma: '#1aebff', signal: '#ffff00', text: '#ffffff', dim: '#e0e0e0', error: '#ff6b6b'
	}),

	// ── Worlds: colours, shapes, background and characters ──
	worldTheme('cianografia', 'Cianografia', false, {
		void: '#0a2744', hull: '#0e3257', rail: '#4f80b2', current: '#b8f0ff',
		plasma: '#5db8ff', signal: '#ffd36b', text: '#eaf4ff', dim: '#9cb9d9'
	}, { radius: 12, radiusSmall: 5, titleFont: font('Cascadia'), corner: 'bevel', tab: 'trapezoid', sky: 'grid' }, 'compasso'),
	worldTheme('abisso', 'Abisso', false, {
		void: '#02121b', hull: '#06202d', rail: '#144a5c', current: '#52ffd6',
		plasma: '#2fb4ff', signal: '#ff8ade', text: '#dcf6f3', dim: '#7fa8ab'
	}, { radius: 22, radiusSmall: 15, font: font('Candara'), titleFont: font('Candara'), corner: 'pill', tab: 'pill', sky: 'bubbles' }, 'medusa'),
	worldTheme('atlante', 'Atlante', true, {
		void: '#e3ece6', hull: '#f7faf6', rail: '#9fb5ab', current: '#0f6a8c',
		plasma: '#c27a1a', signal: '#b4432f', text: '#17283a', dim: '#5a6c78'
	}, { radius: 14, radiusSmall: 6, titleFont: font('Georgia'), corner: 'notch', sky: 'contours' }, 'mongolfiera'),
	worldTheme('orient', 'Orient Express', false, {
		void: '#0c1512', hull: '#13201b', rail: '#6b5c34', current: '#f6dc96',
		plasma: '#cfa24a', signal: '#8fd1b8', text: '#f1ead8', dim: '#a99f86'
	}, { radius: 10, radiusSmall: 4, titleFont: font('Bahnschrift'), corner: 'bevel', tab: 'arch', sky: 'fans', frame: 'double' }, 'locoOro'),
	worldTheme('anime', 'Anime', false, {
		void: '#12101f', hull: '#1c1830', rail: '#3d3566', current: '#5ee7ff',
		plasma: '#ff5fa2', signal: '#ffd166', text: '#f5f0ff', dim: '#a59bc4'
	}, { radius: 14, radiusSmall: 10, titleFont: font('Trebuchet') }, 'stellina'),
	worldTheme('pokemon', 'Pokémon', true, {
		void: '#eef1f8', hull: '#ffffff', rail: '#c7cde0', current: '#3b4cca',
		plasma: '#e3350d', signal: '#ffcb05', text: '#1a1a2e', dim: '#5c6178'
	}, { radius: 16, radiusSmall: 12, font: font('Trebuchet'), titleFont: font('Trebuchet') }, 'scintilla'),
	worldTheme('gatti', 'Gatti', true, {
		void: '#f8efe4', hull: '#fffaf3', rail: '#e5d3bf', current: '#8a5a44',
		plasma: '#e07a2f', signal: '#d4a017', text: '#3b2a20', dim: '#8c7564'
	}, { radius: 16, radiusSmall: 12, titleFont: font('Ink Free') }, 'gattoArancio'),
	worldTheme('kawaii', 'Kawaii', true, {
		void: '#fff0f6', hull: '#ffffff', rail: '#ffd3e8', current: '#5bb8f0',
		plasma: '#ff7ab8', signal: '#ffc94d', text: '#5a3d55', dim: '#a58aa0'
	}, { radius: 24, radiusSmall: 16, font: font('Candara'), titleFont: font('Comic Sans') }, 'mochi'),
	worldTheme('primavera', 'Primavera', true, {
		void: '#eef7ea', hull: '#fbfef9', rail: '#cfe3c6', current: '#3f9b46',
		plasma: '#ec4899', signal: '#f59e0b', text: '#233623', dim: '#6b8a6b'
	}, { radius: 16, radiusSmall: 10, titleFont: font('Segoe Print') }, 'farfalla'),
	worldTheme('estate', 'Estate', true, {
		void: '#fff6df', hull: '#fffdf6', rail: '#f3e2b5', current: '#0891b2',
		plasma: '#ff6b4a', signal: '#f59e0b', text: '#2b2a20', dim: '#7a7460'
	}, { radius: 14, radiusSmall: 10, titleFont: font('Trebuchet') }, 'sole'),
	worldTheme('autunno', 'Autunno', false, {
		void: '#1b130e', hull: '#261a12', rail: '#5a3b24', current: '#f2b134',
		plasma: '#e8743b', signal: '#c2410c', text: '#f6eadf', dim: '#b49a85', error: '#ffc2b0'
	}, { radius: 12, radiusSmall: 8, titleFont: font('Georgia') }, 'foglia'),
	worldTheme('inverno', 'Inverno', true, {
		void: '#eaf2fb', hull: '#fbfdff', rail: '#cfdcec', current: '#0ea5e9',
		plasma: '#3b82f6', signal: '#64748b', text: '#1e2a3a', dim: '#64748b'
	}, { radius: 14, radiusSmall: 10, titleFont: font('Candara') }, 'pupazzo'),
	worldTheme('natale', 'Natale', false, {
		void: '#0e1a14', hull: '#15261c', rail: '#2f4a39', current: '#facc15',
		plasma: '#dc2626', signal: '#22c55e', text: '#f3f6f1', dim: '#a3b8a8'
	}, { radius: 12, radiusSmall: 8, titleFont: font('Gabriola') }, 'regalo'),
	worldTheme('capodanno', 'Capodanno', false, {
		void: '#0b0b12', hull: '#141420', rail: '#3b3a52', current: '#f8f4e3',
		plasma: '#d4af37', signal: '#c0c0c0', text: '#f4f1e8', dim: '#a39e8c'
	}, { radius: 10, radiusSmall: 6, titleFont: font('Georgia') }, 'razzo'),
	worldTheme('sanvalentino', 'San Valentino', true, {
		void: '#fff0f3', hull: '#ffffff', rail: '#fbcfd8', current: '#db2777',
		plasma: '#e11d48', signal: '#fb7185', text: '#4c0519', dim: '#9f5d6d'
	}, { radius: 20, radiusSmall: 14, titleFont: font('Gabriola') }, 'cuore'),
	worldTheme('carnevale', 'Carnevale', false, {
		void: '#160b24', hull: '#22123a', rail: '#47306b', current: '#22d3ee',
		plasma: '#f59e0b', signal: '#ec4899', text: '#f8f0ff', dim: '#b39ccf'
	}, { radius: 14, radiusSmall: 10, titleFont: font('Comic Sans') }, 'maschera'),
	worldTheme('pasqua', 'Pasqua', true, {
		void: '#f6f2ff', hull: '#ffffff', rail: '#ddd3f5', current: '#16a34a',
		plasma: '#8b5cf6', signal: '#eab308', text: '#3b2f5c', dim: '#8579a8'
	}, { radius: 20, radiusSmall: 14, titleFont: font('Candara') }, 'uovo'),
	worldTheme('halloween', 'Halloween', false, {
		void: '#120a16', hull: '#1d1022', rail: '#3f2547', current: '#a3e635',
		plasma: '#f97316', signal: '#a855f7', text: '#f6ead8', dim: '#a8949f'
	}, { radius: 8, radiusSmall: 6, titleFont: font('Ink Free') }, 'fantasma')
];

/** Accent colours: selection, folders, active buttons. Ids are saved: they stay as they are. */
export const ACCENTS = [
	{ id: 'tema', name: 'Quello del tema', color: null },
	{ id: 'viola', name: 'Viola', color: '#8b5cf6' },
	{ id: 'blu', name: 'Blu', color: '#3b82f6' },
	{ id: 'ciano', name: 'Ciano', color: '#06b6d4' },
	{ id: 'verde', name: 'Verde', color: '#22c55e' },
	{ id: 'ambra', name: 'Ambra', color: '#f59e0b' },
	{ id: 'rosso', name: 'Rosso', color: '#ef4444' },
	{ id: 'rosa', name: 'Rosa', color: '#ec4899' },
	{ id: 'lilla', name: 'Lilla', color: '#c084fc' },
	{ id: 'corallo', name: 'Corallo', color: '#fb7185' },
	{ id: 'personalizzato', name: 'Personalizzato…', color: null }
] as const;

export type AccentId = (typeof ACCENTS)[number]['id'];
/** The accent that follows the theme's own colour. */
export const THEME_ACCENT: AccentId = 'tema';
/** The accent picked with the colour picker. */
export const CUSTOM_ACCENT: AccentId = 'personalizzato';

/** The theme with this id, among the built-in ones and the user's. */
export function themeById(id: string, personal: readonly Theme[] = []): Theme {
	return THEMES.find((t) => t.id === id) ?? personal.find((t) => t.id === id) ?? THEMES[0];
}

/** `#rrggbb` → `rgba(r, g, b, a)`. */
export function withAlpha(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The actual accent colour for the user's choice. */
export function accentColor(theme: Theme, accent: AccentId, custom: string): string {
	if (accent === CUSTOM_ACCENT) return custom;
	return ACCENTS.find((a) => a.id === accent)?.color ?? theme.variables['--plasma'];
}

/** Every variable to write on the root for the chosen theme and accent. */
export function variablesFor(theme: Theme, accent: string): Record<string, string> {
	const shapes = { ...BASE_SHAPES, ...theme.shapes };
	const figure = theme.pattern ? FIGURES[theme.pattern] : undefined;
	return {
		...theme.variables,
		// Folders keep the theme's own color: the highlight choice is for selection.
		'--folder': theme.variables['--plasma'] ?? accent,
		'--plasma': accent,
		'--accent': accent,
		// On a light background the selection tint must be stronger to stand
		// out from the white.
		'--accent-soft': withAlpha(accent, theme.light ? 0.18 : 0.26),
		'--font-ui': shapes.font,
		'--font-display': shapes.titleFont,
		'--text-scale': String(textScale(theme)),
		'--title-scale': String(titleScale(theme)),
		'--pattern': figure ? figurePattern(figure, theme.light ? 0.1 : 0.07) : 'none',
		...shapeVariables(shapes),
		// Computed here and not saved with the theme: they also apply to
		// personal themes made before the sky existed.
		...skyVariables(pick(shapes.sky, SKIES, 'stars'), theme)
	};
}

const px = (n: number) => `${n}px`;

/** Cuts the four corners at 45°. */
function bevelPolygon(n: number): string {
	const c = px(n);
	return `polygon(${c} 0, calc(100% - ${c}) 0, 100% ${c}, 100% calc(100% - ${c}), calc(100% - ${c}) 100%, ${c} 100%, 0 calc(100% - ${c}), 0 ${c})`;
}

/** Carves the corners inwards, like the cartouches of maps. */
function notchMask(n: number, topOnly = false): string {
	const corner = (x: string, y: string) =>
		`radial-gradient(circle at ${x} ${y}, #0000 ${px(n)}, #000 ${px(n + 0.5)}) ${x} ${y} / 51% ${topOnly ? '100%' : '51%'} no-repeat`;
	const top = [corner('0', '0'), corner('100%', '0')];
	return (topOnly ? top : [...top, corner('0', '100%'), corner('100%', '100%')]).join(', ');
}

/**
 * The shape variables. With bevelled or notched corners the radius no
 * longer rounds: it becomes the size of the cut, and the border stays
 * square under the clipping. Focus goes inside the element, which the
 * clipping would otherwise hide.
 */
export function shapeVariables(shapes: Shapes): Record<string, string> {
	const corner = pick(shapes.corner, CORNERS, 'round');
	const tab = pick(shapes.tab, TAB_SHAPES, 'roof');
	const r = Math.max(0, shapes.radius);
	const rs = Math.max(0, shapes.radiusSmall);
	const clipped = corner === 'bevel' || corner === 'notch';
	const v: Record<string, string> = {
		'--radius': clipped ? '0px' : px(r),
		'--radius-sm': clipped ? '0px' : corner === 'pill' ? '999px' : px(rs),
		'--shape': corner === 'bevel' ? bevelPolygon(r) : 'none',
		'--shape-sm': corner === 'bevel' ? bevelPolygon(rs) : 'none',
		'--mask': corner === 'notch' ? notchMask(r) : 'none',
		'--mask-sm': corner === 'notch' ? notchMask(rs) : 'none',
		'--focus-offset': clipped ? '-2px' : '2px',
		'--frame': pick(shapes.frame, FRAMES, 'thin') === 'double' ? '3px double var(--rail-metal)' : '1px solid var(--border)'
	};
	// The roof tab follows the corners; the others have a profile of their own.
	const roof = Math.min(rs, 12);
	const tabs: Record<TabShape, [radius: string, shape: string, mask: string]> = {
		roof:
			corner === 'bevel'
				? ['0', `polygon(${px(rs)} 0, calc(100% - ${px(rs)}) 0, 100% ${px(rs)}, 100% 100%, 0 100%, 0 ${px(rs)})`, 'none']
				: corner === 'notch'
					? ['0', 'none', notchMask(rs, true)]
					: [`${px(roof)} ${px(roof)} 0 0`, 'none', 'none'],
		trapezoid: ['0', 'polygon(10px 0, calc(100% - 10px) 0, 100% 100%, 0 100%)', 'none'],
		arch: ['16px 16px 0 0 / 14px 14px 0 0', 'none', 'none'],
		pill: ['999px', 'none', 'none']
	};
	const [radius, shape, mask] = tabs[tab];
	v['--tab-radius'] = radius;
	v['--tab-shape'] = shape;
	v['--tab-mask'] = mask;
	// The pill stands off the edge; the trapezoid needs room on its sides.
	v['--tab-height'] = tab === 'pill' ? '26px' : '32px';
	v['--tab-gap'] = tab === 'pill' ? '4px' : '0px';
	v['--tab-margins'] = tab === 'trapezoid' ? '0 16px 0 20px' : tab === 'arch' ? '0 12px 0 16px' : '0 8px 0 12px';
	return v;
}

/** An SVG as a background image. */
const svgUrl = (w: number, h: number, body: string) =>
	`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;

/**
 * The sky of the header and of the main line, and the size of its tile.
 * Stars stay only for dark themes: on a light background they would look
 * like dirt. The other skies are drawn for both.
 */
export function skyVariables(sky: Sky, theme: Theme): Record<string, string> {
	const text = theme.variables['--text'] ?? '#e9e6f0';
	const current = theme.variables['--current'] ?? '#7cf5ff';
	const plasma = theme.variables['--plasma'] ?? '#8b5cf6';
	const signal = theme.variables['--signal'] ?? '#ffb454';
	const tint = theme.light ? 0.16 : 0.1;
	const v = (image: string, size: string) => ({ '--stars': image, '--sky-size': size });
	switch (sky) {
		case 'stars':
			return v(theme.light ? 'none' : stars(text, current, signal), '480px 40px');
		case 'grid':
			return v(svgUrl(16, 16, `<path d='M0 .5H16M.5 0V16' stroke='${current}' stroke-opacity='${tint}'/>`), '16px 16px');
		case 'bubbles': {
			const bubbles: [number, number, number, string, number][] = [
				[29, 28, 1.5, current, 0.5], [65, 12, 3, current, 0.22], [110, 25, 1.5, signal, 0.4],
				[151, 9, 2.5, plasma, 0.3], [194, 23, 4, current, 0.2], [223, 11, 1.2, text, 0.35]
			];
			const body = bubbles.map(([x, y, r, c, o]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='${c}' fill-opacity='${o}'/>`).join('');
			return v(svgUrl(240, 40, body), '240px 40px');
		}
		case 'contours':
			return v(
				svgUrl(
					300,
					40,
					`<g fill='none' stroke='${current}' stroke-opacity='${theme.light ? 0.14 : 0.12}'><path d='M-10 30C40 10 80 38 130 22S220 6 310 26'/><path d='M-10 36C40 18 85 44 135 30S225 14 310 33'/><path d='M-10 22C35 2 78 30 125 14S215-2 310 18'/><ellipse cx='200' cy='20' rx='22' ry='8'/><ellipse cx='200' cy='20' rx='12' ry='4'/></g>`
				),
				'300px 40px'
			);
		case 'fans':
			return v(
				svgUrl(34, 20, `<path d='M11 20a6 6 0 0 1 12 0M6 20a11 11 0 0 1 22 0M1 20a16 16 0 0 1 32 0' fill='none' stroke='${plasma}' stroke-opacity='0.3'/>`),
				'34px 20px'
			);
		case 'none':
			return v('none', '480px 40px');
	}
}

/** Applies theme and accent to the document. */
export function applyTheme(theme: Theme, accent: string, root = document.documentElement): void {
	for (const [k, v] of Object.entries(variablesFor(theme, accent))) root.style.setProperty(k, v);
	root.dataset.theme = theme.light ? 'light' : 'dark';
	root.dataset.world = theme.group === 'colors' ? '' : theme.id;
}

// ── Saved personal themes ─────────────────────────────────────────
// Personal themes are saved with the names earlier versions wrote. Keys and
// values are translated here, at the storage boundary, in both directions.

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v);
const invert = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));

const STORED_SHAPE_KEYS: Record<string, string> = {
	radius: 'raggio',
	radiusSmall: 'raggioPiccolo',
	font: 'carattere',
	titleFont: 'carattereTitoli',
	size: 'dimensione',
	titleSize: 'dimensioneTitoli',
	corner: 'angolo',
	tab: 'scheda',
	sky: 'cielo',
	frame: 'cornice',
	folder: 'folder'
};
const STORED_SHAPE_VALUES: Record<string, Record<string, string>> = {
	corner: { round: 'tondo', bevel: 'smusso', notch: 'tacca', pill: 'pillola' },
	tab: { roof: 'tetto', trapezoid: 'trapezio', arch: 'arco', pill: 'pillola' },
	sky: { stars: 'stelle', grid: 'griglia', bubbles: 'bolle', contours: 'curve', fans: 'ventagli', none: 'nessuno' },
	frame: { thin: 'filo', double: 'doppia' }
};
/** CSS variables saved inside a theme under an older name. */
const STORED_VARIABLES: Record<string, string> = { '--error-text': '--errore-testo' };

function shapesFromStored(stored: Dict): Partial<Shapes> {
	const keys = invert(STORED_SHAPE_KEYS);
	const out: Dict = {};
	for (const [k, v] of Object.entries(stored)) {
		const key = keys[k];
		if (!key) continue;
		const values = STORED_SHAPE_VALUES[key];
		out[key] = values && typeof v === 'string' ? (invert(values)[v] ?? v) : v;
	}
	return out as Partial<Shapes>;
}

function shapesToStored(shapes: Partial<Shapes>): Dict {
	const out: Dict = {};
	for (const [k, v] of Object.entries(shapes)) {
		if (v === undefined) continue;
		const values = STORED_SHAPE_VALUES[k];
		out[STORED_SHAPE_KEYS[k] ?? k] = values && typeof v === 'string' ? (values[v] ?? v) : v;
	}
	return out;
}

function renameVariables(vars: Dict, map: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(vars)) if (typeof v === 'string') out[map[k] ?? k] = v;
	return out;
}

/** A saved personal theme → in memory. `null` when it is not a theme. */
export function themeFromStored(stored: unknown): PersonalTheme | null {
	if (!isDict(stored) || typeof stored.id !== 'string') return null;
	const theme: PersonalTheme = {
		id: stored.id,
		name: typeof stored.nome === 'string' ? stored.nome : stored.id,
		light: stored.chiaro === true,
		group: 'personal',
		variables: renameVariables(isDict(stored.variabili) ? stored.variabili : {}, invert(STORED_VARIABLES))
	};
	if (isDict(stored.forme)) theme.shapes = shapesFromStored(stored.forme);
	if (Array.isArray(stored.corteo)) theme.parade = stored.corteo.filter((c): c is string => typeof c === 'string');
	if (typeof stored.motivo === 'string') theme.pattern = stored.motivo;
	if (isDict(stored.animazioni)) theme.animations = animationsFromStored(stored.animazioni);
	return theme;
}

/** In memory → the saved form of a personal theme. */
export function themeToStored(theme: PersonalTheme): Dict {
	const out: Dict = {
		id: theme.id,
		nome: theme.name,
		chiaro: theme.light,
		gruppo: 'personale',
		variabili: renameVariables(theme.variables, STORED_VARIABLES)
	};
	if (theme.shapes) out.forme = shapesToStored(theme.shapes);
	if (theme.parade) out.corteo = theme.parade;
	if (theme.pattern !== undefined) out.motivo = theme.pattern;
	if (theme.animations) out.animazioni = animationsToStored(theme.animations);
	return out;
}
