import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import FileList from './FileList.svelte';
import { ROW_HEIGHT, ZONA_TESTATA } from '../virtual';
import type { Entry } from '../ipc';

afterEach(cleanup);

function voci(quante: number): Entry[] {
	return Array.from({ length: quante }, (_, i) => ({
		name: `file${i}.txt`,
		path: `C:\\file${i}.txt`,
		kind: 'file' as const,
		size: 1,
		modified: 0,
		hidden: false
	}));
}

function monta(entries: Entry[], preferiti = 0) {
	// Come fa la pagina: con dei preferiti la lista ha due zone.
	const zone =
		preferiti > 0
			? [
					{ etichetta: 'Preferiti', quante: preferiti, tono: 'preferiti' as const },
					{ etichetta: 'Comuni', quante: entries.length - preferiti }
				]
			: [];
	const risultato = render(FileList, {
		props: { entries, zone, onactivate: vi.fn(), onselect: vi.fn() }
	});

	const viewport = risultato.container.querySelector('.viewport') as HTMLElement;
	// jsdom non fa layout: clientHeight resta 0 e la finestra visibile
	// sarebbe vuota. Lo imponiamo a mano.
	Object.defineProperty(viewport, 'clientHeight', { value: 320, configurable: true });

	return { ...risultato, viewport };
}

describe('FileList virtualizzata', () => {
	it('renderizza poche righe anche con diecimila voci', async () => {
		const { container, viewport } = monta(voci(10_000));

		viewport.dispatchEvent(new Event('scroll'));
		await Promise.resolve();

		const righe = container.querySelectorAll('.row');
		// Il punto della virtualizzazione: il DOM non cresce col dataset.
		expect(righe.length).toBeGreaterThan(0);
		expect(righe.length).toBeLessThan(60);
	});

	it('lo spaziatore è alto quanto l intera lista', () => {
		const { container } = monta(voci(1000));

		const spacer = container.querySelector('.spacer') as HTMLElement;
		expect(spacer.style.height).toBe(`${1000 * ROW_HEIGHT}px`);
	});

	it('una lista vuota non renderizza righe', () => {
		const { container } = monta([]);
		expect(container.querySelectorAll('.row').length).toBe(0);
	});

	it('scorrendo cambiano le righe mostrate', async () => {
		const { container, viewport } = monta(voci(1000));

		const primoNome = () => container.querySelector('.name')?.textContent;
		const inizio = primoNome();

		Object.defineProperty(viewport, 'scrollTop', { value: ROW_HEIGHT * 500, configurable: true });
		viewport.dispatchEvent(new Event('scroll'));
		await Promise.resolve();

		expect(primoNome()).not.toBe(inizio);
	});

	it('senza preferiti non compare nessuna testata di zona', () => {
		const { container } = monta(voci(10));
		expect(container.querySelectorAll('.testata').length).toBe(0);
	});

	it('con i preferiti la cartella si divide in due zone', () => {
		const { container } = monta(voci(10), 3);

		const testate = container.querySelectorAll('.testata');
		expect(testate.length).toBe(2);
		expect(testate[0].getAttribute('aria-label')).toBe('Preferiti, 3');
		expect(testate[1].getAttribute('aria-label')).toBe('Comuni, 7');

		const spacer = container.querySelector('.spacer') as HTMLElement;
		expect(spacer.style.height).toBe(`${10 * ROW_HEIGHT + 2 * ZONA_TESTATA}px`);
	});
});
