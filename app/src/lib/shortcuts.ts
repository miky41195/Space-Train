import { t } from './i18n';
/**
 * Keys → actions, in the style of File Explorer.
 *
 * Pure function: it decides what a key means, it does not run it. Arrows
 * and Enter stay in the page, because they depend on the current view.
 */

export type KeyAction =
	| 'copy'
	| 'cut'
	| 'paste'
	| 'rename'
	| 'newFolder'
	| 'trash'
	| 'deletePermanently'
	| 'search'
	| 'selectAll'
	| 'favorite'
	| 'undo'
	| 'reload'
	| 'address'
	| 'newTab'
	| 'newWindow'
	| 'closeTab'
	| 'nextTab'
	| 'previousTab'
	| 'back'
	| 'forward'
	| 'up'
	| 'properties'
	| 'preview'
	| 'dualPane'
	| 'otherPane'
	| 'copyToOtherPane'
	| 'moveToOtherPane'
	| 'palette'
	| 'toggleTerminal'
	| { tab: number }
	/** Ctrl+Shift+1…8: Explorer's eight views, from the largest icons. */
	| { view: number };

export interface KeyInput {
	key: string;
	/** The physical key: with Shift held, `key` of «1» becomes «!». */
	code?: string;
	ctrlKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
}

export function keyAction(e: KeyInput): KeyAction | null {
	const ctrl = e.ctrlKey ?? false;
	const shift = e.shiftKey ?? false;
	const alt = e.altKey ?? false;
	const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

	if (ctrl && !alt) {
		if (k === 'tab' || k === 'Tab') return shift ? 'previousTab' : 'nextTab';
		if (k === 'PageDown') return 'nextTab';
		if (k === 'PageUp') return 'previousTab';
		if (shift && k === 'n') return 'newFolder';
		if (shift && k === 'd') return 'dualPane';
		if (shift && k === 'c') return 'copyToOtherPane';
		if (shift && k === 'x') return 'moveToOtherPane';
		if (shift && k === 'p') return 'palette';
		if (shift && k === 't') return 'toggleTerminal';
		const digit = /^Digit([1-8])$/.exec(e.code ?? '');
		if (shift && digit) return { view: Number(digit[1]) - 1 };
		if (shift) return null;
		if (/^[1-9]$/.test(k)) return { tab: Number(k) - 1 };

		switch (k) {
			case 'c':
				return 'copy';
			case 'x':
				return 'cut';
			case 'v':
				return 'paste';
			case 'a':
				return 'selectAll';
			case 'd':
				return 'favorite';
			case 'z':
				return 'undo';
			case 'f':
				return 'search';
			case 'r':
				return 'reload';
			case 'l':
				return 'address';
			case 't':
				return 'newTab';
			case 'n':
				return 'newWindow';
			case 'w':
				return 'closeTab';
		}
		return null;
	}

	if (alt && !ctrl) {
		switch (k) {
			case 'ArrowLeft':
				return 'back';
			case 'ArrowRight':
				return 'forward';
			case 'ArrowUp':
				return 'up';
			case 'Enter':
				return 'properties';
			case 'd':
				return 'address';
			case 'p':
				return 'preview';
		}
		return null;
	}

	if (ctrl || alt) return null;

	switch (k) {
		case 'Delete':
			return shift ? 'deletePermanently' : 'trash';
		case 'F2':
			return 'rename';
		case 'F3':
			return 'search';
		case 'F4':
			return 'address';
		case 'F5':
			return 'reload';
		case 'F6':
			return 'otherPane';
		case 'Backspace':
			return 'back';
	}
	return null;
}

export interface ShortcutItem {
	/** What the user reads in the settings list. */
	label: string;
	/** Key combinations as shown, e.g. `Ctrl+Maiusc+N`. */
	keys: string[];
	/** The action `keyAction` returns for every key: a test keeps the list honest. */
	action?: KeyAction;
}

/** The global hotkey registered in Rust (`SHORTCUT` in lib.rs). */
export const GLOBAL_SHORTCUT: ShortcutItem = {
	label: t('Porta Space Train in primo piano'),
	keys: ['Win+Maiusc+E']
};

