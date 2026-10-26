import { describe, it, expect } from 'vitest';
import { azioneTasto } from './scorciatoie';

describe('azioneTasto', () => {
	it.each([
		[{ key: 'c', ctrlKey: true }, 'copia'],
		[{ key: 'X', ctrlKey: true }, 'taglia'],
		[{ key: 'v', ctrlKey: true }, 'incolla'],
		[{ key: 'z', ctrlKey: true }, 'annulla'],
		[{ key: 'd', ctrlKey: true }, 'preferito'],
		[{ key: 'N', ctrlKey: true, shiftKey: true }, 'nuovaCartella'],
		[{ key: 'Delete' }, 'cestina'],
		[{ key: 'Delete', shiftKey: true }, 'eliminaDefinitivo'],
		[{ key: 'F2' }, 'rinomina'],
		[{ key: 'F5' }, 'ricarica'],
		[{ key: 'r', ctrlKey: true }, 'ricarica'],
		[{ key: 'l', ctrlKey: true }, 'indirizzo'],
		[{ key: 'd', altKey: true }, 'indirizzo'],
		[{ key: 'F4' }, 'indirizzo'],
		[{ key: 't', ctrlKey: true }, 'nuovaScheda'],
		[{ key: 'n', ctrlKey: true }, 'nuovaFinestra'],
		[{ key: 'w', ctrlKey: true }, 'chiudiScheda'],
		[{ key: 'Tab', ctrlKey: true }, 'schedaSuccessiva'],
		[{ key: 'Tab', ctrlKey: true, shiftKey: true }, 'schedaPrecedente'],
		[{ key: 'Backspace' }, 'indietro'],
		[{ key: 'ArrowLeft', altKey: true }, 'indietro'],
		[{ key: 'ArrowRight', altKey: true }, 'avanti'],
		[{ key: 'ArrowUp', altKey: true }, 'su'],
		[{ key: 'Enter', altKey: true }, 'proprieta'],
		[{ key: 'p', altKey: true }, 'anteprima'],
		[{ key: 'F3' }, 'cerca'],
		[{ key: 'f', ctrlKey: true }, 'cerca']
	])('%o → %s', (tasto, atteso) => {
		expect(azioneTasto(tasto)).toBe(atteso);
	});

	it('Ctrl+numero porta alla scheda in quella posizione', () => {
		expect(azioneTasto({ key: '1', ctrlKey: true })).toEqual({ scheda: 0 });
		expect(azioneTasto({ key: '9', ctrlKey: true })).toEqual({ scheda: 8 });
	});

	it('i tasti normali e le frecce restano alla pagina', () => {
		expect(azioneTasto({ key: 'a' })).toBeNull();
		expect(azioneTasto({ key: 'ArrowDown' })).toBeNull();
		expect(azioneTasto({ key: 'Enter' })).toBeNull();
		expect(azioneTasto({ key: 'c', ctrlKey: true, altKey: true })).toBeNull();
	});

	it('Ctrl+Maiusc+1…8 scelgono la vista, anche con la tastiera italiana', () => {
		expect(azioneTasto({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true })).toEqual({ vista: 0 });
		expect(azioneTasto({ key: '(', code: 'Digit8', ctrlKey: true, shiftKey: true })).toEqual({ vista: 7 });
	});
});
