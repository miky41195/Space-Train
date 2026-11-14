import { describe, expect, it } from 'vitest';
import { record, growthText } from './growth';

const DAY = 24 * 60 * 60 * 1000;

describe('growth', () => {
	it('has no growth the first time', () => {
		expect(record({}, 'C:\\A', 100, 0).growth).toBeNull();
	});

	it('counts from the latest measure of an earlier day, even when weighed again today', () => {
		let m = record({}, 'C:\\A', 100, 0).measures;
		const today = record(m, 'c:\\a', 150, 3 * DAY);
		expect(today.growth).toEqual({ delta: 50, since: 0, share: 50 / 150 });
		m = today.measures;
		// An hour later: still since day 0, not since an hour ago.
		expect(record(m, 'C:\\A', 160, 3 * DAY + 3600_000).growth?.delta).toBe(60);
	});

	it('words the change', () => {
		const b = (n: number) => `${n / 1e9} GB`;
		expect(growthText(7.9e9, b)).toBe('+7.9 GB');
		expect(growthText(-1.3e9, b)).toBe('−1.3 GB');
		expect(growthText(1000, b)).toBe('=');
	});
});
