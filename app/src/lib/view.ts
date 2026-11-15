import { t } from './i18n';
/**
 * List views as in Windows 11 File Explorer.
 *
 * Icons have no fixed sizes: the side goes from 16 to 256 pixels and changes
 * with Ctrl+wheel or with the slider in the status bar. The menu items
 * «Icone grandi», «medie» etc. are just shortcuts to a side.
 */

export type View = 'details' | 'list' | 'tiles' | 'content' | 'icons';

/** The view names as saved by earlier versions: the settings keep writing these. */
export const STORED_VIEW_NAMES: Record<View, string> = {
	details: 'dettagli',
	list: 'elenco',
	tiles: 'riquadri',
	content: 'contenuto',
	icons: 'icone'
};

export const SIDE_MIN = 16;
export const SIDE_MAX = 256;

/** The sizes with a name, as in Windows' View menu. */
export const SIZES = [
	{ name: t('Icone molto grandi'), side: 256 },
	{ name: t('Icone grandi'), side: 128 },
	{ name: t('Icone medie'), side: 64 },
	{ name: t('Icone piccole'), side: 24 }
] as const;

export interface ViewState {
	view: View;
	/** Side of the icons in the «icone» view. Ignored by the other views. */
	side: number;
}

export function clampSide(side: number): number {
	return Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, side)));
}

/**
 * One Ctrl+wheel notch. As in Windows: within icons the side grows or
 * shrinks by 15%; below the smallest icons it goes to List and then to
 * Details, and climbing back from there it returns to icons.
 */
export function zoom(s: ViewState, direction: 1 | -1): ViewState {
	if (direction > 0) {
		if (s.view === 'details') return { view: 'list', side: s.side };
		if (s.view !== 'icons') return { view: 'icons', side: SIDE_MIN };
		return { view: 'icons', side: clampSide(Math.max(s.side + 2, s.side * 1.15)) };
	}
	if (s.view === 'icons') {
		if (s.side <= SIDE_MIN) return { view: 'list', side: SIDE_MIN };
		return { view: 'icons', side: clampSide(Math.min(s.side - 2, s.side / 1.15)) };
	}
	if (s.view === 'list') return { view: 'details', side: s.side };
	if (s.view === 'tiles' || s.view === 'content') return { view: 'list', side: s.side };
	return s;
}

/** How the cells of a grid view are made. */
export interface CellSize {
	width: number;
	height: number;
	/** Side of the image inside the cell. */
	icon: number;
	/** Icon next to the name instead of above it. */
	horizontal: boolean;
	/** A single cell per row, as wide as the list. */
	full: boolean;
	/** Shows type, size and date next to the name. */
	details: boolean;
}

/** Below this side the icons sit next to the name, like «Icone piccole». */
const HORIZONTAL_THRESHOLD = 40;

export function cellSize(s: ViewState): CellSize {
	switch (s.view) {
		case 'list':
			return { width: 240, height: 28, icon: 16, horizontal: true, full: false, details: false };
		case 'tiles':
			return { width: 280, height: 72, icon: 48, horizontal: true, full: false, details: true };
		case 'content':
			return { width: 0, height: 64, icon: 40, horizontal: true, full: true, details: true };
		default: {
			const side = clampSide(s.side);
			if (side < HORIZONTAL_THRESHOLD) {
				return {
					width: 200 + side,
					height: side + 12,
					icon: side,
					horizontal: true,
					full: false,
					details: false
				};
			}
			// The name sits below on two lines: the cell grows with the icon but
			// never gets narrower than a width a name fits in.
			return {
				width: Math.max(96, side + 32),
				height: side + 56,
				icon: side,
				horizontal: false,
				full: false,
				details: false
			};
		}
	}
}

/** The name of the current size, when it matches one of the menu. */
export function sizeName(s: ViewState): string | null {
	if (s.view !== 'icons') return null;
	return SIZES.find((t) => t.side === s.side)?.name ?? null;
}
