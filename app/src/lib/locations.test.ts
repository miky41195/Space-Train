import { describe, it, expect } from 'vitest';
import {
	breadcrumbs,
	locationName,
	nameOf,
	folderOf,
	sameVolume,
	withoutExtension,
	isZip,
	isExecutable,
	samePath,
	formatBytes,
	isInside,
	isArchive
} from './locations';

describe('breadcrumbs', () => {
	it('a disk starts from This PC and each stretch leads to its folder', () => {
		expect(breadcrumbs('C:\\Utenti\\Anna')).toEqual([
			{ name: 'Questo PC', path: '::pc' },
			{ name: 'C:', path: 'C:\\' },
			{ name: 'Utenti', path: 'C:\\Utenti' },
			{ name: 'Anna', path: 'C:\\Utenti\\Anna' }
		]);
	});

	it('a network path starts from Network', () => {
		expect(breadcrumbs('\\\\nas\\foto\\2024').map((b) => b.path)).toEqual([
			'::rete',
			'\\\\nas',
			'\\\\nas\\foto',
			'\\\\nas\\foto\\2024'
		]);
	});

	it('virtual locations have their name', () => {
		expect(breadcrumbs('::cestino')).toEqual([{ name: 'Cestino', path: '::cestino' }]);
		expect(locationName('::pc')).toBe('Questo PC');
		expect(locationName('C:\\')).toBe('C:');
		expect(locationName('C:\\Dati\\Foto')).toBe('Foto');
	});
});

describe('path readings', () => {
	it('name and folder of an item', () => {
		expect(nameOf('C:\\Dati\\nota.txt')).toBe('nota.txt');
		expect(folderOf('C:\\Dati\\nota.txt')).toBe('C:\\Dati');
		expect(folderOf('C:\\nota.txt')).toBe('C:\\');
	});

	it('the same volume decides between moving and copying', () => {
		expect(sameVolume('C:\\a', 'c:\\b\\c')).toBe(true);
		expect(sameVolume('C:\\a', 'D:\\a')).toBe(false);
		expect(sameVolume('\\\\nas\\foto\\a', '\\\\nas\\foto\\b')).toBe(true);
		expect(sameVolume('\\\\nas\\foto\\a', '\\\\nas\\video\\b')).toBe(false);
	});

	it('extensions and types', () => {
		expect(withoutExtension('foto.vacanze.jpg')).toBe('foto.vacanze');
		expect(withoutExtension('.gitignore')).toBe('.gitignore');
		expect(isZip('Archivio.ZIP')).toBe(true);
		expect(isExecutable('setup.exe')).toBe(true);
		expect(isExecutable('nota.txt')).toBe(false);
	});

	it('paths compare the way Windows does', () => {
		expect(samePath('C:\\Dati\\', 'c:\\dati')).toBe(true);
		expect(samePath('C:\\Dati', 'C:\\Dati2')).toBe(false);
	});

	it('bytes read at a glance', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2 KB');
		expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
	});
});

describe('local network', () => {
	it('breadcrumbs start from Local network and go through the PC', () => {
		expect(breadcrumbs('::lan\\PC2-ab12\\Foto')).toEqual([
			{ name: 'Rete locale', path: '::lan' },
			{ name: 'PC2-ab12', path: '::lan\\PC2-ab12' },
			{ name: 'Foto', path: '::lan\\PC2-ab12\\Foto' }
		]);
		expect(locationName('::lan')).toBe('Rete locale');
	});
});

describe('Linux paths', () => {
	it('breadcrumbs start at This PC, then the file system root', () => {
		expect(breadcrumbs('/home/anna/Foto')).toEqual([
			{ name: 'Questo PC', path: '::pc' },
			{ name: 'File system', path: '/' },
			{ name: 'home', path: '/home' },
			{ name: 'anna', path: '/home/anna' },
			{ name: 'Foto', path: '/home/anna/Foto' }
		]);
		expect(locationName('/')).toBe('File system');
	});

	it('name and parent folder', () => {
		expect(nameOf('/home/anna/nota.txt')).toBe('nota.txt');
		expect(folderOf('/home/anna/nota.txt')).toBe('/home/anna');
		expect(folderOf('/home')).toBe('/');
	});

	it('case matters on Linux', () => {
		expect(samePath('/home/Anna', '/home/anna')).toBe(false);
		expect(samePath('/home/anna/', '/home/anna')).toBe(true);
		expect(samePath('/', '/')).toBe(true);
	});

	it('a USB stick is a different volume from the system disk', () => {
		expect(sameVolume('/home/anna/a.txt', '/tmp')).toBe(true);
		expect(sameVolume('/home/anna/a.txt', '/media/anna/USB/x')).toBe(false);
		expect(sameVolume('/media/anna/USB/a', '/media/anna/USB/b/c')).toBe(true);
		expect(sameVolume('/run/media/anna/USB/a', '/home')).toBe(false);
	});

	it('inside a folder', () => {
		expect(isInside('/home/anna/Foto', '/home/anna')).toBe(true);
		expect(isInside('/home/annalisa', '/home/anna')).toBe(false);
		expect(isInside('/etc', '/')).toBe(true);
		expect(isInside('C:\\Users\\X', 'c:\\users')).toBe(true);
	});
});

describe('archives', () => {
	it('recognises the formats Space Train reads', () => {
		expect(['a.zip', 'b.7Z', 'c.rar', 'd.tar', 'e.tar.gz', 'f.tgz'].every(isArchive)).toBe(true);
		expect(isArchive('note.txt')).toBe(false);
		expect(isArchive('tar')).toBe(false);
	});
});
