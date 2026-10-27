import { describe, it, expect } from 'vitest';
import { limitaSpostamento } from './spostabile';

describe('finestra spostabile', () => {
	const finestra = { left: 200, top: 100, width: 600 };
	const schermo = { width: 1000, height: 700 };

	it('si sposta liberamente dentro lo schermo', () => {
		expect(limitaSpostamento(-150, 80, finestra, schermo)).toEqual({ dx: -150, dy: 80 });
	});

	it('non si perde mai fuori dallo schermo: resta un pezzo di testata da riprendere', () => {
		// Troppo a sinistra: restano 48 px a destra.
		expect(limitaSpostamento(-2000, 0, finestra, schermo).dx).toBe(48 - 800);
		// La testata non sale sopra il bordo, e non scende sotto il fondo.
		expect(limitaSpostamento(0, -500, finestra, schermo).dy).toBe(-100);
		expect(limitaSpostamento(0, 5000, finestra, schermo).dy).toBe(700 - 48 - 100);
	});
});
