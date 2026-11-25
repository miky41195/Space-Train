import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen, within } from '@testing-library/svelte';
import { FakeDisk } from '$lib/fake-disk';
import { THEMES, type PersonalTheme } from '$lib/themes';

/**
 * Integration test of the whole page: everything that sits between the
 * components — shortcuts, menus, clipboard, favourites — and that no
 * single-component test sees.
 *
 * The fake boundary is `invoke`: below there is an in-memory disk, above
 * runs the real code of the app, `tauriBackend` included.
 */

let disk: FakeDisk;

/**
 * jsdom has no canvas: the pixels of an image are always these 4×2, white
 * background with two red pixels at the top. The «written» PNGs are kept
 * here to check them.
 */
function testPixel() {
	const B = [255, 255, 255, 255];
	const R = [200, 30, 30, 255];
	return { data: new Uint8ClampedArray([...B, ...R, ...R, ...B, ...B, ...B, ...B, ...B]), width: 4, height: 2 };
}
const writtenPngs: Array<{ data: Uint8ClampedArray }> = [];
vi.mock('$lib/pixel', () => ({
	readPixels: async () => testPixel(),
	writePng: async (img: { data: Uint8ClampedArray }) => {
		writtenPngs.push(img);
		return 'UE5H';
	}
}));

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (cmd: string, args?: Record<string, unknown>) => disk.invoke(cmd, args),
	Channel: class {
		onmessage: ((m: unknown) => void) | null = null;
	},
	convertFileSrc: (path: string) => `asset://${path}`
}));

/** Listeners registered by the page: the tests call them as Tauri would. */
const listeners = new Map<string, (e: { payload: unknown }) => void>();
let onDrag: ((e: { payload: unknown }) => void) | null = null;

vi.mock('@tauri-apps/api/event', () => ({
	listen: async (name: string, f: (e: { payload: unknown }) => void) => {
		listeners.set(name, f);
		return () => listeners.delete(name);
	}
}));

vi.mock('@tauri-apps/api/webview', () => ({
	getCurrentWebview: () => ({
		onDragDropEvent: async (f: (e: { payload: unknown }) => void) => {
			onDrag = f;
			return () => (onDrag = null);
		}
	})
}));

/** Name of the window the page runs in: «main» or one opened with Ctrl+N. */
let windowName = 'main';

vi.mock('@tauri-apps/api/window', () => ({
	getCurrentWindow: () => ({
		label: windowName,
		close: vi.fn(),
		minimize: vi.fn(),
		toggleMaximize: vi.fn()
	})
}));

const { default: Page } = await import('./+page.svelte');

const STRUCTURE = [
	'C:\\Dati\\',
	'C:\\Dati\\interno.txt',
	'C:\\Vuota\\',
	'C:\\Segreta\\',
	'C:\\alfa.txt',
	'C:\\beta.txt',
	'C:\\gamma.txt',
	'C:\\delta.txt'
];

beforeEach(() => {
	windowName = 'main';
	delete (window as unknown as { __SPACE_TRAIN_OPEN?: unknown }).__SPACE_TRAIN_OPEN;
	disk = new FakeDisk(STRUCTURE);
	disk.denied.add('C:\\Segreta');
	localStorage.clear();

	// Reduced motion: the intro sequence is not mounted and does not cover
	// the list with its curtain.
	window.matchMedia = ((q: string) => ({
		matches: q.includes('reduce'),
		media: q,
		addEventListener() {},
		removeEventListener() {}
	})) as unknown as typeof window.matchMedia;

	// jsdom does no layout: without sizes the virtualized list does not
	// know how many rows fit on screen.
	Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
		configurable: true,
		get: () => 600
	});
	Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
		configurable: true,
		get: () => 600
	});
});

afterEach(cleanup);

// ── Helpers ────────────────────────────────────────────────────────────

async function mount() {
	const r = render(Page);
	await waitFor(() => expect(names()).toContain('alfa.txt'));
	return r;
}

/** Names in the order they appear on screen, row view. */
function names(): string[] {
	return [...document.querySelectorAll('.row .name')].map((n) => n.textContent ?? '');
}

/** Names in the grid view. */
function gridNames(): string[] {
	return [...document.querySelectorAll('.cell .name')].map((n) => n.textContent ?? '');
}

function row(name: string): HTMLElement {
	const r = [...document.querySelectorAll<HTMLElement>('.row')].find(
		(el) => el.querySelector('.name')?.textContent === name
	);
	if (!r) throw new Error(`Riga non trovata: ${name}. A schermo: ${names().join(', ')}`);
	return r;
}

function selected(): string[] {
	return [...document.querySelectorAll('.row.selected .name')].map((n) => n.textContent ?? '');
}

function headers(): string[] {
	return [...document.querySelectorAll('.header')].map((t) => t.getAttribute('aria-label') ?? '');
}

function key(key: string, mod: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
	fireEvent.keyDown(window, {
		key,
		ctrlKey: mod.ctrl ?? false,
		shiftKey: mod.shift ?? false,
		altKey: mod.alt ?? false
	});
}

/** Adds to the disk an item that is not in the base structure. */
function add(path: string, text?: string) {
	const dir = path.endsWith('\\');
	const p = dir ? path.slice(0, -1) : path;
	disk.nodes.set(p, { kind: dir ? 'dir' : 'file', size: 100, hidden: false, modified: 0 });
	if (text !== undefined) disk.contents.set(p, text);
}

/** Opens a bar menu («Visualizza», «Ordina», «Aspetto») and picks an item. */
async function fromMenu(button: string, label: string | RegExp, role = 'menuitemcheckbox') {
	await fireEvent.click(screen.getByRole('button', { name: button }));
	const menu = await screen.findByRole('menu');
	await fireEvent.click(within(menu).getByRole(role, { name: label }));
}

const view = (label: string | RegExp) => fromMenu('Visualizza', label);

/** Opens the theme gallery from the «Aspetto» button. */
async function gallery() {
	if (!screen.queryByRole('dialog', { name: 'Temi' })) await fireEvent.click(screen.getByRole('button', { name: 'Aspetto' }));
	return screen.findByRole('dialog', { name: 'Temi' });
}

/** The button of a theme in the gallery, looking for it in all categories. */
async function themeInGallery(name: string) {
	const g = await gallery();
	for (const tab of within(g).getAllByRole('tab')) {
		await fireEvent.click(tab);
		const theme = within(g).queryByRole('button', { name: name });
		if (theme) return theme;
	}
	throw new Error(`Tema non trovato nella galleria: ${name}`);
}

/** Picks a theme or a highlight colour from the gallery. */
async function fromGallery(name: string) {
	const g = await gallery();
	const color = within(g).queryByRole('button', { name: name });
	await fireEvent.click(color && color.classList.contains('swatch') ? color : await themeInGallery(name));
}

/** Opens the theme editor from the gallery. */
async function createTheme() {
	const g = await gallery();
	await fireEvent.click(within(g).getByRole('button', { name: 'Crea o modifica un tema…' }));
}

const sort = (label: string | RegExp) => fromMenu('Ordina', label);

/** Name and order of the cells in an icon view. */
function sides(): number[] {
	return [...document.querySelectorAll<HTMLElement>('.cell')].map((c) =>
		parseInt(c.style.getPropertyValue('--side'))
	);
}

function tabs(): string[] {
	return [...document.querySelectorAll('.tab .label')].map((t) => t.textContent ?? '');
}

async function menuItem(above: HTMLElement | null, label: string | RegExp) {
	if (above) await fireEvent.contextMenu(above);
	else await fireEvent.contextMenu(document.querySelector('.viewport')!);
	const menu = await screen.findByRole('menu');
	await fireEvent.click(within(menu).getByRole('menuitem', { name: label }));
}

function renameField(): Promise<HTMLInputElement> {
	return waitFor(() => {
		const c = document.querySelector<HTMLInputElement>('.rename-field');
		if (!c) throw new Error('campo di rinomina assente');
		return c;
	});
}

async function enter(folder: string) {
	await fireEvent.dblClick(row(folder));
}

// ── Favourites ────────────────────────────────────────────────────────

describe('favorites', () => {
	it('without favourites the folder is not split', async () => {
		await mount();
		expect(headers()).toEqual([]);
	});

	it('Ctrl+D brings the selected item into the favourites zone, on top', async () => {
		await mount();

		await fireEvent.click(row('gamma.txt'));
		key('d', { ctrl: true });

		await waitFor(() => expect(names()[0]).toBe('gamma.txt'));
		expect(headers()).toEqual(['Preferiti, 1', 'Comuni, 6']);
	});

	it('Ctrl+D a second time puts it back among the common ones', async () => {
		await mount();
		await fireEvent.click(row('gamma.txt'));

		key('d', { ctrl: true });
		await waitFor(() => expect(headers()).toHaveLength(2));

		key('d', { ctrl: true });
		await waitFor(() => expect(headers()).toEqual([]));
		expect(names()).toEqual(['Dati', 'Segreta', 'Vuota', 'alfa.txt', 'beta.txt', 'delta.txt', 'gamma.txt']);
	});

	it('from the context menu it is added and removed, with the right label', async () => {
		await mount();

		await menuItem(row('beta.txt'), /Aggiungi ai preferiti/);
		await waitFor(() => expect(names()[0]).toBe('beta.txt'));

		await menuItem(row('beta.txt'), /Rimuovi dai preferiti/);
		await waitFor(() => expect(headers()).toEqual([]));
	});

	it('on empty space the menu does not offer favourites', async () => {
		await mount();
		await fireEvent.contextMenu(document.querySelector('.viewport')!);

		const menu = await screen.findByRole('menu');
		expect(within(menu).queryByRole('menuitem', { name: /preferiti/ })).toBeNull();
	});

	it('a multiple selection goes in all together, in the order of the list', async () => {
		await mount();

		await fireEvent.click(row('gamma.txt'));
		await fireEvent.click(row('alfa.txt'), { ctrlKey: true });
		key('d', { ctrl: true });

		await waitFor(() => expect(names().slice(0, 2)).toEqual(['alfa.txt', 'gamma.txt']));
		expect(headers()).toEqual(['Preferiti, 2', 'Comuni, 5']);
	});

	it('folders can be favourites too', async () => {
		await mount();

		await fireEvent.click(row('Vuota'));
		key('d', { ctrl: true });

		await waitFor(() => expect(names()[0]).toBe('Vuota'));
	});

	it('inside each zone the chosen sort applies', async () => {
		await mount();

		await fireEvent.click(row('alfa.txt'));
		await fireEvent.click(row('delta.txt'), { ctrlKey: true });
		key('d', { ctrl: true });
		await waitFor(() => expect(names().slice(0, 2)).toEqual(['alfa.txt', 'delta.txt']));

		// Click on the "Nome" header: direction flipped.
		await fireEvent.click(screen.getByRole('button', { name: /nome/i }));

		await waitFor(() => expect(names().slice(0, 2)).toEqual(['delta.txt', 'alfa.txt']));
		expect(headers()).toHaveLength(2);
	});

	it('favourites stay after an app restart', async () => {
		const { unmount } = await mount();
		await fireEvent.click(row('delta.txt'));
		key('d', { ctrl: true });
		await waitFor(() => expect(names()[0]).toBe('delta.txt'));
		unmount();

		await mount();
		expect(names()[0]).toBe('delta.txt');
		expect(headers()).toEqual(['Preferiti, 1', 'Comuni, 6']);
	});

	it('they belong to the folder: elsewhere they do not appear, coming back they do', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('d', { ctrl: true });
		await waitFor(() => expect(headers()).toHaveLength(2));

		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		expect(headers()).toEqual([]);

		await fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
		await waitFor(() => expect(names()[0]).toBe('alfa.txt'));
		expect(headers()).toHaveLength(2);
	});

	it('the search suspends the split and closing it restores it', async () => {
		await mount();
		await fireEvent.click(row('gamma.txt'));
		key('d', { ctrl: true });
		await waitFor(() => expect(headers()).toHaveLength(2));

		key('f', { ctrl: true });
		const field = await screen.findByLabelText('Filtra i file in questa cartella');
		await fireEvent.input(field, { target: { value: 'ta' } });

		await waitFor(() => expect(headers()).toEqual([]));
		expect(names()).toEqual(expect.arrayContaining(['beta.txt', 'delta.txt']));

		key('Escape');
		await waitFor(() => expect(headers()).toHaveLength(2));
	});

	it('renaming a favourite keeps it a favourite', async () => {
		await mount();
		await fireEvent.click(row('beta.txt'));
		key('d', { ctrl: true });
		await waitFor(() => expect(names()[0]).toBe('beta.txt'));

		key('F2');
		const field = await renameField();
		field.value = 'omega.txt';
		await fireEvent.keyDown(field, { key: 'Enter' });

		await waitFor(() => expect(names()[0]).toBe('omega.txt'));
		expect(headers()).toEqual(['Preferiti, 1', 'Comuni, 6']);
		expect(disk.exists('C:\\omega.txt')).toBe(true);
	});

	it('trashing a favourite leaves no ghost zone', async () => {
		await mount();
		await fireEvent.click(row('beta.txt'));
		key('d', { ctrl: true });
		await waitFor(() => expect(headers()).toHaveLength(2));

		key('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));

		await waitFor(() => expect(names()).not.toContain('beta.txt'));
		expect(headers()).toEqual([]);
	});

	it('the arrows follow the order on screen, favourites included', async () => {
		await mount();
		await fireEvent.click(row('gamma.txt'));
		key('d', { ctrl: true });
		await waitFor(() => expect(names()[0]).toBe('gamma.txt'));

		await fireEvent.click(row('gamma.txt'));
		key('ArrowDown');

		// After the only favourite comes the first of the common ones.
		await waitFor(() => expect(selected()).toEqual(['Dati']));
	});

	it('Ctrl+A selects both zones', async () => {
		await mount();
		await fireEvent.click(row('gamma.txt'));
		key('d', { ctrl: true });
		await waitFor(() => expect(headers()).toHaveLength(2));

		key('a', { ctrl: true });
		await waitFor(() => expect(selected()).toHaveLength(7));
	});

	it('in the grid view the split stays', async () => {
		await mount();
		await fireEvent.click(row('delta.txt'));
		key('d', { ctrl: true });
		await waitFor(() => expect(headers()).toHaveLength(2));

		await fireEvent.click(screen.getByRole('button', { name: 'Icone grandi' }));

		await waitFor(() => expect(gridNames()[0]).toBe('delta.txt'));
		expect(headers()).toEqual(['Preferiti, 1', 'Comuni, 6']);
		expect(screen.getByRole('grid', { name: 'Preferiti' })).toBeTruthy();
		expect(screen.getByRole('grid', { name: 'Comuni' })).toBeTruthy();
	});
});

// ── General flows ──────────────────────────────────────────────────

describe('navigation', () => {
	it('at startup it shows drive C:, folders first', async () => {
		await mount();
		expect(names()).toEqual(['Dati', 'Segreta', 'Vuota', 'alfa.txt', 'beta.txt', 'delta.txt', 'gamma.txt']);
	});

	it('double click on a folder enters it, Up goes back to the parent', async () => {
		await mount();
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));

		await fireEvent.click(screen.getByRole('button', { name: 'Su' }));
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});

	it('double click on a file opens it with the default program', async () => {
		await mount();
		await fireEvent.dblClick(row('alfa.txt'));
		await waitFor(() => expect(disk.opened).toEqual(['C:\\alfa.txt']));
	});

	it('Enter opens the selected item', async () => {
		await mount();
		await fireEvent.click(row('Dati'));
		key('Enter');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
	});

	it('the mouse side buttons go back and forward', async () => {
		await mount();
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));

		await fireEvent.mouseDown(window, { button: 3 });
		await waitFor(() => expect(names()).toContain('alfa.txt'));

		await fireEvent.mouseDown(window, { button: 4 });
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
	});

	it('an empty folder shows the empty state', async () => {
		await mount();
		await enter('Vuota');
		expect(await screen.findByText('Deposito vuoto')).toBeTruthy();
	});

	it('a denied folder shows the error and leaves the user where they were', async () => {
		await mount();
		await enter('Segreta');

		await waitFor(() => expect(document.querySelector('.error')?.textContent).toMatch(/Accesso negato/));
		expect(names()).toContain('alfa.txt');
	});
});

describe('selection', () => {
	it('Shift+click selects a range', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		await fireEvent.click(row('delta.txt'), { shiftKey: true });

		expect(selected()).toEqual(['alfa.txt', 'beta.txt', 'delta.txt']);
	});

	it('Ctrl+click adds and removes', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		await fireEvent.click(row('gamma.txt'), { ctrlKey: true });
		expect(selected()).toEqual(['alfa.txt', 'gamma.txt']);

		await fireEvent.click(row('alfa.txt'), { ctrlKey: true });
		expect(selected()).toEqual(['gamma.txt']);
	});

	it('Shift+arrow extends the selection', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('ArrowDown', { shift: true });
		key('ArrowDown', { shift: true });

		await waitFor(() => expect(selected()).toEqual(['alfa.txt', 'beta.txt', 'delta.txt']));
	});
});

