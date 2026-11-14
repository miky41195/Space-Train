import { describe, it, expect, vi, afterEach } from 'vitest';
import { reducedMotion } from './reduced-motion';

const originalWindow = globalThis.window;

afterEach(() => {
	globalThis.window = originalWindow;
});

function withMatchMedia(matches: boolean) {
	globalThis.window = {
		matchMedia: vi.fn(() => ({ matches }))
	} as unknown as Window & typeof globalThis;
}

describe('reducedMotion', () => {
	it('reports the preference when the system expresses it', () => {
		withMatchMedia(true);
		expect(reducedMotion()).toBe(true);
	});

	it('is false when the system asks for no reduction', () => {
		withMatchMedia(false);
		expect(reducedMotion()).toBe(false);
	});

	it('without matchMedia it does not make up a preference', () => {
		globalThis.window = {} as unknown as Window & typeof globalThis;

		// A missing API is not an expressed preference: inferring «reduced»
		// would turn animations off for someone who asked for nothing.
		expect(reducedMotion()).toBe(false);
	});
});
