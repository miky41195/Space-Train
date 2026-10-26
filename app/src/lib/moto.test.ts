import { describe, it, expect, vi, afterEach } from 'vitest';
import { motoRidotto } from './moto';

const finestraOriginale = globalThis.window;

afterEach(() => {
	globalThis.window = finestraOriginale;
});

function conMatchMedia(matches: boolean) {
	globalThis.window = {
		matchMedia: vi.fn(() => ({ matches }))
	} as unknown as Window & typeof globalThis;
}

describe('motoRidotto', () => {
	it('riporta la preferenza quando il sistema la esprime', () => {
		conMatchMedia(true);
		expect(motoRidotto()).toBe(true);
	});

	it('è falso quando il sistema non chiede riduzioni', () => {
		conMatchMedia(false);
		expect(motoRidotto()).toBe(false);
	});

	it('senza matchMedia non inventa una preferenza', () => {
		globalThis.window = {} as unknown as Window & typeof globalThis;

		// L'assenza dell'API non è una preferenza espressa: dedurne
		// «ridotto» spegnerebbe le animazioni a chi non ha chiesto nulla.
		expect(motoRidotto()).toBe(false);
	});
});