describe('file operations', () => {
	it('Ctrl+Shift+N creates a folder and opens the rename right away', async () => {
		await mount();
		key('N', { ctrl: true, shift: true });

		await waitFor(() => expect(document.querySelector('.rename-field')).not.toBeNull());
		expect(disk.exists('C:\\Nuova cartella')).toBe(true);
	});

	it('a second new folder gets numbered', async () => {
		await mount();
		key('N', { ctrl: true, shift: true });
		await waitFor(() => expect(document.querySelector('.rename-field')).not.toBeNull());
		await fireEvent.keyDown(document.querySelector('.rename-field')!, { key: 'Escape' });

		key('N', { ctrl: true, shift: true });
		await waitFor(() => expect(disk.exists('C:\\Nuova cartella (2)')).toBe(true));
	});

	it('F2 renames the file on the disk', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('F2');

		const field = await renameField();
		field.value = 'zeta.txt';
		await fireEvent.keyDown(field, { key: 'Enter' });

		await waitFor(() => expect(names()).toContain('zeta.txt'));
		expect(disk.exists('C:\\alfa.txt')).toBe(false);
	});

	it('F2 on several files renames them with a counter, Ctrl+Z puts every name back', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		await fireEvent.click(row('beta.txt'), { ctrlKey: true });
		key('F2');

		const dialog = await screen.findByRole('dialog', { name: 'Rinomina 2 elementi' });
		const name = within(dialog).getByRole('textbox');
		await fireEvent.input(name, { target: { value: 'Nota_##' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Rinomina' }));

		await waitFor(() => expect(disk.exists('C:\\Nota_01.txt')).toBe(true));
		expect(disk.exists('C:\\Nota_02.txt')).toBe(true);
		expect(disk.exists('C:\\alfa.txt')).toBe(false);

		key('z', { ctrl: true });
		await waitFor(() => expect(disk.exists('C:\\alfa.txt')).toBe(true));
		expect(disk.exists('C:\\beta.txt')).toBe(true);
	});

	it('Trova duplicati groups files with the same content, Esc goes back to the folder', async () => {
		disk = new FakeDisk([...STRUCTURE, 'C:\\uno.txt=stesso', 'C:\\Dati\\due.txt=stesso', 'C:\\tre.txt=altro']);
		await mount();
		await fireEvent.contextMenu(document.querySelector('.viewport')!);
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Trova duplicati qui' }));

		await waitFor(() => expect(names()).toEqual(['due.txt', 'uno.txt']));
		expect(screen.getByRole('separator', { name: /ciascuna/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Duplicati' }).getAttribute('aria-current')).toBe('location');

		await fireEvent.click(screen.getByRole('button', { name: 'Seleziona le copie in più' }));
		await waitFor(() => expect(row('uno.txt').classList.contains('selected')).toBe(true));
		expect(row('due.txt').classList.contains('selected')).toBe(false);

		key('Escape');
		await waitFor(() => expect(names()).toContain('alfa.txt'));
		expect(screen.queryByRole('button', { name: 'Duplicati' })).toBeNull();
	});

	it('the folder stop before «Duplicati» goes back to the folder', async () => {
		disk = new FakeDisk([...STRUCTURE, 'C:\\uno.txt=stesso', 'C:\\Dati\\due.txt=stesso']);
		await mount();
		await fireEvent.contextMenu(document.querySelector('.viewport')!);
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Trova duplicati qui' }));
		const stop = await screen.findByRole('button', { name: 'Duplicati' });

		await fireEvent.click(stop.previousElementSibling as HTMLElement);
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});

	it('Esc during the rename does not touch the disk', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('F2');

		const field = await renameField();
		field.value = 'zeta.txt';
		await fireEvent.keyDown(field, { key: 'Escape' });

		await waitFor(() => expect(document.querySelector('.rename-field')).toBeNull());
		expect(disk.exists('C:\\alfa.txt')).toBe(true);
	});

	it('Del asks for confirmation before trashing', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('Delete');

		await screen.findByRole('dialog', { name: 'Conferma eliminazione' });
		expect(disk.trash).toEqual([]);

		await fireEvent.click(screen.getByRole('button', { name: 'Sposta nel Cestino' }));
		await waitFor(() => expect(disk.trash).toEqual(['C:\\alfa.txt']));
		await waitFor(() => expect(names()).not.toContain('alfa.txt'));
	});

	it('a file that refuses the Trash does not stop the others, and is named', async () => {
		disk.inUse.add('C:\\beta.txt');
		await mount();
		key('a', { ctrl: true });
		await fireEvent.click(row('alfa.txt'), { ctrlKey: true });
		await fireEvent.click(row('Dati'), { ctrlKey: true });
		await fireEvent.click(row('Vuota'), { ctrlKey: true });
		await fireEvent.click(row('Segreta'), { ctrlKey: true });
		// Selected now: beta, gamma, delta.
		key('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));

		await waitFor(() => expect([...disk.trash].sort()).toEqual(['C:\\delta.txt', 'C:\\gamma.txt']));
		await waitFor(() => expect(document.querySelector('.error')?.textContent).toContain('1 elemento non eliminato'));
		expect(document.querySelector('.error')?.textContent).toContain('«beta.txt»: File in uso');
		expect(names()).toContain('beta.txt');
	});

	it('cancelling the confirmation trashes nothing', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('Delete');

		await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
		expect(disk.trash).toEqual([]);
		expect(names()).toContain('alfa.txt');
	});

	it('copy and paste into another folder', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('c', { ctrl: true });

		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('v', { ctrl: true });

		await waitFor(() => expect(names()).toEqual(['alfa.txt', 'interno.txt']));
		expect(disk.exists('C:\\alfa.txt')).toBe(true);
	});

	it('cut and paste moves, and the cut item looks faded', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('x', { ctrl: true });
		await waitFor(() => expect(row('alfa.txt').classList.contains('cut')).toBe(true));

		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('v', { ctrl: true });

		await waitFor(() => expect(names()).toContain('alfa.txt'));
		expect(disk.exists('C:\\alfa.txt')).toBe(false);
		expect(disk.exists('C:\\Dati\\alfa.txt')).toBe(true);
	});

	it('pasting where the name exists asks what to do', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('c', { ctrl: true });
		key('v', { ctrl: true });

		await screen.findByRole('dialog', { name: 'Conflitto di nomi' });
		await fireEvent.click(screen.getByRole('button', { name: /Mantieni entrambi/ }));

		await waitFor(() => expect(names()).toContain('alfa (2).txt'));
	});

	it('in the conflict, Salta leaves everything as it was', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('c', { ctrl: true });
		key('v', { ctrl: true });

		await fireEvent.click(await screen.findByRole('button', { name: /Salta/ }));
		await waitFor(() => expect(document.querySelector('.error')?.textContent).toMatch(/saltato/));
		expect(disk.exists('C:\\alfa (2).txt')).toBe(false);
	});

	it('paste from the menu on empty space', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('c', { ctrl: true });
		await enter('Vuota');
		await screen.findByText('Deposito vuoto');

		// In the empty folder there is no list: you paste from the
		// keyboard.
		key('v', { ctrl: true });
		await waitFor(() => expect(names()).toEqual(['alfa.txt']));
	});

	it('with a dialog open the list shortcuts stay silent', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('Delete');
		await screen.findByRole('dialog', { name: 'Conferma eliminazione' });

		key('d', { ctrl: true });
		key('N', { ctrl: true, shift: true });

		expect(disk.exists('C:\\Nuova cartella')).toBe(false);
		expect(headers()).toEqual([]);
	});
});

// ── Windows clipboard ────────────────────────────────────────────────

describe('Windows clipboard', () => {
	it('copying writes to the system clipboard, cutting marks the move', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('c', { ctrl: true });
		await waitFor(() => expect(disk.clipboard).toEqual({ paths: ['C:\\alfa.txt'], cut: false }));

		key('x', { ctrl: true });
		await waitFor(() => expect(disk.clipboard?.cut).toBe(true));
	});

	it('pastes files copied in Explorer or in another app', async () => {
		add('C:\\Altrove\\');
		add('C:\\Altrove\\da-fuori.txt');
		await mount();
		// Another program filled the clipboard.
		disk.clipboard = { paths: ['C:\\Altrove\\da-fuori.txt'], cut: false };

		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('v', { ctrl: true });

		await waitFor(() => expect(names()).toContain('da-fuori.txt'));
		expect(disk.exists('C:\\Altrove\\da-fuori.txt')).toBe(true);
	});

	it('after pasting a cut the clipboard is emptied, as in Explorer', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('x', { ctrl: true });
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('v', { ctrl: true });

		await waitFor(() => expect(disk.exists('C:\\Dati\\alfa.txt')).toBe(true));
		await waitFor(() => expect(disk.clipboard).toBeNull());
	});

	it('the menu offers Incolla only if there are files in the clipboard', async () => {
		await mount();
		await fireEvent.contextMenu(document.querySelector('.viewport')!);
		let menu = await screen.findByRole('menu');
		expect(within(menu).queryByRole('menuitem', { name: /Incolla/ })).toBeNull();
		await fireEvent.keyDown(window, { key: 'Escape' });

		disk.clipboard = { paths: ['C:\\beta.txt'], cut: false };
		await fireEvent.contextMenu(document.querySelector('.viewport')!);
		menu = await screen.findByRole('menu');
		await waitFor(() => expect(within(menu).getByRole('menuitem', { name: /Incolla/ })).toBeTruthy());
	});
});

// ── Address bar ────────────────────────────────────────────

describe('address bar', () => {
	async function write(text: string) {
		const field = await screen.findByLabelText('Indirizzo');
		(field as HTMLInputElement).value = text;
		await fireEvent.keyDown(field, { key: 'Enter' });
	}

	it('a click on the free space opens the field with the path', async () => {
		await mount();
		await fireEvent.click(screen.getByRole('button', { name: "Modifica l'indirizzo" }));
		const field = (await screen.findByLabelText('Indirizzo')) as HTMLInputElement;
		expect(field.value).toBe('C:\\');
	});

	it('typing a folder and pressing Enter takes us there', async () => {
		await mount();
		key('l', { ctrl: true });
		await write('C:\\Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
	});

	it('typing the path of a file opens its folder and selects it', async () => {
		await mount();
		key('F4');
		await write('C:\\Dati\\interno.txt');
		await waitFor(() => expect(selected()).toEqual(['interno.txt']));
	});

	it('a path that does not exist leaves you where you are and says so', async () => {
		await mount();
		key('d', { alt: true });
		await write('C:\\non\\esiste');
		await waitFor(() => expect(document.querySelector('.error')?.textContent).toMatch(/Impossibile trovare/));
		expect(names()).toContain('alfa.txt');
	});

	it('Esc closes the field without moving', async () => {
		await mount();
		key('l', { ctrl: true });
		const field = await screen.findByLabelText('Indirizzo');
		await fireEvent.keyDown(field, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByLabelText('Indirizzo')).toBeNull());
	});

	it('the stations lead straight to the folder, up to This PC', async () => {
		add('C:\\Dati\\Sotto\\');
		await mount();
		await enter('Dati');
		await waitFor(() => expect(names()).toContain('Sotto'));
		await enter('Sotto');
		await waitFor(() => expect(screen.getByRole('button', { name: 'C:' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'C:' }));
		await waitFor(() => expect(names()).toContain('alfa.txt'));

		// The station in the bar, not the sidebar item with the same name.
		const line = screen.getByRole('button', { name: "Modifica l'indirizzo" });
		await fireEvent.click(within(line).getByRole('button', { name: 'Questo PC' }));
		await waitFor(() => expect(names()).toEqual(['Disco locale (C:)']));
	});
});

// ── Automatic refresh ─────────────────────────────────────────

describe('automatic refresh', () => {
	it('watches the folders open in the tabs', async () => {
		await mount();
		await waitFor(() => expect(disk.watched).toEqual(['C:\\']));
		key('t', { ctrl: true });
		await waitFor(() => expect(disk.watched).toEqual(['C:\\', 'C:\\']));
	});

	it('when another program changes the folder the list refreshes by itself', async () => {
		await mount();
		await fireEvent.click(row('beta.txt'));

		add('C:\\nuovo-da-fuori.txt');
		listeners.get('folder-changed')?.({ payload: 'c:\\' });

		await waitFor(() => expect(names()).toContain('nuovo-da-fuori.txt'));
		// The refresh does not lose the selection.
		expect(selected()).toEqual(['beta.txt']);
	});

	it('F5 reads the folder again', async () => {
		await mount();
		add('C:\\comparso.txt');
		key('F5');
		await waitFor(() => expect(names()).toContain('comparso.txt'));
	});
});

// ── Undo ──────────────────────────────────────────────────────────

describe('since the last visit', () => {
	it('marks what is new and counts what is gone when coming back to a folder', async () => {
		await mount();
		await enter('Dati');
		await waitFor(() => expect(names()).toContain('interno.txt'));
		add('C:\\nuovo.txt');
		disk.nodes.delete('C:\\beta.txt');

		await fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
		await waitFor(() => expect(row('nuovo.txt').querySelector('.change')?.textContent).toBe('nuovo'));
		const band = document.querySelector('.duplicates-summary')!;
		expect(band.textContent).toContain('1 nuovo');
		expect(band.textContent).toContain('1 sparito');

		await fireEvent.click(screen.getByRole('button', { name: 'Solo i cambiati' }));
		await waitFor(() => expect(names()).toEqual(['nuovo.txt']));
	});

	it('switched off it marks nothing', async () => {
		localStorage.setItem('space-train.impostazioni', JSON.stringify({ folderChanges: false }));
		await mount();
		await enter('Dati');
		await waitFor(() => expect(names()).toContain('interno.txt'));
		add('C:\\nuovo.txt');
		await fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
		await waitFor(() => expect(names()).toContain('nuovo.txt'));
		expect(document.querySelector('.change')).toBeNull();
	});
});

describe('operation history (Ctrl+H)', () => {
	it('lists an operation and undoes it from the panel', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('F2');
		const field = await renameField();
		field.value = 'zeta.txt';
		await fireEvent.keyDown(field, { key: 'Enter' });
		await waitFor(() => expect(names()).toContain('zeta.txt'));

		key('h', { ctrl: true });
		const panel = await screen.findByRole('complementary', { name: 'Cronologia' });
		expect(panel.textContent).toContain('Rinomina di «zeta.txt»');
		await fireEvent.click(within(panel).getByRole('button', { name: 'Annulla operazione' }));
		await waitFor(() => expect(names()).toContain('alfa.txt'));
		expect(panel.textContent).toContain('Annullata');
	});
});

describe('undo (Ctrl+Z)', () => {
	it('undoes a rename', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('F2');
		const field = await renameField();
		field.value = 'zeta.txt';
		await fireEvent.keyDown(field, { key: 'Enter' });
		await waitFor(() => expect(names()).toContain('zeta.txt'));

		key('z', { ctrl: true });
		await waitFor(() => expect(names()).toContain('alfa.txt'));
		expect(disk.exists('C:\\zeta.txt')).toBe(false);
		expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Annullata: rinomina di «zeta.txt».');
	});

	it('undoes the move to the Recycle Bin', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));
		await waitFor(() => expect(names()).not.toContain('alfa.txt'));

		key('z', { ctrl: true });
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});

	it('undoes a copy by removing the duplicate', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('c', { ctrl: true });
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('v', { ctrl: true });
		await waitFor(() => expect(names()).toContain('alfa.txt'));

		key('z', { ctrl: true });
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		expect(disk.exists('C:\\alfa.txt')).toBe(true);
	});

	it('undoes a move by putting the file back where it was', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('x', { ctrl: true });
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('v', { ctrl: true });
		await waitFor(() => expect(disk.exists('C:\\Dati\\alfa.txt')).toBe(true));

		key('z', { ctrl: true });
		await waitFor(() => expect(disk.exists('C:\\alfa.txt')).toBe(true));
		expect(disk.exists('C:\\Dati\\alfa.txt')).toBe(false);
	});

	it('undoes the creation of a folder', async () => {
		await mount();
		key('N', { ctrl: true, shift: true });
		await waitFor(() => expect(disk.exists('C:\\Nuova cartella')).toBe(true));
		await fireEvent.keyDown(await renameField(), { key: 'Escape' });

		key('z', { ctrl: true });
		await waitFor(() => expect(disk.exists('C:\\Nuova cartella')).toBe(false));
	});

	it('the menu on empty space says what would be undone', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));
		await waitFor(() => expect(names()).not.toContain('alfa.txt'));

		await menuItem(null, /Annulla eliminazione di 1 elemento/);
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});
});

// ── Search in subfolders ──────────────────────────────────────

describe('search in subfolders', () => {
	async function search(text: string, opts: { content?: boolean } = {}) {
		key('f', { ctrl: true });
		await fireEvent.click(await screen.findByRole('button', { name: 'Sottocartelle' }));
		if (opts.content) await fireEvent.click(screen.getByRole('button', { name: 'Contenuto' }));
		const field = screen.getByLabelText('Filtra i file in questa cartella');
		await fireEvent.input(field, { target: { value: text } });
	}

	it('finds files in depth and shows which folder they are in', async () => {
		add('C:\\Dati\\Annidata\\');
		add('C:\\Dati\\Annidata\\relazione.txt');
		await mount();

		await search('relaz');
		await waitFor(() => expect(names()).toEqual(['relazione.txt']));
		expect(document.querySelector('.row .folder-hint')?.textContent).toBe('C:\\Dati\\Annidata');
	});

	it('also searches inside the files if asked', async () => {
		add('C:\\Dati\\note.txt', 'la parola introvabile è qui');
		await mount();

		await search('introvabile', { content: true });
		await waitFor(() => expect(names()).toEqual(['note.txt']));
	});

	it('«Ovunque» finds by name on every drive, through the index', async () => {
		await mount();
		await enter('Vuota');
		key('f', { ctrl: true });
		await fireEvent.click(await screen.findByRole('button', { name: 'Ovunque' }));
		expect(screen.queryByRole('button', { name: 'Sottocartelle' })).toBeNull();
		await fireEvent.input(screen.getByLabelText('Filtra i file in questa cartella'), { target: { value: 'INTERNO' } });
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		expect(document.querySelector('.row .folder-hint')?.textContent).toBe('C:\\Dati');
	});

	it('with no results it says so', async () => {
		await mount();
		await search('nessunfilecosì');
		expect(await screen.findByText('Nessuna corrispondenza')).toBeTruthy();
	});

	it('Apri percorso file leads to the folder of the result and selects it', async () => {
		await mount();
		await search('interno');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));

		await menuItem(row('interno.txt'), 'Apri percorso file');
		await waitFor(() => expect(selected()).toEqual(['interno.txt']));
		expect(document.querySelector('.row .folder-hint')).toBeNull();
	});

	it('closing the search goes back to the content of the folder', async () => {
		await mount();
		await search('interno');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));

		await fireEvent.click(screen.getByRole('button', { name: 'Chiudi la ricerca' }));
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});
});

// ── Windows Shell ────────────────────────────────────────────────────

