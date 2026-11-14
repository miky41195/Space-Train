import { describe, it, expect } from 'vitest';
import { FavoritesStore, split, type KeyValueStore } from './favorites.svelte';
import type { Entry } from '../ipc';

function storage(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
	const data = { ...initial };
	return {
		data,
		getItem: (k) => data[k] ?? null,
		setItem: (k, v) => {
			data[k] = v;
		}
	};
}

function item(name: string): Entry {
	return { name, path: `C:\\d\\${name}`, kind: 'file', size: 1, modified: 0, hidden: false };
}

describe('FavoritesStore', () => {
	it('starts without favourites', () => {
		const p = new FavoritesStore(storage());
		expect(p.of('C:\\d').size).toBe(0);
	});

	it('toggle adds and then removes', () => {
		const p = new FavoritesStore(storage());
		p.toggle('C:\\d', ['a.txt']);
		expect(p.of('C:\\d').has('a.txt')).toBe(true);

		p.toggle('C:\\d', ['a.txt']);
		expect(p.of('C:\\d').has('a.txt')).toBe(false);
	});

	it('on a mixed selection adds everything', () => {
		const p = new FavoritesStore(storage());
		p.toggle('C:\\d', ['a.txt']);
		p.toggle('C:\\d', ['a.txt', 'b.txt']);

		expect([...p.of('C:\\d')].sort()).toEqual(['a.txt', 'b.txt']);
	});

	it('favourites belong to the folder they were chosen in', () => {
		const p = new FavoritesStore(storage());
		p.toggle('C:\\uno', ['a.txt']);
		expect(p.of('C:\\due').has('a.txt')).toBe(false);
	});

	it('ignores case like the Windows file system', () => {
		const p = new FavoritesStore(storage());
		p.toggle('C:\\Dati', ['Foto']);
		expect(p.all('c:\\dati', ['FOTO'])).toBe(true);
	});

	it('survives a restart through the storage', () => {
		const a = storage();
		new FavoritesStore(a).toggle('C:\\d', ['a.txt']);

		expect(new FavoritesStore(a).of('C:\\d').has('a.txt')).toBe(true);
	});

	it('a corrupt storage does not block startup', () => {
		const p = new FavoritesStore(storage({ 'space-train.preferiti': '{rotto' }));
		expect(p.of('C:\\d').size).toBe(0);
	});

	it('a rename carries the favourite along', () => {
		const p = new FavoritesStore(storage());
		p.toggle('C:\\d', ['a.txt']);
		p.rename('C:\\d', 'a.txt', 'b.txt');

		expect(p.of('C:\\d').has('a.txt')).toBe(false);
		expect(p.of('C:\\d').has('b.txt')).toBe(true);
	});

	it('renaming a non-favourite does not make it one', () => {
		const p = new FavoritesStore(storage());
		p.rename('C:\\d', 'a.txt', 'b.txt');
		expect(p.of('C:\\d').size).toBe(0);
	});
});

describe('split', () => {
	it('separates the zones keeping the order of each', () => {
		const items = ['a', 'b', 'c', 'd'].map(item);
		const { favorites, common } = split(items, new Set(['d', 'b']));

		expect(favorites.map((e) => e.name)).toEqual(['b', 'd']);
		expect(common.map((e) => e.name)).toEqual(['a', 'c']);
	});
});
