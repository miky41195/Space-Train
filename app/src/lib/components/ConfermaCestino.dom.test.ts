import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ConfermaCestino from './ConfermaCestino.svelte';
import type { Entry } from '../ipc';

afterEach(cleanup);

function voce(name: string): Entry {
	return { name, path: `C:\\${name}`, kind: 'file', size: 1, modified: 0, hidden: false };
}

function monta(voci: Entry[]) {
	const onconfirm = vi.fn();
	const oncancel = vi.fn();
	const risultato = render(ConfermaCestino, { props: { voci, onconfirm, oncancel } });
	return { ...risultato, onconfirm, oncancel };
}

describe('ConfermaCestino', () => {
	it('nomina l elemento che sta per sparire', () => {
		monta([voce('importante.txt')]);
		expect(screen.getByText(/importante\.txt/)).toBeTruthy();
	});

	it('con più elementi ne dichiara il numero', () => {
		monta([voce('a.txt'), voce('b.txt'), voce('c.txt')]);
		expect(screen.getByText(/3 elementi/)).toBeTruthy();
	});

	it('il focus parte su Annulla, non sull azione distruttiva', async () => {
		monta([voce('a.txt')]);
		await Promise.resolve();

		// Un Invio d'istinto non deve cancellare niente.
		expect(document.activeElement?.textContent).toBe('Annulla');
	});

	it('Annulla non conferma', () => {
		const { onconfirm, oncancel } = monta([voce('a.txt')]);

		screen.getByText('Annulla').dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(oncancel).toHaveBeenCalledTimes(1);
		expect(onconfirm).not.toHaveBeenCalled();
	});

	it('confermare non fa scattare anche l annullamento', () => {
		const { onconfirm, oncancel } = monta([voce('a.txt')]);

		screen
			.getByText('Sposta nel Cestino')
			.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(onconfirm).toHaveBeenCalledTimes(1);
		// Il click risaliva allo sfondo, che annullava: due callback per un
		// solo gesto, e l'esito dipendeva dall'ordine.
		expect(oncancel).not.toHaveBeenCalled();
	});

	it('cliccare fuori dalla finestra annulla', () => {
		const { container, oncancel } = monta([voce('a.txt')]);

		const sfondo = container.querySelector('.sfondo') as HTMLElement;
		sfondo.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(oncancel).toHaveBeenCalledTimes(1);
	});

	it('dice che il Cestino è recuperabile', () => {
		monta([voce('a.txt')]);
		expect(screen.getByText(/recuperarli dal Cestino/)).toBeTruthy();
	});
});
