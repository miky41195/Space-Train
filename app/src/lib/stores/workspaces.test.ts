import { describe, it, expect } from 'vitest';
import { WorkspacesStore } from './workspaces.svelte';

function storage() {
	const data: Record<string, string> = {};
	return {
		getItem: (k: string) => data[k] ?? null,
		setItem: (k: string, v: string) => {
			data[k] = v;
		}
	};
}

const snap = (tabs: string[], active = 0, split: [number, number] | null = null) => ({ tabs, active, split });

describe('WorkspacesStore', () => {
	it('creates an area, makes it current, and keeps it after a restart', () => {
		const s = storage();
		const w = new WorkspacesStore(s);
		expect(w.create('  Foto ', snap(['C:\\Foto', 'D:\\Vacanze'], 1, [0, 1]))).toBe('Foto');
		const again = new WorkspacesStore(s);
		expect(again.current).toBe('Foto');
		expect(again.get('Foto')).toEqual({ name: 'Foto', tabs: ['C:\\Foto', 'D:\\Vacanze'], active: 1, split: [0, 1] });
	});

	it('a taken name gets a number, blank names are refused', () => {
		const w = new WorkspacesStore(storage());
		w.create('Lavoro', snap(['C:\\A']));
		expect(w.create('Lavoro', snap(['C:\\B']))).toBe('Lavoro (2)');
		expect(w.create('   ', snap(['C:\\B']))).toBeNull();
	});

	it('update follows only the current area and clamps bad indexes', () => {
		const w = new WorkspacesStore(storage());
		w.create('A', snap(['C:\\A']));
		w.create('B', snap(['C:\\B']));
		w.update(snap(['C:\\B', 'C:\\B2'], 9, [1, 1]));
		expect(w.get('B')).toEqual({ name: 'B', tabs: ['C:\\B', 'C:\\B2'], active: 1, split: null });
		expect(w.get('A')?.tabs).toEqual(['C:\\A']);
	});

	it('rename refuses a name already used; remove clears the current area', () => {
		const w = new WorkspacesStore(storage());
		w.create('A', snap(['C:\\A']));
		w.create('B', snap(['C:\\B']));
		expect(w.rename('B', 'A')).toBe(false);
		expect(w.rename('B', 'Casa')).toBe(true);
		expect(w.current).toBe('Casa');
		w.remove('Casa');
		expect(w.current).toBeNull();
		expect(w.areas.map((a) => a.name)).toEqual(['A']);
	});

	it('drops junk read from storage', () => {
		const s = storage();
		s.setItem('space-train.aree', '{"current":"X","areas":[{"name":"X","tabs":[]},{"name":"Y","tabs":["C:\\\\Y"],"active":"z"},3]}');
		const w = new WorkspacesStore(s);
		expect(w.current).toBeNull();
		expect(w.areas).toEqual([{ name: 'Y', tabs: ['C:\\Y'], active: 0, split: null }]);
	});
});
