import { describe, it, expect } from 'vitest';
import { limitaSpostamento } from './spostabile';

describe('finestra spostabile', () => {
	const finestra = { left: 200, top: 100, width: 600, height: 400 };
	const schermo = { width: 1000, height: 700 };

	it('si sposta liberamente dentro la finestra dell’app', () => {
		expect(limitaSpostamento(-150, 80, finestra, schermo)).toEqual({ dx: -150, dy: 80 });
	});

	it('non esce mai dalla finestra dell’app, da nessun lato', () => {
		expect(limitaSpostamento(-2000, 0, finestra, schermo).dx).toBe(-200);
		expect(limitaSpostamento(2000, 0, finestra, schermo).dx).toBe(1000 - 600 - 200);
		expect(limitaSpostamento(0, -500, finestra, schermo).dy).toBe(-100);
		expect(limitaSpostamento(0, 5000, finestra, schermo).dy).toBe(700 - 400 - 100);
	});

	it('più grande della finestra dell’app: resta attaccata in alto a sinistra', () => {
		const grande = { left: 0, top: 0, width: 1200, height: 900 };
		expect(limitaSpostamento(300, 300, grande, schermo)).toEqual({ dx: 0, dy: 0 });
		expect(limitaSpostamento(-300, -300, grande, schermo)).toEqual({ dx: 0, dy: 0 });
	});
});
