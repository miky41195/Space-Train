import { describe, it, expect } from 'vitest';
import { TabsStore } from './tabs.svelte';
import type { Backend, Listing, SortSpec } from '../ipc';
import { backendFinto as backendComune } from '../test-doppi';

/** Backend finto: risponde con voci sintetiche e latenza controllabile. */
function fakeBackend(opts: { delays?: Record<string, number> } = {}): Backend {
	return {
		...backendComune(),
		async listDir(path: string, _sort: SortSpec): Promise<Listing> {
			const d = opts.delays?.[path] ?? 0;
			if (d > 0) await new Promise((r) => setTimeout(r, d));
			return {
				path,
				entries: [
					{
						name: `file-di-${path}`,
						path: `${path}#f`,
						kind: 'file',
						size: 1,
						modified: 1,
						hidden: false
					}
				]
			};
		},
		async openEntry() {},
		async navigate(path: string) {
			return path.replace(/\\[^\\]+$/, '') || 'C:\\';
		},
		async drives() {
			return [];
		},
		async knownFolders() {
			return [];
		},
		async revealInExplorer() {},
		async createFolder(parent: string, name: string) {
			return `${parent}\\${name}`;
		},
		async renameEntry(path: string, name: string) {
			return `${path}#${name}`;
		},
		async moveToTrash() {},
		async iconForExtension() {
			return null;
		},
		async thumbnail() {
			return null;
		},
		async scanConflicts() {
			return [];
		},
		async transfer() {
			return { copiati: 0, saltati: 0, annullato: false, coppie: [] };
		},
		async cancelTransfer() {
			return true;
		}
	};
}

describe('TabsStore', () => {
	it('apre un tab e ne carica il contenuto', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');

		expect(s.tabs.length).toBe(1);
		expect(s.activeTab?.id).toBe(id);
		expect(s.activeTab?.path).toBe('C:\\uno');
		expect(s.activeTab?.entries[0].name).toBe('file-di-C:\\uno');
	});

	it('chiude un tab e attiva il precedente', async () => {
		const s = new TabsStore(fakeBackend());
		const primo = await s.openTab('C:\\uno');
		const secondo = await s.openTab('C:\\due');

		s.closeTab(secondo);

		expect(s.tabs.length).toBe(1);
		expect(s.activeTab?.id).toBe(primo);
	});

	it('chiudere l ultimo tab lascia la lista vuota', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');

		s.closeTab(id);

		expect(s.tabs.length).toBe(0);
		expect(s.activeTab).toBeUndefined();
	});

	it('naviga indietro e avanti nella cronologia', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		await s.navigate(id, 'C:\\due');
		await s.navigate(id, 'C:\\tre');

		await s.goBack(id);
		expect(s.activeTab?.path).toBe('C:\\due');

		await s.goBack(id);
		expect(s.activeTab?.path).toBe('C:\\uno');

		await s.goForward(id);
		expect(s.activeTab?.path).toBe('C:\\due');
	});

	it('indietro dal primo elemento non fa niente', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');

		await s.goBack(id);

		expect(s.activeTab?.path).toBe('C:\\uno');
	});

	it('navigare dopo essere tornato indietro tronca la cronologia futura', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		await s.navigate(id, 'C:\\due');
		await s.goBack(id);
		await s.navigate(id, 'C:\\tre');

		await s.goForward(id);
		expect(s.activeTab?.path).toBe('C:\\tre');
	});

	it('scarta la risposta lenta arrivata dopo una navigazione più recente', async () => {
		const s = new TabsStore(fakeBackend({ delays: { 'C:\\lento': 50 } }));
		const id = await s.openTab('C:\\uno');

		const lenta = s.navigate(id, 'C:\\lento');
		await s.navigate(id, 'C:\\veloce');
		await lenta;

		expect(s.activeTab?.path).toBe('C:\\veloce');
		expect(s.activeTab?.entries[0].name).toBe('file-di-C:\\veloce');
	});

	it('la risposta scartata non entra in cronologia', async () => {
		const s = new TabsStore(fakeBackend({ delays: { 'C:\\lento': 50 } }));
		const id = await s.openTab('C:\\uno');

		const lenta = s.navigate(id, 'C:\\lento');
		await s.navigate(id, 'C:\\veloce');
		await lenta;

		await s.goBack(id);
		expect(s.activeTab?.path).toBe('C:\\uno');
	});

	it('a caricamento finito il tab non risulta più in lettura', async () => {
		const s = new TabsStore(fakeBackend());
		await s.openTab('C:\\uno');

		// Se resta true, tutto ciò che dipende da `loading` — i binari
		// elettrici — resta acceso per sempre.
		expect(s.activeTab?.loading).toBe(false);
	});

	it('anche dopo una navigazione il caricamento si chiude', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		await s.navigate(id, 'C:\\due');

		expect(s.activeTab?.loading).toBe(false);
	});

	it('reload rilegge senza allungare la cronologia', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		await s.navigate(id, 'C:\\due');
		const lunghezzaPrima = s.activeTab!.history.length;

		await s.reload(id);

		expect(s.activeTab?.path).toBe('C:\\due');
		expect(s.activeTab?.history.length).toBe(lunghezzaPrima);
	});

	it('un tab nuovo nasce senza filtro di ricerca', async () => {
		const s = new TabsStore(fakeBackend());
		await s.openTab('C:\\uno');

		expect(s.activeTab?.query).toBe('');
	});

	it('impostare la query non ricarica la cartella', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		const richiestePrima = s.activeTab!.reqSeq;

		s.setQuery(id, 'cargo');

		expect(s.activeTab?.query).toBe('cargo');
		expect(s.activeTab?.reqSeq).toBe(richiestePrima);
	});

	it('navigare azzera la query', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		s.setQuery(id, 'cargo');

		await s.navigate(id, 'C:\\due');

		expect(s.activeTab?.query).toBe('');
	});

	it('clearQuery svuota il filtro', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		s.setQuery(id, 'cargo');

		s.clearQuery(id);

		expect(s.activeTab?.query).toBe('');
	});

	it('un errore lascia il tab dove si trova', async () => {
		const backend = fakeBackend();
		backend.listDir = async () => {
			throw { kind: 'accessDenied' };
		};
		const s = new TabsStore(backend);
		s.tabs.push({
			id: 1,
			path: 'C:\\uno',
			entries: [],
			sort: { key: 'name', ascending: true },
			selection: [],
			anchor: null,
			query: '',
			history: ['C:\\uno'],
			historyIndex: 0,
			reqSeq: 0,
			lastApplied: 0,
			error: null,
			loading: false,
			risultati: null,
			cercando: false,
			ricercaOp: null
		});
		s.setActive(1);

		await s.navigate(1, 'C:\\vietato');

		expect(s.activeTab?.path).toBe('C:\\uno');
		expect(s.activeTab?.error).toEqual({ kind: 'accessDenied' });
	});
});
