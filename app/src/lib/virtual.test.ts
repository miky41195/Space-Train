import { describe, it, expect } from 'vitest';
import { visibleRange, ROW_HEIGHT, OVERSCAN } from './virtual';

describe('visibleRange', () => {
	it('starts from zero when scrolled to the top', () => {
		const r = visibleRange(0, 320, 1000);
		expect(r.start).toBe(0);
		expect(r.padTop).toBe(0);
	});

	it('applies the overscan margin above', () => {
		const r = visibleRange(ROW_HEIGHT * 100, 320, 1000);
		expect(r.start).toBe(100 - OVERSCAN);
		expect(r.padTop).toBe((100 - OVERSCAN) * ROW_HEIGHT);
	});

	it('never produces a negative index', () => {
		const r = visibleRange(ROW_HEIGHT * 2, 320, 1000);
		expect(r.start).toBe(0);
	});

	it('does not exceed the total number of items', () => {
		const r = visibleRange(ROW_HEIGHT * 995, 320, 1000);
		expect(r.start + r.count).toBeLessThanOrEqual(1000);
	});

	it('computes the total height of the spacer', () => {
		const r = visibleRange(0, 320, 1000);
		expect(r.totalHeight).toBe(1000 * ROW_HEIGHT);
	});

	it('with an empty list renders nothing', () => {
		const r = visibleRange(0, 320, 0);
		expect(r.count).toBe(0);
		expect(r.totalHeight).toBe(0);
	});
});
