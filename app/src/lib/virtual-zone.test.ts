import { describe, it, expect } from 'vitest';
import { layoutZones, zoneWindow, itemTop, visibleRange, ROW_HEIGHT } from './virtual';

describe('layoutZones', () => {
	it('with a single zone and no header it matches the plain list', () => {
		const { zones, totalHeight } = layoutZones([1000], 1, ROW_HEIGHT, 0);
		const f = zoneWindow(zones[0], 0, 320, 1, ROW_HEIGHT, 8);
		const r = visibleRange(0, 320, 1000);

		expect(totalHeight).toBe(r.totalHeight);
		expect(f.start).toBe(r.start);
		// The margin above the top does not exist: only the one below is drawn.
		expect(f.count).toBe(320 / ROW_HEIGHT + 8);
	});

	it('stacks the zones with their header', () => {
		const { zones, totalHeight } = layoutZones([3, 5], 1, 32, 28);

		expect(zones[0]).toMatchObject({ start: 0, top: 0, body: 28 });
		expect(zones[1]).toMatchObject({ start: 3, top: 28 + 3 * 32, body: 56 + 3 * 32 });
		expect(totalHeight).toBe(56 + 8 * 32);
	});

	it('in a grid each zone starts on a new line', () => {
		const { zones } = layoutZones([5, 4], 4, 100, 0);
		// Five favourites on four columns take two whole rows.
		expect(zones[1].top).toBe(200);
	});
});

describe('zoneWindow', () => {
	it('a zone off screen draws nothing', () => {
		const { zones } = layoutZones([10, 1000], 1, 32, 28);
		const f = zoneWindow(zones[0], 20_000, 320, 1, 32, 2);
		expect(f.count).toBe(0);
	});

	it('returns global indices', () => {
		const { zones } = layoutZones([10, 1000], 1, 32, 28);
		const f = zoneWindow(zones[1], zones[1].body, 320, 1, 32, 0);
		expect(f.start).toBe(10);
		expect(f.top).toBe(zones[1].body);
	});
});

describe('itemTop', () => {
	it('accounts for the zone header', () => {
		const { zones } = layoutZones([3, 5], 1, 32, 28);
		expect(itemTop(zones, 0, 1, 32)).toBe(28);
		expect(itemTop(zones, 3, 1, 32)).toBe(zones[1].body);
	});
});
