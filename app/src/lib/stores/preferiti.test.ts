import { describe, it, expect } from 'vitest';
import { PreferitiStore, dividi, type Archivio } from './preferiti.svelte';
import type { Entry } from '../ipc';

function archivio(iniziale: Record<string, string> = {}): Archivio & { dati: Record<string, string> } {
	const dati = { ...iniziale };
	return {
		dati,
		getItem: (k) => dati[k] ?? null,
		setItem: (k, v) => {
			dati[k] = v;
		}
	};
}

function voce(name: string): Entry {
	return { name, path: `C:\\d\\${name}`, kind: 'file', size: 1, modified: 0, hidden: false };
}

describe('PreferitiStore', () => {
	it('nasce senza preferiti', () => {
		const p = new PreferitiStore(archivio());
		expect(p.di('C:\\d').size).toBe(0);
	});

	it('alterna aggiunge e poi toglie', () => {
		const p = new PreferitiStore(archivio());
		p.alterna('C:\\d', ['a.txt']);
		expect(p.di('C:\\d').has('a.txt')).toBe(true);

		p.alterna('C:\\d', ['a.txt']);
		expect(p.di('C:\\d').has('a.txt')).toBe(false);
	});

	it('su una selezione mista aggiunge tutto', () => {
		const p = new PreferitiStore(archivio());
		p.alterna('C:\\d', ['a.txt']);
		p.alterna('C:\\d', ['a.txt', 'b.txt']);

		expect([...p.di('C:\\d')].sort()).toEqual(['a.txt', 'b.txt']);
	});

	it('i preferiti appartengono alla cartella in cui sono stati scelti', () => {
		const p = new PreferitiStore(archivio());
		p.alterna('C:\\uno', ['a.txt']);
		expect(p.di('C:\\due').has('a.txt')).toBe(false);
	});

	it('ignora maiuscole come il file system di Windows', () => {
		const p = new PreferitiStore(archivio());
		p.alterna('C:\\Dati', ['Foto']);
		expect(p.tutti('c:\\dati', ['FOTO'])).toBe(true);
	});

	it('sopravvive al riavvio tramite l archivio', () => {
		const a = archivio();
		new PreferitiStore(a).alterna('C:\\d', ['a.txt']);

		expect(new PreferitiStore(a).di('C:\\d').has('a.txt')).toBe(true);
	});

	it('un archivio corrotto non blocca l avvio', () => {
		const p = new PreferitiStore(archivio({ 'space-train.preferiti': '{rotto' }));
		expect(p.di('C:\\d').size).toBe(0);
	});

	it('la rinomina porta con sé il preferito', () => {
		const p = new PreferitiStore(archivio());
		p.alterna('C:\\d', ['a.txt']);
		p.rinomina('C:\\d', 'a.txt', 'b.txt');

		expect(p.di('C:\\d').has('a.txt')).toBe(false);
		expect(p.di('C:\\d').has('b.txt')).toBe(true);
	});

	it('rinominare un non preferito non lo rende preferito', () => {
		const p = new PreferitiStore(archivio());
		p.rinomina('C:\\d', 'a.txt', 'b.txt');
		expect(p.di('C:\\d').size).toBe(0);
	});
});

describe('dividi', () => {
	it('separa le zone mantenendo l ordine di ciascuna', () => {
		const voci = ['a', 'b', 'c', 'd'].map(voce);
		const { preferiti, comuni } = dividi(voci, new Set(['d', 'b']));

		expect(preferiti.map((e) => e.name)).toEqual(['b', 'd']);
		expect(comuni.map((e) => e.name)).toEqual(['a', 'c']);
	});
});
