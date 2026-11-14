import { describe, it, expect } from 'vitest';
import { visibleGridRange, CELL_WIDTH, CELL_HEIGHT } from './virtual';

describe('visibleGridRange', () => {
	it('computes the columns from the available width', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 5 + 40, 100);
		expect(r.columns).toBe(5);
	});

	it('a very narrow window keeps at least one column', () => {
		// With zero columns the division would produce infinite rows.
		const r = visibleGridRange(0, 400, 20, 100);
		expect(r.columns).toBe(1);
	});

	it('the total height follows the number of rows, not of items', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 4, 20);
		expect(r.columns).toBe(4);
		expect(r.totalHeight).toBe(5 * CELL_HEIGHT);
	});

	it('the incomplete last row still counts', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 4, 21);
		expect(r.totalHeight).toBe(6 * CELL_HEIGHT);
	});

	it('returns indices of items, not of rows', () => {
		const r = visibleGridRange(CELL_HEIGHT * 10, 400, CELL_WIDTH * 4, 400);
		// Row 10 minus the margin, times four columns.
		expect(r.start % 4).toBe(0);
		expect(r.start).toBe((10 - 2) * 4);
	});

	it('never goes past the total', () => {
		const r = visibleGridRange(CELL_HEIGHT * 95, 400, CELL_WIDTH * 4, 400);
		expect(r.start + r.count).toBeLessThanOrEqual(400);
	});

	it('at the top produces no negative indices', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 4, 400);
		expect(r.start).toBe(0);
		expect(r.padTop).toBe(0);
	});

	it('an empty list draws nothing but keeps the columns', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 3, 0);
		expect(r.count).toBe(0);
		expect(r.totalHeight).toBe(0);
		expect(r.columns).toBe(3);
	});

	it('renders fewer cells than the whole list holds', () => {
		const r = visibleGridRange(0, 400, CELL_WIDTH * 4, 10_000);
		expect(r.count).toBeLessThan(60);
	});
});
