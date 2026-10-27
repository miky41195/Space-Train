import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen, within } from '@testing-library/svelte';
import { DiscoFinto } from '$lib/test-disco';

/**
 * Test d'integrazione della pagina intera: tutto ciò che sta fra i
 * componenti — scorciatoie, menu, appunti, preferiti — e che nessun test
 * di componente singolo vede.
 *
 * Il confine finto è `invoke`: sotto c'è un disco in memoria, sopra gira
 * il codice vero dell'app, `tauriBackend` compreso.
 */

let disco: DiscoFinto;

/**
 * jsdom non ha il canvas: i pixel di un'immagine sono sempre questi 4×2,
 * sfondo bianco con due pixel rossi in alto. I PNG «scritti» si tengono
 * qui per controllarli.
 */
function pixelDiProva() {
	const B = [255, 255, 255, 255];
	const R = [200, 30, 30, 255];
	return { data: new Uint8ClampedArray([...B, ...R, ...R, ...B, ...B, ...B, ...B, ...B]), width: 4, height: 2 };
}
const pngScritti: Array<{ data: Uint8ClampedArray }> = [];
vi.mock('$lib/pixel', () => ({
	leggiPixel: async () => pixelDiProva(),
	scriviPng: async (img: { data: Uint8ClampedArray }) => {
		pngScritti.push(img);
		return 'UE5H';
	}
}));

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (cmd: string, args?: Record<string, unknown>) => disco.invoke(cmd, args),
	Channel: class {
		onmessage: ((m: unknown) => void) | null = null;
	},
	convertFileSrc: (path: string) => `asset://${path}`
}));

/** Ascoltatori registrati dalla pagina: i test li chiamano come farebbe Tauri. */
const ascoltatori = new Map<string, (e: { payload: unknown }) => void>();
let suTrascina: ((e: { payload: unknown }) => void) | null = null;

vi.mock('@tauri-apps/api/event', () => ({
	listen: async (nome: string, f: (e: { payload: unknown }) => void) => {
		ascoltatori.set(nome, f);
		return () => ascoltatori.delete(nome);
	}
}));

vi.mock('@tauri-apps/api/webview', () => ({
	getCurrentWebview: () => ({
		onDragDropEvent: async (f: (e: { payload: unknown }) => void) => {
			suTrascina = f;
			return () => (suTrascina = null);
		}
	})
}));

/** Nome della finestra in cui gira la pagina: «main» o una aperta con Ctrl+N. */
let etichettaFinestra = 'main';

vi.mock('@tauri-apps/api/window', () => ({
	getCurrentWindow: () => ({
		label: etichettaFinestra,
		close: vi.fn(),
		minimize: vi.fn(),
		toggleMaximize: vi.fn()
	})
}));

const { default: Pagina } = await import('./+page.svelte');

const STRUTTURA = [
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
	etichettaFinestra = 'main';
	delete (window as unknown as { __SPACE_TRAIN_APRI?: unknown }).__SPACE_TRAIN_APRI;
	disco = new DiscoFinto(STRUTTURA);
	disco.negati.add('C:\\Segreta');
	localStorage.clear();

	// Movimento ridotto: la sequenza d'apertura non viene montata e non
	// copre la lista con la sua tenda.
	window.matchMedia = ((q: string) => ({
		matches: q.includes('reduce'),
		media: q,
		addEventListener() {},
		removeEventListener() {}
	})) as unknown as typeof window.matchMedia;

	// jsdom non fa layout: senza misure la lista virtualizzata non sa
	// quante righe stanno a schermo.
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

// ── Aiuti ────────────────────────────────────────────────────────────

async function monta() {
	const r = render(Pagina);
	await waitFor(() => expect(nomi()).toContain('alfa.txt'));
	return r;
}

/** Nomi nell'ordine in cui compaiono a schermo, vista a righe. */
function nomi(): string[] {
	return [...document.querySelectorAll('.row .name')].map((n) => n.textContent ?? '');
}

/** Nomi nella vista a griglia. */
function nomiGriglia(): string[] {
	return [...document.querySelectorAll('.cella .nome')].map((n) => n.textContent ?? '');
}

function riga(nome: string): HTMLElement {
	const r = [...document.querySelectorAll<HTMLElement>('.row')].find(
		(el) => el.querySelector('.name')?.textContent === nome
	);
	if (!r) throw new Error(`Riga non trovata: ${nome}. A schermo: ${nomi().join(', ')}`);
	return r;
}

function selezionati(): string[] {
	return [...document.querySelectorAll('.row.selected .name')].map((n) => n.textContent ?? '');
}

function testate(): string[] {
	return [...document.querySelectorAll('.testata')].map((t) => t.getAttribute('aria-label') ?? '');
}

function tasto(key: string, mod: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
	fireEvent.keyDown(window, {
		key,
		ctrlKey: mod.ctrl ?? false,
		shiftKey: mod.shift ?? false,
		altKey: mod.alt ?? false
	});
}

/** Aggiunge al disco un elemento che non sta nella struttura di base. */
function aggiungi(path: string, testo?: string) {
	const dir = path.endsWith('\\');
	const p = dir ? path.slice(0, -1) : path;
	disco.nodi.set(p, { kind: dir ? 'dir' : 'file', size: 100, hidden: false, modified: 0 });
	if (testo !== undefined) disco.contenuti.set(p, testo);
}

/** Apre un menu della barra («Visualizza», «Ordina», «Aspetto») e sceglie una voce. */
async function dalMenu(pulsante: string, etichetta: string | RegExp, ruolo = 'menuitemcheckbox') {
	await fireEvent.click(screen.getByRole('button', { name: pulsante }));
	const menu = await screen.findByRole('menu');
	await fireEvent.click(within(menu).getByRole(ruolo, { name: etichetta }));
}

const vista = (etichetta: string | RegExp) => dalMenu('Visualizza', etichetta);
const ordina = (etichetta: string | RegExp) => dalMenu('Ordina', etichetta);

/** Nome e ordine delle celle in una vista a icone. */
function lati(): number[] {
	return [...document.querySelectorAll<HTMLElement>('.cella')].map((c) =>
		parseInt(c.style.getPropertyValue('--lato'))
	);
}

function schede(): string[] {
	return [...document.querySelectorAll('.tab .label')].map((t) => t.textContent ?? '');
}

async function voceMenu(sopra: HTMLElement | null, etichetta: string | RegExp) {
	if (sopra) await fireEvent.contextMenu(sopra);
	else await fireEvent.contextMenu(document.querySelector('.viewport')!);
	const menu = await screen.findByRole('menu');
	await fireEvent.click(within(menu).getByRole('menuitem', { name: etichetta }));
}

function campoRinomina(): Promise<HTMLInputElement> {
	return waitFor(() => {
		const c = document.querySelector<HTMLInputElement>('.rinomina');
		if (!c) throw new Error('campo di rinomina assente');
		return c;
	});
}

async function entraIn(cartella: string) {
	await fireEvent.dblClick(riga(cartella));
}

// ── Preferiti ────────────────────────────────────────────────────────

describe('preferiti', () => {
	it('senza preferiti la cartella non è divisa', async () => {
		await monta();
		expect(testate()).toEqual([]);
	});

	it('Ctrl+D porta la voce selezionata nella zona preferiti, in cima', async () => {
		await monta();

		await fireEvent.click(riga('gamma.txt'));
		tasto('d', { ctrl: true });

		await waitFor(() => expect(nomi()[0]).toBe('gamma.txt'));
		expect(testate()).toEqual(['Preferiti, 1', 'Comuni, 6']);
	});

	it('Ctrl+D una seconda volta la rimette fra i comuni', async () => {
		await monta();
		await fireEvent.click(riga('gamma.txt'));

		tasto('d', { ctrl: true });
		await waitFor(() => expect(testate()).toHaveLength(2));

		tasto('d', { ctrl: true });
		await waitFor(() => expect(testate()).toEqual([]));
		expect(nomi()).toEqual(['Dati', 'Segreta', 'Vuota', 'alfa.txt', 'beta.txt', 'delta.txt', 'gamma.txt']);
	});

	it('dal menu contestuale si aggiunge e si toglie, con l etichetta giusta', async () => {
		await monta();

		await voceMenu(riga('beta.txt'), /Aggiungi ai preferiti/);
		await waitFor(() => expect(nomi()[0]).toBe('beta.txt'));

		await voceMenu(riga('beta.txt'), /Rimuovi dai preferiti/);
		await waitFor(() => expect(testate()).toEqual([]));
	});

	it('sul vuoto il menu non offre i preferiti', async () => {
		await monta();
		await fireEvent.contextMenu(document.querySelector('.viewport')!);

		const menu = await screen.findByRole('menu');
		expect(within(menu).queryByRole('menuitem', { name: /preferiti/ })).toBeNull();
	});

	it('una selezione multipla entra tutta insieme, nell ordine della lista', async () => {
		await monta();

		await fireEvent.click(riga('gamma.txt'));
		await fireEvent.click(riga('alfa.txt'), { ctrlKey: true });
		tasto('d', { ctrl: true });

		await waitFor(() => expect(nomi().slice(0, 2)).toEqual(['alfa.txt', 'gamma.txt']));
		expect(testate()).toEqual(['Preferiti, 2', 'Comuni, 5']);
	});

	it('anche le cartelle possono essere preferite', async () => {
		await monta();

		await fireEvent.click(riga('Vuota'));
		tasto('d', { ctrl: true });

		await waitFor(() => expect(nomi()[0]).toBe('Vuota'));
	});

	it('dentro ogni zona vale l ordinamento scelto', async () => {
		await monta();

		await fireEvent.click(riga('alfa.txt'));
		await fireEvent.click(riga('delta.txt'), { ctrlKey: true });
		tasto('d', { ctrl: true });
		await waitFor(() => expect(nomi().slice(0, 2)).toEqual(['alfa.txt', 'delta.txt']));

		// Clic sull'intestazione "Nome": verso invertito.
		await fireEvent.click(screen.getByRole('button', { name: /nome/i }));

		await waitFor(() => expect(nomi().slice(0, 2)).toEqual(['delta.txt', 'alfa.txt']));
		expect(testate()).toHaveLength(2);
	});

	it('i preferiti restano dopo un riavvio dell app', async () => {
		const { unmount } = await monta();
		await fireEvent.click(riga('delta.txt'));
		tasto('d', { ctrl: true });
		await waitFor(() => expect(nomi()[0]).toBe('delta.txt'));
		unmount();

		await monta();
		expect(nomi()[0]).toBe('delta.txt');
		expect(testate()).toEqual(['Preferiti, 1', 'Comuni, 6']);
	});

	it('appartengono alla cartella: altrove non compaiono, tornando sì', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('d', { ctrl: true });
		await waitFor(() => expect(testate()).toHaveLength(2));

		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		expect(testate()).toEqual([]);

		await fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
		await waitFor(() => expect(nomi()[0]).toBe('alfa.txt'));
		expect(testate()).toHaveLength(2);
	});

	it('la ricerca sospende la divisione e la chiusura la ripristina', async () => {
		await monta();
		await fireEvent.click(riga('gamma.txt'));
		tasto('d', { ctrl: true });
		await waitFor(() => expect(testate()).toHaveLength(2));

		tasto('f', { ctrl: true });
		const campo = await screen.findByLabelText('Filtra i file in questa cartella');
		await fireEvent.input(campo, { target: { value: 'ta' } });

		await waitFor(() => expect(testate()).toEqual([]));
		expect(nomi()).toEqual(expect.arrayContaining(['beta.txt', 'delta.txt']));

		tasto('Escape');
		await waitFor(() => expect(testate()).toHaveLength(2));
	});

	it('rinominando un preferito resta preferito', async () => {
		await monta();
		await fireEvent.click(riga('beta.txt'));
		tasto('d', { ctrl: true });
		await waitFor(() => expect(nomi()[0]).toBe('beta.txt'));

		tasto('F2');
		const campo = await campoRinomina();
		campo.value = 'omega.txt';
		await fireEvent.keyDown(campo, { key: 'Enter' });

		await waitFor(() => expect(nomi()[0]).toBe('omega.txt'));
		expect(testate()).toEqual(['Preferiti, 1', 'Comuni, 6']);
		expect(disco.esiste('C:\\omega.txt')).toBe(true);
	});

	it('cestinare un preferito non lascia una zona fantasma', async () => {
		await monta();
		await fireEvent.click(riga('beta.txt'));
		tasto('d', { ctrl: true });
		await waitFor(() => expect(testate()).toHaveLength(2));

		tasto('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));

		await waitFor(() => expect(nomi()).not.toContain('beta.txt'));
		expect(testate()).toEqual([]);
	});

	it('le frecce seguono l ordine a schermo, preferiti compresi', async () => {
		await monta();
		await fireEvent.click(riga('gamma.txt'));
		tasto('d', { ctrl: true });
		await waitFor(() => expect(nomi()[0]).toBe('gamma.txt'));

		await fireEvent.click(riga('gamma.txt'));
		tasto('ArrowDown');

		// Dopo l'unico preferito viene il primo dei comuni.
		await waitFor(() => expect(selezionati()).toEqual(['Dati']));
	});

	it('Ctrl+A seleziona entrambe le zone', async () => {
		await monta();
		await fireEvent.click(riga('gamma.txt'));
		tasto('d', { ctrl: true });
		await waitFor(() => expect(testate()).toHaveLength(2));

		tasto('a', { ctrl: true });
		await waitFor(() => expect(selezionati()).toHaveLength(7));
	});

	it('nella vista a griglia la divisione resta', async () => {
		await monta();
		await fireEvent.click(riga('delta.txt'));
		tasto('d', { ctrl: true });
		await waitFor(() => expect(testate()).toHaveLength(2));

		await fireEvent.click(screen.getByRole('button', { name: 'Icone grandi' }));

		await waitFor(() => expect(nomiGriglia()[0]).toBe('delta.txt'));
		expect(testate()).toEqual(['Preferiti, 1', 'Comuni, 6']);
		expect(screen.getByRole('grid', { name: 'Preferiti' })).toBeTruthy();
		expect(screen.getByRole('grid', { name: 'Comuni' })).toBeTruthy();
	});
});

// ── Flussi generali ──────────────────────────────────────────────────

describe('navigazione', () => {
	it('all avvio mostra il disco C:, cartelle prima', async () => {
		await monta();
		expect(nomi()).toEqual(['Dati', 'Segreta', 'Vuota', 'alfa.txt', 'beta.txt', 'delta.txt', 'gamma.txt']);
	});

	it('doppio clic su una cartella ci entra, Su torna al genitore', async () => {
		await monta();
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));

		await fireEvent.click(screen.getByRole('button', { name: 'Su' }));
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
	});

	it('doppio clic su un file lo apre col programma predefinito', async () => {
		await monta();
		await fireEvent.dblClick(riga('alfa.txt'));
		await waitFor(() => expect(disco.aperti).toEqual(['C:\\alfa.txt']));
	});

	it('Invio apre la voce selezionata', async () => {
		await monta();
		await fireEvent.click(riga('Dati'));
		tasto('Enter');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
	});

	it('i tasti laterali del mouse vanno indietro e avanti', async () => {
		await monta();
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));

		await fireEvent.mouseDown(window, { button: 3 });
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));

		await fireEvent.mouseDown(window, { button: 4 });
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
	});

	it('una cartella vuota mostra lo stato vuoto', async () => {
		await monta();
		await entraIn('Vuota');
		expect(await screen.findByText('Deposito vuoto')).toBeTruthy();
	});

	it('una cartella negata mostra l errore e lascia l utente dov era', async () => {
		await monta();
		await entraIn('Segreta');

		await waitFor(() => expect(document.querySelector('.errore')?.textContent).toMatch(/Accesso negato/));
		expect(nomi()).toContain('alfa.txt');
	});
});

