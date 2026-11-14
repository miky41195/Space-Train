/**
 * Theme animations: at startup and when a folder opens.
 *
 * Folder animations are short on purpose (at most 250 ms): a folder opens
 * hundreds of times a day. They run through the Web Animations API on the
 * elements already there, so nothing is remounted and the list keeps its
 * scroll and selection.
 */

export type IntroAnimation = 'train' | 'current' | 'stars' | 'custom' | 'none';
export type IntroMotion = 'enter' | 'cross' | 'center';
export type FolderAnimation = 'none' | 'wagons' | 'fade' | 'slide' | 'current';

export interface Animations {
	intro: IntroAnimation;
	/** For «personalizzata»: a parade entry (figure id, `img:…`, `sprite:…`). */
	figure?: string;
	motion: IntroMotion;
	/** Seconds, 0.5 to 3. */
	duration: number;
	folder: FolderAnimation;
}

export const INTRO_ANIMATIONS: readonly { value: IntroAnimation; name: string }[] = [
	{ value: 'none', name: 'Nessuna' },
	{ value: 'train', name: 'Treno che arriva' },
	{ value: 'current', name: 'Corrente' },
	{ value: 'stars', name: 'Pioggia di stelle' },
	{ value: 'custom', name: 'Personalizzata' }
];
export const INTRO_MOTIONS: readonly { value: IntroMotion; name: string }[] = [
	{ value: 'enter', name: 'Entra da un lato' },
	{ value: 'cross', name: 'Attraversa' },
	{ value: 'center', name: 'Compare al centro' }
];
export const FOLDER_ANIMATIONS: readonly { value: FolderAnimation; name: string }[] = [
	{ value: 'none', name: 'Nessuna' },
	{ value: 'wagons', name: 'Vagoni' },
	{ value: 'fade', name: 'Dissolvenza' },
	{ value: 'slide', name: 'Scorrimento' },
	{ value: 'current', name: 'Corrente sul percorso' }
];

export const BASE_ANIMATIONS: Animations = { intro: 'train', motion: 'cross', duration: 1.25, folder: 'none' };

function one<T extends string>(v: unknown, allowed: readonly { value: T }[], base: T): T {
	return allowed.some((a) => a.value === v) ? (v as T) : base;
}

/** What a theme asks for, checked: saved themes may be old or hand-edited. */
export function animationsOf(a: Partial<Animations> | undefined): Animations {
	const duration = Number(a?.duration);
	return {
		intro: one(a?.intro, INTRO_ANIMATIONS, BASE_ANIMATIONS.intro),
		figure: typeof a?.figure === 'string' && a.figure ? a.figure : undefined,
		motion: one(a?.motion, INTRO_MOTIONS, BASE_ANIMATIONS.motion),
		duration: Number.isFinite(duration) ? Math.min(3, Math.max(0.5, duration)) : BASE_ANIMATIONS.duration,
		folder: one(a?.folder, FOLDER_ANIMATIONS, BASE_ANIMATIONS.folder)
	};
}

// Saved themes keep the names earlier versions wrote: translated here, both ways.
const STORED_KEYS: Record<keyof Animations, string> = {
	intro: 'avvio',
	figure: 'figura',
	motion: 'moto',
	duration: 'durata',
	folder: 'cartella'
};
const STORED_VALUES: Partial<Record<keyof Animations, Record<string, string>>> = {
	intro: { train: 'treno', current: 'corrente', stars: 'stelle', custom: 'personalizzata', none: 'nessuna' },
	motion: { enter: 'entra', cross: 'attraversa', center: 'centro' },
	folder: { none: 'nessuna', wagons: 'vagoni', fade: 'dissolvenza', slide: 'scorrimento', current: 'corrente' }
};

/** A theme's saved animations → in memory. Unknown values pass through and `animationsOf` drops them. */
export function animationsFromStored(stored: Record<string, unknown>): Partial<Animations> {
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(STORED_KEYS) as Array<keyof Animations>) {
		const v = stored[STORED_KEYS[key]];
		if (v === undefined) continue;
		const values = STORED_VALUES[key];
		const back = values && Object.entries(values).find(([, s]) => s === v)?.[0];
		out[key] = back ?? v;
	}
	return out as Partial<Animations>;
}

/** In memory → a theme's saved animations. */
export function animationsToStored(a: Partial<Animations>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(STORED_KEYS) as Array<keyof Animations>) {
		const v = a[key];
		if (v === undefined) continue;
		out[STORED_KEYS[key]] = typeof v === 'string' ? (STORED_VALUES[key]?.[v] ?? v) : v;
	}
	return out;
}

/** The rows that arrive one behind the other: only those on screen count. */
const MAX_WAGONS = 14;

/**
 * Plays the folder animation on `list` (the list or grid) and `path`
 * (the address bar's line). Does nothing where animations are missing.
 */
export function animateFolder(kind: FolderAnimation, list: HTMLElement | null, path: HTMLElement | null): void {
	const can = (el: Element | null): el is HTMLElement => !!el && typeof (el as HTMLElement).animate === 'function';
	switch (kind) {
		case 'fade':
			if (can(list)) list.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
			break;
		case 'slide':
			if (can(list))
				list.animate(
					[
						{ opacity: 0, transform: 'translateY(8px)' },
						{ opacity: 1, transform: 'none' }
					],
					{ duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
				);
			break;
		case 'wagons': {
			const rows = [...(list?.querySelectorAll('[role="row"], [role="gridcell"]') ?? [])].slice(0, MAX_WAGONS);
			rows.forEach((r, i) => {
				if (can(r))
					r.animate(
						[
							{ opacity: 0, transform: 'translateX(-12px)' },
							{ opacity: 1, transform: 'none' }
						],
						// The last wagon still ends within 250 ms.
						{ duration: 120, delay: i * 9, easing: 'ease-out', fill: 'backwards' }
					);
			});
			break;
		}
		case 'current': {
			if (!can(path)) break;
			const light = document.createElement('span');
			light.setAttribute('aria-hidden', 'true');
			Object.assign(light.style, {
				position: 'absolute',
				left: '0',
				bottom: '0',
				height: '2px',
				width: '64px',
				pointerEvents: 'none',
				background: 'linear-gradient(90deg, transparent, var(--plasma), var(--current))',
				boxShadow: '0 0 6px var(--current)'
			});
			if (getComputedStyle(path).position === 'static') path.style.position = 'relative';
			path.appendChild(light);
			const end = Math.max(0, path.scrollWidth - 64);
			const a = light.animate([{ transform: 'translateX(-64px)' }, { transform: `translateX(${end}px)`, opacity: 0.2 }], {
				duration: 240,
				easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
			});
			a.onfinish = () => light.remove();
			a.oncancel = () => light.remove();
			break;
		}
	}
}
