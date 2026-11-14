import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Parade from './Parade.svelte';
import { withMotion } from '../motion';

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => `asset://${p}` }));

/** The train on stage: at every pass it is a new element. */
const train = (c: HTMLElement) => c.querySelector('.train') as HTMLElement;

describe('train passes', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it('the first run comes at once, then the pause is waited from when it leaves the stage', async () => {
		const { container } = render(Parade, { pause: 5000 });
		const still = train(container);
		await vi.advanceTimersByTimeAsync(1100);
		expect(train(container)).toBe(still);
		await vi.advanceTimersByTimeAsync(200);
		const first = train(container);
		expect(first).not.toBe(still);

		// While on stage it does not leave again, however slow the crossing.
		await vi.advanceTimersByTimeAsync(15_000);
		expect(train(container)).toBe(first);

		await fireEvent.animationEnd(first);
		await vi.advanceTimersByTimeAsync(4900);
		expect(train(container)).toBe(first);
		await vi.advanceTimersByTimeAsync(200);
		expect(train(container)).not.toBe(first);
	});

	it('if the end of the animation never arrives, it moves on after the maximum crossing', async () => {
		const { container } = render(Parade, { pause: 1000 });
		await vi.advanceTimersByTimeAsync(1300);
		const first = train(container);
		await vi.advanceTimersByTimeAsync(20_000 + 1000 + 100);
		expect(train(container)).not.toBe(first);
	});

	it('a folder loading mid-run does not change the speed of the run in progress', async () => {
		// A new animation-duration mid-flight makes the train jump back and forth.
		const { container, rerender } = render(Parade, { pause: 5000 });
		await vi.advanceTimersByTimeAsync(1300);
		const running = train(container);
		await rerender({ pause: 5000, active: true });
		expect(train(container)).toBe(running);
		expect(running.classList.contains('loaded')).toBe(false);
		await rerender({ pause: 5000, active: false });
		expect(running.classList.contains('loaded')).toBe(false);

		// The next run, started under load, goes at the fast speed.
		await rerender({ pause: 5000, active: true });
		await fireEvent.animationEnd(running);
		await vi.advanceTimersByTimeAsync(700);
		expect(train(container).classList.contains('loaded')).toBe(true);
	});

	it('«solo durante i trasferimenti»: at rest it never passes, under load it does', async () => {
		const { container, rerender } = render(Parade, { pause: null });
		const still = train(container);
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(train(container)).toBe(still);

		await rerender({ pause: null, active: true });
		await vi.advanceTimersByTimeAsync(700);
		const loaded = train(container);
		expect(loaded).not.toBe(still);
		// Under load it leaves again almost at once after every arrival.
		await fireEvent.animationEnd(loaded);
		await vi.advanceTimersByTimeAsync(700);
		expect(train(container)).not.toBe(loaded);
	});

	it('changing the pause reschedules the next pass', async () => {
		const { container, rerender } = render(Parade, { pause: 600_000 });
		await vi.advanceTimersByTimeAsync(1300);
		const first = train(container);
		await fireEvent.animationEnd(first);
		await rerender({ pause: 2000 });
		await vi.advanceTimersByTimeAsync(2100);
		expect(train(container)).not.toBe(first);
	});
});

describe('stage: who stays still and who crosses', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	const still = withMotion('img:C:\\fight.gif', { kind: 'still', position: 30, delay: 0, duration: 6 });
	const wave = withMotion('img:C:\\wave.gif', { kind: 'cross', position: 0, delay: 1, duration: 3 });

	it('with nobody walking the train does not pass, but the stage does', async () => {
		const { container } = render(Parade, { pause: 5000, parade: [still, wave] });
		await vi.advanceTimersByTimeAsync(1300);
		expect(container.querySelector('.train')).toBeNull();
		const fight = container.querySelector<HTMLElement>('.on-stage.still')!;
		expect(fight.style.getPropertyValue('--from')).toBe('30');
		const crossing = container.querySelector<HTMLElement>('.on-stage.cross')!;
		expect(crossing.style.animationDelay).toBe('1s');
		expect(crossing.style.animationDuration).toBe('3s');
	});

	it('the pass ends when the last one leaves the stage, then the pause counts', async () => {
		const { container } = render(Parade, { pause: 5000, parade: [still, wave] });
		await vi.advanceTimersByTimeAsync(1300);
		expect(container.querySelector('.on-stage')).not.toBeNull();
		// The still one stays 6 seconds: it does not close before.
		await vi.advanceTimersByTimeAsync(5000);
		expect(container.querySelector('.on-stage')).not.toBeNull();
		await vi.advanceTimersByTimeAsync(1200);
		expect(container.querySelector('.on-stage')).toBeNull();
	});

	it('with someone walking, the train is waited for too', async () => {
		const { container } = render(Parade, { pause: 5000, parade: ['img:C:\\gatto.png', wave] });
		await vi.advanceTimersByTimeAsync(1300);
		const c = container.querySelector<HTMLElement>('.train')!;
		expect(c).not.toBeNull();
		await vi.advanceTimersByTimeAsync(5000);
		// The stage is over, the train is not: it stays travelling.
		expect(container.querySelector('.on-stage')).not.toBeNull();
		await fireEvent.animationEnd(c);
		expect(container.querySelector('.on-stage')).toBeNull();
	});
});

describe('looping stage: no duration, in a loop', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	const warrior = withMotion('img:C:\\warrior.gif', { kind: 'still', position: 20, loop: true });
	const wave = withMotion('img:C:\\wave.gif', {
		kind: 'cross',
		position: 25,
		duration: 1.5,
		pause: 0.5,
		loop: true,
		direction: 'left',
		mirror: true,
		height: 12
	});

	it('is visible at once and never disappears, passes or not', async () => {
		const { container } = render(Parade, { pause: 5000, parade: [warrior, wave] });
		expect(container.querySelectorAll('.on-stage.loop')).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(120_000);
		expect(container.querySelectorAll('.on-stage.loop')).toHaveLength(2);
	});

	it('the wave loops forever: travel, pause, direction, height and mirror', async () => {
		const { container } = render(Parade, { pause: 5000, parade: [warrior, wave] });
		const o = container.querySelector<HTMLElement>('.on-stage.loop.cross')!;
		expect(o.style.animationName).toBe('loop-1');
		// The round is travel plus pause.
		expect(o.style.animationDuration).toBe('2s');
		expect(o.style.bottom).toBe('12px');
		expect(o.querySelector('.look.mirrored')).not.toBeNull();
		const keyframes = container.querySelector('style')!.textContent!;
		// It arrives at 75% of the round, going left, then stays hidden until the end.
		expect(keyframes).toContain('@keyframes loop-1{');
		expect(keyframes).toContain('75.000%{visibility:visible;transform:translateX(calc(-100% - 20px))}');
		expect(keyframes).toContain('75.010%,100%{visibility:hidden');
	});
});