describe('Windows Shell features', () => {
	it('Altre opzioni opens the Windows menu on the chosen items', async () => {
		await mount();
		await menuItem(row('alfa.txt'), 'Altre opzioni di Windows');
		await waitFor(() => expect(disk.shell.map((c) => c.cmd)).toEqual(['show_shell_menu']));
		expect(disk.shell[0].args).toMatchObject({ paths: ['C:\\alfa.txt'], folder: 'C:\\' });
	});

	it('Alt+Enter opens the Properties of the selection, or of the folder if empty', async () => {
		await mount();
		await fireEvent.click(row('beta.txt'));
		key('Enter', { alt: true });
		await waitFor(() => expect(disk.shell[0]).toEqual({ cmd: 'show_properties', args: { paths: ['C:\\beta.txt'] } }));

		await fireEvent.click(row('beta.txt'), { ctrlKey: true });
		key('Enter', { alt: true });
		await waitFor(() => expect(disk.shell[1]?.args).toEqual({ paths: ['C:\\'] }));
	});

	it('Apri con… and Esegui come amministratore hand the file to Windows', async () => {
		add('C:\\setup.exe');
		await mount();
		await menuItem(row('alfa.txt'), 'Apri con…');
		await menuItem(row('setup.exe'), 'Esegui come amministratore');
		await waitFor(() =>
			expect(disk.shell).toEqual([
				{ cmd: 'open_with', args: { path: 'C:\\alfa.txt' } },
				{ cmd: 'run_as_admin', args: { path: 'C:\\setup.exe' } }
			])
		);
	});
});

// ── Tabs ───────────────────────────────────────────────────────────

describe('tabs', () => {
	it('Ctrl+T opens a tab, Ctrl+W closes it', async () => {
		await mount();
		key('t', { ctrl: true });
		await waitFor(() => expect(tabs()).toHaveLength(2));
		key('w', { ctrl: true });
		await waitFor(() => expect(tabs()).toHaveLength(1));
	});

	it('Ctrl+Tab and Ctrl+number switch from one tab to another', async () => {
		await mount();
		await menuItem(row('Dati'), 'Apri in una nuova scheda');
		await waitFor(() => expect(tabs()).toEqual(['C:', 'Dati']));
		await waitFor(() => expect(names()).toEqual(['interno.txt']));

		key('Tab', { ctrl: true });
		await waitFor(() => expect(names()).toContain('alfa.txt'));
		key('2', { ctrl: true });
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
	});

	it('the wheel click closes the tab', async () => {
		await mount();
		key('t', { ctrl: true });
		await waitFor(() => expect(tabs()).toHaveLength(2));
		await fireEvent(
			document.querySelectorAll('.tab')[1],
			new MouseEvent('auxclick', { button: 1, bubbles: true })
		);
		await waitFor(() => expect(tabs()).toHaveLength(1));
	});

	it('Backspace goes back, Alt+Up goes to the parent', async () => {
		await mount();
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('Backspace');
		await waitFor(() => expect(names()).toContain('alfa.txt'));

		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('ArrowUp', { alt: true });
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});

	it('typing in the search field Backspace deletes, it does not go back', async () => {
		await mount();
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('f', { ctrl: true });
		const field = await screen.findByLabelText('Filtra i file in questa cartella');
		await fireEvent.keyDown(field, { key: 'Backspace' });
		expect(names()).toEqual(['interno.txt']);
	});
});

// ── Special locations ───────────────────────────────────────────────

describe('This PC and Recycle Bin', () => {
	it('the sidebar shows the free space of the drives', async () => {
		await mount();
		expect(await screen.findByText('40 B liberi')).toBeTruthy();
	});

	it('the free space is read again when the window comes back to the foreground', async () => {
		await mount();
		expect(await screen.findByText('40 B liberi')).toBeTruthy();
		// Another program filled the disk while the window was behind.
		disk.freeOnC = 25;
		await fireEvent.focus(window);
		expect(await screen.findByText('25 B liberi')).toBeTruthy();
	});

	it('above the drive root there is This PC, with the drives and their space', async () => {
		await mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Su' }));
		await waitFor(() => expect(names()).toEqual(['Disco locale (C:)']));
		expect(document.querySelector('.row .size')?.textContent).toBe('40 B liberi');

		await enter('Disco locale (C:)');
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});

	it('in the Recycle Bin you see where an item comes from and restore it', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));
		await waitFor(() => expect(names()).not.toContain('alfa.txt'));

		await fireEvent.click(screen.getByRole('button', { name: 'Cestino' }));
		await waitFor(() => expect(names()).toEqual(['alfa.txt']));
		expect(document.querySelector('.row .folder-hint')?.textContent).toBe('C:\\');

		await menuItem(row('alfa.txt'), 'Ripristina');
		await waitFor(() => expect(names()).toEqual([]));
		expect(disk.exists('C:\\alfa.txt')).toBe(true);
	});

	it('emptying the Recycle Bin asks for confirmation and cannot be undone', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));
		await waitFor(() => expect(names()).not.toContain('alfa.txt'));
		await fireEvent.click(screen.getByRole('button', { name: 'Cestino' }));
		await waitFor(() => expect(names()).toEqual(['alfa.txt']));

		await menuItem(null, 'Svuota Cestino');
		await fireEvent.click(await screen.findByRole('button', { name: 'Elimina definitivamente' }));
		await waitFor(() => expect(names()).toEqual([]));
	});
});

// ── Permanent deletion ──────────────────────────────────────────

describe('permanent deletion', () => {
	it('Shift+Del asks a different confirmation and deletes without the Recycle Bin', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('Delete', { shift: true });

		expect(await screen.findByText('Eliminare definitivamente?')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Elimina definitivamente' }));

		await waitFor(() => expect(disk.exists('C:\\alfa.txt')).toBe(false));
		expect(disk.trash).toEqual([]);
	});

	it('shows the progress bar, counted in items, while deleting', async () => {
		let unblock = () => {};
		disk.blockDeletion = new Promise((r) => (unblock = r));
		await mount();
		await fireEvent.click(row('alfa.txt'));
		key('Delete', { shift: true });
		await fireEvent.click(await screen.findByRole('button', { name: 'Elimina definitivamente' }));

		expect(await screen.findByText('Eliminazione in corso…')).toBeTruthy();
		expect(screen.getByText(/0 di 1 elemento/)).toBeTruthy();

		unblock();
		await waitFor(() => expect(screen.queryByText('Eliminazione in corso…')).toBeNull());
		expect(disk.exists('C:\\alfa.txt')).toBe(false);
	});
});

// ── ZIP archives ──────────────────────────────────────────────────────

describe('ZIP archives', () => {
	it('Comprimi creates the ZIP next to it and selects it', async () => {
		await mount();
		await menuItem(row('alfa.txt'), 'Comprimi in file ZIP');
		await waitFor(() => expect(selected()).toEqual(['alfa.zip']));
		expect(disk.exists('C:\\alfa.zip')).toBe(true);
	});

	it('Estrai tutto creates a folder with the name of the archive', async () => {
		add('C:\\pacco.zip');
		await mount();
		await menuItem(row('pacco.zip'), 'Estrai tutto');
		await waitFor(() => expect(selected()).toEqual(['pacco']));
		expect(disk.exists('C:\\pacco\\estratto.txt')).toBe(true);
	});

	it('compression too is undone with Ctrl+Z', async () => {
		await mount();
		await menuItem(row('alfa.txt'), 'Comprimi in file ZIP');
		await waitFor(() => expect(disk.exists('C:\\alfa.zip')).toBe(true));
		key('z', { ctrl: true });
		await waitFor(() => expect(disk.exists('C:\\alfa.zip')).toBe(false));
	});
});

// ── Preview ────────────────────────────────────────────────────────

describe('preview pane', () => {
	it('Alt+P opens the pane, which shows the text of the selected file', async () => {
		disk.contents.set('C:\\alfa.txt', 'prima riga del file');
		await mount();
		key('p', { alt: true });
		expect(await screen.findByText('Seleziona un file per vederne l’anteprima.')).toBeTruthy();

		await fireEvent.click(row('alfa.txt'));
		expect(await screen.findByText('prima riga del file')).toBeTruthy();
	});

	it('images are shown from the real file', async () => {
		add('C:\\foto.jpg');
		await mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Riquadro di anteprima' }));
		await fireEvent.click(row('foto.jpg'));

		const img = (await screen.findByAltText('foto.jpg')) as HTMLImageElement;
		expect(img.getAttribute('src')).toBe('asset://C:\\foto.jpg');
	});

	it('Markdown is formatted, CSV becomes a table, «Testo semplice» shows the raw text', async () => {
		add('C:\\note.md', '# Trasloco\n\n- **scatoloni**\n- libri');
		add('C:\\spese.csv', 'Data;Euro\n02/03;84,20');
		await mount();
		key('p', { alt: true });
		await fireEvent.click(row('note.md'));
		const pane = await screen.findByRole('complementary', { name: 'Anteprima' });
		await waitFor(() => expect(pane.querySelector('.md .heading')?.textContent).toBe('Trasloco'));
		expect(pane.querySelector('.md strong')?.textContent).toBe('scatoloni');

		await fireEvent.click(within(pane).getByLabelText('Testo semplice'));
		expect(pane.querySelector('pre')?.textContent).toContain('# Trasloco');
		await fireEvent.click(within(pane).getByLabelText('Testo semplice'));

		await fireEvent.click(row('spese.csv'));
		await waitFor(() => expect(pane.querySelectorAll('th').length).toBe(2));
		expect(pane.querySelector('td.number')?.textContent).toBe('84,20');
	});

	it('an archive shows what is inside without extracting it', async () => {
		add('C:\\p.7z');
		disk.archives.set('C:\\p.7z', [
			{ path: 'src/a.txt', size: 5, dir: false, modified: 1 },
			{ path: 'README.md', size: 2048, dir: false, modified: 1 }
		]);
		await mount();
		key('p', { alt: true });
		await fireEvent.click(row('p.7z'));
		const pane = await screen.findByRole('complementary', { name: 'Anteprima' });
		expect(await within(pane).findByText('2 file nell’archivio')).toBeTruthy();
		expect(within(pane).getByText('README.md')).toBeTruthy();
	});

	it('the pane stays open after a restart', async () => {
		const { unmount } = await mount();
		key('p', { alt: true });
		await screen.findByRole('complementary', { name: 'Anteprima' });
		unmount();

		await mount();
		expect(screen.getByRole('complementary', { name: 'Anteprima' })).toBeTruthy();
	});
});

// ── View ───────────────────────────────────────────────────────

describe('Visualizza menu', () => {
	it('the eight views of Explorer', async () => {
		await mount();

		await view('Icone molto grandi');
		await waitFor(() => expect(sides()[0]).toBe(256));

		await view('Icone piccole');
		await waitFor(() => expect(document.querySelectorAll('.cell.horizontal').length).toBe(7));

		await view('Riquadri');
		await waitFor(() => expect(document.querySelector('.cell .info')?.textContent).toBe('Cartella'));

		await view('Contenuto');
		await waitFor(() => expect(document.querySelectorAll('.cell.full').length).toBe(7));

		await view('Dettagli');
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});

	it('Ctrl+wheel enlarges the icons at will and goes down to the details', async () => {
		await mount();
		await view('Icone medie');
		await waitFor(() => expect(sides()[0]).toBe(64));

		fireEvent.wheel(window, { deltaY: -100, ctrlKey: true });
		await waitFor(() => expect(sides()[0]).toBeGreaterThan(64));

		// Many notches back: icons smaller and smaller, then list, then details.
		for (let i = 0; i < 40; i++) fireEvent.wheel(window, { deltaY: 100, ctrlKey: true });
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});

	it('the wheel without Ctrl does not change the view', async () => {
		await mount();
		fireEvent.wheel(window, { deltaY: -100 });
		expect(names()).toContain('alfa.txt');
	});

	it('the slider in the status bar sets the icon size', async () => {
		await mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Icone grandi' }));
		const cursor = (await screen.findByLabelText('Dimensione delle icone')) as HTMLInputElement;
		expect(cursor.value).toBe('128');

		await fireEvent.input(cursor, { target: { value: '200' } });
		await waitFor(() => expect(sides()[0]).toBe(200));
	});

	it('Ctrl+Shift+6 goes back to details, Ctrl+Shift+2 to large icons', async () => {
		await mount();
		fireEvent.keyDown(window, { key: '"', code: 'Digit2', ctrlKey: true, shiftKey: true });
		await waitFor(() => expect(sides()[0]).toBe(128));
		fireEvent.keyDown(window, { key: '&', code: 'Digit6', ctrlKey: true, shiftKey: true });
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});

	it('the chosen view stays after a restart', async () => {
		const { unmount } = await mount();
		await view('Icone grandi');
		await waitFor(() => expect(sides()[0]).toBe(128));
		unmount();

		render(Page);
		await waitFor(() => expect(sides()[0]).toBe(128));
	});

	it('compact view lowers the rows', async () => {
		await mount();
		expect(row('alfa.txt').style.height).toBe('32px');
		await view('Visualizzazione compatta');
		await waitFor(() => expect(row('alfa.txt').style.height).toBe('26px'));
	});

	it('columns are chosen from the menu or from the right click on the headers', async () => {
		await mount();
		expect(document.querySelector('.row .type')).toBeNull();

		await fireEvent.contextMenu(document.querySelector('.board')!);
		const menu = await screen.findByRole('menu');
		await fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Tipo' }));
		await waitFor(() => expect(row('alfa.txt').querySelector('.type')?.textContent).toBe('Documento di testo TXT'));

		await view('Dimensione');
		await waitFor(() => expect(row('alfa.txt').querySelector('.size')).toBeNull());
	});

	it('extensions can be hidden, and the rename keeps them', async () => {
		await mount();
		await view('Estensioni dei nomi file');
		await waitFor(() => expect(names()).toContain('alfa'));

		await fireEvent.click(row('alfa'));
		key('F2');
		const field = await renameField();
		expect(field.value).toBe('alfa');
		field.value = 'omega';
		await fireEvent.keyDown(field, { key: 'Enter' });

		await waitFor(() => expect(disk.exists('C:\\omega.txt')).toBe(true));
	});

	it('hidden items from the Visualizza menu', async () => {
		await mount();
		await view('Elementi nascosti');
		const eye = screen.getByTitle('Nascondi i file di sistema');
		expect(eye.getAttribute('aria-pressed')).toBe('true');
	});
});

// ── Sort ───────────────────────────────────────────────────────────

describe('Ordina menu', () => {
	it('sort by column and direction', async () => {
		await mount();
		await sort('Decrescente');
		await waitFor(() => expect(names().slice(3)).toEqual(['gamma.txt', 'delta.txt', 'beta.txt', 'alfa.txt']));

		await sort('Crescente');
		await waitFor(() => expect(names().slice(3)).toEqual(['alfa.txt', 'beta.txt', 'delta.txt', 'gamma.txt']));
	});

	it('the menu marks the current sort', async () => {
		await mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Ordina' }));
		const menu = await screen.findByRole('menu');
		expect(within(menu).getByRole('menuitemcheckbox', { name: 'Nome' }).getAttribute('aria-checked')).toBe('true');
		expect(within(menu).getByRole('menuitemcheckbox', { name: 'Crescente' }).getAttribute('aria-checked')).toBe('true');
	});

	it('every folder remembers its sort', async () => {
		await mount();
		await sort('Decrescente');
		await waitFor(() => expect(names()[3]).toBe('gamma.txt'));

		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		await fireEvent.click(screen.getByRole('button', { name: 'Ordina' }));
		let menu = await screen.findByRole('menu');
		// Dati has never been sorted: it starts from ascending.
		expect(within(menu).getByRole('menuitemcheckbox', { name: 'Crescente' }).getAttribute('aria-checked')).toBe('true');
		await fireEvent.keyDown(window, { key: 'Escape' });

		await fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
		await waitFor(() => expect(names()[3]).toBe('gamma.txt'));
		await fireEvent.click(screen.getByRole('button', { name: 'Ordina' }));
		menu = await screen.findByRole('menu');
		expect(within(menu).getByRole('menuitemcheckbox', { name: 'Decrescente' }).getAttribute('aria-checked')).toBe('true');
	});

	it('group by type splits the list into zones', async () => {
		await mount();
		await sort('Raggruppa per tipo');
		await waitFor(() => expect(headers()).toEqual(['Cartelle, 3', 'Documenti, 4']));
	});

	it('favourites stay above the groups', async () => {
		await mount();
		await fireEvent.click(row('gamma.txt'));
		key('d', { ctrl: true });
		await sort('Raggruppa per tipo');
		await waitFor(() => expect(headers()).toEqual(['Preferiti, 1', 'Cartelle, 3', 'Documenti, 3']));
	});

	it('group by name', async () => {
		await mount();
		await sort('Raggruppa per nome');
		await waitFor(() => expect(headers()).toEqual(['A–H, 5', 'Q–Z, 2']));
	});
});

// ── Appearance ──────────────────────────────────────────────────────────

describe('themes and colours', () => {
	const cssVariable = (name: string) => document.documentElement.style.getPropertyValue(name);

	it('a theme is chosen and the document changes colours', async () => {
		await mount();
		expect(cssVariable('--hull')).toBe('#171420');
		await fromGallery('Chiaro');
		await waitFor(() => expect(cssVariable('--hull')).toBe('#ffffff'));
		expect(document.documentElement.dataset.theme).toBe('light');
	});

	it('the accent colour replaces the theme one', async () => {
		await mount();
		await fromGallery('Verde');
		await waitFor(() => expect(cssVariable('--accent')).toBe('#22c55e'));
	});

	it('theme and accent stay after a restart', async () => {
		const { unmount } = await mount();
		await fromGallery('Oceano');
		await waitFor(() => expect(cssVariable('--hull')).toBe('#0d1e2c'));
		unmount();
		document.documentElement.removeAttribute('style');

		await mount();
		expect(cssVariable('--hull')).toBe('#0d1e2c');
	});
});

// ── Coloured folders ────────────────────────────────────────────────

