import { describe, expect, it } from 'vitest';
import { shortPath, age, plan, preselection } from './cleanup';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;

describe('cleanup', () => {
	it('never preselects what needs a look, nor projects used this week', () => {
		const items = [
			{ path: 'a', size: 1, used: NOW - DAY },
			{ path: 'b', size: 1, used: NOW - 30 * DAY }
		];
		expect(preselection('review', items, NOW)).toEqual([]);
		expect(preselection('projects', items, NOW)).toEqual(['b']);
		expect(preselection('rebuilt', items, NOW)).toEqual(['a', 'b']);
	});

	it('splits the plan: rebuilt for good, to look at into the Trash', () => {
		const p = plan(
			{
				cache: [{ path: 'c', size: 10, used: 0 }],
				models: [
					{ path: 'm', size: 100, used: 0 },
					{ path: 'n', size: 5, used: 0 }
				],
				trash: [{ path: 't', size: 1, used: 0 }]
			},
			{ cache: ['c'], models: ['m'], trash: ['t'] }
		);
		expect(p).toEqual({ permanent: ['c'], trash: ['m'], emptyTrash: true, bytes: 111 });
	});

	it('says ages in words', () => {
		expect(age(NOW - 1000, NOW)).toBe('oggi');
		expect(age(NOW - 41 * DAY, NOW)).toBe('41 giorni');
		expect(age(NOW - 150 * DAY, NOW)).toBe('5 mesi');
		expect(age(NOW - 800 * DAY, NOW)).toBe('2 anni');
	});

	it('shortens paths below their folder', () => {
		expect(shortPath('C:\\P\\Explorer\\target', ['C:\\P\\'])).toBe('Explorer\\target');
		expect(shortPath('D:\\x', ['C:\\P'])).toBe('D:\\x');
	});
});
