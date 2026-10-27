import { describe, it, expect } from 'vitest';
import { confrontaVersioni, novitaDaMostrare, NOVITA } from './novita';

const elenco = [
	{ versione: '0.3.0', voci: ['c'] },
	{ versione: '0.2.10', voci: ['b'] },
	{ versione: '0.2.1', voci: ['a'] }
];

describe('novità dopo un aggiornamento', () => {
	it('le versioni si confrontano come numeri, non come testo', () => {
		expect(confrontaVersioni('0.2.10', '0.2.9')).toBeGreaterThan(0);
		expect(confrontaVersioni('0.2.1', '0.2.1')).toBe(0);
		expect(confrontaVersioni('1.0.0', '0.9.9')).toBeGreaterThan(0);
	});

	it('mostra le versioni saltate, dalla più recente, fino a quella installata', () => {
		expect(novitaDaMostrare('0.2.1', '0.3.0', true, elenco).map((n) => n.versione)).toEqual(['0.3.0', '0.2.10']);
		expect(novitaDaMostrare('0.2.1', '0.2.10', true, elenco).map((n) => n.versione)).toEqual(['0.2.10']);
	});

	it('già viste: niente', () => {
		expect(novitaDaMostrare('0.3.0', '0.3.0', true, elenco)).toEqual([]);
	});

	it('alla prima installazione niente; aggiornata da una versione senza novità, solo quella attuale', () => {
		expect(novitaDaMostrare(null, '0.3.0', false, elenco)).toEqual([]);
		expect(novitaDaMostrare(null, '0.3.0', true, elenco).map((n) => n.versione)).toEqual(['0.3.0']);
	});

	it('l elenco vero è in ordine, dalla più recente', () => {
		const versioni = NOVITA.map((n) => n.versione);
		expect([...versioni].sort((a, b) => confrontaVersioni(b, a))).toEqual(versioni);
		for (const n of NOVITA) expect(n.voci.length, n.versione).toBeGreaterThan(0);
	});
});
