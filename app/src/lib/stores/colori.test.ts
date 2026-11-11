import { describe, it, expect } from 'vitest';
import { ColoriStore } from './colori.svelte';

function archivio() {
	const dati: Record<string, string> = {};
	return {
		getItem: (k: string) => dati[k] ?? null,
		setItem: (k: string, v: string) => {
			dati[k] = v;
		}
	};
}

describe('ColoriStore', () => {
	it('dà e toglie un colore, ignorando le maiuscole del path', () => {
		const c = new ColoriStore(archivio());
		c.imposta(['C:\\Lavoro'], 'rosso');
		expect(c.di('c:\\lavoro')).toBe('#ef4444');
		expect(c.idDi('C:\\LAVORO')).toBe('rosso');

		c.imposta(['C:\\Lavoro'], null);
		expect(c.di('C:\\Lavoro')).toBeUndefined();
	});

	it('i colori restano dopo un riavvio', () => {
		const a = archivio();
		new ColoriStore(a).imposta(['C:\\Foto', 'C:\\Musica'], 'verde');
		const dopo = new ColoriStore(a);
		expect(dopo.idDi('C:\\Foto')).toBe('verde');
		expect(dopo.idDi('C:\\Musica')).toBe('verde');
	});

	it('rinominando o spostando, il colore segue la cartella e le sottocartelle', () => {
		const c = new ColoriStore(archivio());
		c.imposta(['C:\\Vecchia'], 'blu');
		c.imposta(['C:\\Vecchia\\Dentro'], 'giallo');
		c.sposta('C:\\Vecchia', 'D:\\Nuova');

		expect(c.idDi('C:\\Vecchia')).toBeUndefined();
		expect(c.idDi('D:\\Nuova')).toBe('blu');
		expect(c.idDi('D:\\Nuova\\Dentro')).toBe('giallo');
	});

	it('una cartella con un nome che inizia uguale non viene toccata', () => {
		const c = new ColoriStore(archivio());
		c.imposta(['C:\\Dati2'], 'rosa');
		c.sposta('C:\\Dati', 'C:\\Altro');
		expect(c.idDi('C:\\Dati2')).toBe('rosa');
	});
});

describe('ColoriStore label names', () => {
	it('names a colour, keeps it after restart, and blank restores the default', () => {
		const a = archivio();
		const c = new ColoriStore(a);
		c.imposta(['C:\Lavoro'], 'rosso');
		c.rename('rosso', '  Lavoro  ');
		expect(c.nameOf('rosso')).toBe('Lavoro');
		expect(c.usati[0].nome).toBe('Lavoro');
		expect(new ColoriStore(a).nameOf('rosso')).toBe('Lavoro');

		c.rename('rosso', '   ');
		expect(c.nameOf('rosso')).toBe('Rosso');
	});

	it('ignores junk in saved names', () => {
		const a = archivio();
		a.setItem('space-train.nomi-colori', '{"rosso":3,"verde":"Fatto","nope":"x"}');
		const c = new ColoriStore(a);
		expect(c.nameOf('rosso')).toBe('Rosso');
		expect(c.nameOf('verde')).toBe('Fatto');
	});
});
