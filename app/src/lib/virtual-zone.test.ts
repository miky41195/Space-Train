import { describe, it, expect } from 'vitest';
import { impaginaZone, finestraZona, cimaVoce, visibleRange, ROW_HEIGHT } from './virtual';

describe('impaginaZone', () => {
	it('con una zona sola e senza testata coincide con la lista semplice', () => {
		const { zone, altezzaTotale } = impaginaZone([1000], 1, ROW_HEIGHT, 0);
		const f = finestraZona(zone[0], 0, 320, 1, ROW_HEIGHT, 8);
		const r = visibleRange(0, 320, 1000);

		expect(altezzaTotale).toBe(r.totalHeight);
		expect(f.start).toBe(r.start);
		// Il margine sopra la cima non esiste: si disegna solo quello sotto.
		expect(f.count).toBe(320 / ROW_HEIGHT + 8);
	});

	it('impila le zone con la loro testata', () => {
		const { zone, altezzaTotale } = impaginaZone([3, 5], 1, 32, 28);

		expect(zone[0]).toMatchObject({ inizio: 0, alto: 0, corpo: 28 });
		expect(zone[1]).toMatchObject({ inizio: 3, alto: 28 + 3 * 32, corpo: 56 + 3 * 32 });
		expect(altezzaTotale).toBe(56 + 8 * 32);
	});

	it('in griglia ogni zona ricomincia a capo', () => {
		const { zone } = impaginaZone([5, 4], 4, 100, 0);
		// Cinque preferiti su quattro colonne occupano due righe intere.
		expect(zone[1].alto).toBe(200);
	});
});

describe('finestraZona', () => {
	it('una zona fuori dallo schermo non disegna nulla', () => {
		const { zone } = impaginaZone([10, 1000], 1, 32, 28);
		const f = finestraZona(zone[0], 20_000, 320, 1, 32, 2);
		expect(f.count).toBe(0);
	});

	it('restituisce indici globali', () => {
		const { zone } = impaginaZone([10, 1000], 1, 32, 28);
		const f = finestraZona(zone[1], zone[1].corpo, 320, 1, 32, 0);
		expect(f.start).toBe(10);
		expect(f.top).toBe(zone[1].corpo);
	});
});

describe('cimaVoce', () => {
	it('tiene conto della testata della zona', () => {
		const { zone } = impaginaZone([3, 5], 1, 32, 28);
		expect(cimaVoce(zone, 0, 1, 32)).toBe(28);
		expect(cimaVoce(zone, 3, 1, 32)).toBe(zone[1].corpo);
	});
});
