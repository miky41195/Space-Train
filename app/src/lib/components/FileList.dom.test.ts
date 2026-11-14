import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import FileList from './FileList.svelte';
import { ROW_HEIGHT, ZONE_HEADER } from '../virtual';
import type { Entry } from '../ipc';

afterEach(cleanup);

function makeEntries(count: number): Entry[] {
	return Array.from({ length: count }, (_, i) => ({
		name: `file${i}.txt`,
		path: `C:\\file${i}.txt`,
		kind: 'file' as const,
		size: 1,
		modified: 0,
		hidden: false
	}));
}

function mount(entries: Entry[], favorites = 0) {
	// As the page does: with favourites the list has two zones.
	const zones =
		favorites > 0
			? [
					{ label: 'Preferiti', count: favorites, tone: 'favorites' as const },
					{ label: 'Comuni', count: entries.length - favorites }
				]
			: [];
	const result = render(FileList, {
		props: { entries, zones, onactivate: vi.fn(), onselect: vi.fn() }
	});

	const viewport = result.container.querySelector('.viewport') as HTMLElement;
	// jsdom does no layout: clientHeight stays 0 and the visible window
	// would be empty. We set it by hand.
	Object.defineProperty(viewport, 'clientHeight', { value: 320, configurable: true });

	return { ...result, viewport };
}

describe('virtualised FileList', () => {
	it('renders few rows even with ten thousand items', async () => {
		const { container, viewport } = mount(makeEntries(10_000));

		viewport.dispatchEvent(new Event('scroll'));
		await Promise.resolve();

		const rows = container.querySelectorAll('.row');
		// The point of virtualisation: the DOM does not grow with the dataset.
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.length).toBeLessThan(60);
	});

	it('the spacer is as tall as the whole list', () => {
		const { container } = mount(makeEntries(1000));

		const spacer = container.querySelector('.spacer') as HTMLElement;
		expect(spacer.style.height).toBe(`${1000 * ROW_HEIGHT}px`);
	});

	it('an empty list renders no rows', () => {
		const { container } = mount([]);
		expect(container.querySelectorAll('.row').length).toBe(0);
	});

	it('scrolling changes the rows shown', async () => {
		const { container, viewport } = mount(makeEntries(1000));

		const firstName = () => container.querySelector('.name')?.textContent;
		const start = firstName();

		Object.defineProperty(viewport, 'scrollTop', { value: ROW_HEIGHT * 500, configurable: true });
		viewport.dispatchEvent(new Event('scroll'));
		await Promise.resolve();

		expect(firstName()).not.toBe(start);
	});

	it('without favourites no zone header appears', () => {
		const { container } = mount(makeEntries(10));
		expect(container.querySelectorAll('.header').length).toBe(0);
	});

	it('with favourites the folder splits into two zones', () => {
		const { container } = mount(makeEntries(10), 3);

		const headers = container.querySelectorAll('.header');
		expect(headers.length).toBe(2);
		expect(headers[0].getAttribute('aria-label')).toBe('Preferiti, 3');
		expect(headers[1].getAttribute('aria-label')).toBe('Comuni, 7');

		const spacer = container.querySelector('.spacer') as HTMLElement;
		expect(spacer.style.height).toBe(`${10 * ROW_HEIGHT + 2 * ZONE_HEADER}px`);
	});
});

describe('scroll memory', () => {
	it('a list mounted again with the same content key comes back where it was', async () => {
		const props = { entries: makeEntries(1000), contentKey: 'tab1:folder', onactivate: vi.fn(), onselect: vi.fn() };
		const first = render(FileList, { props });
		const v1 = first.container.querySelector('.viewport') as HTMLElement;
		v1.scrollTop = 640;
		v1.dispatchEvent(new Event('scroll'));
		first.unmount();

		const second = render(FileList, { props });
		await Promise.resolve();
		expect((second.container.querySelector('.viewport') as HTMLElement).scrollTop).toBe(640);

		const other = render(FileList, { props: { ...props, contentKey: 'tab1:other' } });
		await Promise.resolve();
		expect((other.container.querySelectorAll('.viewport')[0] as HTMLElement).scrollTop).toBe(0);
	});
});
