import { describe, it, expect } from 'vitest';
import { TabsStore } from './tabs.svelte';
import { backendFinto } from '../test-doppi';
import type { Entry } from '../ipc';

function voci(...nomi: string[]): Entry[] {
	return nomi.map((name) => ({
		name,
		path: `C:\\${name}`,
		kind: 'file' as const,
		size: 1,
		modified: 1,
		hidden: false
	}));
}

const elenco = voci('a', 'b', 'c', 'd', 'e');
const p = (n: string) => `C:\\${n}`;

async function conTab() {
	const s = new TabsStore(backendFinto());
	const id = await s.openTab('C:\\uno');
	return { s, id };
}

describe('selezione', () => {
	it('un tab nuovo non ha niente selezionato', async () => {
		const { s } = await conTab();
		expect(s.activeTab?.selection).toEqual([]);
	});

	it('un clic semplice seleziona solo quella voce', async () => {
		const { s, id } = await conTab();

		s.seleziona(id, p('b'), elenco);
		s.seleziona(id, p('d'), elenco);

		expect(s.activeTab?.selection).toEqual([p('d')]);
	});

	it('Ctrl aggiunge senza togliere il resto', async () => {
		const { s, id } = await conTab();

		s.seleziona(id, p('a'), elenco);
		s.seleziona(id, p('c'), elenco, { ctrl: true });
		s.seleziona(id, p('e'), elenco, { ctrl: true });

		expect(s.activeTab?.selection).toEqual([p('a'), p('c'), p('e')]);
	});

	it('Ctrl su una voce già presa la toglie', async () => {
		const { s, id } = await conTab();

		s.seleziona(id, p('a'), elenco);
		s.seleziona(id, p('c'), elenco, { ctrl: true });
		s.seleziona(id, p('a'), elenco, { ctrl: true });

		expect(s.activeTab?.selection).toEqual([p('c')]);
	});

	it('Maiusc prende l intervallo dall ancora', async () => {
		const { s, id } = await conTab();

		s.seleziona(id, p('b'), elenco);
		s.seleziona(id, p('d'), elenco, { shift: true });

		expect(s.activeTab?.selection).toEqual([p('b'), p('c'), p('d')]);
	});

	it('Maiusc funziona anche all indietro', async () => {
		const { s, id } = await conTab();

		s.seleziona(id, p('d'), elenco);
		s.seleziona(id, p('b'), elenco, { shift: true });

		expect(s.activeTab?.selection).toEqual([p('b'), p('c'), p('d')]);
	});

	it('estendere due volte parte sempre dalla stessa ancora', async () => {
		const { s, id } = await conTab();

		s.seleziona(id, p('c'), elenco);
		s.seleziona(id, p('e'), elenco, { shift: true });
		s.seleziona(id, p('a'), elenco, { shift: true });

		// Se l'ancora seguisse l'ultimo clic, qui resterebbero solo a..e
		// a partire da 'e', cioè tutto: comportamento diverso da qualsiasi
		// elenco di sistema.
		expect(s.activeTab?.selection).toEqual([p('a'), p('b'), p('c')]);
	});

	it('Maiusc senza ancora si comporta come un clic semplice', async () => {
		const { s, id } = await conTab();

		s.seleziona(id, p('c'), elenco, { shift: true });

		expect(s.activeTab?.selection).toEqual([p('c')]);
	});

	it('la selezione segue l ordine della lista, non quello dei clic', async () => {
		const { s, id } = await conTab();

		s.seleziona(id, p('e'), elenco);
		s.seleziona(id, p('b'), elenco, { shift: true });

		expect(s.activeTab?.selection).toEqual([p('b'), p('c'), p('d'), p('e')]);
	});

	it('seleziona tutto prende ogni voce visibile', async () => {
		const { s, id } = await conTab();

		s.selezionaTutto(id, elenco);

		expect(s.activeTab?.selection.length).toBe(5);
	});

	it('pulire azzera anche l ancora', async () => {
		const { s, id } = await conTab();

		s.seleziona(id, p('b'), elenco);
		s.pulisciSelezione(id);
		s.seleziona(id, p('d'), elenco, { shift: true });

		expect(s.activeTab?.selection).toEqual([p('d')]);
	});

	it('cambiare cartella svuota la selezione', async () => {
		const { s, id } = await conTab();

		s.seleziona(id, p('b'), elenco);
		await s.navigate(id, 'C:\\due');

		expect(s.activeTab?.selection).toEqual([]);
	});
});
