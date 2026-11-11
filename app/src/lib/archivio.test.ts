import { describe, it, expect } from 'vitest';
import { internoDi, livello, sopra } from './archivio';

const voci = [
	{ path: 'src/deep/b.txt', size: 4, dir: false, modified: 2 },
	{ path: 'src/a.txt', size: 5, dir: false, modified: 1 },
	{ path: 'README.md', size: 2, dir: false, modified: 3 },
	{ path: 'empty', size: 0, dir: true, modified: 9 }
];

describe('archive as a folder', () => {
	it('lists one level, folders first, making up folders TAR leaves out', () => {
		const radice = livello(voci, '', 'C:\\p.tar');
		expect(radice.map((e) => [e.name, e.kind])).toEqual([
			['empty', 'dir'],
			['src', 'dir'],
			['README.md', 'file']
		]);
		expect(radice[1].path).toBe('C:\\p.tar::src');
		expect(livello(voci, 'src', 'C:\\p.tar').map((e) => e.name)).toEqual(['deep', 'a.txt']);
	});

	it('walks back up and out', () => {
		expect(sopra('src/deep')).toBe('src');
		expect(sopra('src')).toBe('');
		expect(sopra('')).toBeNull();
		expect(internoDi('C:\\p.tar::src/a.txt')).toBe('src/a.txt');
	});
});
