import { describe, it, expect } from 'vitest';
import { zoom, cellSize, sizeName, clampSide, SIDE_MAX, SIDE_MIN, type View } from './view';

describe('zoom', () => {
	it('within icons grows and shrinks in steps, without leaving the limits', () => {
		let s = { view: 'icons' as const, side: 64 };
		const up = zoom(s, 1);
		expect(up.view).toBe('icons');
		expect(up.side).toBeGreaterThan(64);

		s = { view: 'icons', side: SIDE_MAX };
		expect(zoom(s, 1).side).toBe(SIDE_MAX);
	});

	it('below the smallest icons goes to List and then to Details', () => {
		const list = zoom({ view: 'icons', side: SIDE_MIN }, -1);
		expect(list.view).toBe('list');
		expect(zoom(list, -1).view).toBe('details');
		// Details is the bottom: it goes no further.
		expect(zoom({ view: 'details', side: 96 }, -1).view).toBe('details');
	});

	it('climbing back from Details returns to icons', () => {
		const list = zoom({ view: 'details', side: 96 }, 1);
		expect(list.view).toBe('list');
		expect(zoom(list, 1)).toEqual({ view: 'icons', side: SIDE_MIN });
	});

	it('many wheel notches go from one end to the other', () => {
		let s: { view: View; side: number } = { view: 'details', side: 96 };
		for (let i = 0; i < 60; i++) s = zoom(s, 1);
		expect(s).toEqual({ view: 'icons', side: SIDE_MAX });
		for (let i = 0; i < 60; i++) s = zoom(s, -1);
		expect(s.view).toBe('details');
	});
});

describe('cellSize', () => {
	it('large icons sit above the name and the cell grows with them', () => {
		const small = cellSize({ view: 'icons', side: 64 });
		const large = cellSize({ view: 'icons', side: 256 });
		expect(small.horizontal).toBe(false);
		expect(large.width).toBeGreaterThan(small.width);
		expect(large.icon).toBe(256);
	});

	it('small icons sit next to the name', () => {
		expect(cellSize({ view: 'icons', side: 24 }).horizontal).toBe(true);
	});

	it('tiles and content show the details; content takes the whole row', () => {
		expect(cellSize({ view: 'tiles', side: 0 }).details).toBe(true);
		const c = cellSize({ view: 'content', side: 0 });
		expect(c.full).toBe(true);
		expect(c.details).toBe(true);
	});
});

describe('sizes', () => {
	it('the menu sizes have a name, the others do not', () => {
		expect(sizeName({ view: 'icons', side: 128 })).toBe('Icone grandi');
		expect(sizeName({ view: 'icons', side: 130 })).toBeNull();
		expect(sizeName({ view: 'details', side: 128 })).toBeNull();
	});

	it('the side rounds and stays within the limits', () => {
		expect(clampSide(100.6)).toBe(101);
		expect(clampSide(0)).toBe(SIDE_MIN);
		expect(clampSide(10_000)).toBe(SIDE_MAX);
	});
});
