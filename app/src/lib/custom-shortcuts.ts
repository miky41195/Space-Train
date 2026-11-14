import { keyAction, SHORTCUT_GROUPS, type KeyAction, type KeyInput } from './shortcuts';

/**
 * Custom shortcuts: the user can give an action other keys. Stored as
 * action → key combinations; an action listed here loses its default keys.
 * Combinations are written like the settings list shows them: «Ctrl+Maiusc+D».
 */
export type CustomShortcuts = Partial<Record<string, string[]>>;

/** Actions that can take other keys: the ones listed in the settings with an action. */
export type SimpleAction = Extract<KeyAction, string>;

/** The action ids as saved by earlier versions: the settings keep writing these. */
const STORED_ACTION_IDS: Record<SimpleAction, string> = {
	copy: 'copia',
	cut: 'taglia',
	paste: 'incolla',
	rename: 'rinomina',
	newFolder: 'nuovaCartella',
	trash: 'cestina',
	deletePermanently: 'eliminaDefinitivo',
	search: 'cerca',
	selectAll: 'selezionaTutto',
	favorite: 'preferito',
	undo: 'annulla',
	reload: 'ricarica',
	address: 'indirizzo',
	newTab: 'nuovaScheda',
	newWindow: 'nuovaFinestra',
	closeTab: 'chiudiScheda',
	nextTab: 'schedaSuccessiva',
	previousTab: 'schedaPrecedente',
	back: 'indietro',
	forward: 'avanti',
	up: 'su',
	properties: 'proprieta',
	preview: 'anteprima',
	dualPane: 'doppioPannello',
	otherPane: 'altroPannello',
	copyToOtherPane: 'copiaAltroPannello',
	moveToOtherPane: 'spostaAltroPannello',
	palette: 'palette'
};
const ACTION_FROM_STORED = Object.fromEntries(Object.entries(STORED_ACTION_IDS).map(([a, s]) => [s, a])) as Record<string, SimpleAction>;

/** Saved shortcuts (legacy action ids) → in memory (English action ids). Unknown ids are dropped. */
export function customFromStored(stored: Record<string, unknown>): CustomShortcuts {
	const out: CustomShortcuts = {};
	for (const [id, keys] of Object.entries(stored)) {
		const action = ACTION_FROM_STORED[id];
		if (action && Array.isArray(keys) && keys.every((k) => typeof k === 'string')) out[action] = keys;
	}
	return out;
}

/** In memory → saved form, with the legacy action ids. */
export function customToStored(custom: CustomShortcuts): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const [action, keys] of Object.entries(custom)) {
		const id = STORED_ACTION_IDS[action as SimpleAction];
		if (id && keys) out[id] = keys;
	}
	return out;
}

export function defaultKeys(action: SimpleAction): string[] {
	return SHORTCUT_GROUPS.flatMap((g) => g.items)
		.filter((i) => i.action === action)
		.flatMap((i) => i.keys);
}

export function keysOf(action: SimpleAction, p: CustomShortcuts): string[] {
	return p[action] ?? defaultKeys(action);
}

export function actionName(action: SimpleAction): string {
	return SHORTCUT_GROUPS.flatMap((g) => g.items).find((i) => i.action === action)?.label ?? action;
}

const KEY_NAMES: Record<string, string> = {
	Delete: 'Canc',
	Enter: 'Invio',
	Escape: 'Esc',
	ArrowLeft: '←',
	ArrowRight: '→',
	ArrowUp: '↑',
	ArrowDown: '↓',
	PageDown: 'PagGiù',
	PageUp: 'PagSu',
	' ': 'Spazio',
	End: 'Fine',
	Insert: 'Ins'
};

/** The combination of a key press, or `null` while only modifiers are down. */
export function combination(e: KeyInput & { metaKey?: boolean }): string | null {
	if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(e.key)) return null;
	const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code ?? '');
	const letter = /^Key([A-Z])$/.exec(e.code ?? '');
	const key = digit?.[1] ?? KEY_NAMES[e.key] ?? (e.key.length === 1 ? (letter?.[1] ?? e.key.toUpperCase()) : e.key);
	const parts = [e.metaKey && 'Win', e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Maiusc'].filter(Boolean);
	return [...parts, key].join('+');
}

/** The action of a key press, custom keys first. */
export function actionWithCustom(e: KeyInput & { metaKey?: boolean }, p: CustomShortcuts): KeyAction | null {
	const c = combination(e);
	if (c !== null) {
		for (const [action, keys] of Object.entries(p)) if (keys?.includes(c)) return action as KeyAction;
	}
	const base = keyAction(e);
	// Moved elsewhere: its default keys no longer do it.
	if (typeof base === 'string' && p[base] !== undefined) return null;
	return base;
}

