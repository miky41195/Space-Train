import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/svelte';
import Welcome from './Welcome.svelte';
import { WELCOME_STEPS } from '../welcome';

afterEach(cleanup);

describe('Welcome', () => {
	it('can be skipped at the first step', async () => {
		const onclose = vi.fn();
		render(Welcome, { props: { onclose } });
		await fireEvent.click(screen.getByRole('button', { name: 'Salta' }));
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('Esc skips it too', async () => {
		const onclose = vi.fn();
		render(Welcome, { props: { onclose } });
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('goes through every step and ends with «Inizia»', async () => {
		const onclose = vi.fn();
		render(Welcome, { props: { onclose } });
		for (let i = 1; i < WELCOME_STEPS.length; i++) await fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
		expect(screen.getByRole('heading').textContent).toBe(WELCOME_STEPS.at(-1)!.title);
		expect(screen.queryByRole('button', { name: 'Salta' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Inizia' }));
		expect(onclose).toHaveBeenCalledTimes(1);
	});
});
