import { describe, expect, it } from 'vitest';
import { corto, eta, piano, preselezione } from './pulizia';

const GIORNO = 24 * 60 * 60 * 1000;
const ADESSO = 1_000 * GIORNO;

describe('pulizia', () => {
	it('never preselects what needs a look, nor projects used this week', () => {
		const voci = [
			{ path: 'a', size: 1, used: ADESSO - GIORNO },
			{ path: 'b', size: 1, used: ADESSO - 30 * GIORNO }
		];
		expect(preselezione('guarda', voci, ADESSO)).toEqual([]);
		expect(preselezione('progetti', voci, ADESSO)).toEqual(['b']);
		expect(preselezione('ricrea', voci, ADESSO)).toEqual(['a', 'b']);
	});

	it('splits the plan: rebuilt for good, to look at into the Trash', () => {
		const p = piano(
			{
				cache: [{ path: 'c', size: 10, used: 0 }],
				modelli: [
					{ path: 'm', size: 100, used: 0 },
					{ path: 'n', size: 5, used: 0 }
				],
				cestino: [{ path: 't', size: 1, used: 0 }]
			},
			{ cache: ['c'], modelli: ['m'], cestino: ['t'] }
		);
		expect(p).toEqual({ disco: ['c'], cestino: ['m'], svuota: true, byte: 111 });
	});

	it('says ages in words', () => {
		expect(eta(ADESSO - 1000, ADESSO)).toBe('oggi');
		expect(eta(ADESSO - 41 * GIORNO, ADESSO)).toBe('41 giorni');
		expect(eta(ADESSO - 150 * GIORNO, ADESSO)).toBe('5 mesi');
		expect(eta(ADESSO - 800 * GIORNO, ADESSO)).toBe('2 anni');
	});

	it('shortens paths below their folder', () => {
		expect(corto('C:\\P\\Explorer\\target', ['C:\\P\\'])).toBe('Explorer\\target');
		expect(corto('D:\\x', ['C:\\P'])).toBe('D:\\x');
	});
});
