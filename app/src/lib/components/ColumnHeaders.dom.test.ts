import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ColumnHeaders from './ColumnHeaders.svelte';
import type { SortSpec } from '../ipc';

afterEach(cleanup);

function mount(sort: SortSpec) {
	const onsort = vi.fn();
	const result = render(ColumnHeaders, { props: { sort, onsort } });
	return { ...result, onsort };
}

describe('ColumnHeaders', () => {
	it('shows the four columns', () => {
		const { container } = mount({ key: 'name', ascending: true });
		expect(container.querySelectorAll('.column').length).toBe(4);
	});

	it('the active column is marked, the others are not', () => {
		const { container } = mount({ key: 'size', ascending: false });

		const active = container.querySelectorAll('.column.active');
		expect(active.length).toBe(1);
		expect(active[0].classList.contains('load')).toBe(true);
	});

	it('only the active column shows the direction', () => {
		const { container } = mount({ key: 'name', ascending: true });
		expect(container.querySelectorAll('.direction').length).toBe(1);
	});

	it('the direction flips in descending order', () => {
		const { container } = mount({ key: 'name', ascending: false });
		expect(container.querySelector('.direction')?.classList.contains('down')).toBe(true);
	});

	it('clicking a column asks for that sort', () => {
		const { onsort } = mount({ key: 'name', ascending: true });

		screen.getByLabelText(/carico/i).click();

		expect(onsort).toHaveBeenCalledWith('size');
	});

	it('the accessible name says state and consequence', () => {
		mount({ key: 'name', ascending: true });

		// Without it, a screen reader would only announce «Nome, pulsante».
		expect(screen.getByLabelText('Nome, ordine crescente. Premi per invertire')).toBeTruthy();
		expect(screen.getByLabelText('Ordina per orario')).toBeTruthy();
	});

	it('the type column stays reachable even without a visible label', () => {
		mount({ key: 'name', ascending: true });
		expect(screen.getByLabelText('Ordina per tipo')).toBeTruthy();
	});
});