describe('coloured folders', () => {
	async function paint(name: string, color: string) {
		await fireEvent.contextMenu(row(name));
		const menu = await screen.findByRole('menu');
		await fireEvent.click(within(menu).getByRole('menuitemradio', { name: color }));
	}

	it('the colour is chosen from the menu of a folder', async () => {
		await mount();
		await paint('Dati', 'Verde');
		await waitFor(() => expect(row('Dati').querySelector('.colored-folder')?.innerHTML).toContain('#22c55e'));
	});

	it('files get the palette too, as a colour label', async () => {
		await mount();
		await fireEvent.contextMenu(row('alfa.txt'));
		const menu = await screen.findByRole('menu');
		expect(within(menu).getByRole('menuitemradio', { name: 'Verde' })).toBeTruthy();
	});

	it('the colour is removed with «Nessun colore»', async () => {
		await mount();
		await paint('Dati', 'Rosso');
		await waitFor(() => expect(row('Dati').querySelector('.colored-folder')).not.toBeNull());
		await paint('Dati', 'Nessun colore');
		await waitFor(() => expect(row('Dati').querySelector('.colored-folder')).toBeNull());
	});

	it('several folders together, and the colour stays after a restart', async () => {
		const { unmount } = await mount();
		await fireEvent.click(row('Dati'));
		await fireEvent.click(row('Vuota'), { ctrlKey: true });
		await paint('Vuota', 'Blu');
		await waitFor(() => expect(document.querySelectorAll('.colored-folder').length).toBe(2));
		unmount();

		await mount();
		expect(document.querySelectorAll('.colored-folder').length).toBe(2);
	});

	it('renaming the folder the colour follows it', async () => {
		await mount();
		await paint('Vuota', 'Viola');
		await fireEvent.click(row('Vuota'));
		key('F2');
		const field = await renameField();
		field.value = 'Progetti';
		await fireEvent.keyDown(field, { key: 'Enter' });

		await waitFor(() => expect(row('Progetti').querySelector('.colored-folder')?.innerHTML).toContain('#a855f7'));
	});

	it('the colour shows in the icon views too', async () => {
		await mount();
		await paint('Dati', 'Arancione');
		await view('Icone grandi');
		await waitFor(() => expect(document.querySelector('.cell .drawing')?.innerHTML).toContain('#f97316'));
	});
});

// ── Drag and drop ────────────────────────────────────────────────────

describe('drag and drop', () => {
	function dragFrom(el: HTMLElement) {
		fireEvent.mouseDown(el.querySelector('.name') ?? el, { button: 0, clientX: 10, clientY: 10 });
		fireEvent.mouseMove(window, { buttons: 1, clientX: 40, clientY: 10 });
	}

	function release(above: Element | null, paths: string[]) {
		document.elementFromPoint = () => above;
		onDrag?.({ payload: { type: 'drop', paths, position: { x: 5, y: 5 } } });
	}

	it('dragging an item hands Windows the whole selection', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		await fireEvent.click(row('beta.txt'), { ctrlKey: true });
		dragFrom(row('beta.txt'));

		await waitFor(() =>
			expect(disk.shell[0]).toEqual({ cmd: 'start_drag', args: { paths: ['C:\\alfa.txt', 'C:\\beta.txt'] } })
		);
	});

	it('the row is dragged from any point, not only from the name', async () => {
		await mount();
		const data = row('alfa.txt').querySelector('.date')!;
		fireEvent.mouseDown(data, { button: 0, clientX: 10, clientY: 10 });
		fireEvent.mouseMove(window, { buttons: 1, clientX: 40, clientY: 60 });
		await waitFor(() => expect(disk.shell[0]).toEqual({ cmd: 'start_drag', args: { paths: ['C:\\alfa.txt'] } }));
		expect(document.querySelector('.selection-marquee')).toBeNull();
	});

	it('a folder dropped between the tabs opens in a new tab', async () => {
		await mount();
		release(document.querySelector('[data-new-tab]'), ['C:\\Dati']);
		await waitFor(() => expect(tabs()).toEqual(['C:', 'Dati']));
		// No moves: the folder stays where it was.
		expect(disk.exists('C:\\Dati\\interno.txt')).toBe(true);
	});

	it('dropped on a tab instead it ends up inside it', async () => {
		await mount();
		release(document.querySelector('.tab'), ['C:\\Dati\\interno.txt']);
		await waitFor(() => expect(disk.exists('C:\\interno.txt')).toBe(true));
		expect(tabs()).toEqual(['C:']);
	});

	it('a click without movement is not a drag', async () => {
		await mount();
		fireEvent.mouseDown(row('alfa.txt'), { button: 0, clientX: 10, clientY: 10 });
		fireEvent.mouseMove(window, { buttons: 1, clientX: 12, clientY: 11 });
		fireEvent.mouseUp(window);
		expect(disk.shell).toEqual([]);
	});

	it('dropping on a folder of the same drive moves', async () => {
		await mount();
		release(row('Dati'), ['C:\\alfa.txt']);
		await waitFor(() => expect(disk.exists('C:\\Dati\\alfa.txt')).toBe(true));
		expect(disk.exists('C:\\alfa.txt')).toBe(false);
	});

	it('with Ctrl held it copies instead of moving', async () => {
		await mount();
		disk.keys = { ctrl: true, shift: false, alt: false };
		release(row('Dati'), ['C:\\alfa.txt']);
		await waitFor(() => expect(disk.exists('C:\\Dati\\alfa.txt')).toBe(true));
		expect(disk.exists('C:\\alfa.txt')).toBe(true);
	});

	it('files from another drive are copied into the open folder', async () => {
		disk.nodes.set('D:\\', { kind: 'dir', size: 0, hidden: false, modified: 0 });
		disk.nodes.set('D:\\esterno.txt', { kind: 'file', size: 1, hidden: false, modified: 0 });
		await mount();

		release(document.querySelector('.viewport'), ['D:\\esterno.txt']);
		await waitFor(() => expect(names()).toContain('esterno.txt'));
		expect(disk.exists('D:\\esterno.txt')).toBe(true);
	});

	it('dropping on the Recycle Bin of the sidebar trashes', async () => {
		await mount();
		release(screen.getByRole('button', { name: 'Cestino' }), ['C:\\gamma.txt']);
		await waitFor(() => expect(disk.trash).toEqual(['C:\\gamma.txt']));
	});

	it('items dropped where they already are do not move', async () => {
		await mount();
		release(document.querySelector('.viewport'), ['C:\\alfa.txt']);
		await new Promise((r) => setTimeout(r, 20));
		expect(disk.exists('C:\\alfa.txt')).toBe(true);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('passing over a folder highlights it as the destination', async () => {
		await mount();
		document.elementFromPoint = () => row('Dati');
		onDrag?.({ payload: { type: 'over', position: { x: 5, y: 5 } } });
		await waitFor(() => expect(row('Dati').classList.contains('drop-target')).toBe(true));

		onDrag?.({ payload: { type: 'leave' } });
		await waitFor(() => expect(row('Dati').classList.contains('drop-target')).toBe(false));
	});
});

// ── Command bar and Nuovo ────────────────────────────────────────────

describe('command bar', () => {
	async function newItem(label: string | RegExp) {
		await fireEvent.click(screen.getByRole('button', { name: 'Nuovo' }));
		const menu = await screen.findByRole('menu');
		const name = typeof label === 'string' ? new RegExp(`^${label}`) : label;
		await fireEvent.click(within(menu).getByRole('menuitem', { name: name }));
	}

	it('«Nuovo» sits on the left, before all the other commands', async () => {
		await mount();
		const bar = screen.getByRole('toolbar', { name: 'Comandi' });
		expect(within(bar).getAllByRole('button')[0].textContent).toContain('Nuovo');
	});

	it('Nuovo › Documento di testo creates the file and opens it in rename', async () => {
		await mount();
		await newItem('Documento di testo');

		await waitFor(() => expect(disk.exists('C:\\Nuovo Documento di testo.txt')).toBe(true));
		const field = await renameField();
		field.value = 'appunti.txt';
		await fireEvent.keyDown(field, { key: 'Enter' });
		await waitFor(() => expect(names()).toContain('appunti.txt'));
	});

	it('Nuovo offers the types registered in Windows and numbers the second', async () => {
		await mount();
		await newItem('Cartella compressa');
		await waitFor(() => expect(disk.exists('C:\\Nuovo Cartella compressa.zip')).toBe(true));
		await fireEvent.keyDown(await renameField(), { key: 'Escape' });

		await newItem('Cartella compressa');
		await waitFor(() => expect(disk.exists('C:\\Nuovo Cartella compressa (2).zip')).toBe(true));
	});

	it('Nuovo › Cartella', async () => {
		await mount();
		// «Cartella» alone, not «Cartella compressa»: the shortcut follows it.
		await newItem(/^Cartella\s*Ctrl/);
		await waitFor(() => expect(disk.exists('C:\\Nuova cartella')).toBe(true));
	});

	it('the creation of a file is undone with Ctrl+Z', async () => {
		await mount();
		await newItem('Documento di testo');
		await waitFor(() => expect(disk.exists('C:\\Nuovo Documento di testo.txt')).toBe(true));
		await fireEvent.keyDown(await renameField(), { key: 'Escape' });
		key('z', { ctrl: true });
		await waitFor(() => expect(disk.exists('C:\\Nuovo Documento di testo.txt')).toBe(false));
	});

	it('from the menu on the background «Nuovo…» opens the same menu', async () => {
		await mount();
		await menuItem(null, 'Nuovo…');
		const menu = await screen.findByRole('menu');
		await fireEvent.click(within(menu).getByRole('menuitem', { name: /^Documento di testo/ }));
		await waitFor(() => expect(disk.exists('C:\\Nuovo Documento di testo.txt')).toBe(true));
	});

	it('in the Recycle Bin «Nuovo» is disabled', async () => {
		await mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Cestino' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Nuovo' }).hasAttribute('disabled')).toBe(true));
	});

	it('cut, copy, paste and delete work from the bar', async () => {
		await mount();
		const bar = screen.getByRole('toolbar', { name: 'Comandi' });
		expect(within(bar).getByRole('button', { name: 'Copia' }).hasAttribute('disabled')).toBe(true);

		await fireEvent.click(row('alfa.txt'));
		await fireEvent.click(within(bar).getByRole('button', { name: 'Copia' }));
		await waitFor(() => expect(disk.clipboard?.paths).toEqual(['C:\\alfa.txt']));

		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		await fireEvent.click(within(bar).getByRole('button', { name: 'Incolla' }));
		await waitFor(() => expect(names()).toContain('alfa.txt'));

		await fireEvent.click(row('alfa.txt'));
		await fireEvent.click(within(bar).getByRole('button', { name: 'Elimina' }));
		expect(await screen.findByRole('dialog', { name: 'Conferma eliminazione' })).toBeTruthy();
	});

	it('the Cerca button next to the address opens the search', async () => {
		await mount();
		await fireEvent.click(screen.getByRole('button', { name: /^Cerca in/ }));
		expect(await screen.findByLabelText('Filtra i file in questa cartella')).toBeTruthy();
	});
});

describe('window', () => {
	it('it also moves from the tabs zone and from the train line', async () => {
		await mount();
		expect(document.querySelector('.tabs')?.hasAttribute('data-tauri-drag-region')).toBe(true);
		expect(document.querySelector('.main-line')?.hasAttribute('data-tauri-drag-region')).toBe(true);
	});

	it('the pink theme applies', async () => {
		await mount();
		await fromGallery('Sakura');
		await waitFor(() => expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#f472b6'));
	});
});

// ── Recent ──────────────────────────────────────────────────────────

describe('recent', () => {
	const day = 24 * 60 * 60 * 1000;
	function setModified(path: string, daysAgo: number) {
		disk.nodes.get(path)!.modified = Date.now() - daysAgo * day;
	}

	it('the Recenti button puts on top what changed recently', async () => {
		setModified('C:\\gamma.txt', 1);
		setModified('C:\\alfa.txt', 5);
		setModified('C:\\delta.txt', 40);
		await mount();

		await fireEvent.click(screen.getByRole('button', { name: 'Recenti' }));
		await waitFor(() => expect(headers()[0]).toBe('Modificati di recente, 2'));
		// From the newest.
		expect(names().slice(0, 2)).toEqual(['gamma.txt', 'alfa.txt']);
	});

	it('the slider widens and narrows the period', async () => {
		setModified('C:\\gamma.txt', 1);
		setModified('C:\\delta.txt', 40);
		await mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Recenti' }));
		await waitFor(() => expect(headers()[0]).toBe('Modificati di recente, 1'));

		const cursor = screen.getByLabelText('Periodo') as HTMLInputElement;
		// Index 5 = last 3 months.
		await fireEvent.input(cursor, { target: { value: '5' } });
		await waitFor(() => expect(headers()[0]).toBe('Modificati di recente, 2'));
		expect(screen.getByText('Ultimi 3 mesi')).toBeTruthy();
	});

	it('favourites too go below the recent ones', async () => {
		setModified('C:\\beta.txt', 2);
		await mount();
		await fireEvent.click(row('delta.txt'));
		key('d', { ctrl: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Recenti' }));

		await waitFor(() =>
			expect(headers()).toEqual(['Modificati di recente, 1', 'Preferiti, 1', 'Comuni, 5'])
		);
		expect(names()[0]).toBe('beta.txt');
	});

	it('the choice stays after a restart, and the × turns it off', async () => {
		setModified('C:\\beta.txt', 2);
		const { unmount } = await mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Recenti' }));
		await waitFor(() => expect(headers()[0]).toBe('Modificati di recente, 1'));
		unmount();

		await mount();
		expect(headers()[0]).toBe('Modificati di recente, 1');
		await fireEvent.click(screen.getByRole('button', { name: 'Nascondi i recenti' }));
		await waitFor(() => expect(headers()).toEqual([]));
	});
});

// ── Local network ──────────────────────────────────────────────────────

describe('local network', () => {
	const other = { id: 'PC2-ab12', name: 'PC2', ip: '192.168.1.20', port: 47821, shared: 'Condivisa' };

	/** Another PC with a shared folder that holds photos and a document. */
	function withOtherPc() {
		disk.peers = [other];
		for (const [p, dir] of [
			['::lan\\PC2-ab12', true],
			['::lan\\PC2-ab12\\Foto', true],
			['::lan\\PC2-ab12\\Foto\\mare.jpg', false],
			['::lan\\PC2-ab12\\relazione.docx', false]
		] as const) {
			disk.nodes.set(p, { kind: dir ? 'dir' : 'file', size: 100, hidden: false, modified: 0 });
		}
	}

	it('the switch makes this PC visible', async () => {
		await mount();
		const toggle = await screen.findByRole('switch', { name: /Rendi visibile/ });
		expect(toggle.getAttribute('aria-checked')).toBe('false');

		await fireEvent.click(toggle);
		await waitFor(() => expect(disk.lan.visible).toBe(true));
		expect(await screen.findByText(/Visibile come QUESTO/)).toBeTruthy();
	});

	it('the other PCs appear in the sidebar when they announce themselves', async () => {
		await mount();
		expect(screen.queryByRole('button', { name: /PC2/ })).toBeNull();

		listeners.get('lan-peers')?.({ payload: [other] });
		expect(await screen.findByRole('button', { name: /PC2/ })).toBeTruthy();
	});

	it('the shared folder of the other PC can be browsed', async () => {
		withOtherPc();
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: /PC2/ }));
		await waitFor(() => expect(names()).toEqual(['Foto', 'relazione.docx']));

		await enter('Foto');
		await waitFor(() => expect(names()).toEqual(['mare.jpg']));
		// Nothing is created in the folder of another PC.
		expect(screen.getByRole('button', { name: 'Nuovo' }).hasAttribute('disabled')).toBe(true);
	});

	it('copy from the other PC and paste here', async () => {
		withOtherPc();
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: /PC2/ }));
		await waitFor(() => expect(names()).toContain('relazione.docx'));
		await fireEvent.click(row('relazione.docx'));
		key('c', { ctrl: true });

		await fireEvent.click(screen.getByRole('button', { name: /Disco locale/ }));
		await waitFor(() => expect(names()).toContain('alfa.txt'));
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('v', { ctrl: true });

		await waitFor(() => expect(names()).toContain('relazione.docx'));
		expect(disk.exists('C:\\Dati\\relazione.docx')).toBe(true);
	});

	it('dragged out of the app, a file of the other PC reaches Windows as a real file', async () => {
		withOtherPc();
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: /PC2/ }));
		await waitFor(() => expect(names()).toContain('relazione.docx'));
		const name = row('relazione.docx').querySelector('.name')!;
		fireEvent.mouseDown(name, { button: 0, clientX: 10, clientY: 10 });
		fireEvent.mouseMove(window, { buttons: 1, clientX: 40, clientY: 10 });

		// First it is downloaded into a temporary folder, then the drag
		// starts with that path: Windows does not know a `::lan\…`.
		await waitFor(() =>
			expect(disk.shell[0]).toEqual({ cmd: 'start_drag', args: { paths: ['C:\\Temp\\relazione.docx'] } })
		);
		expect(disk.exists('C:\\Temp\\relazione.docx')).toBe(true);
	});

	it('a file of the other PC opens with a double click', async () => {
		withOtherPc();
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: /PC2/ }));
		await waitFor(() => expect(names()).toContain('relazione.docx'));
		await fireEvent.dblClick(row('relazione.docx'));
		await waitFor(() => expect(disk.opened).toEqual(['::lan\\PC2-ab12\\relazione.docx']));
	});

	it('Invia a sends the selection to the other PC', async () => {
		disk.peers = [other];
		await mount();
		await fireEvent.click(row('alfa.txt'));
		await fireEvent.click(row('beta.txt'), { ctrlKey: true });
		await menuItem(row('beta.txt'), 'Invia a PC2');

		await waitFor(() =>
			expect(disk.sent).toEqual([{ peer: 'PC2-ab12', paths: ['C:\\alfa.txt', 'C:\\beta.txt'] }])
		);
		expect(await screen.findByText('2 elementi inviati a PC2.')).toBeTruthy();
	});

	it('incoming files ask for consent, and can be refused', async () => {
		await mount();
		listeners.get('lan-request')?.({
			payload: { id: 7, from: 'PC2', count: 2, total: 2048, names: ['a.txt', 'b.txt'] }
		});
		const incoming = await screen.findByRole('dialog', { name: 'File in arrivo' });
		expect(within(incoming).getByText('a.txt')).toBeTruthy();
		// Focus starts on Rifiuta: an instinctive Enter accepts nothing.
		expect(document.activeElement?.textContent).toBe('Rifiuta');

		await fireEvent.click(within(incoming).getByRole('button', { name: 'Rifiuta' }));
		await waitFor(() => expect(disk.answers).toEqual([{ id: 7, accept: false, folder: null }]));
		expect(screen.queryByRole('dialog', { name: 'File in arrivo' })).toBeNull();
	});

	it('before accepting you choose where to save them', async () => {
		await mount();
		listeners.get('lan-request')?.({
			payload: { id: 9, from: 'PC2', count: 1, total: 10, names: ['setup.exe'] }
		});
		const incoming = await screen.findByRole('dialog', { name: 'File in arrivo' });
		disk.pickedFolder = 'D:\\Eccezioni';
		await fireEvent.click(within(incoming).getByRole('button', { name: 'Cambia cartella…' }));
		expect(await within(incoming).findByText('D:\\Eccezioni')).toBeTruthy();
		// Cancelling the picker keeps the choice made.
		disk.pickedFolder = null;
		await fireEvent.click(within(incoming).getByRole('button', { name: 'Cambia cartella…' }));
		await fireEvent.click(within(incoming).getByRole('button', { name: 'Accetta' }));
		await waitFor(() => expect(disk.answers).toEqual([{ id: 9, accept: true, folder: 'D:\\Eccezioni' }]));
	});

	it('on accepting they arrive and you get to know', async () => {
		await mount();
		listeners.get('lan-request')?.({
			payload: { id: 8, from: 'PC2', count: 1, total: 10, names: ['foto.jpg'] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: 'Accetta' }));
		await waitFor(() => expect(disk.answers).toEqual([{ id: 8, accept: true, folder: null }]));

		listeners.get('lan-received')?.({
			payload: { id: 8, from: 'PC2', folder: 'C:\\Ricevuti', count: 1, error: null }
		});
		expect(await screen.findByText('Ricevuti 1 elemento da PC2 in C:\\Ricevuti.')).toBeTruthy();
	});

	it('the receiver can cancel from the progress bar', async () => {
		await mount();
		listeners.get('lan-receiving')?.({ payload: { id: 9, done: 10, total: 100 } });
		await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
		await waitFor(() => expect(disk.cancelledReceives).toEqual([9]));

		listeners.get('lan-received')?.({
			payload: { id: 9, from: 'PC2', folder: 'C:\\Ricevuti', count: 0, error: null, cancelled: true }
		});
		expect(await screen.findByText('Ricezione da PC2 annullata.')).toBeTruthy();
	});

	it('sharing a folder makes it visible on the network, read-only', async () => {
		await mount();
		await menuItem(row('Dati'), 'Condividi in rete locale');
		await waitFor(() => expect(disk.lan).toEqual({ visible: true, shared: 'C:\\Dati', received: null, addresses: [] }));
		expect(await screen.findByText(/Condivide «Dati»/)).toBeTruthy();

		await menuItem(row('Dati'), 'Smetti di condividere in rete locale');
		await waitFor(() => expect(disk.lan.shared).toBeNull());
	});
});

