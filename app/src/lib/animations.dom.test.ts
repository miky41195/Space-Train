import { describe, it, expect, vi, afterEach } from 'vitest';
import { animateFolder, animationsOf, BASE_ANIMATIONS } from './animations';

describe('animationsOf', () => {
	it('fills the missing and drops the unknown, keeping duration within 0.5–3 s', () => {
		expect(animationsOf(undefined)).toEqual({ ...BASE_ANIMATIONS, figure: undefined });
		const a = animationsOf({ intro: 'stars', folder: 'boh' as never, duration: 9, figure: 'img:C:\\a.png' });
		expect(a).toMatchObject({ intro: 'stars', folder: 'none', duration: 3, figure: 'img:C:\\a.png' });
		expect(animationsOf({ duration: 0.1 }).duration).toBe(0.5);
	});
});

describe('animateFolder', () => {
	const calls: Array<{ el: Element; opts: KeyframeAnimationOptions }> = [];
	const original = (HTMLElement.prototype as { animate?: unknown }).animate;
	afterEach(() => {
		calls.length = 0;
		(HTMLElement.prototype as { animate?: unknown }).animate = original;
	});
	function fake() {
		(HTMLElement.prototype as { animate?: unknown }).animate = vi.fn(function (this: Element, _k: unknown, opts: KeyframeAnimationOptions) {
			calls.push({ el: this, opts });
			return {} as Animation;
		});
	}

	it('wagons: the rows on screen arrive one after the other, all within 250 ms', () => {
		fake();
		const list = document.createElement('div');
		for (let i = 0; i < 30; i++) list.appendChild(document.createElement('div')).setAttribute('role', 'row');
		animateFolder('wagons', list, null);
		expect(calls).toHaveLength(14);
		const ends = calls.map((c) => Number(c.opts.delay) + Number(c.opts.duration));
		expect(Math.max(...ends)).toBeLessThanOrEqual(250);
		expect(calls[1].opts.delay).toBeGreaterThan(calls[0].opts.delay as number);
	});

	it('nothing happens with «nessuna» or where the browser cannot animate', () => {
		const list = document.createElement('div');
		expect(() => animateFolder('fade', list, null)).not.toThrow();
		fake();
		animateFolder('none', list, null);
		expect(calls).toHaveLength(0);
	});
});