/** Windows takes these before any app sees them. */
const WINDOWS_OWNED = new Map<string, string>([
	['Ctrl+Alt+Canc', 'apre la schermata di sicurezza di Windows'],
	['Ctrl+Maiusc+Esc', 'apre Gestione attività'],
	['Ctrl+Esc', 'apre il menu Start'],
	['Alt+Tab', 'passa da una finestra all’altra'],
	['Alt+Maiusc+Tab', 'passa da una finestra all’altra'],
	['Alt+Esc', 'passa da una finestra all’altra'],
	['Win+L', 'blocca il PC'],
	['Win+D', 'mostra il desktop'],
	['Win+E', 'apre Esplora risorse'],
	['Win+R', 'apre Esegui'],
	['Win+I', 'apre Impostazioni di Windows'],
	['Win+Tab', 'apre la visualizzazione attività'],
	['Win+X', 'apre il menu Start avanzato'],
	['Win+S', 'apre la ricerca di Windows'],
	['Win+V', 'apre la cronologia degli appunti'],
	['Win+Maiusc+S', 'cattura una parte dello schermo']
]);

/** Keys that work, but that every Windows program gives the same meaning. */
const CONVENTIONS = new Map<string, string>([
	['Alt+F4', 'chiude la finestra'],
	['F1', 'apre la guida'],
	['Alt+Spazio', 'apre il menu della finestra'],
	['F10', 'attiva la barra dei menu'],
	['F11', 'mette a schermo intero'],
	['Ctrl+P', 'stampa'],
	['Ctrl+S', 'salva'],
	['Ctrl+O', 'apre un file']
]);

/** Plain keys the lists and dialogs need: they are not given away. */
const BASIC_KEYS = new Set(['←', '→', '↑', '↓', 'Invio', 'Esc', 'Tab', 'Maiusc+Tab', 'Spazio']);
const ALLOWED_WITHOUT_MODIFIERS = /^(F\d{1,2}|Canc|Backspace|Ins|Home|Fine|PagSu|PagGiù)$/;

export interface Check {
	/** Not usable at all: the reason. */
	refusal?: string;
	/** Usable after confirmation: what the user must know first. */
	warnings: string[];
	/** Actions that lose this combination if confirmed. */
	toRemove: SimpleAction[];
}

/** What to tell before giving `combo` to `action`. «Taken by another program» is checked apart (it asks Windows). */
export function check(combo: string, action: SimpleAction, p: CustomShortcuts, all: readonly SimpleAction[]): Check {
	if (BASIC_KEYS.has(combo)) return { refusal: `${combo} serve a muoversi nelle liste e nei dialoghi: non si può cambiare.`, warnings: [], toRemove: [] };
	const withModifier = /^(Win|Ctrl|Alt)\+/.test(combo) || (combo.startsWith('Maiusc+') && ALLOWED_WITHOUT_MODIFIERS.test(combo.slice(7)));
	if (!withModifier && !ALLOWED_WITHOUT_MODIFIERS.test(combo)) {
		return { refusal: `${combo} da solo serve a scrivere: aggiungi Ctrl, Alt o Win.`, warnings: [], toRemove: [] };
	}
	const windows = WINDOWS_OWNED.get(combo);
	if (windows) return { refusal: `${combo} è riservata da Windows (${windows}): non arriverebbe mai a Space Train.`, warnings: [], toRemove: [] };

	const warnings: string[] = [];
	if (combo.startsWith('Win+')) warnings.push(`Windows usa molte combinazioni con il tasto Win: ${combo} potrebbe non arrivare a Space Train.`);
	const conv = CONVENTIONS.get(combo);
	if (conv) warnings.push(`In Windows ${combo} di solito ${conv}: qui farebbe un’altra cosa.`);
	const toRemove = all.filter((a) => a !== action && keysOf(a, p).includes(combo));
	for (const a of toRemove) warnings.push(`Già usata in Space Train per «${actionName(a)}»: confermando, quell’azione la perde.`);
	return { warnings, toRemove };
}

/** Gives `action` the combination `combo` alone, taking it away from the others. */
export function assign(p: CustomShortcuts, action: SimpleAction, combo: string, toRemove: readonly SimpleAction[]): CustomShortcuts {
	const next: CustomShortcuts = { ...p, [action]: [combo] };
	for (const a of toRemove) next[a] = keysOf(a, p).filter((t) => t !== combo);
	return next;
}

/** Back to the default keys of `action`. */
export function restore(p: CustomShortcuts, action: SimpleAction): CustomShortcuts {
	const { [action]: _, ...rest } = p;
	return rest;
}

/** The combination in the syntax Windows registration expects, or `null` if it cannot be probed. */
export function accelerator(combo: string): string | null {
	const parts = combo.split('+');
	const key = parts.pop()!;
	const mod: Record<string, string> = { Win: 'super', Ctrl: 'ctrl', Alt: 'alt', Maiusc: 'shift' };
	const special: Record<string, string> = {
		'←': 'ArrowLeft',
		'→': 'ArrowRight',
		'↑': 'ArrowUp',
		'↓': 'ArrowDown',
		Canc: 'Delete',
		Invio: 'Enter',
		Esc: 'Escape',
		PagGiù: 'PageDown',
		PagSu: 'PageUp',
		Spazio: 'Space',
		Fine: 'End',
		Ins: 'Insert',
		Home: 'Home',
		Backspace: 'Backspace',
		Tab: 'Tab'
	};
	const code = /^[A-Z]$/.test(key)
		? `Key${key}`
		: /^\d$/.test(key)
			? `Digit${key}`
			: /^F\d{1,2}$/.test(key)
				? key
				: special[key];
	if (!code || parts.some((m) => !mod[m])) return null;
	return [...parts.map((m) => mod[m]), code].join('+');
}
