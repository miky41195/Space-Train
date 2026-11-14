import { describe, it, expect } from 'vitest';
import { categoryFor, iconKey, wantsThumbnail, drawnFolder } from './icons';
import type { Entry } from './ipc';

function item(name: string, kind: Entry['kind'] = 'file'): Entry {
	return { name, path: `C:\\${name}`, kind, size: 1, modified: 1, hidden: false };
}

describe('categoryFor', () => {
	it('recognises the known categories', () => {
		expect(categoryFor('main.rs')).toBe('code');
		expect(categoryFor('foto.JPG')).toBe('image');
		expect(categoryFor('archivio.zip')).toBe('archive');
	});

	it('names without an extension are generic', () => {
		expect(categoryFor('LICENSE')).toBe('plain');
	});

	it('a unix hidden file does not count the leading dot as an extension', () => {
		expect(categoryFor('.gitignore')).toBe('plain');
	});
});

describe('iconKey', () => {
	it('two files of the same type share the key', () => {
		expect(iconKey(item('uno.txt'))).toBe(iconKey(item('due.txt')));
	});

	it('different types have different keys', () => {
		expect(iconKey(item('a.txt'))).not.toBe(iconKey(item('a.pdf')));
	});

	it('ignores case in the extension', () => {
		expect(iconKey(item('a.TXT'))).toBe(iconKey(item('b.txt')));
	});

	it('all folders share a single key', () => {
		expect(iconKey(item('progetti', 'dir'))).toBe(iconKey(item('musica', 'dir')));
	});

	it('the size is part of the key', () => {
		expect(iconKey(item('a.txt'), true)).not.toBe(iconKey(item('a.txt'), false));
	});
});

describe('wantsThumbnail', () => {
	it('images and videos yes', () => {
		expect(wantsThumbnail(item('foto.png'))).toBe(true);
		expect(wantsThumbnail(item('clip.mp4'))).toBe(true);
	});

	it('code and archives no', () => {
		expect(wantsThumbnail(item('main.rs'))).toBe(false);
		expect(wantsThumbnail(item('roba.zip'))).toBe(false);
	});

	it('folders never', () => {
		expect(wantsThumbnail(item('immagini', 'dir'))).toBe(false);
	});

	it('whoever has an icon of their own asks the file for it, even a folder', () => {
		expect(wantsThumbnail({ ...item('Gioco.exe'), ownIcon: true })).toBe(true);
		expect(wantsThumbnail({ ...item('Steam', 'dir'), ownIcon: true })).toBe(true);
		expect(wantsThumbnail(item('Steam', 'dir'))).toBe(false);
	});
});

describe('drawnFolder', () => {
	const dir = { name: 'D', path: 'C:\\D', kind: 'dir' as const, size: 0, modified: null, hidden: false };

	it('draws folders in the theme style, colored ones always', () => {
		expect(drawnFolder(dir, undefined, 'pixel')).toBe('pixel');
		expect(drawnFolder(dir, undefined, 'windows')).toBeNull();
		expect(drawnFolder(dir, '#f00', 'windows')).toBe('flat');
		expect(drawnFolder(dir, '#f00', 'wagon')).toBe('wagon');
	});

	it('leaves files, drives and folders with their own icon to Windows', () => {
		expect(drawnFolder({ ...dir, kind: 'file' }, undefined, 'pixel')).toBeNull();
		expect(drawnFolder({ ...dir, free: 5 }, undefined, 'pixel')).toBeNull();
		expect(drawnFolder({ ...dir, ownIcon: true }, undefined, 'pixel')).toBeNull();
	});
});