describe('selezione', () => {
	it('Maiusc+clic seleziona un intervallo', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		await fireEvent.click(riga('delta.txt'), { shiftKey: true });

		expect(selezionati()).toEqual(['alfa.txt', 'beta.txt', 'delta.txt']);
	});

	it('Ctrl+clic aggiunge e toglie', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		await fireEvent.click(riga('gamma.txt'), { ctrlKey: true });
		expect(selezionati()).toEqual(['alfa.txt', 'gamma.txt']);

		await fireEvent.click(riga('alfa.txt'), { ctrlKey: true });
		expect(selezionati()).toEqual(['gamma.txt']);
	});

	it('Maiusc+freccia estende la selezione', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('ArrowDown', { shift: true });
		tasto('ArrowDown', { shift: true });

		await waitFor(() => expect(selezionati()).toEqual(['alfa.txt', 'beta.txt', 'delta.txt']));
	});
});

describe('operazioni sui file', () => {
	it('Ctrl+Maiusc+N crea una cartella e apre subito la rinomina', async () => {
		await monta();
		tasto('N', { ctrl: true, shift: true });

		await waitFor(() => expect(document.querySelector('.rinomina')).not.toBeNull());
		expect(disco.esiste('C:\\Nuova cartella')).toBe(true);
	});

	it('una seconda cartella nuova viene numerata', async () => {
		await monta();
		tasto('N', { ctrl: true, shift: true });
		await waitFor(() => expect(document.querySelector('.rinomina')).not.toBeNull());
		await fireEvent.keyDown(document.querySelector('.rinomina')!, { key: 'Escape' });

		tasto('N', { ctrl: true, shift: true });
		await waitFor(() => expect(disco.esiste('C:\\Nuova cartella (2)')).toBe(true));
	});

	it('F2 rinomina il file sul disco', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('F2');

		const campo = await campoRinomina();
		campo.value = 'zeta.txt';
		await fireEvent.keyDown(campo, { key: 'Enter' });

		await waitFor(() => expect(nomi()).toContain('zeta.txt'));
		expect(disco.esiste('C:\\alfa.txt')).toBe(false);
	});

	it('Esc durante la rinomina non tocca il disco', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('F2');

		const campo = await campoRinomina();
		campo.value = 'zeta.txt';
		await fireEvent.keyDown(campo, { key: 'Escape' });

		await waitFor(() => expect(document.querySelector('.rinomina')).toBeNull());
		expect(disco.esiste('C:\\alfa.txt')).toBe(true);
	});

	it('Canc chiede conferma prima di cestinare', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('Delete');

		await screen.findByRole('dialog', { name: 'Conferma eliminazione' });
		expect(disco.cestino).toEqual([]);

		await fireEvent.click(screen.getByRole('button', { name: 'Sposta nel Cestino' }));
		await waitFor(() => expect(disco.cestino).toEqual(['C:\\alfa.txt']));
		expect(nomi()).not.toContain('alfa.txt');
	});

	it('annullare la conferma non cestina nulla', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('Delete');

		await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
		expect(disco.cestino).toEqual([]);
		expect(nomi()).toContain('alfa.txt');
	});

	it('copia e incolla in un altra cartella', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('c', { ctrl: true });

		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('v', { ctrl: true });

		await waitFor(() => expect(nomi()).toEqual(['alfa.txt', 'interno.txt']));
		expect(disco.esiste('C:\\alfa.txt')).toBe(true);
	});

	it('taglia e incolla sposta, e la voce tagliata appare sbiadita', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('x', { ctrl: true });
		await waitFor(() => expect(riga('alfa.txt').classList.contains('tagliato')).toBe(true));

		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('v', { ctrl: true });

		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
		expect(disco.esiste('C:\\alfa.txt')).toBe(false);
		expect(disco.esiste('C:\\Dati\\alfa.txt')).toBe(true);
	});

	it('incollare dove il nome esiste chiede cosa fare', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('c', { ctrl: true });
		tasto('v', { ctrl: true });

		await screen.findByRole('dialog', { name: 'Conflitto di nomi' });
		await fireEvent.click(screen.getByRole('button', { name: /Mantieni entrambi/ }));

		await waitFor(() => expect(nomi()).toContain('alfa (2).txt'));
	});

	it('nel conflitto, Salta lascia tutto com era', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('c', { ctrl: true });
		tasto('v', { ctrl: true });

		await fireEvent.click(await screen.findByRole('button', { name: /Salta/ }));
		await waitFor(() => expect(document.querySelector('.errore')?.textContent).toMatch(/saltato/));
		expect(disco.esiste('C:\\alfa (2).txt')).toBe(false);
	});

	it('incolla dal menu sul vuoto', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('c', { ctrl: true });
		await entraIn('Vuota');
		await screen.findByText('Deposito vuoto');

		// Nella cartella vuota non c'è lista: si incolla da tastiera.
		tasto('v', { ctrl: true });
		await waitFor(() => expect(nomi()).toEqual(['alfa.txt']));
	});

	it('con un dialogo aperto le scorciatoie della lista tacciono', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('Delete');
		await screen.findByRole('dialog', { name: 'Conferma eliminazione' });

		tasto('d', { ctrl: true });
		tasto('N', { ctrl: true, shift: true });

		expect(disco.esiste('C:\\Nuova cartella')).toBe(false);
		expect(testate()).toEqual([]);
	});
});

// ── Appunti di Windows ───────────────────────────────────────────────

describe('appunti di Windows', () => {
	it('copiare scrive negli appunti di sistema, tagliare segna lo spostamento', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('c', { ctrl: true });
		await waitFor(() => expect(disco.appunti).toEqual({ paths: ['C:\\alfa.txt'], taglia: false }));

		tasto('x', { ctrl: true });
		await waitFor(() => expect(disco.appunti?.taglia).toBe(true));
	});

	it('incolla file copiati in Esplora o in un altra app', async () => {
		aggiungi('C:\\Altrove\\');
		aggiungi('C:\\Altrove\\da-fuori.txt');
		await monta();
		// Gli appunti li ha riempiti un altro programma.
		disco.appunti = { paths: ['C:\\Altrove\\da-fuori.txt'], taglia: false };

		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('v', { ctrl: true });

		await waitFor(() => expect(nomi()).toContain('da-fuori.txt'));
		expect(disco.esiste('C:\\Altrove\\da-fuori.txt')).toBe(true);
	});

	it('dopo aver incollato un taglio gli appunti si svuotano, come in Esplora', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('x', { ctrl: true });
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('v', { ctrl: true });

		await waitFor(() => expect(disco.esiste('C:\\Dati\\alfa.txt')).toBe(true));
		await waitFor(() => expect(disco.appunti).toBeNull());
	});

	it('il menu offre Incolla solo se negli appunti ci sono file', async () => {
		await monta();
		await fireEvent.contextMenu(document.querySelector('.viewport')!);
		let menu = await screen.findByRole('menu');
		expect(within(menu).queryByRole('menuitem', { name: /Incolla/ })).toBeNull();
		await fireEvent.keyDown(window, { key: 'Escape' });

		disco.appunti = { paths: ['C:\\beta.txt'], taglia: false };
		await fireEvent.contextMenu(document.querySelector('.viewport')!);
		menu = await screen.findByRole('menu');
		await waitFor(() => expect(within(menu).getByRole('menuitem', { name: /Incolla/ })).toBeTruthy());
	});
});

// ── Barra degli indirizzi ────────────────────────────────────────────

describe('barra degli indirizzi', () => {
	async function scrivi(testo: string) {
		const campo = await screen.findByLabelText('Indirizzo');
		(campo as HTMLInputElement).value = testo;
		await fireEvent.keyDown(campo, { key: 'Enter' });
	}

	it('un clic sullo spazio libero apre il campo con il percorso', async () => {
		await monta();
		await fireEvent.click(screen.getByRole('button', { name: "Modifica l'indirizzo" }));
		const campo = (await screen.findByLabelText('Indirizzo')) as HTMLInputElement;
		expect(campo.value).toBe('C:\\');
	});

	it('scrivere una cartella e premere Invio ci porta', async () => {
		await monta();
		tasto('l', { ctrl: true });
		await scrivi('C:\\Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
	});

	it('scrivere il path di un file apre la sua cartella e lo seleziona', async () => {
		await monta();
		tasto('F4');
		await scrivi('C:\\Dati\\interno.txt');
		await waitFor(() => expect(selezionati()).toEqual(['interno.txt']));
	});

	it('un percorso inesistente lascia dove si è e lo dice', async () => {
		await monta();
		tasto('d', { alt: true });
		await scrivi('C:\\non\\esiste');
		await waitFor(() => expect(document.querySelector('.errore')?.textContent).toMatch(/Impossibile trovare/));
		expect(nomi()).toContain('alfa.txt');
	});

	it('Esc chiude il campo senza muoversi', async () => {
		await monta();
		tasto('l', { ctrl: true });
		const campo = await screen.findByLabelText('Indirizzo');
		await fireEvent.keyDown(campo, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByLabelText('Indirizzo')).toBeNull());
	});

	it('le stazioni portano direttamente alla cartella, fino a Questo PC', async () => {
		aggiungi('C:\\Dati\\Sotto\\');
		await monta();
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toContain('Sotto'));
		await entraIn('Sotto');
		await waitFor(() => expect(screen.getByRole('button', { name: 'C:' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'C:' }));
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));

		// La stazione nella barra, non la voce omonima della barra laterale.
		const linea = screen.getByRole('button', { name: "Modifica l'indirizzo" });
		await fireEvent.click(within(linea).getByRole('button', { name: 'Questo PC' }));
		await waitFor(() => expect(nomi()).toEqual(['Disco locale (C:)']));
	});
});

// ── Aggiornamento automatico ─────────────────────────────────────────

