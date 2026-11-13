import { describe, expect, it } from 'vitest';
import type { Drive } from './ipc';
import { daRicordare, SILENZIO } from './promemoria';

const GIORNO = 24 * 60 * 60 * 1000;
const ADESSO = 100 * GIORNO;
const disco = (path: string, libero: number, tipo: Drive['tipo'] = 'fisso'): Drive => ({ label: path, path, libero, totale: 100, tipo });

describe('daRicordare', () => {
	it('picks a fixed drive under the threshold', () => {
		expect(daRicordare([disco('D:\\', 50), disco('C:\\', 7)], 10, {}, {}, ADESSO)?.drive.path).toBe('C:\\');
		expect(daRicordare([disco('E:\\', 2, 'rimovibile')], 10, {}, {}, ADESSO)).toBeNull();
		expect(daRicordare([disco('C:\\', 7)], 0, {}, {}, ADESSO)).toBeNull();
	});

	it('reminds once a day and keeps quiet after «Non ora»', () => {
		const c = [disco('C:\\', 7)];
		expect(daRicordare(c, 10, { 'c:\\': { visto: ADESSO - 3600_000 } }, {}, ADESSO)).toBeNull();
		expect(daRicordare(c, 10, { 'c:\\': { visto: ADESSO - 2 * GIORNO } }, {}, ADESSO)).not.toBeNull();
		expect(daRicordare(c, 10, { 'c:\\': { zitto: ADESSO + SILENZIO } }, {}, ADESSO)).toBeNull();
	});

	it('quotes the last cleanup only while recent', () => {
		const c = [disco('C:\\', 7)];
		expect(daRicordare(c, 10, {}, { 'c:\\': { byte: 82, at: ADESSO - GIORNO } }, ADESSO)?.trovati).toBe(82);
		expect(daRicordare(c, 10, {}, { 'c:\\': { byte: 82, at: ADESSO - 30 * GIORNO } }, ADESSO)?.trovati).toBeUndefined();
	});
});
