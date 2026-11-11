import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Avvio from './Avvio.svelte';

afterEach(cleanup);
beforeEach(() => vi.useRealTimers());

describe('Avvio', () => {
	it('si chiude da solo entro un secondo e mezzo', async () => {
		vi.useFakeTimers();
		const onfine = vi.fn();
		render(Avvio, { props: { onfine } });

		vi.advanceTimersByTime(1400);

		// Un file manager si apre cinquanta volte al giorno: una sigla che
		// non finisce da sola diventa un pedaggio.
		expect(onfine).toHaveBeenCalledTimes(1);
	});

	it('un tasto la salta subito', () => {
		const onfine = vi.fn();
		render(Avvio, { props: { onfine } });

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

		expect(onfine).toHaveBeenCalledTimes(1);
	});

	it('un clic la salta subito', () => {
		const onfine = vi.fn();
		render(Avvio, { props: { onfine } });

		window.dispatchEvent(new Event('pointerdown'));

		expect(onfine).toHaveBeenCalledTimes(1);
	});

	it('saltandola e riscadendo il tempo, si chiude una volta sola', () => {
		vi.useFakeTimers();
		const onfine = vi.fn();
		render(Avvio, { props: { onfine } });

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
		vi.advanceTimersByTime(2000);

		expect(onfine).toHaveBeenCalledTimes(1);
	});

	it('resta fuori dall albero di accessibilità', () => {
		const { container } = render(Avvio, { props: { onfine: vi.fn() } });
		const sipario = container.querySelector('.sipario') as HTMLElement;

		// È puro spettacolo: chi usa uno screen reader deve trovare
		// direttamente l'app, non una sigla da attraversare.
		expect(sipario.getAttribute('aria-hidden')).toBe('true');
	});

	// Che il velo non rubi i clic è garantito da `pointer-events: none` nel
	// CSS del componente. Non è verificabile qui: jsdom non risolve gli
	// stili con ambito di componente, e un test che lo affermasse
	// passerebbe o fallirebbe per motivi scollegati dal codice.
});

describe('Avvio chosen by the theme', () => {
	it('«Pioggia di stelle» draws stars and no train', () => {
		const { container } = render(Avvio, { props: { onfine: vi.fn(), tipo: 'stelle' } });
		expect(container.querySelectorAll('.stella').length).toBeGreaterThan(10);
		expect(container.querySelector('.convoglio')).toBeNull();
	});

	it('«Personalizzata» shows the chosen image and lasts the chosen time', () => {
		vi.useFakeTimers();
		const onfine = vi.fn();
		const { container } = render(Avvio, {
			props: { onfine, tipo: 'personalizzata', figura: { tipo: 'immagine', src: 'asset://gatto.png' }, moto: 'centro', durata: 2.5 }
		});
		expect(container.querySelector('.convoglio.centro img')?.getAttribute('src')).toBe('asset://gatto.png');
		vi.advanceTimersByTime(2400);
		expect(onfine).not.toHaveBeenCalled();
		vi.advanceTimersByTime(200);
		expect(onfine).toHaveBeenCalledTimes(1);
	});
});
