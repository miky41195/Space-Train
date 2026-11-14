import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ConfirmTrash from './ConfirmTrash.svelte';
import type { Entry } from '../ipc';

afterEach(cleanup);

function item(name: string): Entry {
	return { name, path: `C:\\${name}`, kind: 'file', size: 1, modified: 0, hidden: false };
}

function mount(items: Entry[]) {
	const onconfirm = vi.fn();
	const oncancel = vi.fn();
	const result = render(ConfirmTrash, { props: { items, onconfirm, oncancel } });
	return { ...result, onconfirm, oncancel };
}

describe('ConfirmTrash', () => {
	it('names the item about to disappear', () => {
		mount([item('important.txt')]);
		expect(screen.getByText(/important\.txt/)).toBeTruthy();
	});

	it('with several items it states their number', () => {
		mount([item('a.txt'), item('b.txt'), item('c.txt')]);
		expect(screen.getByText(/3 elementi/)).toBeTruthy();
	});

	it('focus starts on Annulla, not on the destructive action', async () => {
		mount([item('a.txt')]);
		await Promise.resolve();

		// An instinctive Enter must not delete anything.
		expect(document.activeElement?.textContent).toBe('Annulla');
	});

	it('Annulla does not confirm', () => {
		const { onconfirm, oncancel } = mount([item('a.txt')]);

		screen.getByText('Annulla').dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(oncancel).toHaveBeenCalledTimes(1);
		expect(onconfirm).not.toHaveBeenCalled();
	});

	it('confirming does not also trigger the cancel', () => {
		const { onconfirm, oncancel } = mount([item('a.txt')]);

		screen
			.getByText('Sposta nel Cestino')
			.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(onconfirm).toHaveBeenCalledTimes(1);
		// The click bubbled up to the backdrop, which cancelled: two callbacks for a
		// single gesture, and the outcome depended on the order.
		expect(oncancel).not.toHaveBeenCalled();
	});

	it('clicking outside the dialog cancels', () => {
		const { container, oncancel } = mount([item('a.txt')]);

		const backdrop = container.querySelector('.backdrop') as HTMLElement;
		backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(oncancel).toHaveBeenCalledTimes(1);
	});

	it('says the Recycle Bin can be recovered from', () => {
		mount([item('a.txt')]);
		expect(screen.getByText(/recuperarli dal Cestino/)).toBeTruthy();
	});
});
