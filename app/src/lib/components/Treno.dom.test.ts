import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Treno from './Treno.svelte';
import { conMovimento } from '../movimento';

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => `asset://${p}` }));

/** Il convoglio in scena: a ogni passaggio è un elemento nuovo. */
const convoglio = (c: HTMLElement) => c.querySelector('.convoglio') as HTMLElement;

describe('passaggi del treno', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it('la prima corsa arriva subito, poi si aspetta la pausa da quando esce di scena', async () => {
		const { container } = render(Treno, { pausa: 5000 });
		const fermo = convoglio(container);
		await vi.advanceTimersByTimeAsync(1100);
		expect(convoglio(container)).toBe(fermo);
		await vi.advanceTimersByTimeAsync(200);
		const primo = convoglio(container);
		expect(primo).not.toBe(fermo);

		// Finché è in scena non riparte, per quanto lenta sia la traversata.
		await vi.advanceTimersByTimeAsync(15_000);
		expect(convoglio(container)).toBe(primo);

		await fireEvent.animationEnd(primo);
		await vi.advanceTimersByTimeAsync(4900);
		expect(convoglio(container)).toBe(primo);
		await vi.advanceTimersByTimeAsync(200);
		expect(convoglio(container)).not.toBe(primo);
	});

	it('se la fine dell animazione non arriva, dopo la traversata massima si va avanti', async () => {
		const { container } = render(Treno, { pausa: 1000 });
		await vi.advanceTimersByTimeAsync(1300);
		const primo = convoglio(container);
		await vi.advanceTimersByTimeAsync(20_000 + 1000 + 100);
		expect(convoglio(container)).not.toBe(primo);
	});

	it('«solo durante i trasferimenti»: a riposo non passa mai, sotto carico sì', async () => {
		const { container, rerender } = render(Treno, { pausa: null });
		const fermo = convoglio(container);
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(convoglio(container)).toBe(fermo);

		await rerender({ pausa: null, attivo: true });
		await vi.advanceTimersByTimeAsync(700);
		const inCarico = convoglio(container);
		expect(inCarico).not.toBe(fermo);
		// Sotto carico riparte quasi subito dopo ogni arrivo.
		await fireEvent.animationEnd(inCarico);
		await vi.advanceTimersByTimeAsync(700);
		expect(convoglio(container)).not.toBe(inCarico);
	});

	it('cambiando la pausa il prossimo passaggio si riprogramma', async () => {
		const { container, rerender } = render(Treno, { pausa: 600_000 });
		await vi.advanceTimersByTimeAsync(1300);
		const primo = convoglio(container);
		await fireEvent.animationEnd(primo);
		await rerender({ pausa: 2000 });
		await vi.advanceTimersByTimeAsync(2100);
		expect(convoglio(container)).not.toBe(primo);
	});
});

describe('scena: chi resta fermo e chi attraversa', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	const fermo = conMovimento('img:C:\\lotta.gif', { tipo: 'fermo', posizione: 30, ritardo: 0, durata: 6 });
	const onda = conMovimento('img:C:\\onda.gif', { tipo: 'attraversa', posizione: 0, ritardo: 1, durata: 3 });

	it('senza nessuno che cammina non passa il convoglio, ma la scena sì', async () => {
		const { container } = render(Treno, { pausa: 5000, corteo: [fermo, onda] });
		await vi.advanceTimersByTimeAsync(1300);
		expect(container.querySelector('.convoglio')).toBeNull();
		const lotta = container.querySelector<HTMLElement>('.in-scena.fermo')!;
		expect(lotta.style.getPropertyValue('--da')).toBe('30');
		const corsa = container.querySelector<HTMLElement>('.in-scena.attraversa')!;
		expect(corsa.style.animationDelay).toBe('1s');
		expect(corsa.style.animationDuration).toBe('3s');
	});

	it('il passaggio finisce quando esce di scena l ultimo, poi conta la pausa', async () => {
		const { container } = render(Treno, { pausa: 5000, corteo: [fermo, onda] });
		await vi.advanceTimersByTimeAsync(1300);
		expect(container.querySelector('.in-scena')).not.toBeNull();
		// Il fermo resta 6 secondi: prima non si chiude.
		await vi.advanceTimersByTimeAsync(5000);
		expect(container.querySelector('.in-scena')).not.toBeNull();
		await vi.advanceTimersByTimeAsync(1200);
		expect(container.querySelector('.in-scena')).toBeNull();
	});

	it('con qualcuno che cammina, si aspetta anche il convoglio', async () => {
		const { container } = render(Treno, { pausa: 5000, corteo: ['img:C:\\gatto.png', onda] });
		await vi.advanceTimersByTimeAsync(1300);
		const c = container.querySelector<HTMLElement>('.convoglio')!;
		expect(c).not.toBeNull();
		await vi.advanceTimersByTimeAsync(5000);
		// La scena è finita, il convoglio no: si resta in viaggio.
		expect(container.querySelector('.in-scena')).not.toBeNull();
		await fireEvent.animationEnd(c);
		expect(container.querySelector('.in-scena')).toBeNull();
	});
});