describe('aggiornamento automatico', () => {
	it('osserva le cartelle aperte nei tab', async () => {
		await monta();
		await waitFor(() => expect(disco.osservate).toEqual(['C:\\']));
		tasto('t', { ctrl: true });
		await waitFor(() => expect(disco.osservate).toEqual(['C:\\', 'C:\\']));
	});

	it('quando un altro programma cambia la cartella la lista si aggiorna da sola', async () => {
		await monta();
		await fireEvent.click(riga('beta.txt'));

		aggiungi('C:\\nuovo-da-fuori.txt');
		ascoltatori.get('cartella-cambiata')?.({ payload: 'c:\\' });

		await waitFor(() => expect(nomi()).toContain('nuovo-da-fuori.txt'));
		// L'aggiornamento non fa perdere la selezione.
		expect(selezionati()).toEqual(['beta.txt']);
	});

	it('F5 rilegge la cartella', async () => {
		await monta();
		aggiungi('C:\\comparso.txt');
		tasto('F5');
		await waitFor(() => expect(nomi()).toContain('comparso.txt'));
	});
});

// ── Annulla ──────────────────────────────────────────────────────────

describe('annulla (Ctrl+Z)', () => {
	it('annulla una rinomina', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('F2');
		const campo = await campoRinomina();
		campo.value = 'zeta.txt';
		await fireEvent.keyDown(campo, { key: 'Enter' });
		await waitFor(() => expect(nomi()).toContain('zeta.txt'));

		tasto('z', { ctrl: true });
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
		expect(disco.esiste('C:\\zeta.txt')).toBe(false);
		expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Annullata: rinomina di «zeta.txt».');
	});

	it('annulla lo spostamento nel Cestino', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));
		await waitFor(() => expect(nomi()).not.toContain('alfa.txt'));

		tasto('z', { ctrl: true });
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
	});

	it('annulla una copia togliendo il duplicato', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('c', { ctrl: true });
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('v', { ctrl: true });
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));

		tasto('z', { ctrl: true });
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		expect(disco.esiste('C:\\alfa.txt')).toBe(true);
	});

	it('annulla uno spostamento riportando il file dov era', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('x', { ctrl: true });
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('v', { ctrl: true });
		await waitFor(() => expect(disco.esiste('C:\\Dati\\alfa.txt')).toBe(true));

		tasto('z', { ctrl: true });
		await waitFor(() => expect(disco.esiste('C:\\alfa.txt')).toBe(true));
		expect(disco.esiste('C:\\Dati\\alfa.txt')).toBe(false);
	});

	it('annulla la creazione di una cartella', async () => {
		await monta();
		tasto('N', { ctrl: true, shift: true });
		await waitFor(() => expect(disco.esiste('C:\\Nuova cartella')).toBe(true));
		await fireEvent.keyDown(await campoRinomina(), { key: 'Escape' });

		tasto('z', { ctrl: true });
		await waitFor(() => expect(disco.esiste('C:\\Nuova cartella')).toBe(false));
	});

	it('il menu sul vuoto dice cosa verrebbe annullato', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));
		await waitFor(() => expect(nomi()).not.toContain('alfa.txt'));

		await voceMenu(null, /Annulla eliminazione di 1 elemento/);
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
	});
});

// ── Ricerca nelle sottocartelle ──────────────────────────────────────

describe('ricerca nelle sottocartelle', () => {
	async function cerca(testo: string, opts: { contenuto?: boolean } = {}) {
		tasto('f', { ctrl: true });
		await fireEvent.click(await screen.findByRole('button', { name: 'Sottocartelle' }));
		if (opts.contenuto) await fireEvent.click(screen.getByRole('button', { name: 'Contenuto' }));
		const campo = screen.getByLabelText('Filtra i file in questa cartella');
		await fireEvent.input(campo, { target: { value: testo } });
	}

	it('trova file in profondità e mostra in che cartella stanno', async () => {
		aggiungi('C:\\Dati\\Annidata\\');
		aggiungi('C:\\Dati\\Annidata\\relazione.txt');
		await monta();

		await cerca('relaz');
		await waitFor(() => expect(nomi()).toEqual(['relazione.txt']));
		expect(document.querySelector('.row .cartella')?.textContent).toBe('C:\\Dati\\Annidata');
	});

	it('cerca anche dentro i file se richiesto', async () => {
		aggiungi('C:\\Dati\\note.txt', 'la parola introvabile è qui');
		await monta();

		await cerca('introvabile', { contenuto: true });
		await waitFor(() => expect(nomi()).toEqual(['note.txt']));
	});

	it('senza risultati lo dice', async () => {
		await monta();
		await cerca('nessunfilecosì');
		expect(await screen.findByText('Nessuna corrispondenza')).toBeTruthy();
	});

	it('Apri percorso file porta alla cartella del risultato e lo seleziona', async () => {
		await monta();
		await cerca('interno');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));

		await voceMenu(riga('interno.txt'), 'Apri percorso file');
		await waitFor(() => expect(selezionati()).toEqual(['interno.txt']));
		expect(document.querySelector('.row .cartella')).toBeNull();
	});

	it('chiudere la ricerca torna al contenuto della cartella', async () => {
		await monta();
		await cerca('interno');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));

		await fireEvent.click(screen.getByRole('button', { name: 'Chiudi la ricerca' }));
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
	});
});

// ── Shell di Windows ─────────────────────────────────────────────────

describe('funzioni della Shell di Windows', () => {
	it('Altre opzioni apre il menu di Windows sugli elementi scelti', async () => {
		await monta();
		await voceMenu(riga('alfa.txt'), 'Altre opzioni di Windows');
		await waitFor(() => expect(disco.shell.map((c) => c.cmd)).toEqual(['show_shell_menu']));
		expect(disco.shell[0].args).toMatchObject({ paths: ['C:\\alfa.txt'], folder: 'C:\\' });
	});

	it('Alt+Invio apre le Proprietà della selezione, o della cartella se vuota', async () => {
		await monta();
		await fireEvent.click(riga('beta.txt'));
		tasto('Enter', { alt: true });
		await waitFor(() => expect(disco.shell[0]).toEqual({ cmd: 'show_properties', args: { paths: ['C:\\beta.txt'] } }));

		await fireEvent.click(riga('beta.txt'), { ctrlKey: true });
		tasto('Enter', { alt: true });
		await waitFor(() => expect(disco.shell[1]?.args).toEqual({ paths: ['C:\\'] }));
	});

	it('Apri con… e Esegui come amministratore passano il file a Windows', async () => {
		aggiungi('C:\\setup.exe');
		await monta();
		await voceMenu(riga('alfa.txt'), 'Apri con…');
		await voceMenu(riga('setup.exe'), 'Esegui come amministratore');
		await waitFor(() =>
			expect(disco.shell).toEqual([
				{ cmd: 'open_with', args: { path: 'C:\\alfa.txt' } },
				{ cmd: 'run_as_admin', args: { path: 'C:\\setup.exe' } }
			])
		);
	});
});

// ── Schede ───────────────────────────────────────────────────────────

describe('schede', () => {
	it('Ctrl+T apre una scheda, Ctrl+W la chiude', async () => {
		await monta();
		tasto('t', { ctrl: true });
		await waitFor(() => expect(schede()).toHaveLength(2));
		tasto('w', { ctrl: true });
		await waitFor(() => expect(schede()).toHaveLength(1));
	});

	it('Ctrl+Tab e Ctrl+numero passano da una scheda all altra', async () => {
		await monta();
		await voceMenu(riga('Dati'), 'Apri in una nuova scheda');
		await waitFor(() => expect(schede()).toEqual(['C:', 'Dati']));
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));

		tasto('Tab', { ctrl: true });
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
		tasto('2', { ctrl: true });
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
	});

	it('il clic con la rotella chiude la scheda', async () => {
		await monta();
		tasto('t', { ctrl: true });
		await waitFor(() => expect(schede()).toHaveLength(2));
		await fireEvent(
			document.querySelectorAll('.tab')[1],
			new MouseEvent('auxclick', { button: 1, bubbles: true })
		);
		await waitFor(() => expect(schede()).toHaveLength(1));
	});

	it('Backspace torna indietro, Alt+Su risale', async () => {
		await monta();
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('Backspace');
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));

		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('ArrowUp', { alt: true });
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
	});

	it('scrivendo nel campo di ricerca Backspace cancella, non torna indietro', async () => {
		await monta();
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('f', { ctrl: true });
		const campo = await screen.findByLabelText('Filtra i file in questa cartella');
		await fireEvent.keyDown(campo, { key: 'Backspace' });
		expect(nomi()).toEqual(['interno.txt']);
	});
});

// ── Posizioni speciali ───────────────────────────────────────────────

describe('Questo PC e Cestino', () => {
	it('la barra laterale mostra lo spazio libero dei dischi', async () => {
		await monta();
		expect(await screen.findByText('40 B liberi')).toBeTruthy();
	});

	it('sopra la radice del disco c è Questo PC, con i dischi e il loro spazio', async () => {
		await monta();
		await fireEvent.click(screen.getByRole('button', { name: 'Su' }));
		await waitFor(() => expect(nomi()).toEqual(['Disco locale (C:)']));
		expect(document.querySelector('.row .size')?.textContent).toBe('40 B liberi');

		await entraIn('Disco locale (C:)');
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
	});

	it('nel Cestino si vede da dove viene un elemento e lo si ripristina', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));
		await waitFor(() => expect(nomi()).not.toContain('alfa.txt'));

		await fireEvent.click(screen.getByRole('button', { name: 'Cestino' }));
		await waitFor(() => expect(nomi()).toEqual(['alfa.txt']));
		expect(document.querySelector('.row .cartella')?.textContent).toBe('C:\\');

		await voceMenu(riga('alfa.txt'), 'Ripristina');
		await waitFor(() => expect(nomi()).toEqual([]));
		expect(disco.esiste('C:\\alfa.txt')).toBe(true);
	});

	it('svuotare il Cestino chiede conferma e non si annulla', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Sposta nel Cestino' }));
		await waitFor(() => expect(nomi()).not.toContain('alfa.txt'));
		await fireEvent.click(screen.getByRole('button', { name: 'Cestino' }));
		await waitFor(() => expect(nomi()).toEqual(['alfa.txt']));

		await voceMenu(null, 'Svuota Cestino');
		await fireEvent.click(await screen.findByRole('button', { name: 'Elimina definitivamente' }));
		await waitFor(() => expect(nomi()).toEqual([]));
	});
});

// ── Eliminazione definitiva ──────────────────────────────────────────

describe('eliminazione definitiva', () => {
	it('Maiusc+Canc chiede una conferma diversa ed elimina senza Cestino', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		tasto('Delete', { shift: true });

		expect(await screen.findByText('Eliminare definitivamente?')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Elimina definitivamente' }));

		await waitFor(() => expect(disco.esiste('C:\\alfa.txt')).toBe(false));
		expect(disco.cestino).toEqual([]);
	});
});

// ── Archivi ZIP ──────────────────────────────────────────────────────

describe('archivi ZIP', () => {
	it('Comprimi crea lo ZIP accanto e lo seleziona', async () => {
		await monta();
		await voceMenu(riga('alfa.txt'), 'Comprimi in file ZIP');
		await waitFor(() => expect(selezionati()).toEqual(['alfa.zip']));
		expect(disco.esiste('C:\\alfa.zip')).toBe(true);
	});

	it('Estrai tutto crea una cartella col nome dell archivio', async () => {
		aggiungi('C:\\pacco.zip');
		await monta();
		await voceMenu(riga('pacco.zip'), 'Estrai tutto');
		await waitFor(() => expect(selezionati()).toEqual(['pacco']));
		expect(disco.esiste('C:\\pacco\\estratto.txt')).toBe(true);
	});

	it('anche la compressione si annulla con Ctrl+Z', async () => {
		await monta();
		await voceMenu(riga('alfa.txt'), 'Comprimi in file ZIP');
		await waitFor(() => expect(disco.esiste('C:\\alfa.zip')).toBe(true));
		tasto('z', { ctrl: true });
		await waitFor(() => expect(disco.esiste('C:\\alfa.zip')).toBe(false));
	});
});

// ── Anteprima ────────────────────────────────────────────────────────

describe('riquadro di anteprima', () => {
	it('Alt+P apre il riquadro, che mostra il testo del file selezionato', async () => {
		disco.contenuti.set('C:\\alfa.txt', 'prima riga del file');
		await monta();
		tasto('p', { alt: true });
		expect(await screen.findByText('Seleziona un file per vederne l’anteprima.')).toBeTruthy();

		await fireEvent.click(riga('alfa.txt'));
		expect(await screen.findByText('prima riga del file')).toBeTruthy();
	});

	it('le immagini si vedono dal file vero', async () => {
		aggiungi('C:\\foto.jpg');
		await monta();
		await fireEvent.click(screen.getByRole('button', { name: 'Riquadro di anteprima' }));
		await fireEvent.click(riga('foto.jpg'));

		const img = (await screen.findByAltText('foto.jpg')) as HTMLImageElement;
		expect(img.getAttribute('src')).toBe('asset://C:\\foto.jpg');
	});

	it('il riquadro resta aperto dopo un riavvio', async () => {
		const { unmount } = await monta();
		tasto('p', { alt: true });
		await screen.findByRole('complementary', { name: 'Anteprima' });
		unmount();

		await monta();
		expect(screen.getByRole('complementary', { name: 'Anteprima' })).toBeTruthy();
	});
});

