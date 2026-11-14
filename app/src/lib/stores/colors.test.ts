import { describe, it, expect } from 'vitest';
import { ColorsStore } from './colors.svelte';

function storage() {
	const data: Record<string, string> = {};
	return {
		getItem: (k: string) => data[k] ?? null,
		setItem: (k: string, v: string) => {
			data[k] = v;
		}
	};
}

describe('ColorsStore', () => {
	it('gives and removes a colour, ignoring the path case', () => {
		const c = new ColorsStore(storage());
		c.set(['C:\\Lavoro'], 'rosso');
		expect(c.of('c:\\lavoro')).toBe('#ef4444');
		expect(c.idOf('C:\\LAVORO')).toBe('rosso');

		c.set(['C:\\Lavoro'], null);
		expect(c.of('C:\\Lavoro')).toBeUndefined();
	});

	it('colours survive a restart', () => {
		const a = storage();
		new ColorsStore(a).set(['C:\\Foto', 'C:\\Musica'], 'verde');
		const after = new ColorsStore(a);
		expect(after.idOf('C:\\Foto')).toBe('verde');
		expect(after.idOf('C:\\Musica')).toBe('verde');
	});

	it('on rename or move the colour follows the folder and its subfolders', () => {
		const c = new ColorsStore(storage());
		c.set(['C:\\Vecchia'], 'blu');
		c.set(['C:\\Vecchia\\Dentro'], 'giallo');
		c.move('C:\\Vecchia', 'D:\\Nuova');

		expect(c.idOf('C:\\Vecchia')).toBeUndefined();
		expect(c.idOf('D:\\Nuova')).toBe('blu');
		expect(c.idOf('D:\\Nuova\\Dentro')).toBe('giallo');
	});

	it('a folder whose name starts the same is left alone', () => {
		const c = new ColorsStore(storage());
		c.set(['C:\\Dati2'], 'rosa');
		c.move('C:\\Dati', 'C:\\Altro');
		expect(c.idOf('C:\\Dati2')).toBe('rosa');
	});
});

describe('ColorsStore label names', () => {
	it('names a colour, keeps it after restart, and blank restores the default', () => {
		const a = storage();
		const c = new ColorsStore(a);
		c.set(['C:\\Lavoro'], 'rosso');
		c.rename('rosso', '  Lavoro  ');
		expect(c.nameOf('rosso')).toBe('Lavoro');
		expect(c.used[0].name).toBe('Lavoro');
		expect(new ColorsStore(a).nameOf('rosso')).toBe('Lavoro');

		c.rename('rosso', '   ');
		expect(c.nameOf('rosso')).toBe('Rosso');
	});

	it('ignores junk in saved names', () => {
		const a = storage();
		a.setItem('space-train.nomi-colori', '{"rosso":3,"verde":"Fatto","nope":"x"}');
		const c = new ColorsStore(a);
		expect(c.nameOf('rosso')).toBe('Rosso');
		expect(c.nameOf('verde')).toBe('Fatto');
	});
});
