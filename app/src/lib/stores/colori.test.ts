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