// ── Visualizza ───────────────────────────────────────────────────────

describe('menu Visualizza', () => {
	it('le otto viste di Esplora', async () => {
		await monta();

		await vista('Icone molto grandi');
		await waitFor(() => expect(lati()[0]).toBe(256));

		await vista('Icone piccole');
		await waitFor(() => expect(document.querySelectorAll('.cella.orizzontale').length).toBe(7));

		await vista('Riquadri');
		await waitFor(() => expect(document.querySelector('.cella .info')?.textContent).toBe('Cartella'));

		await vista('Contenuto');
		await waitFor(() => expect(document.querySelectorAll('.cella.piena').length).toBe(7));

		await vista('Dettagli');
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
	});

	it('Ctrl+rotella ingrandisce le icone a piacere e scende fino ai dettagli', async () => {
		await monta();
		await vista('Icone medie');
		await waitFor(() => expect(lati()[0]).toBe(64));

		fireEvent.wheel(window, { deltaY: -100, ctrlKey: true });
		await waitFor(() => expect(lati()[0]).toBeGreaterThan(64));

		// Molti colpi indietro: icone sempre più piccole, poi elenco, poi dettagli.
		for (let i = 0; i < 40; i++) fireEvent.wheel(window, { deltaY: 100, ctrlKey: true });
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
	});

	it('la rotella senza Ctrl non cambia vista', async () => {
		await monta();
		fireEvent.wheel(window, { deltaY: -100 });
		expect(nomi()).toContain('alfa.txt');
	});

	it('il cursore nella barra di stato regola la grandezza delle icone', async () => {
		await monta();
		await fireEvent.click(screen.getByRole('button', { name: 'Icone grandi' }));
		const cursore = (await screen.findByLabelText('Dimensione delle icone')) as HTMLInputElement;
		expect(cursore.value).toBe('128');

		await fireEvent.input(cursore, { target: { value: '200' } });
		await waitFor(() => expect(lati()[0]).toBe(200));
	});

	it('Ctrl+Maiusc+6 torna ai dettagli, Ctrl+Maiusc+2 alle icone grandi', async () => {
		await monta();
		fireEvent.keyDown(window, { key: '"', code: 'Digit2', ctrlKey: true, shiftKey: true });
		await waitFor(() => expect(lati()[0]).toBe(128));
		fireEvent.keyDown(window, { key: '&', code: 'Digit6', ctrlKey: true, shiftKey: true });
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
	});

	it('la vista scelta resta dopo un riavvio', async () => {
		const { unmount } = await monta();
		await vista('Icone grandi');
		await waitFor(() => expect(lati()[0]).toBe(128));
		unmount();

		render(Pagina);
		await waitFor(() => expect(lati()[0]).toBe(128));
	});

	it('visualizzazione compatta abbassa le righe', async () => {
		await monta();
		expect(riga('alfa.txt').style.height).toBe('32px');
		await vista('Visualizzazione compatta');
		await waitFor(() => expect(riga('alfa.txt').style.height).toBe('26px'));
	});

	it('le colonne si scelgono dal menu o dal clic destro sulle intestazioni', async () => {
		await monta();
		expect(document.querySelector('.row .tipo')).toBeNull();

		await fireEvent.contextMenu(document.querySelector('.tabellone')!);
		const menu = await screen.findByRole('menu');
		await fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Tipo' }));
		await waitFor(() => expect(riga('alfa.txt').querySelector('.tipo')?.textContent).toBe('Documento di testo TXT'));

		await vista('Dimensione');
		await waitFor(() => expect(riga('alfa.txt').querySelector('.size')).toBeNull());
	});

	it('le estensioni si possono nascondere, e la rinomina le conserva', async () => {
		await monta();
		await vista('Estensioni dei nomi file');
		await waitFor(() => expect(nomi()).toContain('alfa'));

		await fireEvent.click(riga('alfa'));
		tasto('F2');
		const campo = await campoRinomina();
		expect(campo.value).toBe('alfa');
		campo.value = 'omega';
		await fireEvent.keyDown(campo, { key: 'Enter' });

		await waitFor(() => expect(disco.esiste('C:\\omega.txt')).toBe(true));
	});

	it('elementi nascosti dal menu Visualizza', async () => {
		await monta();
		await vista('Elementi nascosti');
		const occhio = screen.getByTitle('Nascondi i file di sistema');
		expect(occhio.getAttribute('aria-pressed')).toBe('true');
	});
});

// ── Ordina ───────────────────────────────────────────────────────────

describe('menu Ordina', () => {
	it('ordina per colonna e verso', async () => {
		await monta();
		await ordina('Decrescente');
		await waitFor(() => expect(nomi().slice(3)).toEqual(['gamma.txt', 'delta.txt', 'beta.txt', 'alfa.txt']));

		await ordina('Crescente');
		await waitFor(() => expect(nomi().slice(3)).toEqual(['alfa.txt', 'beta.txt', 'delta.txt', 'gamma.txt']));
	});

	it('il menu segna l ordinamento attuale', async () => {
		await monta();
		await fireEvent.click(screen.getByRole('button', { name: 'Ordina' }));
		const menu = await screen.findByRole('menu');
		expect(within(menu).getByRole('menuitemcheckbox', { name: 'Nome' }).getAttribute('aria-checked')).toBe('true');
		expect(within(menu).getByRole('menuitemcheckbox', { name: 'Crescente' }).getAttribute('aria-checked')).toBe('true');
	});

	it('ogni cartella ricorda il suo ordinamento', async () => {
		await monta();
		await ordina('Decrescente');
		await waitFor(() => expect(nomi()[3]).toBe('gamma.txt'));

		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		await fireEvent.click(screen.getByRole('button', { name: 'Ordina' }));
		let menu = await screen.findByRole('menu');
		// Dati non è mai stata ordinata: parte dal crescente.
		expect(within(menu).getByRole('menuitemcheckbox', { name: 'Crescente' }).getAttribute('aria-checked')).toBe('true');
		await fireEvent.keyDown(window, { key: 'Escape' });

		await fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
		await waitFor(() => expect(nomi()[3]).toBe('gamma.txt'));
		await fireEvent.click(screen.getByRole('button', { name: 'Ordina' }));
		menu = await screen.findByRole('menu');
		expect(within(menu).getByRole('menuitemcheckbox', { name: 'Decrescente' }).getAttribute('aria-checked')).toBe('true');
	});

	it('raggruppa per tipo divide la lista in zone', async () => {
		await monta();
		await ordina('Raggruppa per tipo');
		await waitFor(() => expect(testate()).toEqual(['Cartelle, 3', 'Documenti, 4']));
	});

	it('i preferiti restano sopra ai gruppi', async () => {
		await monta();
		await fireEvent.click(riga('gamma.txt'));
		tasto('d', { ctrl: true });
		await ordina('Raggruppa per tipo');
		await waitFor(() => expect(testate()).toEqual(['Preferiti, 1', 'Cartelle, 3', 'Documenti, 3']));
	});

	it('raggruppa per nome', async () => {
		await monta();
		await ordina('Raggruppa per nome');
		await waitFor(() => expect(testate()).toEqual(['A–H, 5', 'Q–Z, 2']));
	});
});

// ── Aspetto ──────────────────────────────────────────────────────────

describe('temi e colori', () => {
	const variabile = (nome: string) => document.documentElement.style.getPropertyValue(nome);

	it('si sceglie un tema e il documento cambia colori', async () => {
		await monta();
		expect(variabile('--hull')).toBe('#171420');
		await dalMenu('Aspetto', 'Chiaro');
		await waitFor(() => expect(variabile('--hull')).toBe('#ffffff'));
		expect(document.documentElement.dataset.tema).toBe('chiaro');
	});

	it('il colore d accento sostituisce quello del tema', async () => {
		await monta();
		await dalMenu('Aspetto', 'Verde', 'menuitemradio');
		await waitFor(() => expect(variabile('--accent')).toBe('#22c55e'));
	});

	it('tema e accento restano dopo un riavvio', async () => {
		const { unmount } = await monta();
		await dalMenu('Aspetto', 'Oceano');
		await waitFor(() => expect(variabile('--hull')).toBe('#0d1e2c'));
		unmount();
		document.documentElement.removeAttribute('style');

		await monta();
		expect(variabile('--hull')).toBe('#0d1e2c');
	});
});

// ── Cartelle colorate ────────────────────────────────────────────────

describe('cartelle colorate', () => {
	async function colora(nome: string, colore: string) {
		await fireEvent.contextMenu(riga(nome));
		const menu = await screen.findByRole('menu');
		await fireEvent.click(within(menu).getByRole('menuitemradio', { name: colore }));
	}

	it('dal menu di una cartella si sceglie il colore', async () => {
		await monta();
		await colora('Dati', 'Verde');
		await waitFor(() => expect(riga('Dati').querySelector('.cartella-colorata')?.innerHTML).toContain('#22c55e'));
	});

	it('i file non hanno la tavolozza', async () => {
		await monta();
		await fireEvent.contextMenu(riga('alfa.txt'));
		const menu = await screen.findByRole('menu');
		expect(within(menu).queryByRole('group', { name: 'Colore cartella' })).toBeNull();
	});

	it('il colore si toglie con «Nessun colore»', async () => {
		await monta();
		await colora('Dati', 'Rosso');
		await waitFor(() => expect(riga('Dati').querySelector('.cartella-colorata')).not.toBeNull());
		await colora('Dati', 'Nessun colore');
		await waitFor(() => expect(riga('Dati').querySelector('.cartella-colorata')).toBeNull());
	});

	it('più cartelle insieme, e il colore resta dopo un riavvio', async () => {
		const { unmount } = await monta();
		await fireEvent.click(riga('Dati'));
		await fireEvent.click(riga('Vuota'), { ctrlKey: true });
		await colora('Vuota', 'Blu');
		await waitFor(() => expect(document.querySelectorAll('.cartella-colorata').length).toBe(2));
		unmount();

		await monta();
		expect(document.querySelectorAll('.cartella-colorata').length).toBe(2);
	});

	it('rinominando la cartella il colore la segue', async () => {
		await monta();
		await colora('Vuota', 'Viola');
		await fireEvent.click(riga('Vuota'));
		tasto('F2');
		const campo = await campoRinomina();
		campo.value = 'Progetti';
		await fireEvent.keyDown(campo, { key: 'Enter' });

		await waitFor(() => expect(riga('Progetti').querySelector('.cartella-colorata')?.innerHTML).toContain('#a855f7'));
	});

	it('il colore si vede anche nelle viste a icone', async () => {
		await monta();
		await colora('Dati', 'Arancione');
		await vista('Icone grandi');
		await waitFor(() => expect(document.querySelector('.cella .disegno')?.innerHTML).toContain('#f97316'));
	});
});

// ── Trascinamento ────────────────────────────────────────────────────

