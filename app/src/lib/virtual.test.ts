import { describe, it, expect } from 'vitest';
import { visibleRange, ROW_HEIGHT, OVERSCAN } from './virtual';

describe('visibleRange', () => {
	it('parte da zero quando lo scroll è in cima', () => {
		const r = visibleRange(0, 320, 1000);
		expect(r.start).toBe(0);
		expect(r.padTop).toBe(0);
	});

	it('applica il margine di overscan sopra', () => {
		const r = visibleRange(ROW_HEIGHT * 100, 320, 1000);
		expect(r.start).toBe(100 - OVERSCAN);
		expect(r.padTop).toBe((100 - OVERSCAN) * ROW_HEIGHT);
	});

	it('non produce mai un indice negativo', () => {
		const r = visibleRange(ROW_HEIGHT * 2, 320, 1000);
		expect(r.start).toBe(0);
	});

	it('non supera il numero totale di voci', () => {
		const r = visibleRange(ROW_HEIGHT * 995, 320, 1000);
		expect(r.start + r.count).toBeLessThanOrEqual(1000);
	});

	it('calcola l altezza totale dello spaziatore', () => {
		const r = visibleRange(0, 320, 1000);
		expect(r.totalHeight).toBe(1000 * ROW_HEIGHT);
	});

	it('con una lista vuota non renderizza niente', () => {
		const r = visibleRange(0, 320, 0);
		expect(r.count).toBe(0);
		expect(r.totalHeight).toBe(0);
	});
});
