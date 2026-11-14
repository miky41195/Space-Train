import { describe, it, expect } from 'vitest';
import { innerOf, level, above } from './archive';

const items = [
	{ path: 'src/deep/b.txt', size: 4, dir: false, modified: 2 },
	{ path: 'src/a.txt', size: 5, dir: false, modified: 1 },
	{ path: 'README.md', size: 2, dir: false, modified: 3 },
	{ path: 'empty', size: 0, dir: true, modified: 9 }
];

describe('archive as a folder', () => {
	it('lists one level, folders first, making up folders TAR leaves out', () => {
		const root = level(items, '', 'C:\\p.tar');
		expect(root.map((e) => [e.name, e.kind])).toEqual([
			['empty', 'dir'],
			['src', 'dir'],
			['README.md', 'file']
		]);
		expect(root[1].path).toBe('C:\\p.tar::src');
		expect(level(items, 'src', 'C:\\p.tar').map((e) => e.name)).toEqual(['deep', 'a.txt']);
	});

	it('walks back up and out', () => {
		expect(above('src/deep')).toBe('src');
		expect(above('src')).toBe('');
		expect(above('')).toBeNull();
		expect(innerOf('C:\\p.tar::src/a.txt')).toBe('src/a.txt');
	});
});
