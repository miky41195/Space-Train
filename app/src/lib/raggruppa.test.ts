import { describe, it, expect } from 'vitest';
import { impagina } from './raggruppa';
import type { Entry } from './ipc';

function voce(name: string, kind: Entry['kind'] = 'file', modified: number | null = 0): Entry {
	return { name, path: `C:\\${name}`, kind, size: 1, modified, hidden: false };
}

const nomi = (v: Entry[]) => v.map((e) => e.name);

describe('impagina', () => {
	const voci = [voce('Foto', 'dir'), voce('a.txt'), voce('b.jpg'), voce('c.zip')];

	it('senza preferiti né gruppi la lista non si divide', () => {
		const r = impagina(voci, new Set(), 'nessuno');
		expect(r.zone).toEqual([]);
		expect(nomi(r.voci)).toEqual(['Foto', 'a.txt', 'b.jpg', 'c.zip']);
	});

	it('i preferiti formano la prima zona', () => {
		const r = impagina(voci, new Set(['c.zip']), 'nessuno');
		expect(r.zone).toEqual([
			{ etichetta: 'Preferiti', quante: 1, tono: 'preferiti' },
			{ etichetta: 'Comuni', quante: 3 }
		]);
		expect(nomi(r.voci)[0]).toBe('c.zip');
	});

	it('per tipo: gruppi nell ordine fisso, solo quelli non vuoti', () => {
		const r = impagina(voci, new Set(), 'tipo');
		expect(r.zone.map((z) => z.etichetta)).toEqual(['Cartelle', 'Documenti', 'Immagini', 'Archivi']);
		expect(nomi(r.voci)).toEqual(['Foto', 'a.txt', 'b.jpg', 'c.zip']);
	});

	it('preferiti e gruppi insieme: i preferiti restano in cima e fuori dai gruppi', () => {
		const r = impagina(voci, new Set(['b.jpg']), 'tipo');
		expect(r.zone.map((z) => z.etichetta)).toEqual(['Preferiti', 'Cartelle', 'Documenti', 'Archivi']);
		expect(r.zone.reduce((n, z) => n + z.quante, 0)).toBe(voci.length);
	});

	it('per data: oggi, ieri, più vecchi e senza data', () => {
		const adesso = new Date(2026, 9, 25, 15, 0).getTime();
		const giorno = 24 * 60 * 60 * 1000;
		const r = impagina(
			[
				voce('oggi', 'file', adesso - 1000),
				voce('ieri', 'file', adesso - giorno),
				voce('vecchio', 'file', adesso - 400 * giorno),
				voce('ignoto', 'file', null)
			],
			new Set(),
			'data',
			adesso
		);
		expect(r.zone.map((z) => z.etichetta)).toEqual(['Oggi', 'Ieri', 'Più di un anno fa', 'Senza data']);
	});

	it('per nome: fasce di iniziali come in Esplora', () => {
		const r = impagina([voce('alfa'), voce('zeta'), voce('3d'), voce('Mario')], new Set(), 'nome');
		expect(r.zone.map((z) => z.etichetta)).toEqual(['0–9', 'A–H', 'I–P', 'Q–Z']);
	});

	it('per dimensione: le fasce di Esplora, cartelle a parte', () => {
		const grande = { ...voce('film.mkv'), size: 2 * 1024 ** 3 };
		const vuoto = { ...voce('vuoto.txt'), size: 0 };
		const r = impagina([grande, vuoto, voce('Foto', 'dir')], new Set(), 'dimensione');
		expect(r.zone.map((z) => z.etichetta)).toEqual(['Cartelle', 'Vuoto', 'Enorme (1–4 GB)']);
	});

	it('i recenti salgono in cima, dal più nuovo, sopra anche ai preferiti', () => {
		const adesso = 1_000_000_000_000;
		const giorno = 24 * 60 * 60 * 1000;
		const voci = [
			voce('vecchio', 'file', adesso - 100 * giorno),
			voce('ieri', 'file', adesso - giorno),
			voce('oggi', 'file', adesso - 1000),
			voce('preferito', 'file', adesso - 50 * giorno)
		];
		const r = impagina(voci, new Set(['preferito', 'oggi']), 'nessuno', adesso, adesso - 7 * giorno);

		expect(r.zone).toEqual([
			{ etichetta: 'Modificati di recente', quante: 2, tono: 'recenti' },
			{ etichetta: 'Preferiti', quante: 1, tono: 'preferiti' },
			{ etichetta: 'Comuni', quante: 1 }
		]);
		// «oggi» è anche preferito: compare una volta sola, fra i recenti.
		expect(r.voci.map((e) => e.name)).toEqual(['oggi', 'ieri', 'preferito', 'vecchio']);
	});

	it('la zona dei recenti c è anche vuota', () => {
		const r = impagina([voce('a', 'file', 0)], new Set(), 'nessuno', 10, 5);
		expect(r.zone).toEqual([
			{ etichetta: 'Modificati di recente', quante: 0, tono: 'recenti' },
			{ etichetta: 'Tutti gli altri', quante: 1 }
		]);
	});
});