describe('trascinamento', () => {
	function trascinaDa(el: HTMLElement) {
		// Il file si prende per il nome, come in Esplora: dal resto della
		// riga parte il rettangolo di selezione.
		fireEvent.mouseDown(el.querySelector('.name') ?? el, { button: 0, clientX: 10, clientY: 10 });
		fireEvent.mouseMove(window, { buttons: 1, clientX: 40, clientY: 10 });
	}

	function rilascia(sopra: Element | null, paths: string[]) {
		document.elementFromPoint = () => sopra;
		suTrascina?.({ payload: { type: 'drop', paths, position: { x: 5, y: 5 } } });
	}

	it('trascinare una voce consegna a Windows la selezione intera', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		await fireEvent.click(riga('beta.txt'), { ctrlKey: true });
		trascinaDa(riga('beta.txt'));

		await waitFor(() =>
			expect(disco.shell[0]).toEqual({ cmd: 'start_drag', args: { paths: ['C:\\alfa.txt', 'C:\\beta.txt'] } })
		);
	});

	it('dalla parte vuota della riga non si trascina il file: parte il rettangolo', async () => {
		await monta();
		const data = riga('alfa.txt').querySelector('.date')!;
		fireEvent.mouseDown(data, { button: 0, clientX: 10, clientY: 10 });
		fireEvent.mouseMove(window, { buttons: 1, clientX: 40, clientY: 60 });
		fireEvent.mouseUp(window);
		expect(disco.shell).toEqual([]);
	});

	it('un clic senza movimento non è un trascinamento', async () => {
		await monta();
		fireEvent.mouseDown(riga('alfa.txt'), { button: 0, clientX: 10, clientY: 10 });
		fireEvent.mouseMove(window, { buttons: 1, clientX: 12, clientY: 11 });
		fireEvent.mouseUp(window);
		expect(disco.shell).toEqual([]);
	});

	it('rilasciare su una cartella dello stesso disco sposta', async () => {
		await monta();
		rilascia(riga('Dati'), ['C:\\alfa.txt']);
		await waitFor(() => expect(disco.esiste('C:\\Dati\\alfa.txt')).toBe(true));
		expect(disco.esiste('C:\\alfa.txt')).toBe(false);
	});

	it('con Ctrl premuto copia invece di spostare', async () => {
		await monta();
		disco.tasti = { ctrl: true, shift: false, alt: false };
		rilascia(riga('Dati'), ['C:\\alfa.txt']);
		await waitFor(() => expect(disco.esiste('C:\\Dati\\alfa.txt')).toBe(true));
		expect(disco.esiste('C:\\alfa.txt')).toBe(true);
	});

	it('file da un altro disco si copiano nella cartella aperta', async () => {
		disco.nodi.set('D:\\', { kind: 'dir', size: 0, hidden: false, modified: 0 });
		disco.nodi.set('D:\\esterno.txt', { kind: 'file', size: 1, hidden: false, modified: 0 });
		await monta();

		rilascia(document.querySelector('.viewport'), ['D:\\esterno.txt']);
		await waitFor(() => expect(nomi()).toContain('esterno.txt'));
		expect(disco.esiste('D:\\esterno.txt')).toBe(true);
	});

	it('rilasciare sul Cestino della barra laterale cestina', async () => {
		await monta();
		rilascia(screen.getByRole('button', { name: 'Cestino' }), ['C:\\gamma.txt']);
		await waitFor(() => expect(disco.cestino).toEqual(['C:\\gamma.txt']));
	});

	it('elementi rilasciati dove già sono non si muovono', async () => {
		await monta();
		rilascia(document.querySelector('.viewport'), ['C:\\alfa.txt']);
		await new Promise((r) => setTimeout(r, 20));
		expect(disco.esiste('C:\\alfa.txt')).toBe(true);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('passando sopra una cartella la evidenzia come destinazione', async () => {
		await monta();
		document.elementFromPoint = () => riga('Dati');
		suTrascina?.({ payload: { type: 'over', position: { x: 5, y: 5 } } });
		await waitFor(() => expect(riga('Dati').classList.contains('bersaglio')).toBe(true));

		suTrascina?.({ payload: { type: 'leave' } });
		await waitFor(() => expect(riga('Dati').classList.contains('bersaglio')).toBe(false));
	});
});

// ── Barra dei comandi e Nuovo ────────────────────────────────────────

describe('barra dei comandi', () => {
	async function nuovo(etichetta: string | RegExp) {
		await fireEvent.click(screen.getByRole('button', { name: 'Nuovo' }));
		const menu = await screen.findByRole('menu');
		const nome = typeof etichetta === 'string' ? new RegExp(`^${etichetta}`) : etichetta;
		await fireEvent.click(within(menu).getByRole('menuitem', { name: nome }));
	}

	it('«Nuovo» sta a sinistra, prima di tutti gli altri comandi', async () => {
		await monta();
		const barra = screen.getByRole('toolbar', { name: 'Comandi' });
		expect(within(barra).getAllByRole('button')[0].textContent).toContain('Nuovo');
	});

	it('Nuovo › Documento di testo crea il file e lo apre in rinomina', async () => {
		await monta();
		await nuovo('Documento di testo');

		await waitFor(() => expect(disco.esiste('C:\\Nuovo Documento di testo.txt')).toBe(true));
		const campo = await campoRinomina();
		campo.value = 'appunti.txt';
		await fireEvent.keyDown(campo, { key: 'Enter' });
		await waitFor(() => expect(nomi()).toContain('appunti.txt'));
	});

	it('Nuovo offre i tipi registrati in Windows e numera il secondo', async () => {
		await monta();
		await nuovo('Cartella compressa');
		await waitFor(() => expect(disco.esiste('C:\\Nuovo Cartella compressa.zip')).toBe(true));
		await fireEvent.keyDown(await campoRinomina(), { key: 'Escape' });

		await nuovo('Cartella compressa');
		await waitFor(() => expect(disco.esiste('C:\\Nuovo Cartella compressa (2).zip')).toBe(true));
	});

	it('Nuovo › Cartella', async () => {
		await monta();
		// «Cartella» da sola, non «Cartella compressa»: la segue la scorciatoia.
		await nuovo(/^Cartella\s*Ctrl/);
		await waitFor(() => expect(disco.esiste('C:\\Nuova cartella')).toBe(true));
	});

	it('la creazione di un file si annulla con Ctrl+Z', async () => {
		await monta();
		await nuovo('Documento di testo');
		await waitFor(() => expect(disco.esiste('C:\\Nuovo Documento di testo.txt')).toBe(true));
		await fireEvent.keyDown(await campoRinomina(), { key: 'Escape' });
		tasto('z', { ctrl: true });
		await waitFor(() => expect(disco.esiste('C:\\Nuovo Documento di testo.txt')).toBe(false));
	});

	it('dal menu sullo sfondo «Nuovo…» apre lo stesso menu', async () => {
		await monta();
		await voceMenu(null, 'Nuovo…');
		const menu = await screen.findByRole('menu');
		await fireEvent.click(within(menu).getByRole('menuitem', { name: /^Documento di testo/ }));
		await waitFor(() => expect(disco.esiste('C:\\Nuovo Documento di testo.txt')).toBe(true));
	});

	it('nel Cestino «Nuovo» è spento', async () => {
		await monta();
		await fireEvent.click(screen.getByRole('button', { name: 'Cestino' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Nuovo' }).hasAttribute('disabled')).toBe(true));
	});

	it('taglia, copia, incolla ed elimina funzionano dalla barra', async () => {
		await monta();
		const barra = screen.getByRole('toolbar', { name: 'Comandi' });
		expect(within(barra).getByRole('button', { name: 'Copia' }).hasAttribute('disabled')).toBe(true);

		await fireEvent.click(riga('alfa.txt'));
		await fireEvent.click(within(barra).getByRole('button', { name: 'Copia' }));
		await waitFor(() => expect(disco.appunti?.paths).toEqual(['C:\\alfa.txt']));

		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		await fireEvent.click(within(barra).getByRole('button', { name: 'Incolla' }));
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));

		await fireEvent.click(riga('alfa.txt'));
		await fireEvent.click(within(barra).getByRole('button', { name: 'Elimina' }));
		expect(await screen.findByRole('dialog', { name: 'Conferma eliminazione' })).toBeTruthy();
	});

	it('il pulsante Cerca accanto all indirizzo apre la ricerca', async () => {
		await monta();
		await fireEvent.click(screen.getByRole('button', { name: /^Cerca in/ }));
		expect(await screen.findByLabelText('Filtra i file in questa cartella')).toBeTruthy();
	});
});

describe('finestra', () => {
	it('si sposta anche dalla zona delle schede e dalla linea del treno', async () => {
		await monta();
		expect(document.querySelector('.tabs')?.hasAttribute('data-tauri-drag-region')).toBe(true);
		expect(document.querySelector('.linea-principale')?.hasAttribute('data-tauri-drag-region')).toBe(true);
	});

	it('il tema rosa si applica', async () => {
		await monta();
		await dalMenu('Aspetto', 'Sakura');
		await waitFor(() => expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#f472b6'));
	});
});

// ── Recenti ──────────────────────────────────────────────────────────

describe('recenti', () => {
	const giorno = 24 * 60 * 60 * 1000;
	function modificato(path: string, giorniFa: number) {
		disco.nodi.get(path)!.modified = Date.now() - giorniFa * giorno;
	}

	it('il pulsante Recenti mette in cima ciò che è cambiato di recente', async () => {
		modificato('C:\\gamma.txt', 1);
		modificato('C:\\alfa.txt', 5);
		modificato('C:\\delta.txt', 40);
		await monta();

		await fireEvent.click(screen.getByRole('button', { name: 'Recenti' }));
		await waitFor(() => expect(testate()[0]).toBe('Modificati di recente, 2'));
		// Dal più nuovo.
		expect(nomi().slice(0, 2)).toEqual(['gamma.txt', 'alfa.txt']);
	});

	it('il cursore allarga e restringe il periodo', async () => {
		modificato('C:\\gamma.txt', 1);
		modificato('C:\\delta.txt', 40);
		await monta();
		await fireEvent.click(screen.getByRole('button', { name: 'Recenti' }));
		await waitFor(() => expect(testate()[0]).toBe('Modificati di recente, 1'));

		const cursore = screen.getByLabelText('Periodo') as HTMLInputElement;
		// Indice 5 = ultimi 3 mesi.
		await fireEvent.input(cursore, { target: { value: '5' } });
		await waitFor(() => expect(testate()[0]).toBe('Modificati di recente, 2'));
		expect(screen.getByText('Ultimi 3 mesi')).toBeTruthy();
	});

	it('anche i preferiti scendono sotto i recenti', async () => {
		modificato('C:\\beta.txt', 2);
		await monta();
		await fireEvent.click(riga('delta.txt'));
		tasto('d', { ctrl: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Recenti' }));

		await waitFor(() =>
			expect(testate()).toEqual(['Modificati di recente, 1', 'Preferiti, 1', 'Comuni, 5'])
		);
		expect(nomi()[0]).toBe('beta.txt');
	});

	it('la scelta resta dopo un riavvio, e la × la spegne', async () => {
		modificato('C:\\beta.txt', 2);
		const { unmount } = await monta();
		await fireEvent.click(screen.getByRole('button', { name: 'Recenti' }));
		await waitFor(() => expect(testate()[0]).toBe('Modificati di recente, 1'));
		unmount();

		await monta();
		expect(testate()[0]).toBe('Modificati di recente, 1');
		await fireEvent.click(screen.getByRole('button', { name: 'Nascondi i recenti' }));
		await waitFor(() => expect(testate()).toEqual([]));
	});
});

// ── Rete locale ──────────────────────────────────────────────────────

describe('rete locale', () => {
	const altro = { id: 'PC2-ab12', nome: 'PC2', ip: '192.168.1.20', porta: 47821, condivisa: 'Condivisa' };

	/** Un altro PC con una cartella condivisa che contiene foto e un documento. */
	function conAltroPc() {
		disco.pari = [altro];
		for (const [p, dir] of [
			['::lan\\PC2-ab12', true],
			['::lan\\PC2-ab12\\Foto', true],
			['::lan\\PC2-ab12\\Foto\\mare.jpg', false],
			['::lan\\PC2-ab12\\relazione.docx', false]
		] as const) {
			disco.nodi.set(p, { kind: dir ? 'dir' : 'file', size: 100, hidden: false, modified: 0 });
		}
	}

	it('l interruttore rende visibile questo PC', async () => {
		await monta();
		const interruttore = await screen.findByRole('switch', { name: /Rendi visibile/ });
		expect(interruttore.getAttribute('aria-checked')).toBe('false');

		await fireEvent.click(interruttore);
		await waitFor(() => expect(disco.lan.visibile).toBe(true));
		expect(await screen.findByText(/Visibile come QUESTO/)).toBeTruthy();
	});

	it('gli altri PC compaiono nella barra laterale quando si annunciano', async () => {
		await monta();
		expect(screen.queryByRole('button', { name: /PC2/ })).toBeNull();

		ascoltatori.get('lan-pari')?.({ payload: [altro] });
		expect(await screen.findByRole('button', { name: /PC2/ })).toBeTruthy();
	});

	it('si sfoglia la cartella condivisa dell altro PC', async () => {
		conAltroPc();
		await monta();
		await fireEvent.click(await screen.findByRole('button', { name: /PC2/ }));
		await waitFor(() => expect(nomi()).toEqual(['Foto', 'relazione.docx']));

		await entraIn('Foto');
		await waitFor(() => expect(nomi()).toEqual(['mare.jpg']));
		// Nella cartella di un altro PC non si crea niente.
		expect(screen.getByRole('button', { name: 'Nuovo' }).hasAttribute('disabled')).toBe(true);
	});

	it('copia dall altro PC e incolla qui', async () => {
		conAltroPc();
		await monta();
		await fireEvent.click(await screen.findByRole('button', { name: /PC2/ }));
		await waitFor(() => expect(nomi()).toContain('relazione.docx'));
		await fireEvent.click(riga('relazione.docx'));
		tasto('c', { ctrl: true });

		await fireEvent.click(screen.getByRole('button', { name: /Disco locale/ }));
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('v', { ctrl: true });

		await waitFor(() => expect(nomi()).toContain('relazione.docx'));
		expect(disco.esiste('C:\\Dati\\relazione.docx')).toBe(true);
	});

	it('trascinato fuori dall app, un file dell altro PC arriva a Windows come file vero', async () => {
		conAltroPc();
		await monta();
		await fireEvent.click(await screen.findByRole('button', { name: /PC2/ }));
		await waitFor(() => expect(nomi()).toContain('relazione.docx'));
		const nome = riga('relazione.docx').querySelector('.name')!;
		fireEvent.mouseDown(nome, { button: 0, clientX: 10, clientY: 10 });
		fireEvent.mouseMove(window, { buttons: 1, clientX: 40, clientY: 10 });

		// Prima si scarica in una cartella temporanea, poi parte il
		// trascinamento con quel path: un `::lan\…` Windows non lo conosce.
		await waitFor(() =>
			expect(disco.shell[0]).toEqual({ cmd: 'start_drag', args: { paths: ['C:\\Temp\\relazione.docx'] } })
		);
		expect(disco.esiste('C:\\Temp\\relazione.docx')).toBe(true);
	});

	it('un file dell altro PC si apre col doppio clic', async () => {
		conAltroPc();
		await monta();
		await fireEvent.click(await screen.findByRole('button', { name: /PC2/ }));
		await waitFor(() => expect(nomi()).toContain('relazione.docx'));
		await fireEvent.dblClick(riga('relazione.docx'));
		await waitFor(() => expect(disco.aperti).toEqual(['::lan\\PC2-ab12\\relazione.docx']));
	});

	it('Invia a manda la selezione all altro PC', async () => {
		disco.pari = [altro];
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		await fireEvent.click(riga('beta.txt'), { ctrlKey: true });
		await voceMenu(riga('beta.txt'), 'Invia a PC2');

		await waitFor(() =>
			expect(disco.inviati).toEqual([{ peer: 'PC2-ab12', paths: ['C:\\alfa.txt', 'C:\\beta.txt'] }])
		);
		expect(await screen.findByText('2 elementi inviati a PC2.')).toBeTruthy();
	});

	it('i file in arrivo chiedono il consenso, e si possono rifiutare', async () => {
		await monta();
		ascoltatori.get('lan-richiesta')?.({
			payload: { id: 7, da: 'PC2', quanti: 2, totale: 2048, nomi: ['a.txt', 'b.txt'] }
		});
		const dialogo = await screen.findByRole('dialog', { name: 'File in arrivo' });
		expect(within(dialogo).getByText('a.txt')).toBeTruthy();
		// Il fuoco parte da Rifiuta: un Invio d'istinto non accetta niente.
		expect(document.activeElement?.textContent).toBe('Rifiuta');

		await fireEvent.click(within(dialogo).getByRole('button', { name: 'Rifiuta' }));
		await waitFor(() => expect(disco.risposte).toEqual([{ id: 7, accetta: false }]));
		expect(screen.queryByRole('dialog', { name: 'File in arrivo' })).toBeNull();
	});

	it('accettando arrivano e lo si viene a sapere', async () => {
		await monta();
		ascoltatori.get('lan-richiesta')?.({
			payload: { id: 8, da: 'PC2', quanti: 1, totale: 10, nomi: ['foto.jpg'] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: 'Accetta' }));
		await waitFor(() => expect(disco.risposte).toEqual([{ id: 8, accetta: true }]));

		ascoltatori.get('lan-ricevuto')?.({
			payload: { id: 8, da: 'PC2', cartella: 'C:\\Ricevuti', quanti: 1, errore: null }
		});
		expect(await screen.findByText('Ricevuti 1 elemento da PC2 in C:\\Ricevuti.')).toBeTruthy();
	});

	it('chi riceve può annullare dalla barra d avanzamento', async () => {
		await monta();
		ascoltatori.get('lan-ricezione')?.({ payload: { id: 9, fatti: 10, totale: 100 } });
		await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
		await waitFor(() => expect(disco.ricezioniAnnullate).toEqual([9]));

		ascoltatori.get('lan-ricevuto')?.({
			payload: { id: 9, da: 'PC2', cartella: 'C:\\Ricevuti', quanti: 0, errore: null, annullato: true }
		});
		expect(await screen.findByText('Ricezione da PC2 annullata.')).toBeTruthy();
	});

	it('condividere una cartella la rende visibile in rete, in sola lettura', async () => {
		await monta();
		await voceMenu(riga('Dati'), 'Condividi in rete locale');
		await waitFor(() => expect(disco.lan).toEqual({ visibile: true, condivisa: 'C:\\Dati', ricevuti: null, indirizzi: [] }));
		expect(await screen.findByText(/Condivide «Dati»/)).toBeTruthy();

		await voceMenu(riga('Dati'), 'Smetti di condividere in rete locale');
		await waitFor(() => expect(disco.lan.condivisa).toBeNull());
	});
});

// ── Avvio da Windows ─────────────────────────────────────────────────

describe('avvio come file manager predefinito', () => {
	it('apre la cartella passata da Windows invece di C:', async () => {
		disco.iniziale = { cartella: 'C:\\Dati', seleziona: null };
		render(Pagina);
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		expect(schede()).toEqual(['Dati']);
	});

	it('con /select apre la cartella e seleziona il file', async () => {
		disco.iniziale = { cartella: 'C:\\', seleziona: 'C:\\gamma.txt' };
		render(Pagina);
		await waitFor(() => expect(selezionati()).toEqual(['gamma.txt']));
	});

	it('una cartella aperta mentre l app è già aperta arriva come scheda nuova', async () => {
		await monta();
		ascoltatori.get('apri-percorso')?.({
			payload: { finestra: 'main', dest: { cartella: 'C:\\Dati', seleziona: null } }
		});
		await waitFor(() => expect(schede()).toEqual(['C:', 'Dati']));
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
	});
});

describe('barra di stato', () => {
	it('dice quanti elementi ci sono e quanti sono selezionati, con gli spazi giusti', async () => {
		await monta();
		expect(document.querySelector('.stato')?.textContent?.trim()).toBe('7 elementi');
		await fireEvent.click(riga('alfa.txt'));
		await waitFor(() =>
			expect(document.querySelector('.stato')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
				'1 selezionati · 7 elementi'
			)
		);
	});
});

// ── Più finestre ─────────────────────────────────────────────────────

describe('più finestre', () => {
	it('una finestra nuova apre la sua cartella, con una scheda sola', async () => {
		etichettaFinestra = 'finestra-2';
		(window as unknown as { __SPACE_TRAIN_APRI?: string }).__SPACE_TRAIN_APRI = 'C:\\Dati';
		render(Pagina);
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		// Il ciclo che apriva schede all'infinito non deve tornare.
		await new Promise((r) => setTimeout(r, 100));
		expect(schede()).toEqual(['Dati']);
	});

	it('una finestra nuova senza cartella parte da C:', async () => {
		etichettaFinestra = 'finestra-2';
		render(Pagina);
		await waitFor(() => expect(nomi()).toContain('alfa.txt'));
		expect(schede()).toEqual(['C:']);
	});

	it('Ctrl+N apre una nuova finestra sulla cartella attuale', async () => {
		await monta();
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		tasto('n', { ctrl: true });
		await waitFor(() => expect(disco.finestre).toEqual(['C:\\Dati']));
	});

	it('«Apri in una nuova finestra» dal menu di una cartella', async () => {
		await monta();
		await voceMenu(riga('Vuota'), 'Apri in una nuova finestra');
		await waitFor(() => expect(disco.finestre).toEqual(['C:\\Vuota']));
	});

	it('una cartella da Windows destinata a un altra finestra qui non arriva', async () => {
		await monta();
		ascoltatori.get('apri-percorso')?.({
			payload: { finestra: 'finestra-2', dest: { cartella: 'C:\\Dati', seleziona: null } }
		});
		await new Promise((r) => setTimeout(r, 100));
		expect(schede()).toEqual(['C:']);
	});
});

// ── Accesso rapido ───────────────────────────────────────────────────

describe('accesso rapido', () => {
	const barra = () => document.querySelector<HTMLElement>('.sidebar')!;
	const fissate = () => barra().querySelectorAll('.voce.fissata');
	// Il nome senza lo spillo che lo precede.
	const nomiFissate = () => [...(fissate() ?? [])].map((v) => v.textContent?.replace('📌', '').trim());

	it('una cartella si fissa dal suo menu e compare accanto alle cartelle di Windows', async () => {
		await monta();
		expect(fissate()).toHaveLength(0);
		await voceMenu(riga('Dati'), 'Fissa nella barra laterale');
		await waitFor(() => expect(nomiFissate()).toEqual(['Dati']));

		// Un clic ci porta, ovunque ci si trovi.
		await entraIn('Vuota');
		await screen.findByText('Deposito vuoto');
		await fireEvent.click(within(barra()).getByRole('button', { name: /Dati/ }));
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
	});

	it('si fissa anche la cartella aperta, dal menu sullo sfondo', async () => {
		await monta();
		await entraIn('Dati');
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
		await voceMenu(null, 'Fissa nella barra laterale');
		await waitFor(() => expect(nomiFissate()).toEqual(['Dati']));
	});

	it('le cartelle fissate restano dopo un riavvio', async () => {
		const { unmount } = await monta();
		await voceMenu(riga('Dati'), 'Fissa nella barra laterale');
		await waitFor(() => expect(nomiFissate()).toEqual(['Dati']));
		unmount();
		await monta();
		expect(nomiFissate()).toEqual(['Dati']);
	});

	it('dal menu della barra laterale si riordina e si rimuove', async () => {
		await monta();
		await voceMenu(riga('Dati'), 'Fissa nella barra laterale');
		await voceMenu(riga('Vuota'), 'Fissa nella barra laterale');
		await waitFor(() => expect(nomiFissate()).toEqual(['Dati', 'Vuota']));

		const menuSu = async (nome: string, voce: string) => {
			const b = within(barra()).getAllByRole('button', { name: new RegExp(nome) })[0];
			await fireEvent.contextMenu(b);
			const m = await screen.findByRole('menu');
			await fireEvent.click(within(m).getByRole('menuitem', { name: voce }));
		};

		await menuSu('Vuota', 'Sposta su');
		await waitFor(() => expect(nomiFissate()).toEqual(['Vuota', 'Dati']));

		await menuSu('Vuota', 'Togli dalla barra laterale');
		await waitFor(() => expect(nomiFissate()).toEqual(['Dati']));
	});

	it('una cartella fissata è una destinazione per il trascinamento', async () => {
		await monta();
		await voceMenu(riga('Dati'), 'Fissa nella barra laterale');
		await waitFor(() => expect(nomiFissate()).toEqual(['Dati']));
		const voce = within(barra()).getAllByRole('button', { name: /Dati/ })[0];
		document.elementFromPoint = () => voce;
		suTrascina?.({ payload: { type: 'drop', paths: ['C:\\beta.txt'], position: { x: 1, y: 1 } } });
		await waitFor(() => expect(disco.esiste('C:\\Dati\\beta.txt')).toBe(true));
	});

	it('rinominata, la cartella resta fissata col nome nuovo', async () => {
		await monta();
		await voceMenu(riga('Vuota'), 'Fissa nella barra laterale');
		await fireEvent.click(riga('Vuota'));
		tasto('F2');
		const campo = await campoRinomina();
		campo.value = 'Progetti';
		await fireEvent.keyDown(campo, { key: 'Enter' });
		await waitFor(() => expect(nomiFissate()).toEqual(['Progetti']));
	});
});

// ── Temi mondo, accento personalizzato, editor ───────────────────────

describe('temi mondo', () => {
	const variabile = (nome: string) => document.documentElement.style.getPropertyValue(nome);

	it('un tema mondo cambia forme, carattere e chi sfila sul binario', async () => {
		await monta();
		await dalMenu('Aspetto', 'Kawaii');
		await waitFor(() => expect(variabile('--radius')).toBe('24px'));
		expect(variabile('--font-display')).toContain('Comic Sans');
		expect(variabile('--motivo')).toContain('data:image/svg+xml');
		expect(document.documentElement.dataset.mondo).toBe('kawaii');
	});

	it('nel tema Gatti al posto del treno sfilano i gatti', async () => {
		await monta();
		await dalMenu('Aspetto', 'Gatti');
		// La prima partenza avviene poco dopo l'avvio.
		await waitFor(() => expect(document.querySelectorAll('.sfilata .figura').length).toBe(4), { timeout: 3000 });
		expect(document.querySelector('.sfilata')?.innerHTML).toContain('#f59e0b');
	});

	it('nei temi solo colore resta il treno', async () => {
		await monta();
		await dalMenu('Aspetto', 'Oceano');
		await waitFor(() => expect(document.querySelector('.convoglio')).not.toBeNull(), { timeout: 3000 });
		expect(document.querySelector('.sfilata')).toBeNull();
	});
});

describe('evidenziazione personalizzata', () => {
	it('il selettore di colore imposta un accento qualsiasi', async () => {
		await monta();
		const selettore = screen.getByLabelText("Colore d'evidenziazione personalizzato");
		await fireEvent.input(selettore, { target: { value: '#13a8a8' } });
		await waitFor(() => expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#13a8a8'));
	});
});

describe('editor dei temi', () => {
	const variabile = (nome: string) => document.documentElement.style.getPropertyValue(nome);

	async function apriEditor() {
		await fireEvent.click(screen.getByRole('button', { name: 'Aspetto' }));
		const menu = await screen.findByRole('menu');
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Crea o modifica un tema…' }));
		return screen.findByRole('dialog', { name: 'Editor dei temi' });
	}

	it('le modifiche si vedono dal vivo e Annulla le toglie', async () => {
		await monta();
		const editor = await apriEditor();
		await fireEvent.input(within(editor).getByLabelText('Arrotondamento finestre'), { target: { value: '27' } });
		await waitFor(() => expect(variabile('--radius')).toBe('27px'));

		await fireEvent.click(within(editor).getByRole('button', { name: 'Annulla' }));
		await waitFor(() => expect(variabile('--radius')).toBe('12px'));
	});

	it('si crea un tema con colori, forme e personaggi, e resta dopo un riavvio', async () => {
		const { unmount } = await monta();
		const editor = await apriEditor();
		await fireEvent.input(within(editor).getByLabelText('Nome del tema'), { target: { value: 'Il mio mondo' } });
		await fireEvent.input(within(editor).getByLabelText('Evidenziazione'), { target: { value: '#00aa55' } });
		await fireEvent.click(within(editor).getByLabelText('Personaggi inclusi'));
		await fireEvent.click(within(editor).getByRole('button', { name: 'Pinguino' }));
		await fireEvent.click(within(editor).getByRole('button', { name: 'Fantasmino' }));
		await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));

		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editor dei temi' })).toBeNull());
		expect(variabile('--accent')).toBe('#00aa55');
		await waitFor(() => expect(document.querySelectorAll('.sfilata .figura').length).toBe(2), { timeout: 3000 });
		unmount();

		await monta();
		await fireEvent.click(screen.getByRole('button', { name: 'Aspetto' }));
		const menu = await screen.findByRole('menu');
		const voce = within(menu).getByRole('menuitemcheckbox', { name: 'Il mio mondo' });
		expect(voce.getAttribute('aria-checked')).toBe('true');
	});

	it('un tema proprio si riapre in modifica e si può eliminare', async () => {
		await monta();
		let editor = await apriEditor();
		await fireEvent.input(within(editor).getByLabelText('Nome del tema'), { target: { value: 'Da buttare' } });
		await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		editor = await apriEditor();
		expect(within(editor).getByText('Modifica tema')).toBeTruthy();
		await fireEvent.click(within(editor).getByRole('button', { name: 'Elimina tema' }));
		await waitFor(() => expect(variabile('--hull')).toBe('#171420'));
	});

	it('le proprie immagini si copiano nell app e sfilano sul binario', async () => {
		await monta();
		const editor = await apriEditor();
		await fireEvent.click(within(editor).getByLabelText('Le mie immagini'));
		const file = new File([new Uint8Array([71, 73, 70])], 'mio-personaggio.gif', { type: 'image/gif' });
		await fireEvent.change(within(editor).getByLabelText('Aggiungi immagini'), { target: { files: [file] } });
		await waitFor(() => expect(disco.immaginiTema).toEqual(['mio-personaggio.gif']));
		expect(within(editor).getByText('mio-personaggio.gif')).toBeTruthy();

		await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));
		await waitFor(() => expect(document.querySelector('.sfilata img')?.getAttribute('src')).toBe(
			'asset://C:\\DatiApp\\temi-immagini\\mio-personaggio.gif'
		), { timeout: 3000 });
	});
});

// ── Spritesheet ──────────────────────────────────────────────────────

describe('spritesheet nei temi', () => {
	/**
	 * jsdom non decodifica immagini: un'Image finta che dice di essere una
	 * striscia di 8 fotogrammi da 32×32.
	 */
	function immagineFinta(larghezza: number, altezza: number) {
		const originale = window.Image;
		class Finta {
			src = '';
			naturalWidth = larghezza;
			naturalHeight = altezza;
			decode() {
				return Promise.resolve();
			}
		}
		(window as unknown as { Image: unknown }).Image = Finta;
		return () => ((window as unknown as { Image: unknown }).Image = originale);
	}

	async function editorConFile(nome: string) {
		await fireEvent.click(screen.getByRole('button', { name: 'Aspetto' }));
		const menu = await screen.findByRole('menu');
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Crea o modifica un tema…' }));
		const editor = await screen.findByRole('dialog', { name: 'Editor dei temi' });
		await fireEvent.click(within(editor).getByLabelText('Le mie immagini'));
		const file = new File([new Uint8Array([137, 80, 78, 71])], nome, { type: 'image/png' });
		await fireEvent.change(within(editor).getByLabelText('Aggiungi immagini'), { target: { files: [file] } });
		return editor;
	}

	it('una striscia di fotogrammi viene riconosciuta e cammina sul binario a scatti', async () => {
		const ripristina = immagineFinta(256, 32);
		try {
			await monta();
			const editor = await editorConFile('camminata.png');
			const spunta = (await within(editor).findByLabelText('Spritesheet camminata.png')) as HTMLInputElement;
			await waitFor(() => expect(spunta.checked).toBe(true));
			expect((within(editor).getByLabelText('Fotogrammi di camminata.png') as HTMLInputElement).value).toBe('8');
			expect(within(editor).getByLabelText('Anteprima di camminata.png').getAttribute('style')).toContain('sprite-0-1-2-3-4-5-6-7');

			await fireEvent.input(within(editor).getByLabelText('Velocità di camminata.png'), { target: { value: '16' } });

			// Più grande sul binario: alto 90, e poi largo 45 invece che proporzionale.
			await fireEvent.input(within(editor).getByLabelText('Altezza sul binario di camminata.png'), { target: { value: '90' } });
			const largo = within(editor).getByLabelText('Larghezza sul binario di camminata.png') as HTMLInputElement;
			expect(largo.value).toBe('90');
			expect(largo.disabled).toBe(true);
			await fireEvent.click(within(editor).getByLabelText('Larghezza proporzionale di camminata.png'));
			expect(largo.disabled).toBe(false);
			await fireEvent.change(largo, { target: { value: '45' } });
			// L'anteprima resta alta 48, con le stesse proporzioni.
			expect(within(editor).getByLabelText('Anteprima di camminata.png').getAttribute('style')).toMatch(/width:\s*24px/);

			await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));

			await waitFor(
				() => expect(document.querySelector('.sfilata .sprite')?.getAttribute('style')).toContain('sprite-0-1-2-3-4-5-6-7'),
				{ timeout: 3000 }
			);
			const st = document.querySelector('.sfilata .sprite')!.getAttribute('style')!;
			// 8 fotogrammi a 16 fps: mezzo secondo per giro.
			expect(st).toMatch(/animation-duration:\s*0\.5s/);
			expect(st).toMatch(/image-rendering:\s*pixelated/);
			expect(st).toMatch(/width:\s*45px/);
			expect(st).toMatch(/height:\s*90px/);
			// Il binario si alza per non tagliarlo.
			expect((document.querySelector('.linea') as HTMLElement).style.height).toBe('100px');
			// E sopra il binario si fa spazio, perché non esca dalla finestra: 90 + 10 − 40.
			expect((document.querySelector('.linea-principale') as HTMLElement).style.paddingTop).toBe('60px');
			// Il percorso Windows arriva intero dentro url(), backslash compresi.
			expect(st).toContain('temi-immagini');
		} finally {
			ripristina();
		}
	});

	it('16 fotogrammi messi in righe e colonne si prendono tutti, riga per riga', async () => {
		// Quadrato: parte come immagine semplice, si accende lo spritesheet.
		const ripristina = immagineFinta(128, 128);
		try {
			await monta();
			const editor = await editorConFile('griglia.png');
			const spunta = (await within(editor).findByLabelText('Spritesheet griglia.png')) as HTMLInputElement;
			await fireEvent.click(spunta);
			const campo = async (nome: string) => (await within(editor).findByLabelText(`${nome} di griglia.png`)) as HTMLInputElement;

			await fireEvent.input(await campo('Righe della griglia'), { target: { value: '4' } });
			await fireEvent.input(await campo('Colonne della griglia'), { target: { value: '4' } });
			// Cambiando la griglia si usano tutte le celle.
			expect((await campo('Fotogrammi')).value).toBe('16');
			expect(within(editor).getByText(/Fotogramma 32×32 px/)).toBeTruthy();
			expect((await campo('Ordine dei fotogrammi')).value).toBe('1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16');

			const st = within(editor).getByLabelText('Anteprima di griglia.png').getAttribute('style')!;
			expect(st).toMatch(/width:\s*48px/);
			expect(st).toMatch(/animation-name:\s*sprite-g4-0-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15;/);
			// Nei keyframes il quinto fotogramma è la prima cella della seconda riga.
			const css = document.querySelector('style[data-sprite^="sprite-g4-0-1-2-3-4"]')!.textContent!;
			expect(css).toContain('25.0000%{background-position:calc(var(--x) - var(--passo) * 0) calc(var(--y) - var(--passo-y) * 1)}');

			// Sul foglio i numeri seguono la griglia: il 5 sta sotto l'1.
			const celle = [...editor.querySelectorAll('.zona .cella')] as HTMLElement[];
			expect(celle).toHaveLength(16);
			expect(celle.map((c) => c.textContent)).toEqual(Array.from({ length: 16 }, (_, k) => String(k + 1)));
			expect(celle[4].style.left).toBe(celle[0].style.left);
			expect(celle[4].style.top).not.toBe(celle[0].style.top);

			// Ultima riga incompleta: 15.
			await fireEvent.input(await campo('Fotogrammi'), { target: { value: '15' } });
			expect((await campo('Colonne della griglia')).value).toBe('4');
			expect(editor.querySelectorAll('.zona .numero')).toHaveLength(15);
		} finally {
			ripristina();
		}
	});

	it('fotogrammi a mano: si sceglie, si ridimensiona, se ne disegna uno nuovo e cammina sul binario', async () => {
		// 130×65 a zoom 4: un pixel del foglio sono quattro a schermo. Striscia di due da 65.
		const ripristina = immagineFinta(130, 65);
		try {
			await monta();
			const editor = await editorConFile('onda.png');
			await waitFor(() => expect((within(editor).getByLabelText('Spritesheet onda.png') as HTMLInputElement).checked).toBe(true));

			// Lo spazio fra le celle cambia il passo dell'animazione.
			await fireEvent.input(within(editor).getByLabelText('Spazio orizzontale fra i fotogrammi di onda.png'), { target: { value: '5' } });
			expect(within(editor).getByText(/Fotogramma 62.5×65 px/)).toBeTruthy();
			await fireEvent.input(within(editor).getByLabelText('Spazio orizzontale fra i fotogrammi di onda.png'), { target: { value: '0' } });

			await fireEvent.click(within(editor).getByLabelText('Fotogrammi a mano di onda.png'));
			const riquadri = () => editor.querySelectorAll('.riquadro');
			expect(riquadri()).toHaveLength(2);
			expect(within(editor).getByText(/2 fotogrammi\./)).toBeTruthy();

			const foglio = within(editor).getByRole('grid', { name: 'Foglio di onda.png' });
			const tira = async (el: Element, da: [number, number], a: [number, number]) => {
				await fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: da[0] * 4, clientY: da[1] * 4 });
				await fireEvent.pointerMove(foglio, { pointerId: 1, clientX: a[0] * 4, clientY: a[1] * 4 });
				await fireEvent.pointerUp(foglio, { pointerId: 1 });
			};

			// Clic sul secondo: diventa quello scelto.
			await tira(within(editor).getByLabelText('Fotogramma 2 di onda.png'), [100, 30], [100, 30]);
			expect(within(editor).getByText('n. 2: 65×65 px da 65,0')).toBeTruthy();
			// Si accorcia dal basso: un fotogramma più basso degli altri.
			await tira(within(editor).getByLabelText('Bordo inferiore del fotogramma di onda.png'), [97, 65], [97, 32]);
			expect(within(editor).getByText('n. 2: 65×32 px da 65,0')).toBeTruthy();

			// Nello spazio vuoto se ne disegna uno nuovo, in fondo alla lista.
			await tira(foglio, [70, 40], [120, 60]);
			expect(riquadri()).toHaveLength(3);
			expect(within(editor).getByText('n. 3: 50×20 px da 70,40')).toBeTruthy();
			expect((within(editor).getByLabelText('Ordine dei fotogrammi di onda.png') as HTMLInputElement).value).toBe('1, 2, 3');
			// E si toglie.
			await fireEvent.click(within(editor).getByLabelText('Togli il fotogramma 3 di onda.png'));
			expect(riquadri()).toHaveLength(2);

			const anteprima = within(editor).getByLabelText('Anteprima di onda.png').getAttribute('style')!;
			expect(anteprima).toMatch(/--sx:/);
			expect(anteprima).toMatch(/animation-name:\s*sprite-r\w+/);

			await fireEvent.click(within(editor).getByRole('button', { name: 'Salva tema' }));
			await waitFor(() => expect(document.querySelector('.sfilata .sprite')?.getAttribute('style')).toMatch(/sprite-r/), { timeout: 3000 });
			const st = document.querySelector('.sfilata .sprite')!.getAttribute('style')!;
			const nome = st.match(/animation-name:\s*(sprite-r\w+)/)![1];
			const css = document.querySelector(`style[data-sprite="${nome}"]`)!.textContent!;
			// Ogni tappa cambia anche la misura: il secondo è basso la metà.
			expect(css).toContain('width:calc(var(--sx) * 65px);height:calc(var(--sy) * 65px)');
			expect(css).toContain('width:calc(var(--sx) * 65px);height:calc(var(--sy) * 32px)');
		} finally {
			ripristina();
		}
	});

	it('lo sfondo si toglie con un pulsante, col colore dagli angoli o dal contagocce', async () => {
		const ripristina = immagineFinta(4, 2);
		try {
			await monta();
			pngScritti.length = 0;
			const editor = await editorConFile('omino.png');
			await waitFor(() => expect((within(editor).getByLabelText('Spritesheet omino.png') as HTMLInputElement).checked).toBe(true));

			await fireEvent.click(within(editor).getByRole('button', { name: 'Togli lo sfondo' }));
			// Il risultato è un PNG nuovo; il personaggio ora usa quello.
			await within(editor).findByLabelText('Spritesheet omino-trasparente.png');
			expect(disco.immaginiTema).toEqual(['omino.png', 'omino-trasparente.png']);
			const alfa = (img: { data: Uint8ClampedArray }) => [...img.data].filter((_, k) => k % 4 === 3);
			// Bianco degli angoli tolto, i due pixel rossi restano.
			expect(alfa(pngScritti[0])).toEqual([0, 255, 255, 0, 0, 0, 0, 0]);
			expect(within(editor).getByText(/Sfondo tolto: 6 pixel/)).toBeTruthy();
			expect(within(editor).getByLabelText('Anteprima di omino-trasparente.png').getAttribute('style')).toContain('omino-trasparente.png');

			// Contagocce sul pixel rosso: si toglie il rosso, sempre partendo dall'originale.
			await fireEvent.click(within(editor).getByRole('button', { name: 'Contagocce' }));
			const foglio = within(editor).getByRole('grid', { name: 'Foglio di omino-trasparente.png' });
			// Foglio da 4 px a zoom 16: il pixel (1, 0) sta tra 16 e 32.
			await fireEvent.pointerDown(foglio, { button: 0, pointerId: 1, clientX: 21, clientY: 5 });
			await waitFor(() =>
				expect((within(editor).getByLabelText('Colore dello sfondo di omino-trasparente.png') as HTMLInputElement).value).toBe('#c81e1e')
			);
			await fireEvent.click(within(editor).getByRole('button', { name: 'Togli lo sfondo' }));
			await waitFor(() => expect(pngScritti).toHaveLength(2));
			await waitFor(() => expect((within(editor).getByRole('button', { name: 'Togli lo sfondo' }) as HTMLButtonElement).disabled).toBe(false));
			expect(alfa(pngScritti[1])).toEqual([255, 0, 0, 255, 255, 255, 255, 255]);

			// Ripristina: torna l'immagine di partenza.
			await fireEvent.click(await within(editor).findByRole('button', { name: 'Ripristina originale' }));
			await within(editor).findByLabelText('Spritesheet omino.png');
		} finally {
			ripristina();
		}
	});

	it('la zona si disegna, si tira da bordi e angoli e si sposta, senza griglia', async () => {
		// 260 px a zoom 2: un pixel dell'immagine sono due a schermo.
		const ripristina = immagineFinta(260, 130);
		try {
			await monta();
			const editor = await editorConFile('foglio.png');
			const spunta = (await within(editor).findByLabelText('Spritesheet foglio.png')) as HTMLInputElement;
			await waitFor(() => expect(spunta.checked).toBe(true));

			const foglio = within(editor).getByRole('grid', { name: 'Foglio di foglio.png' });
			const valori = () =>
				['X', 'Y', 'Larghezza', 'Altezza'].map(
					(c) => (within(editor).getByLabelText(`${c} della zona di foglio.png`) as HTMLInputElement).value
				);
			/** Trascinata da un punto all'altro, in pixel dell'immagine. */
			const tira = async (el: Element, da: [number, number], a: [number, number]) => {
				await fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: da[0] * 2, clientY: da[1] * 2 });
				await fireEvent.pointerMove(foglio, { pointerId: 1, clientX: a[0] * 2, clientY: a[1] * 2 });
				await fireEvent.pointerUp(foglio, { pointerId: 1 });
			};
			const maniglia = (n: string) => within(editor).getByLabelText(`${n} della zona di foglio.png`);

			// All'inizio la zona copre tutto il foglio: trascinandoci dentro se ne
			// disegna una nuova, da (10, 10) a (110, 40).
			await tira(within(editor).getByLabelText('Zona di foglio.png'), [10, 10], [110, 40]);
			expect(valori()).toEqual(['10', '10', '100', '30']);
			await fireEvent.input(within(editor).getByLabelText('Fotogrammi di foglio.png'), { target: { value: '4' } });
			expect(within(editor).getByText(/Fotogramma 25×30 px/)).toBeTruthy();

			// L'angolo in basso a destra allarga in tutte e due le direzioni.
			await tira(maniglia('Angolo in basso a destra'), [110, 40], [150, 70]);
			expect(valori()).toEqual(['10', '10', '140', '60']);
			// Il bordo sinistro si ferma al bordo del foglio, il destro resta dov'è.
			await tira(maniglia('Bordo sinistro'), [10, 40], [-50, 40]);
			expect(valori()).toEqual(['0', '10', '150', '60']);
			// Il bordo superiore sale.
			await tira(maniglia('Bordo superiore'), [75, 10], [75, -100]);
			expect(valori()).toEqual(['0', '0', '150', '70']);
			// Si stringe quanto si vuole, fino a un pixel.
			await tira(maniglia('Bordo inferiore'), [75, 70], [75, -20]);
			expect(valori()[3]).toBe('1');
			await tira(maniglia('Bordo inferiore'), [75, 1], [75, 50]);
			expect(valori()).toEqual(['0', '0', '150', '50']);

			// Trascinata dentro la zona: si sposta tutta, senza uscire dal foglio.
			await tira(within(editor).getByLabelText('Zona di foglio.png'), [50, 30], [500, 500]);
			expect(valori()).toEqual(['110', '80', '150', '50']);

			// Anteprima a 48 px: parte dall'angolo della zona e fa quattro passi.
			const st = within(editor).getByLabelText('Anteprima di foglio.png').getAttribute('style')!;
			expect(st).toMatch(/--x:\s*-105\.6px/);
			expect(st).toMatch(/--y:\s*-76\.8px/);
			expect(st).toMatch(/animation-name:\s*sprite-0-1-2-3;/);

			// Camminata da tre: fermo tra un passo e l'altro, dal pulsante o a mano.
			await fireEvent.input(within(editor).getByLabelText('Fotogrammi di foglio.png'), { target: { value: '3' } });
			await fireEvent.click(within(editor).getByRole('button', { name: 'Fermo tra i passi' }));
			const ordine = within(editor).getByLabelText('Ordine dei fotogrammi di foglio.png') as HTMLInputElement;
			expect(ordine.value).toBe('2, 1, 3, 1');
			expect(within(editor).getByLabelText('Anteprima di foglio.png').getAttribute('style')).toMatch(/animation-name:\s*sprite-1-0-2-0;/);
			await fireEvent.change(ordine, { target: { value: '3 1 2 1 9' } });
			expect(ordine.value).toBe('3, 1, 2, 1');
			// I keyframes di quella sequenza sono nella pagina, un fotogramma fermo per tappa.
			const css = document.querySelector('style[data-sprite="sprite-2-0-1-0"]')!.textContent!;
			expect(css).toContain('0.0000%{background-position:calc(var(--x) - var(--passo) * 2) var(--y)}');
			expect(css).toContain('25.0000%{background-position:calc(var(--x) - var(--passo) * 0) var(--y)}');
			expect(css).toContain('50.0000%{background-position:calc(var(--x) - var(--passo) * 1) var(--y)}');
			expect(within(editor).getByLabelText('Anteprima di foglio.png').getAttribute('style')).toMatch(/animation-name:\s*sprite-2-0-1-0;/);
			await fireEvent.click(within(editor).getByRole('button', { name: 'Di fila' }));
			expect(ordine.value).toBe('1, 2, 3');

			// Anche a mano dai campi.
			await fireEvent.change(within(editor).getByLabelText('Larghezza della zona di foglio.png'), { target: { value: '9999' } });
			expect(valori()[2]).toBe('150');

			// Si torna a immagine semplice.
			await fireEvent.click(spunta);
			await waitFor(() => expect(within(editor).queryByLabelText('Fotogrammi di foglio.png')).toBeNull());
		} finally {
			ripristina();
		}
	});
});

