import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { TabsStore } from './tabs.svelte';
import { osserva } from './osserva.svelte';
import type { Backend, Listing } from '../ipc';
import { backendFinto as backendComune } from '../test-doppi';

function fakeBackend(): Backend {
	return {
		...backendComune(),
		async listDir(path: string): Promise<Listing> {
			return { path, entries: [] };
		},
		async openEntry() {},
		async navigate(path: string) {
			return path;
		},
		async drives() {
			return [];
		},
		async knownFolders() {
			return [];
		},
		async revealInExplorer() {},
		async createFolder() {
			return '';
		},
		async renameEntry() {
			return '';
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

/** Raccoglie i valori che l'interfaccia vedrebbe davvero. */
function spia<T>(leggi: () => T) {
	const visti: T[] = [];
	const stop = osserva(leggi, (v) => visti.push(v));
	return { visti, stop };
}

describe('TabsStore — segnali visti dall interfaccia', () => {
	it('la fine del primo caricamento arriva a chi osserva', async () => {
		const s = new TabsStore(fakeBackend());
		const { visti, stop } = spia(() => s.activeTab?.loading ?? false);

		const apertura = s.openTab('C:\\uno');
		flushSync();
		await apertura;
		flushSync();
		stop();

		// Scrivendo sull'oggetto grezzo invece che sul proxy, l'ultimo
		// valore osservato resta `true`: i binari elettrici, che leggono
		// questo stato, non si spengono più.
		expect(visti.at(-1)).toBe(false);
	});

	it('anche il cambio di cartella arriva a chi osserva', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');

		const { visti, stop } = spia(() => s.activeTab?.path ?? '');
		await s.navigate(id, 'C:\\due');
		flushSync();
		stop();

		expect(visti.at(-1)).toBe('C:\\due');
	});
});
