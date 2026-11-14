import { describe, it, expect } from 'vitest';
import { boxBetween, overlap } from './marquee';

describe('selection marquee', () => {
	it('draws in any direction', () => {
		expect(boxBetween(50, 40, 10, 100)).toEqual({ x: 10, y: 40, w: 40, h: 60 });
	});

	it('brushing an item is enough to take it, but touching only its edge is not', () => {
		const item = { x: 0, y: 32, w: 300, h: 32 };
		expect(overlap({ x: 100, y: 60, w: 5, h: 5 }, item)).toBe(true);
		expect(overlap({ x: 100, y: 0, w: 5, h: 32 }, item)).toBe(false);
		expect(overlap({ x: 100, y: 0, w: 5, h: 33 }, item)).toBe(true);
	});
});
