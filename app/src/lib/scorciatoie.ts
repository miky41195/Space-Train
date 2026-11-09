/**
 * Tasti → azioni, nello stile di Esplora risorse.
 *
 * Funzione pura: decide cosa significa un tasto, non lo esegue. Frecce e
 * Invio restano nella pagina, perché dipendono dalla vista corrente.
 */

export type AzioneTasto =
	| 'copia'
	| 'taglia'
	| 'incolla'
	| 'rinomina'
	| 'nuovaCartella'
	| 'cestina'
	| 'eliminaDefinitivo'
	| 'cerca'
	| 'selezionaTutto'
	| 'preferito'
	| 'annulla'
	| 'ricarica'
	| 'indirizzo'
	| 'nuovaScheda'
	| 'nuovaFinestra'
	| 'chiudiScheda'
	| 'schedaSuccessiva'
	| 'schedaPrecedente'
	| 'indietro'
	| 'avanti'
	| 'su'
	| 'proprieta'
	| 'anteprima'
	| { scheda: number }
	/** Ctrl+Maiusc+1…8: le otto viste di Esplora, dalle icone più grandi. */
	| { vista: number };

export interface Tasto {
	key: string;
	/** Il tasto fisico: con Maiusc premuto `key` di «1» diventa «!». */
	code?: string;
	ctrlKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
}

export function azioneTasto(e: Tasto): AzioneTasto | null {
	const ctrl = e.ctrlKey ?? false;
	const shift = e.shiftKey ?? false;
	const alt = e.altKey ?? false;
	const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

	if (ctrl && !alt) {
		if (k === 'tab' || k === 'Tab') return shift ? 'schedaPrecedente' : 'schedaSuccessiva';
		if (k === 'PageDown') return 'schedaSuccessiva';
		if (k === 'PageUp') return 'schedaPrecedente';
		if (shift && k === 'n') return 'nuovaCartella';
		const cifra = /^Digit([1-8])$/.exec(e.code ?? '');
		if (shift && cifra) return { vista: Number(cifra[1]) - 1 };
		if (shift) return null;
		if (/^[1-9]$/.test(k)) return { scheda: Number(k) - 1 };

		switch (k) {
			case 'c':
				return 'copia';
			case 'x':
				return 'taglia';
			case 'v':
				return 'incolla';
			case 'a':
				return 'selezionaTutto';
			case 'd':
				return 'preferito';
			case 'z':
				return 'annulla';
			case 'f':
				return 'cerca';
			case 'r':
				return 'ricarica';
			case 'l':
				return 'indirizzo';
			case 't':
				return 'nuovaScheda';
			case 'n':
				return 'nuovaFinestra';
			case 'w':
				return 'chiudiScheda';
		}
		return null;
	}

	if (alt && !ctrl) {
		switch (k) {
			case 'ArrowLeft':
				return 'indietro';
			case 'ArrowRight':
				return 'avanti';
			case 'ArrowUp':
				return 'su';
			case 'Enter':
				return 'proprieta';
			case 'd':
				return 'indirizzo';
			case 'p':
				return 'anteprima';
		}
		return null;
	}

	if (ctrl || alt) return null;

	switch (k) {
		case 'Delete':
			return shift ? 'eliminaDefinitivo' : 'cestina';
		case 'F2':
			return 'rinomina';
		case 'F3':
			return 'cerca';
		case 'F4':
			return 'indirizzo';
		case 'F5':
			return 'ricarica';
		case 'Backspace':
			return 'indietro';
	}
	return null;
}

export interface ShortcutItem {
	/** What the user reads in the settings list. */
	label: string;
	/** Key combinations as shown, e.g. `Ctrl+Maiusc+N`. */
	keys: string[];
	/** The action `azioneTasto` returns for every key: a test keeps the list honest. */
	action?: AzioneTasto;
}

/** The global hotkey registered in Rust (`SCORCIATOIA` in lib.rs). */
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
			{ label: 'Copia', keys: ['Ctrl+C'], action: 'copia' },
			{ label: 'Taglia', keys: ['Ctrl+X'], action: 'taglia' },
			{ label: 'Incolla', keys: ['Ctrl+V'], action: 'incolla' },
			{ label: 'Rinomina, anche più file insieme', keys: ['F2'], action: 'rinomina' },
			{ label: 'Nuova cartella', keys: ['Ctrl+Maiusc+N'], action: 'nuovaCartella' },
			{ label: 'Sposta nel Cestino', keys: ['Canc'], action: 'cestina' },
			{ label: 'Elimina definitivamente', keys: ['Maiusc+Canc'], action: 'eliminaDefinitivo' },
			{ label: 'Annulla', keys: ['Ctrl+Z'], action: 'annulla' },
			{ label: 'Proprietà', keys: ['Alt+Invio'], action: 'proprieta' },
			{ label: 'Anteprima', keys: ['Alt+P'], action: 'anteprima' },
			{ label: 'Aggiungi ai preferiti', keys: ['Ctrl+D'], action: 'preferito' }
		]
	},
	{
		name: 'Selezione',
		items: [
			{ label: 'Seleziona tutto', keys: ['Ctrl+A'], action: 'selezionaTutto' },
			{ label: 'Sposta la selezione', keys: ['↑', '↓'] },
			{ label: 'Allarga la selezione', keys: ['Maiusc+↑', 'Maiusc+↓'] },
			{ label: 'Aggiungi o togli un elemento', keys: ['Ctrl+clic'] }
		]
	},
	{
		name: 'Navigazione',
		items: [
			{ label: 'Indietro', keys: ['Alt+←', 'Backspace'], action: 'indietro' },
			{ label: 'Avanti', keys: ['Alt+→'], action: 'avanti' },
			{ label: 'Cartella superiore', keys: ['Alt+↑'], action: 'su' },
			{ label: 'Barra dell’indirizzo', keys: ['Ctrl+L', 'Alt+D', 'F4'], action: 'indirizzo' },
			{ label: 'Cerca', keys: ['Ctrl+F', 'F3'], action: 'cerca' },
			{ label: 'Aggiorna', keys: ['F5', 'Ctrl+R'], action: 'ricarica' }
		]
	},
	{
		name: 'Schede e finestre',
		items: [
			{ label: 'Nuova scheda', keys: ['Ctrl+T'], action: 'nuovaScheda' },
			{ label: 'Chiudi scheda', keys: ['Ctrl+W'], action: 'chiudiScheda' },
			{ label: 'Scheda successiva', keys: ['Ctrl+Tab', 'Ctrl+PagGiù'], action: 'schedaSuccessiva' },
			{ label: 'Scheda precedente', keys: ['Ctrl+Maiusc+Tab', 'Ctrl+PagSu'], action: 'schedaPrecedente' },
			{ label: 'Vai alla scheda 1–9', keys: ['Ctrl+1…9'] },
			{ label: 'Nuova finestra', keys: ['Ctrl+N'], action: 'nuovaFinestra' }
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
