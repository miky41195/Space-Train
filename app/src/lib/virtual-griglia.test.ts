import { describe, it, expect } from 'vitest';
import { visibleGridRange, CELL_WIDTH, CELL_HEIGHT } from './virtual';

describe('visibleGridRange', () => {
	it('calcola le colonne dalla larghezza disponibile', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 5 + 40, 100);
		expect(r.columns).toBe(5);
	});

	it('una finestra strettissima tiene almeno una colonna', () => {
		// Con zero colonne la divisione produrrebbe righe infinite.
		const r = visibleGridRange(0, 400, 20, 100);
		expect(r.columns).toBe(1);
	});

	it('l altezza totale segue il numero di righe, non di elementi', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 4, 20);
		expect(r.columns).toBe(4);
		expect(r.totalHeight).toBe(5 * CELL_HEIGHT);
	});

	it('l ultima riga incompleta conta comunque', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 4, 21);
		expect(r.totalHeight).toBe(6 * CELL_HEIGHT);
	});

	it('restituisce indici di elementi, non di righe', () => {
		const r = visibleGridRange(CELL_HEIGHT * 10, 400, CELL_WIDTH * 4, 400);
		// Riga 10 meno il margine, per quattro colonne.
		expect(r.start % 4).toBe(0);
		expect(r.start).toBe((10 - 2) * 4);
	});

	it('non sfora mai il totale', () => {
		const r = visibleGridRange(CELL_HEIGHT * 95, 400, CELL_WIDTH * 4, 400);
		expect(r.start + r.count).toBeLessThanOrEqual(400);
	});

	it('in cima non produce indici negativi', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 4, 400);
		expect(r.start).toBe(0);
		expect(r.padTop).toBe(0);
	});

	it('una lista vuota non disegna nulla ma conserva le colonne', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 3, 0);
		expect(r.count).toBe(0);
		expect(r.totalHeight).toBe(0);
		expect(r.columns).toBe(3);
	});

	it('rende meno celle di quante ne contenga la lista intera', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 4, 10_000);
		expect(r.count).toBeLessThan(60);
	});
});