// ── Startup from Windows ─────────────────────────────────────────────────

describe('startup as the default file manager', () => {
	it('opens the folder passed by Windows instead of C:', async () => {
		disk.initial = { folder: 'C:\\Dati', select: null };
		render(Page);
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		expect(tabs()).toEqual(['Dati']);
	});

	it('with /select it opens the folder and selects the file', async () => {
		disk.initial = { folder: 'C:\\', select: 'C:\\gamma.txt' };
		render(Page);
		await waitFor(() => expect(selected()).toEqual(['gamma.txt']));
	});

	it('a folder opened while the app is already open arrives as a new tab', async () => {
		await mount();
		listeners.get('open-path')?.({
			payload: { window: 'main', dest: { folder: 'C:\\Dati', select: null } }
		});
		await waitFor(() => expect(tabs()).toEqual(['C:', 'Dati']));
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
	});
});

describe('status bar', () => {
	it('says how many items there are and how many are selected, with the right spaces', async () => {
		await mount();
		expect(document.querySelector('.state')?.textContent?.trim()).toBe('7 elementi');
		await fireEvent.click(row('alfa.txt'));
		await waitFor(() =>
			expect(document.querySelector('.state')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
				'1 selezionati · 7 elementi'
			)
		);
	});
});

// ── Several windows ──────────────────────────────────────────────────

describe('several windows', () => {
	it('a new window opens its folder, with a single tab', async () => {
		windowName = 'window-2';
		(window as unknown as { __SPACE_TRAIN_OPEN?: string }).__SPACE_TRAIN_OPEN = 'C:\\Dati';
		render(Page);
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		// The loop that opened tabs forever must not come back.
		await new Promise((r) => setTimeout(r, 100));
		expect(tabs()).toEqual(['Dati']);
	});

	it('a new window without a folder starts from C:', async () => {
		windowName = 'window-2';
		render(Page);
		await waitFor(() => expect(names()).toContain('alfa.txt'));
		expect(tabs()).toEqual(['C:']);
	});

	it('Ctrl+N opens a new window on the current folder', async () => {
		await mount();
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		key('n', { ctrl: true });
		await waitFor(() => expect(disk.windows).toEqual(['C:\\Dati']));
	});

	it('«Apri in una nuova finestra» from the menu of a folder', async () => {
		await mount();
		await menuItem(row('Vuota'), 'Apri in una nuova finestra');
		await waitFor(() => expect(disk.windows).toEqual(['C:\\Vuota']));
	});

	it('a folder from Windows meant for another window does not arrive here', async () => {
		await mount();
		listeners.get('open-path')?.({
			payload: { window: 'window-2', dest: { folder: 'C:\\Dati', select: null } }
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(tabs()).toEqual(['C:']);
	});
});

// ── Quick access ───────────────────────────────────────────────────

describe('quick access', () => {
	const bar = () => document.querySelector<HTMLElement>('.sidebar')!;
	const pinned = () => bar().querySelectorAll('.item.pinned');
	// The name without the pin that precedes it.
	const pinnedNames = () => [...(pinned() ?? [])].map((v) => v.textContent?.replace('📌', '').trim());

	it('a folder is pinned from its menu and appears next to the Windows folders', async () => {
		await mount();
		expect(pinned()).toHaveLength(0);
		await menuItem(row('Dati'), 'Fissa nella barra laterale');
		await waitFor(() => expect(pinnedNames()).toEqual(['Dati']));

		// A click takes us there, wherever we are.
		await enter('Vuota');
		await screen.findByText('Deposito vuoto');
		await fireEvent.click(within(bar()).getByRole('button', { name: /Dati/ }));
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
	});

	it('the open folder is pinned too, from the menu on the background', async () => {
		await mount();
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
		await menuItem(null, 'Fissa nella barra laterale');
		await waitFor(() => expect(pinnedNames()).toEqual(['Dati']));
	});

	it('pinned folders stay after a restart', async () => {
		const { unmount } = await mount();
		await menuItem(row('Dati'), 'Fissa nella barra laterale');
		await waitFor(() => expect(pinnedNames()).toEqual(['Dati']));
		unmount();
		await mount();
		expect(pinnedNames()).toEqual(['Dati']);
	});

	it('from the sidebar menu they are reordered and removed', async () => {
		await mount();
		await menuItem(row('Dati'), 'Fissa nella barra laterale');
		await menuItem(row('Vuota'), 'Fissa nella barra laterale');
		await waitFor(() => expect(pinnedNames()).toEqual(['Dati', 'Vuota']));

		const menuSu = async (name: string, item: string) => {
			const b = within(bar()).getAllByRole('button', { name: new RegExp(name) })[0];
			await fireEvent.contextMenu(b);
			const m = await screen.findByRole('menu');
			await fireEvent.click(within(m).getByRole('menuitem', { name: item }));
		};

		await menuSu('Vuota', 'Sposta su');
		await waitFor(() => expect(pinnedNames()).toEqual(['Vuota', 'Dati']));

		await menuSu('Vuota', 'Togli dalla barra laterale');
		await waitFor(() => expect(pinnedNames()).toEqual(['Dati']));
	});

	it('a pinned folder is a destination for dragging', async () => {
		await mount();
		await menuItem(row('Dati'), 'Fissa nella barra laterale');
		await waitFor(() => expect(pinnedNames()).toEqual(['Dati']));
		const item = within(bar()).getAllByRole('button', { name: /Dati/ })[0];
		document.elementFromPoint = () => item;
		onDrag?.({ payload: { type: 'drop', paths: ['C:\\beta.txt'], position: { x: 1, y: 1 } } });
		await waitFor(() => expect(disk.exists('C:\\Dati\\beta.txt')).toBe(true));
	});

	it('renamed, the folder stays pinned with the new name', async () => {
		await mount();
		await menuItem(row('Vuota'), 'Fissa nella barra laterale');
		await fireEvent.click(row('Vuota'));
		key('F2');
		const field = await renameField();
		field.value = 'Progetti';
		await fireEvent.keyDown(field, { key: 'Enter' });
		await waitFor(() => expect(pinnedNames()).toEqual(['Progetti']));
	});
});

// ── World themes, custom accent, editor ───────────────────────

describe('world themes', () => {
	const cssVariable = (name: string) => document.documentElement.style.getPropertyValue(name);

	it('a world theme changes shapes, font and who parades on the rail', async () => {
		await mount();
		await fromGallery('Kawaii');
		await waitFor(() => expect(cssVariable('--radius')).toBe('24px'));
		expect(cssVariable('--font-display')).toContain('Comic Sans');
		expect(cssVariable('--pattern')).toContain('data:image/svg+xml');
		expect(document.documentElement.dataset.world).toBe('kawaii');
	});

	it('in the Gatti theme the cats parade in place of the train', async () => {
		await mount();
		await fromGallery('Gatti');
		// The first departure happens shortly after startup.
		await waitFor(() => expect(document.querySelectorAll('.marchers .figure').length).toBe(4), { timeout: 3000 });
		expect(document.querySelector('.marchers')?.innerHTML).toContain('#f59e0b');
	});

	it('in colour-only themes the train stays', async () => {
		await mount();
		await fromGallery('Oceano');
		await waitFor(() => expect(document.querySelector('.train')).not.toBeNull(), { timeout: 3000 });
		expect(document.querySelector('.marchers')).toBeNull();
	});
});

describe('custom highlight', () => {
	it('the colour picker sets any accent', async () => {
		await mount();
		const picker = screen.getByLabelText("Colore d'evidenziazione personalizzato");
		await fireEvent.input(picker, { target: { value: '#13a8a8' } });
		await waitFor(() => expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#13a8a8'));
	});
});

describe('theme editor', () => {
	const cssVariable = (name: string) => document.documentElement.style.getPropertyValue(name);

	describe('in its own window', () => {
		const mine: PersonalTheme = {
			...THEMES[0],
			id: 'personale-1',
			name: 'Fuori',
			group: 'personal',
			shapes: { radius: 27 }
		};
		const fromEditor = (payload: unknown) => listeners.get('theme-editor')?.({ payload });

		async function openInWindow() {
			disk.editorInWindow = true;
			await mount();
			await createTheme();
			await waitFor(() => expect(disk.editorOpenings).toBe(1));
		}

		it('it opens in a separate window, not inside the app', async () => {
			await openInWindow();
			expect(screen.queryByRole('dialog', { name: 'Editor dei temi' })).toBeNull();
		});

		it('the preview comes from the window, and closing it makes it go away', async () => {
			await openInWindow();
			fromEditor({ kind: 'preview', theme: mine });
			await waitFor(() => expect(cssVariable('--radius')).toBe('27px'));
			fromEditor({ kind: 'close' });
			await waitFor(() => expect(cssVariable('--radius')).toBe('12px'));
		});

		it('saved in the window, the theme becomes the one in use', async () => {
			await openInWindow();
			fromEditor({ kind: 'save', theme: mine });
			await waitFor(() => expect(cssVariable('--radius')).toBe('27px'));
			// The close that follows the save does not remove it.
			fromEditor({ kind: 'close' });
			const item = await themeInGallery('Fuori');
			expect(item.getAttribute('aria-pressed')).toBe('true');
			expect(cssVariable('--radius')).toBe('27px');
		});
	});

	async function openEditor() {
		await createTheme();
		return screen.findByRole('dialog', { name: 'Editor dei temi' });
	}

	it('the folder style changes live in the list while the editor is open', async () => {
		await mount();
		const editor = await openEditor();
		await fireEvent.change(within(editor).getByLabelText('Cartelle'), { target: { value: 'wagon' } });
		await waitFor(() => expect(row('Dati').querySelector('.drawn-folder circle')).not.toBeNull());

		await fireEvent.click(within(editor).getByRole('button', { name: 'Annulla' }));
		await waitFor(() => expect(row('Dati').querySelector('.drawn-folder circle')).toBeNull());
	});

	it('changes show live and Annulla removes them', async () => {
		await mount();
		const editor = await openEditor();
		await fireEvent.input(within(editor).getByLabelText('Arrotondamento finestre'), { target: { value: '27' } });
		await waitFor(() => expect(cssVariable('--radius')).toBe('27px'));

		await fireEvent.click(within(editor).getByRole('button', { name: 'Annulla' }));
		await waitFor(() => expect(cssVariable('--radius')).toBe('12px'));
	});

	it('a theme is created with colours, shapes and characters, and stays after a restart', async () => {
		const { unmount } = await mount();
		const editor = await openEditor();
		await fireEvent.input(within(editor).getByLabelText('Nome del tema'), { target: { value: 'Il mio mondo' } });
		await fireEvent.input(within(editor).getByLabelText('Evidenziazione'), { target: { value: '#00aa55' } });
		await fireEvent.click(within(editor).getByLabelText('Personaggi inclusi'));
		await fireEvent.click(within(editor).getByRole('button', { name: 'Pinguino' }));
		await fireEvent.click(within(editor).getByRole('button', { name: 'Fantasmino' }));
		await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));

		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editor dei temi' })).toBeNull());
		expect(cssVariable('--accent')).toBe('#00aa55');
		await waitFor(() => expect(document.querySelectorAll('.marchers .figure').length).toBe(2), { timeout: 3000 });
		unmount();

		await mount();
		const item = await themeInGallery('Il mio mondo');
		expect(item.getAttribute('aria-pressed')).toBe('true');
	});

	it('a theme with «Vagoni» animates the rows of the folder that opens', async () => {
		// Full motion here: the suite runs with «reduce motion» on.
		window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
		const animate = vi.fn(() => ({}) as Animation);
		(HTMLElement.prototype as { animate?: unknown }).animate = animate;
		try {
			await mount();
			const editor = await openEditor();
			await fireEvent.change(within(editor).getByLabelText('Animazione aprendo una cartella'), { target: { value: 'wagons' } });
			await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
			expect(animate).not.toHaveBeenCalled();

			await enter('Dati');
			await waitFor(() => expect(animate).toHaveBeenCalled());
			expect(animate.mock.contexts.every((el) => (el as HTMLElement).getAttribute('role') === 'row')).toBe(true);
		} finally {
			delete (HTMLElement.prototype as { animate?: unknown }).animate;
		}
	});

	it('an own theme reopens for editing and can be deleted', async () => {
		await mount();
		let editor = await openEditor();
		await fireEvent.input(within(editor).getByLabelText('Nome del tema'), { target: { value: 'Da buttare' } });
		await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		editor = await openEditor();
		expect(within(editor).getByText('Modifica tema')).toBeTruthy();
		await fireEvent.click(within(editor).getByRole('button', { name: 'Elimina tema' }));
		await waitFor(() => expect(cssVariable('--hull')).toBe('#171420'));
	});

	it('own images are copied into the app and parade on the rail', async () => {
		await mount();
		const editor = await openEditor();
		await fireEvent.click(within(editor).getByLabelText('Le mie immagini'));
		const file = new File([new Uint8Array([71, 73, 70])], 'mio-personaggio.gif', { type: 'image/gif' });
		await fireEvent.change(within(editor).getByLabelText('Aggiungi immagini'), { target: { files: [file] } });
		await waitFor(() => expect(disk.themeImages).toEqual(['mio-personaggio.gif']));
		expect(within(editor).getByText('mio-personaggio.gif')).toBeTruthy();

		await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));
		await waitFor(() => expect(document.querySelector('.marchers img')?.getAttribute('src')).toBe(
			'asset://C:\\DatiApp\\temi-immagini\\mio-personaggio.gif'
		), { timeout: 3000 });
	});
});

// ── Spritesheet ──────────────────────────────────────────────────────

