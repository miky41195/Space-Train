import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Intro from './Intro.svelte';

afterEach(cleanup);
beforeEach(() => vi.useRealTimers());

describe('Intro', () => {
	it('closes by itself within a second and a half', async () => {
		vi.useFakeTimers();
		const onend = vi.fn();
		render(Intro, { props: { onend } });

		vi.advanceTimersByTime(1400);

		// A file manager is opened fifty times a day: opening titles that
		// do not end by themselves become a toll.
		expect(onend).toHaveBeenCalledTimes(1);
	});

	it('only the train moves: the curtain never gets the moving element class', () => {
		const { container } = render(Intro, { props: { onend: () => {}, kind: 'train' } });

		expect(container.querySelectorAll('.vehicle')).toHaveLength(1);
		expect(container.querySelector('.curtain.vehicle')).toBeNull();
	});

	it('a key skips it at once', () => {
		const onend = vi.fn();
		render(Intro, { props: { onend } });

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

		expect(onend).toHaveBeenCalledTimes(1);
	});

	it('a click skips it at once', () => {
		const onend = vi.fn();
		render(Intro, { props: { onend } });

		window.dispatchEvent(new Event('pointerdown'));

		expect(onend).toHaveBeenCalledTimes(1);
	});

	it('skipping it and then letting the time run out, it closes only once', () => {
		vi.useFakeTimers();
		const onend = vi.fn();
		render(Intro, { props: { onend } });

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
		vi.advanceTimersByTime(2000);

		expect(onend).toHaveBeenCalledTimes(1);
	});

	it('stays out of the accessibility tree', () => {
		const { container } = render(Intro, { props: { onend: vi.fn() } });
		const curtain = container.querySelector('.curtain') as HTMLElement;

		// It is pure show: screen reader users must reach the app directly,
		// not opening titles to get through.
		expect(curtain.getAttribute('aria-hidden')).toBe('true');
	});

	// That the veil does not steal clicks is guaranteed by `pointer-events: none`
	// in the component CSS. It cannot be checked here: jsdom does not resolve
	// component-scoped styles, and a test claiming it would pass or fail for
	// reasons unrelated to the code.
});

describe('Intro chosen by the theme', () => {
	it('«Pioggia di stelle» draws stars and no train', () => {
		const { container } = render(Intro, { props: { onend: vi.fn(), kind: 'stars' } });
		expect(container.querySelectorAll('.star').length).toBeGreaterThan(10);
		expect(container.querySelector('.vehicle')).toBeNull();
	});

	it('«Personalizzata» shows the chosen image and lasts the chosen time', () => {
		vi.useFakeTimers();
		const onend = vi.fn();
		const { container } = render(Intro, {
			props: { onend, kind: 'custom', figure: { kind: 'image', src: 'asset://cat.png' }, motion: 'center', duration: 2.5 }
		});
		expect(container.querySelector('.vehicle.center img')?.getAttribute('src')).toBe('asset://cat.png');
		vi.advanceTimersByTime(2400);
		expect(onend).not.toHaveBeenCalled();
		vi.advanceTimersByTime(200);
		expect(onend).toHaveBeenCalledTimes(1);
	});
});
