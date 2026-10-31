import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';

const finestra = {
	close: vi.fn(),
	minimize: vi.fn(),
	toggleMaximize: vi.fn()
};

vi.mock('@tauri-apps/api/window', () => ({
	getCurrentWindow: () => finestra
}));

const { default: TitleBar } = await import('./TitleBar.svelte');
const { TabsStore } = await import('../stores/tabs.svelte');
const { backendFinto } = await import('../test-doppi');

afterEach(cleanup);
beforeEach(() => {
	finestra.close.mockClear();
	finestra.minimize.mockClear();
	finestra.toggleMaximize.mockClear();
});

async function monta() {
	const store = new TabsStore(backendFinto());
	await store.openTab('C:\\uno');
	render(TitleBar, { props: { store } });
	return store;
}

describe('TitleBar', () => {
	it('mostra il nome del progetto', async () => {
		await monta();
		expect(screen.getByText('Space Train')).toBeTruthy();
	});

	it('le tre lampade hanno un nome accessibile', async () => {
		await monta();

		// I glifi sono decorativi: senza aria-label i comandi finestra
		// sarebbero tre cerchi muti per chi usa uno screen reader.
		expect(screen.getByLabelText('Chiudi')).toBeTruthy();
		expect(screen.getByLabelText('Riduci a icona')).toBeTruthy();
		expect(screen.getByLabelText('Ingrandisci')).toBeTruthy();
	});

	it('ogni lampada comanda la finestra giusta', async () => {
		await monta();

		screen.getByLabelText('Riduci a icona').click();
		expect(finestra.minimize).toHaveBeenCalledTimes(1);

		screen.getByLabelText('Ingrandisci').click();
		expect(finestra.toggleMaximize).toHaveBeenCalledTimes(1);

		screen.getByLabelText('Chiudi').click();
		expect(finestra.close).toHaveBeenCalledTimes(1);
	});

	it('il tab aperto porta il nome della cartella', async () => {
		await monta();
		expect(screen.getByText('uno')).toBeTruthy();
	});

	it('megafono e ingranaggio compaiono solo se qualcuno li ascolta', async () => {
		await monta();
		expect(screen.queryByLabelText('Novità di questa versione')).toBeNull();
		cleanup();

		const store = new TabsStore(backendFinto());
		await store.openTab('C:\\uno');
		const onnovita = vi.fn();
		const onimpostazioni = vi.fn();
		render(TitleBar, { props: { store, onnovita, onimpostazioni } });
		screen.getByLabelText('Novità di questa versione').click();
		screen.getByLabelText('Impostazioni').click();
		expect(onnovita).toHaveBeenCalledTimes(1);
		expect(onimpostazioni).toHaveBeenCalledTimes(1);
	});
});