// ── Selezione col mouse, sessione, cartelle all'avvio ────────────────

describe('selezione sul vuoto', () => {
	const vuoto = () => document.querySelector<HTMLElement>('.viewport')!;

	it('un clic sullo spazio vuoto toglie la selezione', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		await waitFor(() => expect(selezionati()).toEqual(['alfa.txt']));
		await fireEvent.mouseDown(vuoto(), { button: 0 });
		await fireEvent.mouseUp(window);
		await waitFor(() => expect(selezionati()).toEqual([]));
	});

	it('con Ctrl un clic sul vuoto lascia la selezione com era', async () => {
		await monta();
		await fireEvent.click(riga('alfa.txt'));
		await fireEvent.mouseDown(vuoto(), { button: 0, ctrlKey: true });
		await fireEvent.mouseUp(window);
		expect(selezionati()).toEqual(['alfa.txt']);
	});
});

describe('avvio con le schede', () => {
	it('le cartelle fissate per l avvio si aprono ognuna in una scheda', async () => {
		localStorage.setItem(
			'space-train.impostazioni',
			JSON.stringify({ cartelleAvvio: ['C:\\Dati', 'C:\\Vuota'] })
		);
		render(Pagina);
		await waitFor(() => expect(schede()).toEqual(['Dati', 'Vuota']));
	});

	it('con la sessione attiva tornano le schede della volta scorsa, e quella che era davanti', async () => {
		localStorage.setItem('space-train.impostazioni', JSON.stringify({ sessione: true }));
		localStorage.setItem(
			'space-train.sessione',
			JSON.stringify({ schede: ['C:\\', 'C:\\Dati', 'C:\\non-esiste-piu'], attiva: 1 })
		);
		render(Pagina);
		// La cartella sparita si salta.
		await waitFor(() => expect(schede()).toEqual(['C:', 'Dati']));
		await waitFor(() => expect(nomi()).toEqual(['interno.txt']));
	});

	it('senza sessione si riparte dalla pagina iniziale', async () => {
		localStorage.setItem('space-train.sessione', JSON.stringify({ schede: ['C:\\Dati'], attiva: 0 }));
		await monta();
		expect(schede()).toEqual(['C:']);
	});
});

