import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Rail from './Rail.svelte';

afterEach(cleanup);

function monta(props: Record<string, unknown> = {}) {
	const { container } = render(Rail, { props });
	return {
		binario: container.querySelector('.binario') as HTMLElement,
		correnti: container.querySelectorAll('.corrente')
	};
}

describe('Rail', () => {
	it('a riposo un solo impulso percorre il binario', () => {
		const { binario, correnti } = monta();

		expect(correnti.length).toBe(1);
		expect(binario.classList.contains('attivo')).toBe(false);
	});

	it('sotto carico gli impulsi diventano due', () => {
		const { binario, correnti } = monta({ attivo: true });

		// È l'aggancio allo stato reale: due impulsi significano che il
		// sistema sta muovendo dati, non che l'animazione è più carina.
		expect(correnti.length).toBe(2);
		expect(binario.classList.contains('attivo')).toBe(true);
	});

	it('l orientamento verticale è una variante della stessa cosa', () => {
		const { binario } = monta({ orientamento: 'verticale' });
		expect(binario.classList.contains('verticale')).toBe(true);
	});

	it('è decorativo e resta fuori dall albero di accessibilità', () => {
		const { binario } = monta();
		expect(binario.getAttribute('aria-hidden')).toBe('true');
	});
});
