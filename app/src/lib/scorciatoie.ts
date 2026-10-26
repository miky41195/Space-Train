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
