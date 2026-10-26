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
	byte
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