describe('spritesheets in themes', () => {
	/**
	 * jsdom does not decode images: a fake Image that claims to be a strip
	 * of 8 frames of 32×32.
	 */
	function fakeImage(width: number, height: number) {
		const original = window.Image;
		class FakeImage {
			src = '';
			naturalWidth = width;
			naturalHeight = height;
			decode() {
				return Promise.resolve();
			}
		}
		(window as unknown as { Image: unknown }).Image = FakeImage;
		return () => ((window as unknown as { Image: unknown }).Image = original);
	}

	async function editorWithFile(name: string) {
		await createTheme();
		const editor = await screen.findByRole('dialog', { name: 'Editor dei temi' });
		await fireEvent.click(within(editor).getByLabelText('Le mie immagini'));
		const file = new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
		await fireEvent.change(within(editor).getByLabelText('Aggiungi immagini'), { target: { files: [file] } });
		return editor;
	}

	it('a strip of frames is recognised and walks on the rail in steps', async () => {
		const restore = fakeImage(256, 32);
		try {
			await mount();
			const editor = await editorWithFile('camminata.png');
			const checked = (await within(editor).findByLabelText('Spritesheet camminata.png')) as HTMLInputElement;
			await waitFor(() => expect(checked.checked).toBe(true));
			expect((within(editor).getByLabelText('Fotogrammi di camminata.png') as HTMLInputElement).value).toBe('8');
			expect(within(editor).getByLabelText('Anteprima di camminata.png').getAttribute('style')).toContain('sprite-0-1-2-3-4-5-6-7');

			await fireEvent.input(within(editor).getByLabelText('Velocità di camminata.png'), { target: { value: '16' } });

			// Bigger on the rail: 90 tall, and then 45 wide instead of proportional.
			await fireEvent.input(within(editor).getByLabelText('Altezza sul binario di camminata.png'), { target: { value: '90' } });
			const wide = within(editor).getByLabelText('Larghezza sul binario di camminata.png') as HTMLInputElement;
			expect(wide.value).toBe('90');
			expect(wide.disabled).toBe(true);
			await fireEvent.click(within(editor).getByLabelText('Larghezza proporzionale di camminata.png'));
			expect(wide.disabled).toBe(false);
			await fireEvent.change(wide, { target: { value: '45' } });
			// The preview stays 48 tall, with the same proportions.
			expect(within(editor).getByLabelText('Anteprima di camminata.png').getAttribute('style')).toMatch(/width:\s*24px/);

			await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));

			await waitFor(
				() => expect(document.querySelector('.marchers .sprite')?.getAttribute('style')).toContain('sprite-0-1-2-3-4-5-6-7'),
				{ timeout: 3000 }
			);
			const st = document.querySelector('.marchers .sprite')!.getAttribute('style')!;
			// 8 frames at 16 fps: half a second per loop.
			expect(st).toMatch(/animation-duration:\s*0\.5s/);
			expect(st).toMatch(/image-rendering:\s*pixelated/);
			expect(st).toMatch(/width:\s*45px/);
			expect(st).toMatch(/height:\s*90px/);
			// The rail rises so as not to cut it.
			expect((document.querySelector('.line') as HTMLElement).style.height).toBe('100px');
			// And above the rail space is made, so it does not leave the window: 90 + 10 −
			// 40.
			expect((document.querySelector('.main-line') as HTMLElement).style.paddingTop).toBe('60px');
			// The Windows path arrives whole inside url(), backslashes included.
			expect(st).toContain('temi-immagini');
		} finally {
			restore();
		}
	});

	it('16 frames laid out in rows and columns are all taken, row by row', async () => {
		// Square: it starts as a plain image, the spritesheet is turned on.
		const restore = fakeImage(128, 128);
		try {
			await mount();
			const editor = await editorWithFile('griglia.png');
			const checked = (await within(editor).findByLabelText('Spritesheet griglia.png')) as HTMLInputElement;
			await fireEvent.click(checked);
			const field = async (name: string) => (await within(editor).findByLabelText(`${name} di griglia.png`)) as HTMLInputElement;

			await fireEvent.input(await field('Righe della griglia'), { target: { value: '4' } });
			await fireEvent.input(await field('Colonne della griglia'), { target: { value: '4' } });
			// Changing the grid all the cells are used.
			expect((await field('Fotogrammi')).value).toBe('16');
			expect(within(editor).getByText(/Fotogramma 32×32 px/)).toBeTruthy();
			expect((await field('Ordine dei fotogrammi')).value).toBe('1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16');

			const st = within(editor).getByLabelText('Anteprima di griglia.png').getAttribute('style')!;
			expect(st).toMatch(/width:\s*48px/);
			expect(st).toMatch(/animation-name:\s*sprite-g4-0-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15;/);
			// In the keyframes the fifth frame is the first cell of the second row.
			const css = document.querySelector('style[data-sprite^="sprite-g4-0-1-2-3-4"]')!.textContent!;
			expect(css).toContain('25.0000%{background-position:calc(var(--x) - var(--step) * 0) calc(var(--y) - var(--step-y) * 1)}');

			// On the sheet the numbers follow the grid: 5 sits below 1.
			const cells = [...editor.querySelectorAll('.zone .cell')] as HTMLElement[];
			expect(cells).toHaveLength(16);
			expect(cells.map((c) => c.textContent)).toEqual(Array.from({ length: 16 }, (_, k) => String(k + 1)));
			expect(cells[4].style.left).toBe(cells[0].style.left);
			expect(cells[4].style.top).not.toBe(cells[0].style.top);

			// Last row incomplete: 15.
			await fireEvent.input(await field('Fotogrammi'), { target: { value: '15' } });
			expect((await field('Colonne della griglia')).value).toBe('4');
			expect(editor.querySelectorAll('.zone .number')).toHaveLength(15);
		} finally {
			restore();
		}
	});

	it('frames by hand: one is picked, resized, a new one is drawn and it walks on the rail', async () => {
		// 130×65 at zoom 4: one pixel of the sheet is four on screen. Strip of two of 65.
		const restore = fakeImage(130, 65);
		try {
			await mount();
			const editor = await editorWithFile('onda.png');
			await waitFor(() => expect((within(editor).getByLabelText('Spritesheet onda.png') as HTMLInputElement).checked).toBe(true));

			// The space between the cells changes the step of the
			// animation.
			await fireEvent.input(within(editor).getByLabelText('Spazio orizzontale fra i fotogrammi di onda.png'), { target: { value: '5' } });
			expect(within(editor).getByText(/Fotogramma 62.5×65 px/)).toBeTruthy();
			await fireEvent.input(within(editor).getByLabelText('Spazio orizzontale fra i fotogrammi di onda.png'), { target: { value: '0' } });

			await fireEvent.click(within(editor).getByLabelText('Fotogrammi a mano di onda.png'));
			const tiles = () => editor.querySelectorAll('.box');
			expect(tiles()).toHaveLength(2);
			expect(within(editor).getByText(/2 fotogrammi\./)).toBeTruthy();

			const sheet = within(editor).getByRole('grid', { name: 'Foglio di onda.png' });
			const pull = async (el: Element, from: [number, number], a: [number, number]) => {
				await fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: from[0] * 4, clientY: from[1] * 4 });
				await fireEvent.pointerMove(sheet, { pointerId: 1, clientX: a[0] * 4, clientY: a[1] * 4 });
				await fireEvent.pointerUp(sheet, { pointerId: 1 });
			};

			// Click on the second: it becomes the chosen one.
			await pull(within(editor).getByLabelText('Fotogramma 2 di onda.png'), [100, 30], [100, 30]);
			expect(within(editor).getByText('n. 2: 65×65 px da 65,0')).toBeTruthy();
			// It is shortened from the bottom: a frame lower than the
			// others.
			await pull(within(editor).getByLabelText('Bordo inferiore del fotogramma di onda.png'), [97, 65], [97, 32]);
			expect(within(editor).getByText('n. 2: 65×32 px da 65,0')).toBeTruthy();

			// In the empty space a new one is drawn, at the end of the list.
			await pull(sheet, [70, 40], [120, 60]);
			expect(tiles()).toHaveLength(3);
			expect(within(editor).getByText('n. 3: 50×20 px da 70,40')).toBeTruthy();
			expect((within(editor).getByLabelText('Ordine dei fotogrammi di onda.png') as HTMLInputElement).value).toBe('1, 2, 3');
			// And it is removed.
			await fireEvent.click(within(editor).getByLabelText('Togli il fotogramma 3 di onda.png'));
			expect(tiles()).toHaveLength(2);

			const preview = within(editor).getByLabelText('Anteprima di onda.png').getAttribute('style')!;
			expect(preview).toMatch(/--sx:/);
			expect(preview).toMatch(/animation-name:\s*sprite-r\w+/);

			await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));
			await waitFor(() => expect(document.querySelector('.marchers .sprite')?.getAttribute('style')).toMatch(/sprite-r/), { timeout: 3000 });
			const st = document.querySelector('.marchers .sprite')!.getAttribute('style')!;
			const name = st.match(/animation-name:\s*(sprite-r\w+)/)![1];
			const css = document.querySelector(`style[data-sprite="${name}"]`)!.textContent!;
			// Each stage also changes the size: the second is half as tall.
			expect(css).toContain('width:calc(var(--sx) * 65px);height:calc(var(--sy) * 65px)');
			expect(css).toContain('width:calc(var(--sx) * 65px);height:calc(var(--sy) * 32px)');
		} finally {
			restore();
		}
	});

	it('the background is removed with a button, with the colour from the corners or from the eyedropper', async () => {
		const restore = fakeImage(4, 2);
		try {
			await mount();
			writtenPngs.length = 0;
			const editor = await editorWithFile('omino.png');
			await waitFor(() => expect((within(editor).getByLabelText('Spritesheet omino.png') as HTMLInputElement).checked).toBe(true));

			await fireEvent.click(within(editor).getByRole('button', { name: 'Togli lo sfondo' }));
			// The result is a new PNG; the character now uses that one.
			await within(editor).findByLabelText('Spritesheet omino-trasparente.png');
			expect(disk.themeImages).toEqual(['omino.png', 'omino-trasparente.png']);
			const alfa = (img: { data: Uint8ClampedArray }) => [...img.data].filter((_, k) => k % 4 === 3);
			// White of the corners removed, the two red pixels stay.
			expect(alfa(writtenPngs[0])).toEqual([0, 255, 255, 0, 0, 0, 0, 0]);
			expect(within(editor).getByText(/Sfondo tolto: 6 pixel/)).toBeTruthy();
			expect(within(editor).getByLabelText('Anteprima di omino-trasparente.png').getAttribute('style')).toContain('omino-trasparente.png');

			// Eyedropper on the red pixel: red is removed, always starting from the original.
			await fireEvent.click(within(editor).getByRole('button', { name: 'Contagocce' }));
			const sheet = within(editor).getByRole('grid', { name: 'Foglio di omino-trasparente.png' });
			// Sheet of 4 px at zoom 16: the pixel (1, 0) sits between 16
			// and 32.
			await fireEvent.pointerDown(sheet, { button: 0, pointerId: 1, clientX: 21, clientY: 5 });
			await waitFor(() =>
				expect((within(editor).getByLabelText('Colore dello sfondo di omino-trasparente.png') as HTMLInputElement).value).toBe('#c81e1e')
			);
			await fireEvent.click(within(editor).getByRole('button', { name: 'Togli lo sfondo' }));
			await waitFor(() => expect(writtenPngs).toHaveLength(2));
			await waitFor(() => expect((within(editor).getByRole('button', { name: 'Togli lo sfondo' }) as HTMLButtonElement).disabled).toBe(false));
			expect(alfa(writtenPngs[1])).toEqual([255, 0, 0, 255, 255, 255, 255, 255]);

			// Restore: the starting image comes back.
			await fireEvent.click(await within(editor).findByRole('button', { name: 'Ripristina originale' }));
			await within(editor).findByLabelText('Spritesheet omino.png');
		} finally {
			restore();
		}
	});

	it('the zone is drawn, pulled from edges and corners and moved, without a grid', async () => {
		// 260 px at zoom 2: one pixel of the image is two on screen.
		const restore = fakeImage(260, 130);
		try {
			await mount();
			const editor = await editorWithFile('foglio.png');
			const checked = (await within(editor).findByLabelText('Spritesheet foglio.png')) as HTMLInputElement;
			await waitFor(() => expect(checked.checked).toBe(true));

			const sheet = within(editor).getByRole('grid', { name: 'Foglio di foglio.png' });
			const values = () =>
				['X', 'Y', 'Larghezza', 'Altezza'].map(
					(c) => (within(editor).getByLabelText(`${c} della zona di foglio.png`) as HTMLInputElement).value
				);
			/** Dragged from one point to another, in image pixels. */
			const pull = async (el: Element, from: [number, number], a: [number, number]) => {
				await fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: from[0] * 2, clientY: from[1] * 2 });
				await fireEvent.pointerMove(sheet, { pointerId: 1, clientX: a[0] * 2, clientY: a[1] * 2 });
				await fireEvent.pointerUp(sheet, { pointerId: 1 });
			};
			const handle = (n: string) => within(editor).getByLabelText(`${n} della zona di foglio.png`);

			// At the start the zone covers the whole sheet: dragging inside it a
			// new one is drawn, from (10, 10) to (110, 40).
			await pull(within(editor).getByLabelText('Zona di foglio.png'), [10, 10], [110, 40]);
			expect(values()).toEqual(['10', '10', '100', '30']);
			await fireEvent.input(within(editor).getByLabelText('Fotogrammi di foglio.png'), { target: { value: '4' } });
			expect(within(editor).getByText(/Fotogramma 25×30 px/)).toBeTruthy();

			// The bottom right corner widens in both directions.
			await pull(handle('Angolo in basso a destra'), [110, 40], [150, 70]);
			expect(values()).toEqual(['10', '10', '140', '60']);
			// The left edge stops at the edge of the sheet, the right one stays
			// where it is.
			await pull(handle('Bordo sinistro'), [10, 40], [-50, 40]);
			expect(values()).toEqual(['0', '10', '150', '60']);
			// The top edge goes up.
			await pull(handle('Bordo superiore'), [75, 10], [75, -100]);
			expect(values()).toEqual(['0', '0', '150', '70']);
			// It narrows as much as you want, down to one pixel.
			await pull(handle('Bordo inferiore'), [75, 70], [75, -20]);
			expect(values()[3]).toBe('1');
			await pull(handle('Bordo inferiore'), [75, 1], [75, 50]);
			expect(values()).toEqual(['0', '0', '150', '50']);

			// Dragged inside the zone: it all moves, without leaving the sheet.
			await pull(within(editor).getByLabelText('Zona di foglio.png'), [50, 30], [500, 500]);
			expect(values()).toEqual(['110', '80', '150', '50']);

			// Preview at 48 px: it starts from the corner of the zone and takes
			// four steps.
			const st = within(editor).getByLabelText('Anteprima di foglio.png').getAttribute('style')!;
			expect(st).toMatch(/--x:\s*-105\.6px/);
			expect(st).toMatch(/--y:\s*-76\.8px/);
			expect(st).toMatch(/animation-name:\s*sprite-0-1-2-3;/);

			// Walk of three: still between one step and the next, from the button or
			// by hand.
			await fireEvent.input(within(editor).getByLabelText('Fotogrammi di foglio.png'), { target: { value: '3' } });
			await fireEvent.click(within(editor).getByRole('button', { name: 'Fermo tra i passi' }));
			const order = within(editor).getByLabelText('Ordine dei fotogrammi di foglio.png') as HTMLInputElement;
			expect(order.value).toBe('2, 1, 3, 1');
			expect(within(editor).getByLabelText('Anteprima di foglio.png').getAttribute('style')).toMatch(/animation-name:\s*sprite-1-0-2-0;/);
			await fireEvent.change(order, { target: { value: '3 1 2 1 9' } });
			expect(order.value).toBe('3, 1, 2, 1');
			// The keyframes of that sequence are in the page, one still frame per stage.
			const css = document.querySelector('style[data-sprite="sprite-2-0-1-0"]')!.textContent!;
			expect(css).toContain('0.0000%{background-position:calc(var(--x) - var(--step) * 2) var(--y)}');
			expect(css).toContain('25.0000%{background-position:calc(var(--x) - var(--step) * 0) var(--y)}');
			expect(css).toContain('50.0000%{background-position:calc(var(--x) - var(--step) * 1) var(--y)}');
			expect(within(editor).getByLabelText('Anteprima di foglio.png').getAttribute('style')).toMatch(/animation-name:\s*sprite-2-0-1-0;/);
			await fireEvent.click(within(editor).getByRole('button', { name: 'Di fila' }));
			expect(order.value).toBe('1, 2, 3');

			// By hand from the fields too.
			await fireEvent.change(within(editor).getByLabelText('Larghezza della zona di foglio.png'), { target: { value: '9999' } });
			expect(values()[2]).toBe('150');

			// Back to a plain image.
			await fireEvent.click(checked);
			await waitFor(() => expect(within(editor).queryByLabelText('Fotogrammi di foglio.png')).toBeNull());
		} finally {
			restore();
		}
	});
});

// ── Mouse selection, session, startup folders ────────────────

describe('selection on empty space', () => {
	const empty = () => document.querySelector<HTMLElement>('.viewport')!;

	it('a click on the empty space clears the selection', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		await waitFor(() => expect(selected()).toEqual(['alfa.txt']));
		await fireEvent.mouseDown(empty(), { button: 0 });
		await fireEvent.mouseUp(window);
		await waitFor(() => expect(selected()).toEqual([]));
	});

	it('with Ctrl a click on empty space leaves the selection as it was', async () => {
		await mount();
		await fireEvent.click(row('alfa.txt'));
		await fireEvent.mouseDown(empty(), { button: 0, ctrlKey: true });
		await fireEvent.mouseUp(window);
		expect(selected()).toEqual(['alfa.txt']);
	});
});

describe('startup with the tabs', () => {
	it('the folders pinned for startup each open in a tab', async () => {
		localStorage.setItem(
			'space-train.impostazioni',
			JSON.stringify({ cartelleAvvio: ['C:\\Dati', 'C:\\Vuota'] })
		);
		render(Page);
		await waitFor(() => expect(tabs()).toEqual(['Dati', 'Vuota']));
	});

	it('with the session on the tabs of last time come back, and the one that was in front', async () => {
		localStorage.setItem('space-train.impostazioni', JSON.stringify({ sessione: true }));
		localStorage.setItem(
			'space-train.sessione',
			JSON.stringify({ schede: ['C:\\', 'C:\\Dati', 'C:\\non-esiste-piu'], attiva: 1 })
		);
		render(Page);
		// The folder that disappeared is skipped.
		await waitFor(() => expect(tabs()).toEqual(['C:', 'Dati']));
		await waitFor(() => expect(names()).toEqual(['interno.txt']));
	});

	it('without a session it starts again from the start page', async () => {
		localStorage.setItem('space-train.sessione', JSON.stringify({ schede: ['C:\\Dati'], attiva: 0 }));
		await mount();
		expect(tabs()).toEqual(['C:']);
	});
});

// ── What is new after an update ──────────────────────────────────────

describe('what is new after an update', () => {
	it('at the first opening of the new version it explains what changed, only once', async () => {
		disk.appVersion = '0.2.2';
		localStorage.setItem('space-train.versione-vista', '0.2.1');
		const { unmount } = await mount();
		const dialog = await screen.findByRole('dialog', { name: 'Novità di Space Train' });
		expect(dialog.textContent).toContain('0.2.2');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Ho capito' }));
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novità di Space Train' })).toBeNull());
		expect(localStorage.getItem('space-train.versione-vista')).toBe('0.2.2');

		unmount();
		await mount();
		await new Promise((r) => setTimeout(r, 20));
		expect(screen.queryByRole('dialog', { name: 'Novità di Space Train' })).toBeNull();
	});

	it('to whoever installs the app for the first time it shows nothing', async () => {
		disk.appVersion = '0.2.2';
		await mount();
		await waitFor(() => expect(localStorage.getItem('space-train.versione-vista')).toBe('0.2.2'));
		expect(screen.queryByRole('dialog', { name: 'Novità di Space Train' })).toBeNull();
	});

	it('to whoever installs the app for the first time it offers the welcome guide, once and skippable', async () => {
		disk.appVersion = '0.2.2';
		const { unmount } = await mount();
		const guide = await screen.findByRole('dialog', { name: 'Benvenuto in Space Train' });
		await fireEvent.click(within(guide).getByRole('button', { name: 'Salta' }));
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Benvenuto in Space Train' })).toBeNull());

		unmount();
		localStorage.removeItem('space-train.versione-vista');
		await mount();
		await new Promise((r) => setTimeout(r, 20));
		expect(screen.queryByRole('dialog', { name: 'Benvenuto in Space Train' })).toBeNull();
	});

	it('who already used the app does not get the guide after an update', async () => {
		disk.appVersion = '0.2.2';
		localStorage.setItem('space-train.versione-vista', '0.2.1');
		await mount();
		await screen.findByRole('dialog', { name: 'Novità di Space Train' });
		expect(screen.queryByRole('dialog', { name: 'Benvenuto in Space Train' })).toBeNull();
	});
});

