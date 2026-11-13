import { describe, expect, it } from 'vitest';
import { registra, testoCrescita } from './crescita';

const GIORNO = 24 * 60 * 60 * 1000;

describe('crescita', () => {
	it('has no growth the first time', () => {
		expect(registra({}, 'C:\\A', 100, 0).crescita).toBeNull();
	});

	it('counts from the latest measure of an earlier day, even when weighed again today', () => {
		let m = registra({}, 'C:\\A', 100, 0).misure;
		const oggi = registra(m, 'c:\\a', 150, 3 * GIORNO);
		expect(oggi.crescita).toEqual({ delta: 50, dal: 0, parte: 50 / 150 });
		m = oggi.misure;
		// An hour later: still since day 0, not since an hour ago.
		expect(registra(m, 'C:\\A', 160, 3 * GIORNO + 3600_000).crescita?.delta).toBe(60);
	});

	it('words the change', () => {
		const b = (n: number) => `${n / 1e9} GB`;
		expect(testoCrescita(7.9e9, b)).toBe('+7.9 GB');
		expect(testoCrescita(-1.3e9, b)).toBe('−1.3 GB');
		expect(testoCrescita(1000, b)).toBe('=');
	});
});
