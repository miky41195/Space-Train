import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';
import Row from './Row.svelte';
import type { Entry } from '../ipc';

afterEach(cleanup);

function item(name: string, kind: Entry['kind'] = 'file'): Entry {
	return { name, path: `C:\\${name}`, kind, size: 1234, modified: 0, hidden: false };
}

function mountRenaming(entry: Entry) {
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

	const field = screen.getByLabelText('Nuovo nome') as HTMLInputElement;
	return { field, onrename, oncancelrename };
}

describe('Row while renaming', () => {
	it('mostra il nome corrente nel field', () => {
		const { field } = mountRenaming(item('notes.txt'));
		expect(field.value).toBe('notes.txt');
	});

	it('Enter confirms the new name only once', async () => {
		const { field, onrename } = mountRenaming(item('old.txt'));

		field.value = 'new.txt';
		field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		// Lo smontaggio del field scatena blur: è il secondo invio che
		// caused «Esiste già un elemento con quel nome».
		field.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

		expect(onrename).toHaveBeenCalledTimes(1);
		expect(onrename).toHaveBeenCalledWith(expect.objectContaining({ name: 'old.txt' }), 'new.txt');
	});

	it('Escape cancels only once, without renaming', () => {
		const { field, onrename, oncancelrename } = mountRenaming(item('old.txt'));

		field.value = 'new.txt';
		field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		field.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

		expect(onrename).not.toHaveBeenCalled();
		expect(oncancelrename).toHaveBeenCalledTimes(1);
	});

	it('confirming the same name cancels instead of renaming', () => {
		const { field, onrename, oncancelrename } = mountRenaming(item('same.txt'));

		field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

		expect(onrename).not.toHaveBeenCalled();
		expect(oncancelrename).toHaveBeenCalledTimes(1);
	});

	it('a name of only spaces is not sent to the backend', () => {
		const { field, onrename, oncancelrename } = mountRenaming(item('valid.txt'));

		field.value = '   ';
		field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

		expect(onrename).not.toHaveBeenCalled();
		expect(oncancelrename).toHaveBeenCalledTimes(1);
	});

	it('blur alone, without Enter, still confirms', () => {
		const { field, onrename } = mountRenaming(item('old.txt'));

		field.value = 'new.txt';
		field.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

		expect(onrename).toHaveBeenCalledTimes(1);
	});
});

describe('Row, normal', () => {
	it('shows name and size', () => {
		render(Row, {
			props: {
				entry: item('notes.txt'),
				onactivate: vi.fn(),
				onselect: vi.fn()
			}
		});

		expect(screen.getByText('notes.txt')).toBeTruthy();
		expect(screen.getByText('1 KB')).toBeTruthy();
	});

	it('folders show no size', () => {
		render(Row, {
			props: {
				entry: item('projects', 'dir'),
				onactivate: vi.fn(),
				onselect: vi.fn()
			}
		});

		expect(screen.getByText('—')).toBeTruthy();
	});

	it('double click opens, single click selects', () => {
		const onactivate = vi.fn();
		const onselect = vi.fn();
		const { container } = render(Row, {
			props: { entry: item('a.txt'), onactivate, onselect }
		});

		const row = container.querySelector('.row') as HTMLElement;

		row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onselect).toHaveBeenCalledTimes(1);
		expect(onactivate).not.toHaveBeenCalled();

		row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(onactivate).toHaveBeenCalledTimes(1);
	});
});

describe('Row in one-click mode', () => {
	function mount(props: Record<string, unknown>) {
		const onselect = vi.fn();
		const { container } = render(Row, {
			props: { entry: item('note.txt'), onactivate: vi.fn(), onselect, ...props }
		});
		return { row: container.querySelector('.row') as HTMLElement, onselect };
	}

	it('selects the item the pointer rests on', () => {
		vi.useFakeTimers();
		try {
			const { row, onselect } = mount({ singleClick: true });
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
			const a = mount({ singleClick: true });
			a.row.dispatchEvent(new MouseEvent('mouseenter'));
			a.row.dispatchEvent(new MouseEvent('mouseleave'));
			vi.advanceTimersByTime(600);
			expect(a.onselect).not.toHaveBeenCalled();

			const b = mount({ singleClick: false });
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
		const entry = { ...item('note.txt'), snippet: { line: 42, text: '…la 😀 fattura 2024 qui', at: 6, len: 12, more: 2 } };
		const { container } = render(Row, { props: { entry, onactivate: vi.fn(), onselect: vi.fn() } });
		const f = container.querySelector('.snippet')!;
		expect(f.querySelector('.line-num')?.textContent).toBe('42');
		expect(f.querySelector('mark')?.textContent).toBe('fattura 2024');
		expect(f.textContent).toContain('+2 altre righe');
	});

	it('plain rows have no snippet line', () => {
		const { container } = render(Row, { props: { entry: item('note.txt'), onactivate: vi.fn(), onselect: vi.fn() } });
		expect(container.querySelector('.snippet')).toBeNull();
	});
});
