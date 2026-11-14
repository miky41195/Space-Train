import { describe, it, expect, vi } from 'vitest';
import { IconsStore } from './icons.svelte';
import type { Backend, Entry } from '../ipc';
import { fakeBackend as sharedFakeBackend } from '../test-doubles';

function item(name: string, kind: Entry['kind'] = 'file'): Entry {
	return { name, path: `C:\\${name}`, kind, size: 1, modified: 1, hidden: false };
}

function fakeBackend(over: Partial<Backend> = {}): Backend {
	return {
		...sharedFakeBackend(),
		async iconForExtension(ext: string, isDir: boolean) {
			return `icon:${isDir ? 'dir' : ext}`;
		},
		async thumbnail(path: string) {
			return `thumb:${path}`;
		},
		async listDir() {
			return { path: '', entries: [] };
		},
		async openEntry() {},
		async navigate() {
			return '';
		},
		async drives() {
			return [];
		},
		async knownFolders() {
			return [];
		},
		async revealInExplorer() {},
		async createFolder() {
			return '';
		},
		async renameEntry() {
			return '';
		},
		async moveToTrash() {},
		async scanConflicts() {
			return [];
		},
		async transfer() {
			return { copied: 0, skipped: 0, cancelled: false, pairs: [] };
		},
		async cancelTransfer() {
			return true;
		},
		...over
	};
}

/** Lets the queued promises run. */
const breathe = () => new Promise((r) => setTimeout(r, 0));

/** Waits for the queue to drain, without relying on fixed timings. */
async function drain(s: IconsStore, rounds = 400): Promise<void> {
	for (let i = 0; i < rounds && s.inFlight > 0; i++) await breathe();
	await breathe();
}

describe('IconsStore — pure reads', () => {
	it('reading starts no loading', async () => {
		const iconForExtension = vi.fn(async () => 'icon');
		const thumbnail = vi.fn(async () => 'thumb');
		const s = new IconsStore(fakeBackend({ iconForExtension, thumbnail }));

		s.icon(item('a.txt'));
		s.thumbnail(item('foto.png'));
		await breathe();

		// This is the requirement that keeps rendering free of side effects.
		expect(iconForExtension).not.toHaveBeenCalled();
		expect(thumbnail).not.toHaveBeenCalled();
	});

	it('before any request the cache is empty', () => {
		const s = new IconsStore(fakeBackend());
		expect(s.icon(item('a.txt'))).toBeNull();
	});
});

describe('IconsStore — type icons', () => {
	it('after the request the icon can be read', async () => {
		const s = new IconsStore(fakeBackend());
		s.request([item('a.txt')]);
		await breathe();

		expect(s.icon(item('a.txt'))).toBe('icon:txt');
	});

	it('several files of the same type cost a single call', async () => {
		const iconForExtension = vi.fn(async () => 'icon');
		const s = new IconsStore(fakeBackend({ iconForExtension }));

		s.request([item('a.txt'), item('b.txt'), item('c.txt')]);
		await breathe();
		s.request([item('d.txt')]);
		await breathe();

		expect(iconForExtension).toHaveBeenCalledTimes(1);
	});

	it('a type without an icon is not asked for forever', async () => {
		const iconForExtension = vi.fn(async () => null);
		const s = new IconsStore(fakeBackend({ iconForExtension }));

		s.request([item('a.qwerty')]);
		await breathe();
		s.request([item('b.qwerty')]);
		await breathe();

		expect(iconForExtension).toHaveBeenCalledTimes(1);
	});

	it('a backend error does not leave the item pending', async () => {
		const iconForExtension = vi.fn(async () => {
			throw new Error('boom');
		});
		const s = new IconsStore(fakeBackend({ iconForExtension }));

		s.request([item('a.txt')]);
		await breathe();

		expect(s.icon(item('a.txt'))).toBe('');
	});
});

describe('IconsStore — thumbnail queue', () => {
	it('asks for thumbnails only for images and videos', async () => {
		const thumbnail = vi.fn(async () => 'thumb');
		const s = new IconsStore(fakeBackend({ thumbnail }));

		s.request([item('main.rs'), item('cartella', 'dir'), item('roba.zip')]);
		await drain(s);

		expect(thumbnail).not.toHaveBeenCalled();

		s.request([item('foto.png')]);
		await drain(s);

		expect(thumbnail).toHaveBeenCalledTimes(1);
		expect(s.thumbnail(item('foto.png'))).toBe('thumb');
	});

	it('never exceeds the cap on parallel extractions', async () => {
		const thumbnail = vi.fn(async (path: string) => {
			await new Promise((r) => setTimeout(r, 5));
			return `thumb:${path}`;
		});
		const s = new IconsStore(fakeBackend({ thumbnail }));

		s.request(Array.from({ length: 20 }, (_, i) => item(`f${i}.png`)));

		// The peak is measured right after the request, before any has had
		// time to complete.
		expect(s.inFlight).toBeLessThanOrEqual(3);

		await drain(s);
		expect(thumbnail).toHaveBeenCalledTimes(20);
	});

	it('a new request replaces the queue instead of extending it', async () => {
		const calls: string[] = [];
		const thumbnail = vi.fn(async (path: string) => {
			calls.push(path);
			await new Promise((r) => setTimeout(r, 5));
			return 'thumb';
		});
		const s = new IconsStore(fakeBackend({ thumbnail }));

		// First screen: the first 3 start, the others wait in the queue.
		s.request(Array.from({ length: 30 }, (_, i) => item(`old${i}.png`)));
		// The user scrolls away before the queue drains.
		s.request([item('new.png')]);

		await drain(s);

		// Items that left the screen are not extracted: only the ones
		// already started plus the new one.
		expect(calls).toContain('C:\\new.png');
		expect(calls.filter((c) => c.includes('old')).length).toBeLessThanOrEqual(3);
	});

	it('the thumbnail cache stays under the cap', async () => {
		const s = new IconsStore(fakeBackend());

		for (let block = 0; block < 45; block++) {
			s.request(Array.from({ length: 10 }, (_, i) => item(`photo${block}_${i}.png`)));
			await drain(s);
		}

		expect(s.thumbnailsInMemory).toBeGreaterThan(0);
		expect(s.thumbnailsInMemory).toBeLessThanOrEqual(400);
	});
});
