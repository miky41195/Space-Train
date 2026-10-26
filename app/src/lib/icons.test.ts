import { describe, it, expect } from 'vitest';
import { categoryFor, chiaveIcona, vuoleMiniatura } from './icons';
import type { Entry } from './ipc';

function voce(name: string, kind: Entry['kind'] = 'file'): Entry {
	return { name, path: `C:\\${name}`, kind, size: 1, modified: 1, hidden: false };
}

describe('categoryFor', () => {
	it('riconosce le categorie note', () => {
		expect(categoryFor('main.rs')).toBe('code');
		expect(categoryFor('foto.JPG')).toBe('image');
		expect(categoryFor('archivio.zip')).toBe('archive');
	});

	it('i nomi senza estensione sono generici', () => {
		expect(categoryFor('LICENSE')).toBe('plain');
	});

	it('un file nascosto unix non conta il punto iniziale come estensione', () => {
		expect(categoryFor('.gitignore')).toBe('plain');
	});
});

describe('chiaveIcona', () => {
	it('due file dello stesso tipo condividono la chiave', () => {
		expect(chiaveIcona(voce('uno.txt'))).toBe(chiaveIcona(voce('due.txt')));
	});

	it('tipi diversi hanno chiavi diverse', () => {
		expect(chiaveIcona(voce('a.txt'))).not.toBe(chiaveIcona(voce('a.pdf')));
	});

	it('ignora le maiuscole nell estensione', () => {
		expect(chiaveIcona(voce('a.TXT'))).toBe(chiaveIcona(voce('b.txt')));
	});

	it('tutte le cartelle condividono una chiave sola', () => {
		expect(chiaveIcona(voce('progetti', 'dir'))).toBe(chiaveIcona(voce('musica', 'dir')));
	});

	it('la dimensione fa parte della chiave', () => {
		expect(chiaveIcona(voce('a.txt'), true)).not.toBe(chiaveIcona(voce('a.txt'), false));
	});
});

describe('vuoleMiniatura', () => {
	it('immagini e video sì', () => {
		expect(vuoleMiniatura(voce('foto.png'))).toBe(true);
		expect(vuoleMiniatura(voce('clip.mp4'))).toBe(true);
	});

	it('codice e archivi no', () => {
		expect(vuoleMiniatura(voce('main.rs'))).toBe(false);
		expect(vuoleMiniatura(voce('roba.zip'))).toBe(false);
	});

	it('le cartelle mai', () => {
		expect(vuoleMiniatura(voce('immagini', 'dir'))).toBe(false);
	});
});

describe('vuoleMiniatura', () => {
	it('chi ha un icona propria la chiede al file, anche se è una cartella', () => {
		expect(vuoleMiniatura({ ...voce('Gioco.exe'), iconaPropria: true })).toBe(true);
		expect(vuoleMiniatura({ ...voce('Steam', 'dir'), iconaPropria: true })).toBe(true);
		expect(vuoleMiniatura(voce('Steam', 'dir'))).toBe(false);
	});
});
