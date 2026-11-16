import { describe, it, expect } from 'vitest';
import { folderChanges, seenOf } from './folder-changes';
import type { Entry } from './ipc';

const file = (name: string, size = 1, modified = 1, hidden = false): Entry => ({
	name,
	path: `C:\\x\\${name}`,
	kind: 'file',
	size,
	modified,
	hidden
});
const dir = (name: string, size = 0, modified = 1): Entry => ({ ...file(name, size, modified), kind: 'dir' });

describe('folderChanges', () => {
	const before = { at: 100, entries: seenOf([file('a.pdf'), file('b.xlsx'), file('gone.txt'), dir('Foto')]) };

	it('finds the new, the modified and the gone', () => {
		const c = folderChanges(before, [file('a.pdf'), file('b.xlsx', 2), file('new.pdf'), dir('Foto', 99, 5)]);
		expect([...c.added]).toEqual(['new.pdf']);
		expect([...c.modified]).toEqual(['b.xlsx']);
		expect(c.removed.map((s) => s.name)).toEqual(['gone.txt']);
		expect(c.since).toBe(100);
	});

	it('a folder whose inside changed is not marked, and hidden items do not count', () => {
		const c = folderChanges(before, [file('a.pdf'), file('b.xlsx'), file('gone.txt'), dir('Foto', 5, 9), file('desktop.ini', 1, 1, true)]);
		expect(c.added.size + c.modified.size + c.removed.length).toBe(0);
	});

	it('a renamed case is the same file on Windows', () => {
		expect(folderChanges(before, [file('A.PDF'), file('b.xlsx'), file('gone.txt'), dir('Foto')]).added.size).toBe(0);
		expect(folderChanges(before, [file('A.PDF'), file('b.xlsx'), file('gone.txt'), dir('Foto')], false).added.size).toBe(1);
	});
});
