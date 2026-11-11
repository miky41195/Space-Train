import { describe, it, expect } from 'vitest';
import {
	briciole,
	nomePosizione,
	nomeDi,
	cartellaDi,
	stessoVolume,
	senzaEstensione,
	eZip,
	eEseguibile,
	stessoPath,
	byte,
	dentroDi
} from './posizioni';

describe('briciole', () => {
	it('un disco parte da Questo PC e ogni tratto porta alla sua cartella', () => {
		expect(briciole('C:\\Utenti\\Anna')).toEqual([
			{ nome: 'Questo PC', path: '::pc' },
			{ nome: 'C:', path: 'C:\\' },
			{ nome: 'Utenti', path: 'C:\\Utenti' },
			{ nome: 'Anna', path: 'C:\\Utenti\\Anna' }
		]);
	});

	it('un percorso di rete parte da Rete', () => {
		expect(briciole('\\\\nas\\foto\\2024').map((b) => b.path)).toEqual([
			'::rete',
			'\\\\nas',
			'\\\\nas\\foto',
			'\\\\nas\\foto\\2024'
		]);
	});

	it('le posizioni virtuali hanno il loro nome', () => {
		expect(briciole('::cestino')).toEqual([{ nome: 'Cestino', path: '::cestino' }]);
		expect(nomePosizione('::pc')).toBe('Questo PC');
		expect(nomePosizione('C:\\')).toBe('C:');
		expect(nomePosizione('C:\\Dati\\Foto')).toBe('Foto');
	});
});

describe('letture sui path', () => {
	it('nome e cartella di un elemento', () => {
		expect(nomeDi('C:\\Dati\\nota.txt')).toBe('nota.txt');
		expect(cartellaDi('C:\\Dati\\nota.txt')).toBe('C:\\Dati');
		expect(cartellaDi('C:\\nota.txt')).toBe('C:\\');
	});

	it('lo stesso volume decide fra spostare e copiare', () => {
		expect(stessoVolume('C:\\a', 'c:\\b\\c')).toBe(true);
		expect(stessoVolume('C:\\a', 'D:\\a')).toBe(false);
		expect(stessoVolume('\\\\nas\\foto\\a', '\\\\nas\\foto\\b')).toBe(true);
		expect(stessoVolume('\\\\nas\\foto\\a', '\\\\nas\\video\\b')).toBe(false);
	});

	it('estensioni e tipi', () => {
		expect(senzaEstensione('foto.vacanze.jpg')).toBe('foto.vacanze');
		expect(senzaEstensione('.gitignore')).toBe('.gitignore');
		expect(eZip('Archivio.ZIP')).toBe(true);
		expect(eEseguibile('setup.exe')).toBe(true);
		expect(eEseguibile('nota.txt')).toBe(false);
	});

	it('i path si confrontano come fa Windows', () => {
		expect(stessoPath('C:\\Dati\\', 'c:\\dati')).toBe(true);
		expect(stessoPath('C:\\Dati', 'C:\\Dati2')).toBe(false);
	});

	it('i byte si leggono a colpo d occhio', () => {
		expect(byte(512)).toBe('512 B');
		expect(byte(2048)).toBe('2 KB');
		expect(byte(5 * 1024 ** 3)).toBe('5.0 GB');
	});
});

describe('rete locale', () => {
	it('le briciole partono da Rete locale e passano dal PC', () => {
		expect(briciole('::lan\\PC2-ab12\\Foto')).toEqual([
			{ nome: 'Rete locale', path: '::lan' },
			{ nome: 'PC2-ab12', path: '::lan\\PC2-ab12' },
			{ nome: 'Foto', path: '::lan\\PC2-ab12\\Foto' }
		]);
		expect(nomePosizione('::lan')).toBe('Rete locale');
	});
});

describe('Linux paths', () => {
	it('breadcrumbs start at This PC, then the file system root', () => {
		expect(briciole('/home/anna/Foto')).toEqual([
			{ nome: 'Questo PC', path: '::pc' },
			{ nome: 'File system', path: '/' },
			{ nome: 'home', path: '/home' },
			{ nome: 'anna', path: '/home/anna' },
			{ nome: 'Foto', path: '/home/anna/Foto' }
		]);
		expect(nomePosizione('/')).toBe('File system');
	});

	it('name and parent folder', () => {
		expect(nomeDi('/home/anna/nota.txt')).toBe('nota.txt');
		expect(cartellaDi('/home/anna/nota.txt')).toBe('/home/anna');
		expect(cartellaDi('/home')).toBe('/');
	});

	it('case matters on Linux', () => {
		expect(stessoPath('/home/Anna', '/home/anna')).toBe(false);
		expect(stessoPath('/home/anna/', '/home/anna')).toBe(true);
		expect(stessoPath('/', '/')).toBe(true);
	});

	it('a USB stick is a different volume from the system disk', () => {
		expect(stessoVolume('/home/anna/a.txt', '/tmp')).toBe(true);
		expect(stessoVolume('/home/anna/a.txt', '/media/anna/USB/x')).toBe(false);
		expect(stessoVolume('/media/anna/USB/a', '/media/anna/USB/b/c')).toBe(true);
		expect(stessoVolume('/run/media/anna/USB/a', '/home')).toBe(false);
	});

	it('inside a folder', () => {
		expect(dentroDi('/home/anna/Foto', '/home/anna')).toBe(true);
		expect(dentroDi('/home/annalisa', '/home/anna')).toBe(false);
		expect(dentroDi('/etc', '/')).toBe(true);
		expect(dentroDi('C:\\Users\\X', 'c:\\users')).toBe(true);
	});
});

describe('archives', () => {
	it('recognises the formats Space Train reads', async () => {
		const { eArchivio } = await import('./posizioni');
		expect(['a.zip', 'b.7Z', 'c.rar', 'd.tar', 'e.tar.gz', 'f.tgz'].every(eArchivio)).toBe(true);
		expect(eArchivio('note.txt')).toBe(false);
		expect(eArchivio('tar')).toBe(false);
	});
});
