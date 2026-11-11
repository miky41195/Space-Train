import { describe, it, expect } from 'vitest';
import type { Entry } from './ipc';
import { describeRule, matches, parseExts, problem, settled, type Rule } from './rules';

const NOW = Date.UTC(2026, 10, 11);
const DAY = 86_400_000;
const file = (name: string, extra: Partial<Entry> = {}): Entry => ({
	name,
	path: `C:\\Download\\${name}`,
	kind: 'file',
	size: 10,
	modified: NOW,
	hidden: false,
	...extra
});

const rule = (over: Partial<Rule>): Rule => ({
	id: '1',
	folder: 'C:\\Download',
	when: 'arrival',
	if: { type: 'ext', exts: ['pdf'] },
	then: { type: 'move', dest: 'C:\\Documenti\\PDF' },
	enabled: true,
	...over
});

describe('matches', () => {
	it('checks extension, category, name, age and size; never folders or partial downloads', () => {
		expect(matches({ type: 'ext', exts: ['pdf'] }, file('Fattura.PDF'), NOW)).toBe(true);
		expect(matches({ type: 'ext', exts: ['pdf'] }, file('x.pdf.crdownload'), NOW)).toBe(false);
		expect(matches({ type: 'any' }, { ...file('Cartella'), kind: 'dir' }, NOW)).toBe(false);
		expect(matches({ type: 'category', category: 'doc' }, file('a.pdf'), NOW)).toBe(true);
		expect(matches({ type: 'category', category: 'image' }, file('a.jpg'), NOW)).toBe(true);
		expect(matches({ type: 'name', text: 'screenshot' }, file('Screenshot 2026.png'), NOW)).toBe(true);
		expect(matches({ type: 'olderThan', days: 30 }, file('old.zip', { modified: NOW - 31 * DAY }), NOW)).toBe(true);
		expect(matches({ type: 'olderThan', days: 30 }, file('new.zip', { modified: NOW - 2 * DAY }), NOW)).toBe(false);
		expect(matches({ type: 'largerThan', mb: 1 }, file('big.iso', { size: 2 * 1024 * 1024 }), NOW)).toBe(true);
	});
});

describe('problem', () => {
	it('refuses incomplete rules and the trash without a condition', () => {
		expect(problem(rule({}))).toBeNull();
		expect(problem(rule({ then: { type: 'move', dest: '' } }))).toMatch(/destinazione/);
		expect(problem(rule({ then: { type: 'move', dest: 'c:\\download\\' } }))).toMatch(/stessa/);
		expect(problem(rule({ if: { type: 'any' }, then: { type: 'trash' } }))).toMatch(/condizione/);
		expect(problem(rule({ if: { type: 'olderThan', days: 0 }, then: { type: 'trash' } }))).toMatch(/numero/);
	});
});

describe('parseExts and describeRule', () => {
	it('reads extensions however typed and describes the rule as a sentence', () => {
		expect(parseExts('PDF, .docx *.txt pdf')).toEqual(['pdf', 'docx', 'txt']);
		expect(describeRule(rule({}))).toBe('Quando arriva un file, se ha estensione PDF, spostalo in PDF');
	});
});

describe('settled', () => {
	it('ignores what was there at the first look, then waits one look for a new file to stop changing', () => {
		const a = file('a.pdf');
		let st = settled(null, new Map(), [a]);
		expect(st.ready).toEqual([]);

		const b = file('b.pdf', { size: 5 });
		st = settled(st.seen, st.waiting, [a, b]);
		expect(st.ready).toEqual([]);

		const bGrown = file('b.pdf', { size: 9 });
		st = settled(st.seen, st.waiting, [a, bGrown]);
		expect(st.ready).toEqual([]);

		st = settled(st.seen, st.waiting, [a, bGrown]);
		expect(st.ready.map((f) => f.name)).toEqual(['b.pdf']);

		st = settled(st.seen, st.waiting, [a, bGrown]);
		expect(st.ready).toEqual([]);
	});
});
