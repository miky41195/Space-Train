import { describe, it, expect } from 'vitest';
import { planRename, renameSteps, type RenameItem, type RenameRule } from './batch-rename';

const file = (name: string): RenameItem => ({ path: `C:\\F\\${name}`, name, isDir: false });
const dir = (name: string): RenameItem => ({ path: `C:\\F\\${name}`, name, isDir: true });

const pattern = (p: string, start = 1): RenameRule => ({ mode: 'pattern', pattern: p, start, keepExtension: true });
const names = (items: RenameItem[], rule: RenameRule, taken: string[] = []) =>
	planRename(items, rule, new Set(taken.map((t) => t.toLowerCase()))).map((p) => p.problem ?? p.newName);

describe('planRename', () => {
	it('numbers with the width of the # run and keeps each extension as written', () => {
		expect(names([file('a.JPG'), file('b.heic'), dir('c.old')], pattern('Foto_###', 9))).toEqual([
			'Foto_009.JPG',
			'Foto_010.heic',
			'Foto_011'
		]);
	});

	it('without # appends the number like Explorer', () => {
		expect(names([file('a.txt')], pattern('Nota'))).toEqual(['Nota (1).txt']);
	});

	it('replaces every match, case-insensitive unless asked, outside the extension', () => {
		const rule: RenameRule = { mode: 'replace', find: 'img', replace: 'Foto', matchCase: false, keepExtension: true };
		expect(names([file('IMG_1 img.img')], rule)).toEqual(['Foto_1 Foto.img']);
		expect(names([file('IMG_1.txt')], { ...rule, matchCase: true })).toEqual(['IMG_1.txt']);
	});

	it('treats $ in the replacement literally', () => {
		const rule: RenameRule = { mode: 'replace', find: 'a', replace: '$&$1', matchCase: true, keepExtension: true };
		expect(names([file('a.txt')], rule)).toEqual(['$&$1.txt']);
	});

	it('flags names already in the folder, repeated names and invalid names', () => {
		expect(names([file('a.txt'), file('b.txt')], pattern('x'), ['x (2).txt'])).toEqual(['x (1).txt', 'esiste già']);
		const same: RenameRule = { mode: 'replace', find: 'a', replace: 'b', matchCase: true, keepExtension: true };
		expect(names([file('a.txt'), file('b.txt')], same)).toEqual(['nome ripetuto', 'b.txt']);
		expect(names([file('a.txt')], { ...same, replace: 'CON' })).toEqual(['nome riservato da Windows']);
		expect(names([file('a.txt')], pattern('a?b'))).toEqual(['carattere non ammesso «?»']);
	});

	it('lets an item take a name another selected item is giving up', () => {
		expect(names([file('1.txt'), file('2.txt')], pattern('#', 2), ['1.txt', '2.txt'])).toEqual(['2.txt', '3.txt']);
	});
});

describe('renameSteps', () => {
	it('goes through a temporary name when the target is still held', () => {
		const plan = planRename([file('1.txt'), file('2.txt')], pattern('#', 2), new Set());
		expect(renameSteps(plan)).toEqual([
			{ from: 'C:\\F\\1.txt', to: '1.txt.~st0' },
			{ from: 'C:\\F\\1.txt.~st0', to: '2.txt' },
			{ from: 'C:\\F\\2.txt', to: '3.txt' }
		]);
	});

	it('skips unchanged items', () => {
		const plan = planRename([file('a.txt')], { mode: 'replace', find: 'z', replace: 'y', matchCase: false, keepExtension: true }, new Set());
		expect(renameSteps(plan)).toEqual([]);
	});
});
