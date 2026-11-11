import { describe, it, expect, vi, afterEach } from 'vitest';
import { animaCartella, animazioniDi, ANIMAZIONI_BASE } from './animazioni';

describe('animazioniDi', () => {
	it('fills the missing and drops the unknown, keeping duration within 0.5–3 s', () => {
		expect(animazioniDi(undefined)).toEqual({ ...ANIMAZIONI_BASE, figura: undefined });
		const a = animazioniDi({ avvio: 'stelle', cartella: 'boh' as never, durata: 9, figura: 'img:C:\\a.png' });
		expect(a).toMatchObject({ avvio: 'stelle', cartella: 'nessuna', durata: 3, figura: 'img:C:\\a.png' });
		expect(animazioniDi({ durata: 0.1 }).durata).toBe(0.5);
	});
});

describe('animaCartella', () => {
	const chiamate: Array<{ el: Element; opts: KeyframeAnimationOptions }> = [];
	const originale = (HTMLElement.prototype as { animate?: unknown }).animate;
	afterEach(() => {
		chiamate.length = 0;
		(HTMLElement.prototype as { animate?: unknown }).animate = originale;
	});
	function finto() {
		(HTMLElement.prototype as { animate?: unknown }).animate = vi.fn(function (this: Element, _k: unknown, opts: KeyframeAnimationOptions) {
			chiamate.push({ el: this, opts });
			return {} as Animation;
		});
	}

	it('wagons: the rows on screen arrive one after the other, all within 250 ms', () => {
		finto();
		const lista = document.createElement('div');
		for (let i = 0; i < 30; i++) lista.appendChild(document.createElement('div')).setAttribute('role', 'row');
		animaCartella('vagoni', lista, null);
		expect(chiamate).toHaveLength(14);
		const fine = chiamate.map((c) => Number(c.opts.delay) + Number(c.opts.duration));
		expect(Math.max(...fine)).toBeLessThanOrEqual(250);
		expect(chiamate[1].opts.delay).toBeGreaterThan(chiamate[0].opts.delay as number);
	});

	it('nothing happens with «nessuna» or where the browser cannot animate', () => {
		const lista = document.createElement('div');
		expect(() => animaCartella('dissolvenza', lista, null)).not.toThrow();
		finto();
		animaCartella('nessuna', lista, null);
		expect(chiamate).toHaveLength(0);
	});
});
