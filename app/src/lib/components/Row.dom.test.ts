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

describe('Row in one-click mode', () => {
	function mount(props: Record<string, unknown>) {
		const onselect = vi.fn();
		const { container } = render(Row, {
			props: { entry: voce('note.txt'), onactivate: vi.fn(), onselect, ...props }
		});
		return { row: container.querySelector('.row') as HTMLElement, onselect };
	}

	it('selects the item the pointer rests on', () => {
		vi.useFakeTimers();
		try {
			const { row, onselect } = mount({ unClic: true });
			row.dispatchEvent(new MouseEvent('mouseenter'));
			vi.advanceTimersByTime(600);
			expect(onselect).toHaveBeenCalledWith(expect.objectContaining({ name: 'note.txt' }), {});
		} finally {
			vi.useRealTimers();
		}
	});

	it('does nothing if the pointer leaves first, or without one-click mode', () => {
		vi.useFakeTimers();
		try {
			const a = mount({ unClic: true });
			a.row.dispatchEvent(new MouseEvent('mouseenter'));
			a.row.dispatchEvent(new MouseEvent('mouseleave'));
			vi.advanceTimersByTime(600);
			expect(a.onselect).not.toHaveBeenCalled();

			const b = mount({ unClic: false });
			b.row.dispatchEvent(new MouseEvent('mouseenter'));
			vi.advanceTimersByTime(600);
			expect(b.onselect).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('Row with a content search snippet', () => {
	it('shows the found line with the match highlighted and the extra count', () => {
		const entry = { ...voce('note.txt'), snippet: { line: 42, text: '…la 😀 fattura 2024 qui', at: 6, len: 12, more: 2 } };
		const { container } = render(Row, { props: { entry, onactivate: vi.fn(), onselect: vi.fn() } });
		const f = container.querySelector('.frammento')!;
		expect(f.querySelector('.riga-num')?.textContent).toBe('42');
		expect(f.querySelector('mark')?.textContent).toBe('fattura 2024');
		expect(f.textContent).toContain('+2 altre righe');
	});

	it('plain rows have no snippet line', () => {
		const { container } = render(Row, { props: { entry: voce('note.txt'), onactivate: vi.fn(), onselect: vi.fn() } });
		expect(container.querySelector('.frammento')).toBeNull();
	});
});
