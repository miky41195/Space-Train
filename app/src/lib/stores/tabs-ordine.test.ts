import { describe, it, expect, vi } from 'vitest';
import { TabsStore } from './tabs.svelte';
import { backendFinto } from '../test-doppi';
import type { SortSpec } from '../ipc';

function memoria() {
	const dati = new Map<string, SortSpec>();
	return {
		dati,
		leggi: (c: string) => dati.get(c.toLowerCase()),
		scrivi: (c: string, s: SortSpec) => void dati.set(c.toLowerCase(), s)
	};
}

describe('ordinamento ricordato per cartella', () => {
	it('ogni cartella si riapre come l utente l aveva ordinata', async () => {
		const listDir = vi.fn(async (path: string) => ({ path, entries: [] }));
		const ordini = memoria();
		const s = new TabsStore(backendFinto({ listDir }), ordini);
		const id = await s.openTab('C:\\Foto');

		await s.setSort(id, { key: 'modified', ascending: false });
		expect(ordini.dati.get('c:\\foto')).toEqual({ key: 'modified', ascending: false });

		// Un'altra cartella mai ordinata parte dal nome crescente…
		await s.navigate(id, 'C:\\Documenti');
		expect(s.activeTab?.sort).toEqual({ key: 'name', ascending: true });

		// …e tornando nella prima ritorna il suo ordinamento.
		await s.navigate(id, 'C:\\Foto');
		expect(s.activeTab?.sort).toEqual({ key: 'modified', ascending: false });
		expect(listDir).toHaveBeenLastCalledWith('C:\\Foto', { key: 'modified', ascending: false }, false);
	});

	it('un tab nuovo apre la cartella col suo ordinamento ricordato', async () => {
		const ordini = memoria();
		ordini.scrivi('C:\\Musica', { key: 'size', ascending: false });
		const s = new TabsStore(backendFinto(), ordini);
		await s.openTab('C:\\Musica');
		expect(s.activeTab?.sort).toEqual({ key: 'size', ascending: false });
	});
});

describe('navigazione in fila', () => {
	it('due «Su» premuti di fila risalgono di due livelli anche col disco lento', async () => {
		const lento = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 15));
		const s = new TabsStore(
			backendFinto({
				listDir: (path: string) => lento({ path, entries: [] }),
				navigate: (path: string) => lento(path.slice(0, path.lastIndexOf('\\')) || path)
			})
		);
		const id = await s.openTab('C:\\a\\b\\c');

		await Promise.all([s.goUp(id), s.goUp(id)]);
		expect(s.activeTab?.path).toBe('C:\\a');
	});

	it('due «Indietro» di fila tornano indietro di due passi', async () => {
		const s = new TabsStore(backendFinto());
		const id = await s.openTab('C:\\uno');
		await s.navigate(id, 'C:\\due');
		await s.navigate(id, 'C:\\tre');

		await Promise.all([s.goBack(id), s.goBack(id)]);
		expect(s.activeTab?.path).toBe('C:\\uno');
	});
});