// ── Novità dopo un aggiornamento ─────────────────────────────────────

describe('novità dopo un aggiornamento', () => {
	it('alla prima apertura della versione nuova spiega cosa è cambiato, una volta sola', async () => {
		disco.versioneApp = '0.2.2';
		localStorage.setItem('space-train.versione-vista', '0.2.1');
		const { unmount } = await monta();
		const finestra = await screen.findByRole('dialog', { name: 'Novità di Space Train' });
		expect(finestra.textContent).toContain('0.2.2');
		await fireEvent.click(within(finestra).getByRole('button', { name: 'Ho capito' }));
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novità di Space Train' })).toBeNull());
		expect(localStorage.getItem('space-train.versione-vista')).toBe('0.2.2');

		unmount();
		await monta();
		await new Promise((r) => setTimeout(r, 20));
		expect(screen.queryByRole('dialog', { name: 'Novità di Space Train' })).toBeNull();
	});

	it('a chi installa l app per la prima volta non mostra niente', async () => {
		disco.versioneApp = '0.2.2';
		await monta();
		await waitFor(() => expect(localStorage.getItem('space-train.versione-vista')).toBe('0.2.2'));
		expect(screen.queryByRole('dialog', { name: 'Novità di Space Train' })).toBeNull();
	});
});