/** Every shortcut the app knows, grouped for the «Scorciatoie» settings section. */
export const SHORTCUT_GROUPS: { name: string; items: ShortcutItem[] }[] = [
	{
		name: t('File'),
		items: [
			{ label: t('Apri'), keys: ['Invio'] },
			{ label: t('Copia'), keys: ['Ctrl+C'], action: 'copy' },
			{ label: t('Taglia'), keys: ['Ctrl+X'], action: 'cut' },
			{ label: t('Incolla'), keys: ['Ctrl+V'], action: 'paste' },
			{ label: t('Rinomina, anche più file insieme'), keys: ['F2'], action: 'rename' },
			{ label: t('Nuova cartella'), keys: ['Ctrl+Maiusc+N'], action: 'newFolder' },
			{ label: t('Sposta nel Cestino'), keys: ['Canc'], action: 'trash' },
			{ label: t('Elimina definitivamente'), keys: ['Maiusc+Canc'], action: 'deletePermanently' },
			{ label: t('Annulla'), keys: ['Ctrl+Z'], action: 'undo' },
			{ label: t('Proprietà'), keys: ['Alt+Invio'], action: 'properties' },
			{ label: t('Anteprima'), keys: ['Alt+P'], action: 'preview' },
			{ label: t('Aggiungi ai preferiti'), keys: ['Ctrl+D'], action: 'favorite' }
		]
	},
	{
		name: t('Selezione'),
		items: [
			{ label: t('Seleziona tutto'), keys: ['Ctrl+A'], action: 'selectAll' },
			{ label: t('Sposta la selezione'), keys: ['↑', '↓'] },
			{ label: t('Allarga la selezione'), keys: ['Maiusc+↑', 'Maiusc+↓'] },
			{ label: t('Aggiungi o togli un elemento'), keys: ['Ctrl+clic'] }
		]
	},
	{
		name: t('Navigazione'),
		items: [
			{ label: t('Indietro'), keys: ['Alt+←', 'Backspace'], action: 'back' },
			{ label: t('Avanti'), keys: ['Alt+→'], action: 'forward' },
			{ label: t('Cartella superiore'), keys: ['Alt+↑'], action: 'up' },
			{ label: t('Barra dell’indirizzo'), keys: ['Ctrl+L', 'Alt+D', 'F4'], action: 'address' },
			{ label: t('Cerca'), keys: ['Ctrl+F', 'F3'], action: 'search' },
			{ label: t('Palette dei comandi'), keys: ['Ctrl+Maiusc+P'], action: 'palette' },
			{ label: t('Aggiorna'), keys: ['F5', 'Ctrl+R'], action: 'reload' }
		]
	},
	{
		name: t('Schede e finestre'),
		items: [
			{ label: t('Nuova scheda'), keys: ['Ctrl+T'], action: 'newTab' },
			{ label: t('Chiudi scheda'), keys: ['Ctrl+W'], action: 'closeTab' },
			{ label: t('Scheda successiva'), keys: ['Ctrl+Tab', 'Ctrl+PagGiù'], action: 'nextTab' },
			{ label: t('Scheda precedente'), keys: ['Ctrl+Maiusc+Tab', 'Ctrl+PagSu'], action: 'previousTab' },
			{ label: t('Vai alla scheda 1–9'), keys: ['Ctrl+1…9'] },
			{ label: t('Nuova finestra'), keys: ['Ctrl+N'], action: 'newWindow' },
			{ label: t('Apri o chiudi il terminale integrato'), keys: ['Ctrl+Maiusc+T'], action: 'toggleTerminal' }
		]
	},
	{
		name: t('Doppio pannello'),
		items: [
			{ label: t('Apri o chiudi il doppio pannello'), keys: ['Ctrl+Maiusc+D'], action: 'dualPane' },
			{ label: t('Passa all’altro pannello'), keys: ['F6'], action: 'otherPane' },
			{ label: t('Copia nell’altro pannello'), keys: ['Ctrl+Maiusc+C'], action: 'copyToOtherPane' },
			{ label: t('Sposta nell’altro pannello'), keys: ['Ctrl+Maiusc+X'], action: 'moveToOtherPane' }
		]
	},
	{
		name: t('Viste'),
		items: [
			{ label: t('Le otto viste, dalle icone più grandi'), keys: ['Ctrl+Maiusc+1…8'] },
			{ label: t('Icone più grandi o più piccole'), keys: ['Ctrl+rotella'] }
		]
	}
];
