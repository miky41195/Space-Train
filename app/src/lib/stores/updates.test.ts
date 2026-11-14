import { describe, it, expect, vi } from 'vitest';
import { UpdatesStore, type Update, type UpdateSource } from './updates.svelte';

function update(over: Partial<Update> = {}): Update {
	return { version: '0.2.0', download: vi.fn(async () => {}), install: vi.fn(async () => {}), ...over };
}

function source(found: Update | null | Error): UpdateSource & { relaunch: ReturnType<typeof vi.fn> } {
	return {
		check: vi.fn(async () => {
			if (found instanceof Error) throw found;
			return found;
		}),
		relaunch: vi.fn(async () => {})
	};
}

describe('UpdatesStore', () => {
	it('with no update stays idle and shows nothing', async () => {
		const s = new UpdatesStore(source(null));
		await s.check();
		expect(s.state).toBe('idle');
		expect(s.visible).toBe(false);
	});

	it('downloads an update before asking to restart', async () => {
		const a = update();
		const s = new UpdatesStore(source(a));
		await s.check();
		expect(a.download).toHaveBeenCalledTimes(1);
		expect(a.install).not.toHaveBeenCalled();
		expect(s.state).toBe('ready');
		expect(s.version).toBe('0.2.0');
		expect(s.visible).toBe(true);
	});

	it('installs and then restarts', async () => {
		const a = update();
		const f = source(a);
		const s = new UpdatesStore(f);
		await s.check();
		await s.install();
		expect(a.install).toHaveBeenCalledTimes(1);
		expect(f.relaunch).toHaveBeenCalledTimes(1);
	});

	it('without network stays quiet and tries again at the next check', async () => {
		const s = new UpdatesStore(source(new Error('offline')));
		await s.check();
		expect(s.state).toBe('idle');
		expect(s.visible).toBe(false);
	});

	it('a failed download does not leave the bar halfway', async () => {
		const a = update({ download: vi.fn(async () => Promise.reject(new Error('network'))) });
		const s = new UpdatesStore(source(a));
		await s.check();
		expect(s.state).toBe('idle');
	});

	it('«Più tardi» hides the bar but the update stays ready', async () => {
		const s = new UpdatesStore(source(update()));
		await s.check();
		s.postpone();
		expect(s.visible).toBe(false);
		expect(s.state).toBe('ready');
	});

	it('a failed install lets the user try again', async () => {
		const a = update({ install: vi.fn(async () => Promise.reject(new Error('denied'))) });
		const s = new UpdatesStore(source(a));
		await s.check();
		await expect(s.install()).rejects.toThrow();
		expect(s.state).toBe('ready');
	});
});
