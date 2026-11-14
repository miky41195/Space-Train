import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';

const win = {
	close: vi.fn(),
	minimize: vi.fn(),
	toggleMaximize: vi.fn()
};

vi.mock('@tauri-apps/api/window', () => ({
	getCurrentWindow: () => win
}));

const { default: TitleBar } = await import('./TitleBar.svelte');
const { TabsStore } = await import('../stores/tabs.svelte');
const { fakeBackend } = await import('../test-doubles');

afterEach(cleanup);
beforeEach(() => {
	win.close.mockClear();
	win.minimize.mockClear();
	win.toggleMaximize.mockClear();
});

async function mount() {
	const store = new TabsStore(fakeBackend());
	await store.openTab('C:\\one');
	render(TitleBar, { props: { store } });
	return store;
}

describe('TitleBar', () => {
	it('shows the project name', async () => {
		await mount();
		expect(screen.getByText('Space Train')).toBeTruthy();
	});

	it('the three lamps have an accessible name', async () => {
		await mount();

		// The glyphs are decorative: without aria-label the window commands
		// would be three mute circles for screen reader users.
		expect(screen.getByLabelText('Chiudi')).toBeTruthy();
		expect(screen.getByLabelText('Riduci a icona')).toBeTruthy();
		expect(screen.getByLabelText('Ingrandisci')).toBeTruthy();
	});

	it('each lamp drives the right window command', async () => {
		await mount();

		screen.getByLabelText('Riduci a icona').click();
		expect(win.minimize).toHaveBeenCalledTimes(1);

		screen.getByLabelText('Ingrandisci').click();
		expect(win.toggleMaximize).toHaveBeenCalledTimes(1);

		screen.getByLabelText('Chiudi').click();
		expect(win.close).toHaveBeenCalledTimes(1);
	});

	it('the open tab carries the folder name', async () => {
		await mount();
		expect(screen.getByText('one')).toBeTruthy();
	});

	it('megaphone and gear appear only if someone listens', async () => {
		await mount();
		expect(screen.queryByLabelText('Novità di questa versione')).toBeNull();
		cleanup();

		const store = new TabsStore(fakeBackend());
		await store.openTab('C:\\one');
		const onwhatsnew = vi.fn();
		const onsettings = vi.fn();
		render(TitleBar, { props: { store, onwhatsnew, onsettings } });
		screen.getByLabelText('Novità di questa versione').click();
		screen.getByLabelText('Impostazioni').click();
		expect(onwhatsnew).toHaveBeenCalledTimes(1);
		expect(onsettings).toHaveBeenCalledTimes(1);
	});
});
