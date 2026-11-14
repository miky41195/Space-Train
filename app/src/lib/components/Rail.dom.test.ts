import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Rail from './Rail.svelte';

afterEach(cleanup);

function mount(props: Record<string, unknown> = {}) {
	const { container } = render(Rail, { props });
	return {
		rail: container.querySelector('.rail') as HTMLElement,
		currents: container.querySelectorAll('.current')
	};
}

describe('Rail', () => {
	it('at rest a single pulse runs along the rail', () => {
		const { rail, currents } = mount();

		expect(currents.length).toBe(1);
		expect(rail.classList.contains('active')).toBe(false);
	});

	it('under load the pulses become two', () => {
		const { rail, currents } = mount({ active: true });

		// It is the link to the real state: two pulses mean the system is
		// moving data, not that the animation is prettier.
		expect(currents.length).toBe(2);
		expect(rail.classList.contains('active')).toBe(true);
	});

	it('the vertical orientation is a variant of the same thing', () => {
		const { rail } = mount({ orientation: 'vertical' });
		expect(rail.classList.contains('vertical')).toBe(true);
	});

	it('is decorative and stays out of the accessibility tree', () => {
		const { rail } = mount();
		expect(rail.getAttribute('aria-hidden')).toBe('true');
	});
});