// ── PCs added by address ─────────────────────────────────────────────

describe('PCs added by address', () => {
	const bar = () => document.querySelector<HTMLElement>('.sidebar')!;

	it('an address is added from the sidebar, and whoever adds it becomes visible', async () => {
		await mount();
		await fireEvent.click(await within(bar()).findByRole('button', { name: 'Aggiungi PC per indirizzo' }));
		const field = within(bar()).getByRole('textbox', { name: 'Indirizzo del PC da aggiungere' }) as HTMLInputElement;
		await fireEvent.input(field, { target: { value: '100.64.0.2' } });
		await fireEvent.submit(field.closest('form')!);

		await waitFor(() => expect(disk.lan.addresses).toEqual(['100.64.0.2']));
		expect(disk.lan.visible).toBe(true);
		expect(bar().textContent).toContain('100.64.0.2');
	});

	it('it is removed with the small cross', async () => {
		disk.lan = { visible: true, shared: null, received: null, addresses: ['100.64.0.2'] };
		await mount();
		await fireEvent.click(await within(bar()).findByRole('button', { name: 'Togli 100.64.0.2' }));
		await waitFor(() => expect(disk.lan.addresses).toEqual([]));
	});
});

describe('friends', () => {
	const code = 'k'.repeat(52);
	const anna = { id: code, name: 'Anna', status: 'confirmed' as const, share: false, online: true };

	/** A friend who shares a folder with photos and a document. */
	function withAnna() {
		disk.friends = [{ ...anna }];
		for (const [p, dir] of [
			[`::amici\\${code}`, true],
			[`::amici\\${code}\\Foto`, true],
			[`::amici\\${code}\\relazione.docx`, false]
		] as const) {
			disk.nodes.set(p, { kind: dir ? 'dir' : 'file', size: 100, hidden: false, modified: 0 });
		}
	}

	it('from the panel you see your own code and ask for a friendship', async () => {
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi amici' }));
		const pane = await screen.findByRole('dialog', { name: 'Amici' });
		// The code is read in groups of four.
		expect(within(pane).getByText(/^codi-ce-d/)).toBeTruthy();

		await fireEvent.input(within(pane).getByRole('textbox', { name: "Codice dell'amico" }), {
			target: { value: code }
		});
		await fireEvent.click(within(pane).getByRole('button', { name: 'Chiedi amicizia' }));
		await waitFor(() => expect(disk.friends.map((a) => a.status)).toEqual(['sent']));
	});

	it('a received request is accepted from the panel', async () => {
		disk.friends = [{ ...anna, status: 'received', online: false }];
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: '1 richiesta d’amicizia' }));
		const pane = await screen.findByRole('dialog', { name: 'Amici' });
		await fireEvent.click(within(pane).getByRole('button', { name: 'Accetta' }));
		await waitFor(() => expect(disk.friends[0].status).toBe('confirmed'));
	});

	it('the incoming request gets noticed', async () => {
		await mount();
		listeners.get('friend-request')?.({ payload: { id: code, name: 'Anna' } });
		expect(await screen.findByText(/Anna ti ha chiesto l’amicizia/)).toBeTruthy();
	});

	it('the folder of a friend can be browsed, with her name in the path', async () => {
		withAnna();
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: /Anna/ }));
		await waitFor(() => expect(names()).toEqual(['Foto', 'relazione.docx']));
		expect(screen.getAllByText('Anna').length).toBeGreaterThan(0);
		expect(screen.queryByText(code)).toBeNull();

		await fireEvent.dblClick(row('relazione.docx'));
		await waitFor(() => expect(disk.opened).toEqual([`::amici\\${code}\\relazione.docx`]));
	});

	it('Invia a sends the selection to the friend', async () => {
		withAnna();
		await mount();
		await screen.findByRole('button', { name: /Anna/ });
		await fireEvent.click(row('alfa.txt'));
		await menuItem(row('alfa.txt'), 'Invia a Anna');
		await waitFor(() => expect(disk.sent).toEqual([{ peer: '@' + code, paths: ['C:\\alfa.txt'] }]));
	});

	it('backup: a folder is chosen, runs on request, and stops', async () => {
		withAnna();
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: 'Gestisci amici' }));
		let pane = await screen.findByRole('dialog', { name: 'Amici' });
		disk.pickedFolder = 'C:\\Dati';
		await fireEvent.click(within(pane).getByRole('button', { name: 'Tieni allineata una cartella…' }));
		await waitFor(() => expect(disk.friends[0].backup?.folder).toBe('C:\\Dati'));

		// The window follows the «amici» event, as Rust sends it after a change.
		listeners.get('friends')?.({ payload: { code: disk.friendsCode, ready: true, friends: disk.friends } });
		pane = await screen.findByRole('dialog', { name: 'Amici' });
		expect(await within(pane).findByText(/Backup di «Dati» ogni giorno · non ancora fatto/)).toBeTruthy();
		await fireEvent.click(within(pane).getByRole('button', { name: 'Allinea ora' }));
		await waitFor(() => expect(disk.backupsDone).toEqual([code]));
		await fireEvent.click(within(pane).getByRole('button', { name: 'Smetti il backup verso Anna' }));
		await waitFor(() => expect(disk.friends[0].backup).toBeUndefined());
	});

	it('a friend asking to keep a backup here is told, and accepted from Friends', async () => {
		withAnna();
		disk.friends[0].guest = { consent: 'asked', folder: null, last: null };
		await mount();
		listeners.get('friend-backup')?.({ payload: { id: code, name: 'Anna' } });
		expect(await screen.findByText(/Anna vuole tenere un backup su questo PC/)).toBeTruthy();

		await fireEvent.click(await screen.findByRole('button', { name: 'Gestisci amici' }));
		const request = within(await screen.findByRole('dialog', { name: 'Amici' })).getByRole('group', { name: 'Backup di Anna' });
		await fireEvent.click(within(request).getByRole('button', { name: 'Accetta' }));
		await waitFor(() => expect(disk.friends[0].guest).toEqual({ consent: 'yes', folder: null, last: null }));
	});

	it('removing a friend asks for confirmation', async () => {
		withAnna();
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: 'Gestisci amici' }));
		const pane = await screen.findByRole('dialog', { name: 'Amici' });
		await fireEvent.click(within(pane).getByRole('button', { name: 'Togli' }));
		expect(disk.friends).toHaveLength(1);
		await fireEvent.click(within(pane).getByRole('button', { name: 'Conferma' }));
		await waitFor(() => expect(disk.friends).toHaveLength(0));
	});
});

// ── Settings ─────────────────────────────────────────────────────

describe('settings', () => {
	async function openSettings(section?: string) {
		await fireEvent.click(screen.getByRole('button', { name: 'Impostazioni' }));
		const f = await screen.findByRole('dialog', { name: 'Impostazioni' });
		if (section) await fireEvent.click(within(f).getByRole('button', { name: section }));
		return f;
	}

	it('the gear opens the sections and Esc closes', async () => {
		await mount();
		const f = await openSettings('Aspetto');
		expect(within(f).getByRole('switch', { name: 'Animazione all’avvio' })).toBeTruthy();
		key('Escape');
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Impostazioni' })).toBeNull());
	});

	it('the shortcuts section lists the keys and filters them', async () => {
		await mount();
		const f = await openSettings('Scorciatoie');
		expect(within(f).getByText('Win+Maiusc+E')).toBeTruthy();
		await fireEvent.input(within(f).getByRole('searchbox'), { target: { value: 'cestino' } });
		expect(within(f).getByText('Sposta nel Cestino')).toBeTruthy();
		expect(within(f).queryByText('Nuova scheda')).toBeNull();
	});

	it('a shortcut is changed only after confirming, with a warning when another action uses it', async () => {
		await mount();
		const f = await openSettings('Scorciatoie');
		await fireEvent.click(within(f).getByRole('button', { name: 'Cambia la scorciatoia di «Apri o chiudi il doppio pannello»' }));
		expect(within(f).getByText('Premi la combinazione nuova… (Esc annulla)')).toBeTruthy();
		await fireEvent.keyDown(window, { key: 'd', code: 'KeyD', ctrlKey: true });

		const c = await within(f).findByRole('alertdialog', { name: 'Conferma scorciatoia' });
		expect(c.textContent).toContain('«Aggiungi ai preferiti»');
		// Nothing changed yet, and the key went to the recording, not to the app.
		expect(document.querySelector('.pane.passive')).toBeNull();
		await fireEvent.click(within(c).getByRole('button', { name: 'Usa Ctrl+D' }));
		await fireEvent.click(within(f).getByRole('button', { name: 'Chiudi le impostazioni' }));

		key('d', { ctrl: true });
		await waitFor(() => expect(document.querySelector('.pane.passive')).not.toBeNull());
	});

	it('refuses keys Windows keeps, warns when another program holds a combination, Esc cancels', async () => {
		disk.takenShortcuts.add('ctrl+shift+KeyO');
		await mount();
		const f = await openSettings('Scorciatoie');
		const change = () => within(f).getByRole('button', { name: 'Cambia la scorciatoia di «Copia»' });

		await fireEvent.click(change());
		await fireEvent.keyDown(window, { key: 'Tab', code: 'Tab', altKey: true });
		expect(await within(f).findByText(/riservata da Windows/)).toBeTruthy();

		await fireEvent.click(change());
		await fireEvent.keyDown(window, { key: 'O', code: 'KeyO', ctrlKey: true, shiftKey: true });
		const c = await within(f).findByRole('alertdialog', { name: 'Conferma scorciatoia' });
		expect(c.textContent).toContain('Un altro programma tiene già Ctrl+Maiusc+O');
		await fireEvent.click(within(c).getByRole('button', { name: 'Annulla' }));
		expect(within(f).queryByRole('alertdialog')).toBeNull();
		expect(within(f).getAllByText('Ctrl+C').length).toBeGreaterThan(0);
	});

	it('without confirmation Del trashes right away', async () => {
		await mount();
		const f = await openSettings('File e cartelle');
		await fireEvent.click(within(f).getByRole('switch', { name: 'Chiedi conferma prima di spostare nel cestino' }));
		await fireEvent.click(within(f).getByRole('button', { name: 'Chiudi le impostazioni' }));

		await fireEvent.click(row('alfa.txt'));
		key('Delete');
		await waitFor(() => expect(disk.trash).toEqual(['C:\\alfa.txt']));
		expect(screen.queryByRole('dialog', { name: 'Conferma eliminazione' })).toBeNull();
	});

	it('with one click a folder opens right away', async () => {
		await mount();
		const f = await openSettings('File e cartelle');
		await fireEvent.click(within(f).getByRole('switch', { name: 'Apri con un clic' }));
		await fireEvent.click(within(f).getByRole('button', { name: 'Chiudi le impostazioni' }));

		await fireEvent.click(row('Dati'));
		await waitFor(() => expect(names()).not.toContain('alfa.txt'));
	});

	it('the folder size is computed for the open folder', async () => {
		await mount();
		expect(row('Dati').querySelector('.size')?.textContent?.trim()).toBe('—');
		const f = await openSettings('File e cartelle');
		await fireEvent.change(within(f).getByLabelText(/Dimensione delle cartelle/), { target: { value: 'open' } });
		await fireEvent.click(within(f).getByRole('button', { name: 'Chiudi le impostazioni' }));

		await waitFor(() => expect(row('Dati').querySelector('.size')?.textContent?.trim()).toBe('2 KB'));
		expect(disk.sized).toContain('C:\\Dati');
	});

	it('on request the folder is weighed only with its Calcola', async () => {
		await mount();
		const f = await openSettings('File e cartelle');
		await fireEvent.change(within(f).getByLabelText(/Dimensione delle cartelle/), { target: { value: 'onRequest' } });
		await fireEvent.click(within(f).getByRole('button', { name: 'Chiudi le impostazioni' }));

		expect(disk.sized).toEqual([]);
		await fireEvent.click(within(row('Dati')).getByRole('button', { name: 'Calcola' }));
		await waitFor(() => expect(row('Dati').querySelector('.size')?.textContent?.trim()).toBe('2 KB'));
	});
});

describe('dual pane', () => {
	it('opens beside the list, F6 switches side, Ctrl+Maiusc+C copies into the other folder', async () => {
		await mount();
		key('D', { ctrl: true, shift: true });
		await waitFor(() => expect(document.querySelector('.pane.passive')).not.toBeNull());

		// Right pane becomes active and goes into Dati.
		key('F6');
		await fireEvent.dblClick(row('Dati'));
		await waitFor(() => expect(names()).toContain('interno.txt'));

		// Back to the left pane (C:), copy alfa.txt across.
		key('F6');
		await waitFor(() => expect(names()[0]).not.toBe('interno.txt'));
		await fireEvent.click(row('alfa.txt'));
		key('C', { ctrl: true, shift: true });
		await waitFor(() => expect(disk.exists('C:\\Dati\\alfa.txt')).toBe(true));
		expect(disk.exists('C:\\alfa.txt')).toBe(true);

		key('D', { ctrl: true, shift: true });
		await waitFor(() => expect(document.querySelector('.pane.passive')).toBeNull());
	});
});

describe('folder comparison', () => {
	it('compares with the other pane, lists the differences, «Allinea» copies them across', async () => {
		add('C:\\Dati\\solo-qui.txt');
		add('C:\\Copia\\');
		add('C:\\Copia\\interno.txt');
		add('C:\\Copia\\solo-la.txt');
		await mount();
		await fireEvent.dblClick(row('Dati'));
		await waitFor(() => expect(names()).toContain('interno.txt'));
		key('D', { ctrl: true, shift: true });
		await waitFor(() => expect(document.querySelector('.pane.passive')).not.toBeNull());
		key('F6');
		await fireEvent.click(document.querySelector('.active-pane .pane-header')!);
		key('ArrowUp', { alt: true });
		await waitFor(() => expect(names()).toContain('Copia'));
		await fireEvent.dblClick(row('Copia'));
		await waitFor(() => expect(names()).toContain('solo-la.txt'));
		key('F6');
		await waitFor(() => expect(names()).toContain('solo-qui.txt'));

		await fireEvent.contextMenu(document.querySelector('.active-pane .viewport')!);
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Confronta con «Copia»' }));

		await screen.findByText(/mancano in Copia/);
		const activeNames = () => [...document.querySelectorAll('.active-pane .row .name')].map((n) => n.textContent);
		await waitFor(() => expect(activeNames()).toEqual(['solo-qui.txt', 'solo-la.txt']));

		await fireEvent.click(screen.getByRole('button', { name: 'Allinea Copia' }));
		await waitFor(() => expect(disk.exists('C:\\Copia\\solo-qui.txt')).toBe(true));
		expect(disk.exists('C:\\Dati\\solo-la.txt')).toBe(false);
	});
});

describe('space analysis', () => {
	it('sorts the folder by size with a bar on every row, weighing folders; Esc leaves it', async () => {
		disk.folderSizes = 5000;
		disk.nodes.get('C:\\gamma.txt')!.size = 10_000;
		await mount();
		await fireEvent.contextMenu(document.querySelector('.viewport')!);
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Analizza spazio' }));

		await waitFor(() => expect(names()[0]).toBe('gamma.txt'));
		await waitFor(() => expect(names()[1]).toBe('Dati'));
		expect(document.querySelectorAll('.fill.share').length).toBeGreaterThan(3);
		expect(screen.getByText('Spazio')).toBeTruthy();

		key('Escape');
		await waitFor(() => expect(document.querySelector('.fill.share')).toBeNull());
		expect(names()[0]).not.toBe('gamma.txt');
	});
});

describe('smart folders', () => {
	it('a type filter finds files with no text, «Salva ricerca» adds a sidebar stop that reopens it', async () => {
		add('C:\\Dati\\film.mp4');
		await mount();
		key('f', { ctrl: true });
		await fireEvent.click(await screen.findByRole('button', { name: 'Sottocartelle' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Filtri' }));
		await fireEvent.click(within(screen.getByRole('group', { name: 'Filtri' })).getByRole('button', { name: 'Video' }));
		await waitFor(() => expect(names()).toEqual(['film.mp4']));

		await fireEvent.click(screen.getByRole('button', { name: 'Salva ricerca' }));
		const stop = await screen.findByRole('button', { name: 'Video in C:' });

		key('Escape');
		await waitFor(() => expect(names()).toContain('alfa.txt'));
		await fireEvent.click(stop);
		await waitFor(() => expect(names()).toEqual(['film.mp4']));
	});
});

describe('colour labels', () => {
	it('a file gets a colour, the sidebar stop lists every labelled item, Esc goes back', async () => {
		await mount();
		await fireEvent.contextMenu(row('beta.txt'));
		await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: 'Rosso' }));
		await waitFor(() => expect(row('beta.txt').querySelector('.color-label')).not.toBeNull());

		const stop = await screen.findByRole('button', { name: /Rosso/ });
		await fireEvent.click(stop);
		await waitFor(() => expect(names()).toEqual(['beta.txt']));
		expect(screen.getByText('Etichetta Rosso')).toBeTruthy();

		key('Escape');
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});
	it('right-click on a label stop renames it, and the menu shows the new name', async () => {
		await mount();
		await fireEvent.contextMenu(row('beta.txt'));
		await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: 'Rosso' }));
		const stop = await screen.findByRole('button', { name: /Rosso/ });
		await fireEvent.contextMenu(stop);
		const field = await screen.findByLabelText("Nome dell'etichetta Rosso");
		await fireEvent.input(field, { target: { value: 'Lavoro' } });
		await fireEvent.keyDown(field, { key: 'Enter' });
		await fireEvent.blur(field);
		await screen.findByRole('button', { name: /Lavoro/ });

		await fireEvent.contextMenu(row('alfa.txt'));
		expect(within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: 'Lavoro' })).toBeTruthy();
	});
});

describe('media columns', () => {
	it('a folder of photos shows date taken and size, sorts by them, and the columns can be switched off', async () => {
		add('C:\\Foto\\');
		add('C:\\Foto\\a.jpg');
		add('C:\\Foto\\b.jpg');
		add('C:\\Foto\\c.jpg');
		disk.media.set('C:\\Foto\\a.jpg', { taken: Date.UTC(2024, 5, 1), width: 400, height: 300 });
		disk.media.set('C:\\Foto\\b.jpg', { taken: Date.UTC(2025, 0, 1), width: 800, height: 600 });
		await mount();
		await fireEvent.dblClick(row('Foto'));
		await waitFor(() => expect(names()).toEqual(['a.jpg', 'b.jpg', 'c.jpg']));
		await waitFor(() => expect(row('b.jpg').textContent).toContain('800×600'));

		// Newest first, the photo without a date last.
		await fireEvent.click(screen.getByRole('button', { name: 'Ordina per scattata il' }));
		await waitFor(() => expect(names()).toEqual(['b.jpg', 'a.jpg', 'c.jpg']));

		await fireEvent.contextMenu(document.querySelector('.board')!);
		await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitemcheckbox', { name: 'Scattata il' }));
		await waitFor(() => expect(screen.queryByRole('button', { name: /scattata il/i })).toBeNull());
		expect(names()).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
	});
});

