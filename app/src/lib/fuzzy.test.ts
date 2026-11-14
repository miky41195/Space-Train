import { describe, it, expect } from 'vitest';
import { fuzzyMatch, filterEntries } from './fuzzy';

describe('fuzzyMatch', () => {
	it('finds a contiguous substring', () => {
		const m = fuzzyMatch('cargo', 'Cargo.toml');
		expect(m).not.toBeNull();
		expect(m!.positions).toEqual([0, 1, 2, 3, 4]);
	});

	it('finds a subsequence with gaps', () => {
		const m = fuzzyMatch('crgo', 'Cargo.toml');
		expect(m).not.toBeNull();
		expect(m!.positions).toEqual([0, 2, 3, 4]);
	});

	it('ignores case', () => {
		expect(fuzzyMatch('CARGO', 'cargo.toml')).not.toBeNull();
		expect(fuzzyMatch('cargo', 'CARGO.TOML')).not.toBeNull();
	});

	it('returns null when the characters are not there', () => {
		expect(fuzzyMatch('xyz', 'Cargo.toml')).toBeNull();
	});

	it('returns null when the characters are there but in the wrong order', () => {
		expect(fuzzyMatch('ograc', 'Cargo')).toBeNull();
	});

	it('an empty query matches everything without highlighting anything', () => {
		const m = fuzzyMatch('', 'qualsiasi.txt');
		expect(m).not.toBeNull();
		expect(m!.positions).toEqual([]);
	});

	it('rewards the contiguous match over the scattered one', () => {
		const contiguous = fuzzyMatch('abc', 'abc.txt')!;
		const scattered = fuzzyMatch('abc', 'a_b_c.txt')!;
		expect(contiguous.score).toBeGreaterThan(scattered.score);
	});

	it('rewards the match at the start of a word', () => {
		const wordStart = fuzzyMatch('mt', 'main.ts')!;
		const insideWord = fuzzyMatch('mt', 'formatter')!;
		expect(wordStart.score).toBeGreaterThan(insideWord.score);
	});

	it('rewards the prefix over a match in the middle of the name', () => {
		const prefix = fuzzyMatch('log', 'logger.ts')!;
		const inner = fuzzyMatch('log', 'catalogo.ts')!;
		expect(prefix.score).toBeGreaterThan(inner.score);
	});

	it('the name identical to the query gets the highest score', () => {
		const identical = fuzzyMatch('readme', 'readme')!;
		const parziale = fuzzyMatch('readme', 'readme.md')!;
		expect(identical.score).toBeGreaterThan(parziale.score);
	});

	it('recognises the word start on a camelCase capital', () => {
		const m = fuzzyMatch('fb', 'fooBar.ts')!;
		expect(m.positions).toEqual([0, 3]);
	});
});

describe('filterEntries', () => {
	const items = [
		{ name: 'Cargo.toml' },
		{ name: 'catalogo.ts' },
		{ name: 'README.md' },
		{ name: 'src' }
	];

	it('an empty query returns everything in the original order', () => {
		const r = filterEntries(items, '');
		expect(r.map((x) => x.item.name)).toEqual([
			'Cargo.toml',
			'catalogo.ts',
			'README.md',
			'src'
		]);
	});

	it('drops the items that do not match', () => {
		const r = filterEntries(items, 'md');
		expect(r.map((x) => x.item.name)).toEqual(['README.md']);
	});

	it('sorts by descending score', () => {
		const r = filterEntries(items, 'ca');
		expect(r[0].item.name).toBe('Cargo.toml');
		expect(r.map((x) => x.item.name)).toContain('catalogo.ts');
	});

	it('returns the positions to highlight for each item', () => {
		const r = filterEntries(items, 'car');
		expect(r[0].positions).toEqual([0, 1, 2]);
	});

	it('no result when nothing matches', () => {
		expect(filterEntries(items, 'zzzz')).toEqual([]);
	});
});