// ── PC aggiunti per indirizzo ────────────────────────────────────────

describe('PC aggiunti per indirizzo', () => {
	const barra = () => document.querySelector<HTMLElement>('.sidebar')!;

	it('si aggiunge un indirizzo dalla barra laterale, e chi lo aggiunge diventa visibile', async () => {
		await monta();
		await fireEvent.click(await within(barra()).findByRole('button', { name: '+ Aggiungi PC per indirizzo' }));
		const campo = within(barra()).getByRole('textbox', { name: 'Indirizzo del PC da aggiungere' }) as HTMLInputElement;
		await fireEvent.input(campo, { target: { value: '100.64.0.2' } });
		await fireEvent.submit(campo.closest('form')!);

		await waitFor(() => expect(disco.lan.indirizzi).toEqual(['100.64.0.2']));
		expect(disco.lan.visibile).toBe(true);
		expect(barra().textContent).toContain('100.64.0.2');
	});

	it('si toglie con la crocetta', async () => {
		disco.lan = { visibile: true, condivisa: null, ricevuti: null, indirizzi: ['100.64.0.2'] };
		await monta();
		await fireEvent.click(await within(barra()).findByRole('button', { name: 'Togli 100.64.0.2' }));
		await waitFor(() => expect(disco.lan.indirizzi).toEqual([]));
	});
});
