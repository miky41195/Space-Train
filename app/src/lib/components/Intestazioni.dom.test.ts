import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Intestazioni from './Intestazioni.svelte';
import type { SortSpec } from '../ipc';

afterEach(cleanup);

function monta(sort: SortSpec) {
	const onsort = vi.fn();
	const risultato = render(Intestazioni, { props: { sort, onsort } });
	return { ...risultato, onsort };
}

describe('Intestazioni', () => {
	it('mostra le quattro colonne', () => {
		const { container } = monta({ key: 'name', ascending: true });
		expect(container.querySelectorAll('.colonna').length).toBe(4);
	});

	it('la colonna attiva è marcata, le altre no', () => {
		const { container } = monta({ key: 'size', ascending: false });

		const attive = container.querySelectorAll('.colonna.attiva');
		expect(attive.length).toBe(1);
		expect(attive[0].classList.contains('carico')).toBe(true);
	});

	it('solo la colonna attiva mostra il verso', () => {
		const { container } = monta({ key: 'name', ascending: true });
		expect(container.querySelectorAll('.verso').length).toBe(1);
	});

	it('il verso si capovolge in ordine decrescente', () => {
		const { container } = monta({ key: 'name', ascending: false });
		expect(container.querySelector('.verso')?.classList.contains('giu')).toBe(true);
	});

	it('cliccare una colonna chiede quell ordinamento', () => {
		const { onsort } = monta({ key: 'name', ascending: true });

		screen.getByLabelText(/carico/i).click();

		expect(onsort).toHaveBeenCalledWith('size');
	});

	it('il nome accessibile dice stato e conseguenza', () => {
		monta({ key: 'name', ascending: true });

		// Senza, uno screen reader annuncerebbe solo «Nome, pulsante».
		expect(screen.getByLabelText('Nome, ordine crescente. Premi per invertire')).toBeTruthy();
		expect(screen.getByLabelText('Ordina per orario')).toBeTruthy();
	});

	it('la colonna del tipo resta raggiungibile pur senza etichetta visibile', () => {
		monta({ key: 'name', ascending: true });
		expect(screen.getByLabelText('Ordina per tipo')).toBeTruthy();
	});
});