describe('remote servers', () => {
	it('adds a server from the sidebar, asks the password when the server wants it, then lists its files', async () => {
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi server' }));
		const dialog = await screen.findByRole('dialog', { name: 'Aggiungi server' });
		await fireEvent.click(within(dialog).getByRole('radio', { name: 'FTP' }));
		expect(within(dialog).getByText(/non è cifrato/)).toBeTruthy();
		await fireEvent.click(within(dialog).getByRole('radio', { name: 'SFTP' }));
		await fireEvent.input(within(dialog).getByLabelText('Indirizzo'), { target: { value: 'nas.casa' } });
		await fireEvent.input(within(dialog).getByLabelText('Utente'), { target: { value: 'io' } });
		add('::server\\s1\\');
		add('::server\\s1\\foto.jpg');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Aggiungi' }));

		// No password given: the server asks for it.
		const prompt = await screen.findByRole('dialog', { name: 'Password per «nas.casa»' });
		expect(disk.server[0]).toMatchObject({ host: 'nas.casa', protocol: 'sftp', port: 22, user: 'io' });
		await fireEvent.input(within(prompt).getByLabelText(/Password/), { target: { value: 'segreta' } });
		await fireEvent.click(within(prompt).getByRole('button', { name: 'Collegati' }));
		await waitFor(() => expect(names()).toEqual(['foto.jpg']));
		expect(document.querySelector('.item[title="SFTP · io@nas.casa"]')?.classList.contains('current')).toBe(true);
	});
});

describe('vault', () => {
	it('asks the password, refuses a wrong one, lists the items, and locks back to the folder', async () => {
		add('C:\\Privato.cassaforte\\');
		disk.vaults.set('C:\\Privato.cassaforte', {
			password: 'giusta-123',
			open: false,
			items: [
				{ path: 'Banca', size: 0, dir: true, modified: 0 },
				{ path: 'Banca/estratto.pdf', size: 10, dir: false, modified: 0 },
				{ path: 'codici.txt', size: 5, dir: false, modified: 0 }
			]
		});
		await mount();
		await fireEvent.dblClick(row('Privato.cassaforte'));
		const dialog = await screen.findByRole('dialog', { name: 'Apri «Privato»' });
		const field = within(dialog).getByLabelText('Password');
		await fireEvent.input(field, { target: { value: 'sbagliata' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Apri' }));
		expect((await within(dialog).findByRole('alert')).textContent).toContain('Password sbagliata');

		await fireEvent.input(field, { target: { value: 'giusta-123' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Apri' }));
		await waitFor(() => expect(names()).toEqual(['Banca', 'codici.txt']));
		expect(document.querySelector('.lock-in')?.textContent).toMatch(/si chiude fra \d+:\d\d/);

		await fireEvent.dblClick(row('Banca'));
		await waitFor(() => expect(names()).toEqual(['estratto.pdf']));

		await fireEvent.click(document.querySelector('.lock-in')!);
		await waitFor(() => expect(names()).toContain('alfa.txt'));
		expect(disk.vaults.get('C:\\Privato.cassaforte')?.open).toBe(false);
	});

	it('«Nuovo → Cassaforte…» checks the two passwords, then opens the new vault', async () => {
		await mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Nuovo' }));
		await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Cassaforte…' }));
		const dialog = await screen.findByRole('dialog', { name: 'Nuova cassaforte' });
		await fireEvent.input(within(dialog).getByLabelText('Nome'), { target: { value: 'Segreti' } });
		await fireEvent.input(within(dialog).getByLabelText('Password'), { target: { value: 'una-password' } });
		await fireEvent.input(within(dialog).getByLabelText('Ripeti la password'), { target: { value: 'un-altra' } });
		const create = within(dialog).getByRole('button', { name: 'Crea cassaforte' }) as HTMLButtonElement;
		expect(create.disabled).toBe(true);
		expect(within(dialog).getByText('Le due password non sono uguali.')).toBeTruthy();

		await fireEvent.input(within(dialog).getByLabelText('Ripeti la password'), { target: { value: 'una-password' } });
		expect(create.disabled).toBe(false);
		await fireEvent.click(create);
		await waitFor(() => expect(document.querySelector('.lock-in')).not.toBeNull());
		expect(disk.vaults.get('C:\\Segreti.cassaforte')?.open).toBe(true);
	});
});

describe('automatic rules', () => {
	it('a folder gets a rule from its menu, the preview counts the matching files, and the folder shows a mark', async () => {
		add('C:\\Dati\\fattura.pdf');
		add('C:\\Archivio\\');
		disk.pickedFolder = 'C:\\Archivio';
		await mount();
		await fireEvent.contextMenu(row('Dati'));
		await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Regole automatiche…' }));
		const dialog = await screen.findByRole('dialog', { name: 'Regole di Dati' });
		await fireEvent.click(within(dialog).getByRole('button', { name: '+ Aggiungi regola' }));

		// Without a destination it cannot be saved.
		expect(within(dialog).getByRole('alert').textContent).toMatch(/destinazione/);
		expect((within(dialog).getByRole('button', { name: 'Salva' }) as HTMLButtonElement).disabled).toBe(true);

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Scegli cartella…' }));
		await within(dialog).findByRole('button', { name: 'Archivio' });
		await waitFor(() => expect(within(dialog).getByText(/corrispondono/).textContent).toContain('1 file'));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));

		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Regole di Dati' })).toBeNull());
		await waitFor(() => expect(row('Dati').querySelector('.has-rules')).not.toBeNull());
		expect(row('Archivio').querySelector('.has-rules')).toBeNull();
	});
});

describe('git status', () => {
	it('marks modified and new items, greys ignored ones, shows the branch; the setting turns it off', async () => {
		disk.git.set('C:\\', {
			branch: 'main',
			ahead: 2,
			behind: 0,
			items: { 'alfa.txt': 'modified', 'beta.txt': 'new', 'gamma.txt': 'ignored' }
		});
		await mount();
		await waitFor(() => expect(row('alfa.txt').querySelector('.git')?.textContent).toBe('M'));
		expect(row('beta.txt').querySelector('.git')?.textContent).toBe('N');
		expect(row('gamma.txt').classList.contains('ignored')).toBe(true);
		expect(row('delta.txt').querySelector('.git')).toBeNull();
		expect(document.querySelector('.branch')?.textContent).toContain('main');
		expect(document.querySelector('.branch')?.textContent).toContain('↑2');

		localStorage.setItem('space-train.impostazioni', JSON.stringify({ git: false }));
		window.dispatchEvent(new StorageEvent('storage', { key: 'space-train.impostazioni', newValue: JSON.stringify({ git: false }) }));
		await waitFor(() => expect(document.querySelector('.branch')).toBeNull());
		expect(row('alfa.txt').querySelector('.git')).toBeNull();
	});
});

describe('workspaces', () => {
	it('saves the open tabs as an area, switches to another and back', async () => {
		await mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Aree di lavoro' }));
		await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Salva come nuova area…' }));
		const dialog = await screen.findByRole('dialog', { name: 'Nuova area di lavoro' });
		await fireEvent.input(within(dialog).getByRole('textbox'), { target: { value: 'Uno' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Salva area' }));
		await screen.findByRole('button', { name: 'Area di lavoro: Uno' });

		// A second area, then open a folder in it.
		await fireEvent.click(screen.getByRole('button', { name: 'Area di lavoro: Uno' }));
		await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Salva come nuova area…' }));
		const d2 = await screen.findByRole('dialog', { name: 'Nuova area di lavoro' });
		await fireEvent.input(within(d2).getByRole('textbox'), { target: { value: 'Due' } });
		await fireEvent.click(within(d2).getByRole('button', { name: 'Salva area' }));
		await fireEvent.dblClick(row('Dati'));
		await waitFor(() => expect(names()).toContain('interno.txt'));

		await fireEvent.click(screen.getByRole('button', { name: 'Area di lavoro: Due' }));
		await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitemcheckbox', { name: /^Uno/ }));
		await waitFor(() => expect(names()).toContain('alfa.txt'));
		await waitFor(() => expect(document.querySelectorAll('.titlebar .tab')).toHaveLength(1));

		await fireEvent.click(screen.getByRole('button', { name: 'Area di lavoro: Uno' }));
		await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitemcheckbox', { name: /^Due/ }));
		await waitFor(() => expect(names()).toContain('interno.txt'));
	});
});

describe('command palette', () => {
	it('Ctrl+Maiusc+P finds an action by typing and Enter runs it', async () => {
		await mount();
		key('P', { ctrl: true, shift: true });
		const dialog = await screen.findByRole('dialog', { name: 'Palette dei comandi' });
		const field = within(dialog).getByRole('combobox');
		await fireEvent.input(field, { target: { value: 'doppio' } });
		expect(within(dialog).getAllByRole('option')[0].textContent).toContain('doppio pannello');
		await fireEvent.keyDown(field, { key: 'Enter' });
		await waitFor(() => expect(document.querySelector('.pane.passive')).not.toBeNull());
		expect(screen.queryByRole('dialog', { name: 'Palette dei comandi' })).toBeNull();
	});

	it('lists folders and settings, Esc closes it', async () => {
		await mount();
		key('P', { ctrl: true, shift: true });
		const dialog = await screen.findByRole('dialog', { name: 'Palette dei comandi' });
		await fireEvent.input(within(dialog).getByRole('combobox'), { target: { value: 'compatta' } });
		expect(within(dialog).getAllByRole('option')[0].textContent).toContain('Vista compatta');
		await fireEvent.keyDown(within(dialog).getByRole('combobox'), { key: 'Escape' });
		expect(screen.queryByRole('dialog', { name: 'Palette dei comandi' })).toBeNull();
	});
});

describe('archive as a folder', () => {
	it('opens a 7z like a folder, walks in and out, extracts a chosen item, Esc leaves', async () => {
		add('C:\\p.7z');
		disk.archives.set('C:\\p.7z', [
			{ path: 'src/a.txt', size: 5, dir: false, modified: 1 },
			{ path: 'README.md', size: 2, dir: false, modified: 1 }
		]);
		await mount();
		await fireEvent.dblClick(row('p.7z'));
		await waitFor(() => expect(names()).toEqual(['src', 'README.md']));
		expect(screen.getByText('p.7z')).toBeTruthy();

		await fireEvent.dblClick(row('src'));
		await waitFor(() => expect(names()).toEqual(['a.txt']));
		key('Backspace');
		await waitFor(() => expect(names()).toEqual(['src', 'README.md']));

		// Nothing that writes works inside the archive.
		await fireEvent.click(row('README.md'));
		key('Delete');
		expect(document.querySelector('[aria-label="Conferma eliminazione"]')).toBeNull();

		await fireEvent.contextMenu(row('README.md'));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Estrai accanto all’archivio' }));
		await waitFor(() => expect(disk.exists('C:\\README.md')).toBe(true));

		key('Escape');
		await waitFor(() => expect(names()).toContain('alfa.txt'));
	});
});

describe('password-protected archive', () => {
	async function type(password: string) {
		const dialog = await screen.findByRole('dialog', { name: 'Apri «p.zip»' });
		await fireEvent.input(dialog.querySelector('input[type="password"]')!, { target: { value: password } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Apri' }));
	}

	it('«Estrai tutto» asks for the password, again when wrong, then extracts', async () => {
		add('C:\\p.zip');
		disk.archivePasswords.set('C:\\p.zip', 'segreta');
		await mount();
		await fireEvent.contextMenu(row('p.zip'));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Estrai tutto' }));
		await type('sbagliata');
		await screen.findByText('Password sbagliata, o archivio danneggiato.');
		expect(disk.exists('C:\\p')).toBe(false);
		await type('segreta');
		await waitFor(() => expect(disk.exists('C:\\p')).toBe(true));
		expect(screen.queryByRole('dialog', { name: 'Apri «p.zip»' })).toBeNull();
	});

	it('opened like a folder it asks once, and giving up shows no error', async () => {
		add('C:\\p.zip');
		disk.archives.set('C:\\p.zip', [{ path: 'a.txt', size: 5, dir: false, modified: 1 }]);
		disk.archivePasswords.set('C:\\p.zip', 'segreta');
		await mount();
		await fireEvent.dblClick(row('p.zip'));
		const dialog = await screen.findByRole('dialog', { name: 'Apri «p.zip»' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' }));
		expect(names()).toContain('p.zip');
		expect(screen.queryByText('L’archivio è protetto da password.')).toBeNull();

		await fireEvent.dblClick(row('p.zip'));
		await type('segreta');
		await waitFor(() => expect(names()).toEqual(['a.txt']));
		await fireEvent.contextMenu(row('a.txt'));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Estrai accanto all’archivio' }));
		await waitFor(() => expect(disk.exists('C:\\a.txt')).toBe(true));
	});
});

describe('low-disk reminder', () => {
	it('its button opens the disk cleanup', async () => {
		disk.freeOnC = 5;
		await mount();
		await fireEvent.click(await screen.findByRole('button', { name: 'Apri la Pulizia' }));
		await waitFor(() => expect(document.querySelector('.cleanup')).toBeTruthy());
		expect(screen.queryByRole('button', { name: 'Apri la Pulizia' })).toBeNull();
	});
});

describe('transfer queue', () => {
	it('queues copies behind the running one: count, list, move up, remove, pause', async () => {
		let unblock = () => {};
		disk.blockTransfer = new Promise((r) => (unblock = r));
		await mount();
		await enter('Dati');
		await waitFor(() => expect(names()).toEqual(['interno.txt']));

		// First paste runs (blocked), the next two wait.
		disk.clipboard = { paths: ['C:\\alfa.txt'], cut: false };
		key('v', { ctrl: true });
		await screen.findByText(/in corso/);
		disk.clipboard = { paths: ['C:\\beta.txt'], cut: false };
		key('v', { ctrl: true });
		disk.clipboard = { paths: ['C:\\gamma.txt'], cut: false };
		key('v', { ctrl: true });
		await fireEvent.click(await screen.findByRole('button', { name: '+2 in coda' }));

		const queue = screen.getByRole('list', { name: 'Coda dei trasferimenti' });
		const titles = () => [...queue.querySelectorAll('li:not(.running) .title')].map((t) => t.firstChild?.textContent);
		expect(titles()).toEqual(['Copia «beta.txt» → Dati', 'Copia «gamma.txt» → Dati']);

		await fireEvent.click(within(queue).getByRole('button', { name: 'Anticipa «Copia «gamma.txt» → Dati»' }));
		expect(titles()).toEqual(['Copia «gamma.txt» → Dati', 'Copia «beta.txt» → Dati']);
		await fireEvent.click(within(queue).getByRole('button', { name: 'Togli dalla coda «Copia «beta.txt» → Dati»' }));
		expect(titles()).toEqual(['Copia «gamma.txt» → Dati']);

		await fireEvent.click(within(queue).getByRole('button', { name: 'Pausa' }));
		await waitFor(() => expect([...disk.pause.values()]).toEqual([true]));
		expect(within(queue).getByRole('button', { name: 'Riprendi' })).toBeTruthy();

		unblock();
		await waitFor(() => expect(names()).toEqual(['alfa.txt', 'gamma.txt', 'interno.txt']));
		expect(disk.exists('C:\\Dati\\beta.txt')).toBe(false);
	});
});

describe('image tools', () => {
	it('rotates from the menu and Ctrl+Z turns it back', async () => {
		add('C:\\foto.jpg');
		await mount();
		await menuItem(row('foto.jpg'), 'Ruota a destra');
		await waitFor(() => expect(disk.rotated).toEqual([{ path: 'C:\\foto.jpg', clockwise: true }]));

		key('z', { ctrl: true });
		await waitFor(() => expect(disk.rotated[1]).toEqual({ path: 'C:\\foto.jpg', clockwise: false }));
	});

	it('converts into a new file beside the original and selects it', async () => {
		add('C:\\foto.jpg');
		await mount();
		await menuItem(row('foto.jpg'), 'Converti e ridimensiona…');
		const dialog = await screen.findByRole('dialog', { name: 'Converti immagini' });
		await fireEvent.click(within(dialog).getByRole('radio', { name: 'PNG' }));
		await fireEvent.click(within(dialog).getByRole('radio', { name: 'Originale' }));
		expect(within(dialog).getByText('foto.png')).toBeTruthy();
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Converti' }));

		await waitFor(() => expect(selected()).toEqual(['foto.png']));
		expect(disk.exists('C:\\foto.jpg')).toBe(true);
	});

	it('offers no image tools on other files', async () => {
		await mount();
		await fireEvent.contextMenu(row('alfa.txt'));
		await screen.findAllByRole('menuitem');
		expect(screen.queryByRole('menuitem', { name: 'Ruota a destra' })).toBeNull();
	});
});

describe('checksum', () => {
	it('computes SHA-256 at once, switches algorithm and compares a pasted value', async () => {
		add('C:\\setup.exe', 'X');
		await mount();
		await fireEvent.contextMenu(row('setup.exe'));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Somma di controllo…' }));
		const dialog = await screen.findByRole('dialog', { name: 'Somma di controllo' });
		await waitFor(() => expect(within(dialog).getByText('sha256ffx')).toBeTruthy());

		await fireEvent.click(within(dialog).getByRole('radio', { name: 'MD5' }));
		await waitFor(() => expect(within(dialog).getByText('md5ffx')).toBeTruthy());

		const field = within(dialog).getByPlaceholderText('Incolla qui') as HTMLInputElement;
		// As pages print it: other case, a «MD5:» label, spaces.
		await fireEvent.input(field, { target: { value: '  MD5: MD5FFX ' } });
		expect(within(dialog).getByRole('status').textContent).toContain('Coincide');
		await fireEvent.input(field, { target: { value: 'other' } });
		expect(within(dialog).getByRole('status').textContent).toContain('Non coincide');
	});
});
