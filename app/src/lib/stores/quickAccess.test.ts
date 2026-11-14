import { describe, it, expect } from 'vitest';
import { QuickAccessStore } from './quickAccess.svelte';

function storage() {
	const data: Record<string, string> = {};
	return {
		getItem: (k: string) => data[k] ?? null,
		setItem: (k: string, v: string) => {
			data[k] = v;
		}
	};
}

describe('QuickAccessStore', () => {
	it('pins once only, ignoring case', () => {
		const a = new QuickAccessStore(storage());
		a.pin('C:\\Lavoro');
		a.pin('c:\\lavoro\\');
		expect(a.folders).toEqual(['C:\\Lavoro']);
		expect(a.has('C:\\LAVORO')).toBe(true);
	});

	it('reorders without leaving the edges, and unpins', () => {
		const a = new QuickAccessStore(storage());
		a.pin('C:\\A');
		a.pin('C:\\B');
		a.shift('C:\\A', -1);
		expect(a.folders).toEqual(['C:\\A', 'C:\\B']);
		a.shift('C:\\A', 1);
		expect(a.folders).toEqual(['C:\\B', 'C:\\A']);
		a.unpin('C:\\B');
		expect(a.folders).toEqual(['C:\\A']);
	});

	it('survives a restart and follows a rename', () => {
		const s = storage();
		new QuickAccessStore(s).pin('C:\\Vecchia');
		const after = new QuickAccessStore(s);
		after.move('C:\\Vecchia', 'C:\\Nuova');
		expect(new QuickAccessStore(s).folders).toEqual(['C:\\Nuova']);
	});

	it('a corrupt storage does not block startup', () => {
		const s = storage();
		s.setItem('space-train.accesso-rapido', '{rotto');
		expect(new QuickAccessStore(s).folders).toEqual([]);
	});
});
