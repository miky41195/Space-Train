import { describe, it, expect, vi } from 'vitest';
import type { Entry } from '../ipc';
import { MediaStore } from './media.svelte';

const file = (name: string, modified = 1): Entry => ({ name, path: `C:\\F\\${name}`, kind: 'file', size: 1, modified, hidden: false });

function storage() {
	const data: Record<string, string> = {};
	return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

describe('MediaStore', () => {
	it('asks only for media files, once, and again when the file changes', async () => {
		const fetch = vi.fn(async (paths: string[]) => paths.map(() => ({ duration: 60 })));
		const m = new MediaStore(fetch, storage());
		const song = file('a.mp3');
		await m.request([song, file('note.txt')]);
		await m.request([song]);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0][0]).toEqual(['C:\\F\\a.mp3']);
		expect(m.of(song)).toEqual({ duration: 60 });

		await m.request([file('a.mp3', 2)]);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('a failed call leaves the files without details instead of asking forever', async () => {
		const m = new MediaStore(async () => Promise.reject(new Error('x')), storage());
		const song = file('a.mp3');
		await m.request([song]);
		expect(m.of(song)).toBeNull();
	});

	it('columns: automatic until toggled by hand, kept per folder, back to automatic', () => {
		const s = storage();
		const m = new MediaStore(async () => [], s);
		const photos = ['1.jpg', '2.jpg', '3.jpg'].map((n) => file(n));
		expect(m.columnsFor('C:\\F', photos)).toEqual(['taken', 'pixels']);
		m.toggle('C:\\F', 'camera', photos);
		m.toggle('C:\\F', 'pixels', photos);
		expect(new MediaStore(async () => [], s).columnsFor('c:\\f', [])).toEqual(['taken', 'camera']);
		m.automatic('C:\\F');
		expect(m.isChosen('C:\\F')).toBe(false);
	});
});
