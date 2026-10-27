import { describe, it, expect } from 'vitest';
import { riquadroFra, siToccano } from './rettangolo';

describe('rettangolo di selezione', () => {
	it('si disegna in qualsiasi verso', () => {
		expect(riquadroFra(50, 40, 10, 100)).toEqual({ x: 10, y: 40, w: 40, h: 60 });
	});

	it('basta sfiorare una voce per prenderla, ma non toccarne solo il bordo', () => {
		const voce = { x: 0, y: 32, w: 300, h: 32 };
		expect(siToccano({ x: 100, y: 60, w: 5, h: 5 }, voce)).toBe(true);
		expect(siToccano({ x: 100, y: 0, w: 5, h: 32 }, voce)).toBe(false);
		expect(siToccano({ x: 100, y: 0, w: 5, h: 33 }, voce)).toBe(true);
	});
});
