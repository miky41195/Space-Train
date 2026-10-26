import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Treno from './Treno.svelte';

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
