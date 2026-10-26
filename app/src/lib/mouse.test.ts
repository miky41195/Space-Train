import { describe, it, expect } from 'vitest';
import { historyActionFor } from './mouse';

describe('historyActionFor', () => {
	it('il quarto pulsante torna indietro', () => {
		expect(historyActionFor(3)).toBe('back');
	});

	it('il quinto pulsante va avanti', () => {
		expect(historyActionFor(4)).toBe('forward');
	});

	it('sinistro, centrale e destro non toccano la cronologia', () => {
		expect(historyActionFor(0)).toBeNull();
		expect(historyActionFor(1)).toBeNull();
		expect(historyActionFor(2)).toBeNull();
	});

	it('i pulsanti sconosciuti non fanno niente', () => {
		expect(historyActionFor(7)).toBeNull();
	});
});
