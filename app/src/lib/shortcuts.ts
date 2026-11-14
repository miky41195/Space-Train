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
	label: 'Porta Space Train in primo piano',
	keys: ['Win+Maiusc+E']
};

/** Every shortcut the app knows, grouped for the «Scorciatoie» settings section. */
export const SHORTCUT_GROUPS: { name: string; items: ShortcutItem[] }[] = [
	{
		name: 'File',
		items: [
			{ label: 'Apri', keys: ['Invio'] },
			{ label: 'Copia', keys: ['Ctrl+C'], action: 'copy' },
			{ label: 'Taglia', keys: ['Ctrl+X'], action: 'cut' },
			{ label: 'Incolla', keys: ['Ctrl+V'], action: 'paste' },
			{ label: 'Rinomina, anche più file insieme', keys: ['F2'], action: 'rename' },
			{ label: 'Nuova cartella', keys: ['Ctrl+Maiusc+N'], action: 'newFolder' },
			{ label: 'Sposta nel Cestino', keys: ['Canc'], action: 'trash' },
			{ label: 'Elimina definitivamente', keys: ['Maiusc+Canc'], action: 'deletePermanently' },
			{ label: 'Annulla', keys: ['Ctrl+Z'], action: 'undo' },
			{ label: 'Proprietà', keys: ['Alt+Invio'], action: 'properties' },
			{ label: 'Anteprima', keys: ['Alt+P'], action: 'preview' },
			{ label: 'Aggiungi ai preferiti', keys: ['Ctrl+D'], action: 'favorite' }
		]
	},
	{
		name: 'Selezione',
		items: [
			{ label: 'Seleziona tutto', keys: ['Ctrl+A'], action: 'selectAll' },
			{ label: 'Sposta la selezione', keys: ['↑', '↓'] },
			{ label: 'Allarga la selezione', keys: ['Maiusc+↑', 'Maiusc+↓'] },
			{ label: 'Aggiungi o togli un elemento', keys: ['Ctrl+clic'] }
		]
	},
	{
		name: 'Navigazione',
		items: [
			{ label: 'Indietro', keys: ['Alt+←', 'Backspace'], action: 'back' },
			{ label: 'Avanti', keys: ['Alt+→'], action: 'forward' },
			{ label: 'Cartella superiore', keys: ['Alt+↑'], action: 'up' },
			{ label: 'Barra dell’indirizzo', keys: ['Ctrl+L', 'Alt+D', 'F4'], action: 'address' },
			{ label: 'Cerca', keys: ['Ctrl+F', 'F3'], action: 'search' },
			{ label: 'Palette dei comandi', keys: ['Ctrl+Maiusc+P'], action: 'palette' },
			{ label: 'Aggiorna', keys: ['F5', 'Ctrl+R'], action: 'reload' }
		]
	},
	{
		name: 'Schede e finestre',
		items: [
			{ label: 'Nuova scheda', keys: ['Ctrl+T'], action: 'newTab' },
			{ label: 'Chiudi scheda', keys: ['Ctrl+W'], action: 'closeTab' },
			{ label: 'Scheda successiva', keys: ['Ctrl+Tab', 'Ctrl+PagGiù'], action: 'nextTab' },
			{ label: 'Scheda precedente', keys: ['Ctrl+Maiusc+Tab', 'Ctrl+PagSu'], action: 'previousTab' },
			{ label: 'Vai alla scheda 1–9', keys: ['Ctrl+1…9'] },
			{ label: 'Nuova finestra', keys: ['Ctrl+N'], action: 'newWindow' }
		]
	},
	{
		name: 'Doppio pannello',
		items: [
			{ label: 'Apri o chiudi il doppio pannello', keys: ['Ctrl+Maiusc+D'], action: 'dualPane' },
			{ label: 'Passa all’altro pannello', keys: ['F6'], action: 'otherPane' },
			{ label: 'Copia nell’altro pannello', keys: ['Ctrl+Maiusc+C'], action: 'copyToOtherPane' },
			{ label: 'Sposta nell’altro pannello', keys: ['Ctrl+Maiusc+X'], action: 'moveToOtherPane' }
		]
	},
	{
		name: 'Viste',
		items: [
			{ label: 'Le otto viste, dalle icone più grandi', keys: ['Ctrl+Maiusc+1…8'] },
			{ label: 'Icone più grandi o più piccole', keys: ['Ctrl+rotella'] }
		]
	}
];
