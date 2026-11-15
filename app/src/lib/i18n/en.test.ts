import { describe, it, expect } from 'vitest';
import { EN } from './en';

const holes = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();

describe('EN dictionary', () => {
	it('keeps every placeholder of the Italian text', () => {
		const broken = Object.entries(EN).filter(([it, en]) => holes(it) !== holes(en));
		expect(broken).toEqual([]);
	});

	it('has no empty translations', () => {
		expect(Object.entries(EN).filter(([, en]) => !en.trim())).toEqual([]);
	});
});
