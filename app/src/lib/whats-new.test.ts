import { describe, it, expect } from 'vitest';
import { compareVersions, whatsNewToShow, WHATS_NEW } from './whats-new';

const list = [
	{ version: '0.3.0', items: ['c'] },
	{ version: '0.2.10', items: ['b'] },
	{ version: '0.2.1', items: ['a'] }
];

describe('news after an update', () => {
	it('versions compare as numbers, not as text', () => {
		expect(compareVersions('0.2.10', '0.2.9')).toBeGreaterThan(0);
		expect(compareVersions('0.2.1', '0.2.1')).toBe(0);
		expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
	});

	it('shows the skipped versions, newest first, up to the installed one', () => {
		expect(whatsNewToShow('0.2.1', '0.3.0', true, list).map((n) => n.version)).toEqual(['0.3.0', '0.2.10']);
		expect(whatsNewToShow('0.2.1', '0.2.10', true, list).map((n) => n.version)).toEqual(['0.2.10']);
	});

	it('already seen: nothing', () => {
		expect(whatsNewToShow('0.3.0', '0.3.0', true, list)).toEqual([]);
	});

	it('at first install nothing; updated from a version without news, only the current one', () => {
		expect(whatsNewToShow(null, '0.3.0', false, list)).toEqual([]);
		expect(whatsNewToShow(null, '0.3.0', true, list).map((n) => n.version)).toEqual(['0.3.0']);
	});

	it('the real list is in order, newest first', () => {
		const versions = WHATS_NEW.map((n) => n.version);
		expect([...versions].sort((a, b) => compareVersions(b, a))).toEqual(versions);
		for (const n of WHATS_NEW) expect(n.items.length, n.version).toBeGreaterThan(0);
	});
});
