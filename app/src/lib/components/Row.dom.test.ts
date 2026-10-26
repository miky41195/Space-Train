import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';
import Row from './Row.svelte';
import type { Entry } from '../ipc';

afterEach(cleanup);

function voce(name: string, kind: Entry['kind'] = 'file'): Entry {
	return { name, path: `C:\\${name}`, kind, size: 1234, modified: 0, hidden: false };
}

function montaInRinomina(entry: Entry) {
	const onrename = vi.fn();
	const oncancelrename = vi.fn();

	render(Row, {
		props: {
			entry,
			renaming: true,
			onactivate: vi.fn(),
			onselect: vi.fn(),
			onrename,
			oncancelrename
		}
	});

	const campo = screen.getByLabelText('Nuovo nome') as HTMLInputElement;
	return { campo, onrename, oncancelrename };
}

describe('Row in rinomina', () => {
	it('mostra il nome corrente nel campo', () => {
		const { campo } = montaInRinomina(voce('appunti.txt'));
		expect(campo.value).toBe('appunti.txt');
	});

	it('Invio conferma il nuovo nome una volta sola', async () => {
		const { campo, onrename } = montaInRinomina(voce('vecchio.txt'));

		campo.value = 'nuovo.txt';
		campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		// Lo smontaggio del campo scatena blur: è il secondo invio che
		// causava «Esiste già un elemento con quel nome».
		campo.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

		expect(onrename).toHaveBeenCalledTimes(1);
		expect(onrename).toHaveBeenCalledWith(expect.objectContaining({ name: 'vecchio.txt' }), 'nuovo.txt');
	});

	it('Escape annulla una volta sola, senza rinominare', () => {
		const { campo, onrename, oncancelrename } = montaInRinomina(voce('vecchio.txt'));

		campo.value = 'nuovo.txt';
		campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		campo.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

		expect(onrename).not.toHaveBeenCalled();
		expect(oncancelrename).toHaveBeenCalledTimes(1);
	});

	it('confermare lo stesso nome annulla invece di rinominare', () => {
		const { campo, onrename, oncancelrename } = montaInRinomina(voce('uguale.txt'));

		campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

		expect(onrename).not.toHaveBeenCalled();
		expect(oncancelrename).toHaveBeenCalledTimes(1);
	});

	it('un nome di soli spazi non viene inviato al backend', () => {
		const { campo, onrename, oncancelrename } = montaInRinomina(voce('valido.txt'));

		campo.value = '   ';
		campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

		expect(onrename).not.toHaveBeenCalled();
		expect(oncancelrename).toHaveBeenCalledTimes(1);
	});

	it('il solo blur, senza Invio, conferma comunque', () => {
		const { campo, onrename } = montaInRinomina(voce('vecchio.txt'));

		campo.value = 'nuovo.txt';
		campo.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

		expect(onrename).toHaveBeenCalledTimes(1);
	});
});

describe('Row normale', () => {
	it('mostra nome e dimensione', () => {
		render(Row, {
			props: {
				entry: voce('appunti.txt'),
				onactivate: vi.fn(),
				onselect: vi.fn()
			}
		});

		expect(screen.getByText('appunti.txt')).toBeTruthy();
		expect(screen.getByText('1 KB')).toBeTruthy();
	});

	it('le cartelle non mostrano una dimensione', () => {
		render(Row, {
			props: {
				entry: voce('progetti', 'dir'),
				onactivate: vi.fn(),
				onselect: vi.fn()
			}
		});

		expect(screen.getByText('—')).toBeTruthy();
	});

	it('il doppio click apre, il click singolo seleziona', () => {
		const onactivate = vi.fn();
		const onselect = vi.fn();
		const { container } = render(Row, {
			props: { entry: voce('a.txt'), onactivate, onselect }
		});

		const riga = container.querySelector('.row') as HTMLElement;

		riga.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onselect).toHaveBeenCalledTimes(1);
		expect(onactivate).not.toHaveBeenCalled();

		riga.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(onactivate).toHaveBeenCalledTimes(1);
	});
});
