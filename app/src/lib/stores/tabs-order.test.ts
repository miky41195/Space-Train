import { describe, it, expect, vi } from 'vitest';
import { TabsStore } from './tabs.svelte';
import { fakeBackend } from '../test-doubles';
import type { SortSpec } from '../ipc';

function memory() {
	const data = new Map<string, SortSpec>();
	return {
		data,
		read: (c: string) => data.get(c.toLowerCase()),
		write: (c: string, s: SortSpec) => void data.set(c.toLowerCase(), s)
	};
}

describe('sort remembered per folder', () => {
	it('every folder reopens the way the user sorted it', async () => {
		const listDir = vi.fn(async (path: string) => ({ path, entries: [] }));
		const sorts = memory();
		const s = new TabsStore(fakeBackend({ listDir }), sorts);
		const id = await s.openTab('C:\\Foto');

		await s.setSort(id, { key: 'modified', ascending: false });
		expect(sorts.data.get('c:\\foto')).toEqual({ key: 'modified', ascending: false });

		// Another folder never sorted starts from name ascending…
		await s.navigate(id, 'C:\\Documenti');
		expect(s.activeTab?.sort).toEqual({ key: 'name', ascending: true });

		// …and going back to the first one its sort comes back.
		await s.navigate(id, 'C:\\Foto');
		expect(s.activeTab?.sort).toEqual({ key: 'modified', ascending: false });
		expect(listDir).toHaveBeenLastCalledWith('C:\\Foto', { key: 'modified', ascending: false }, false);
	});

	it('a new tab opens the folder with its remembered sort', async () => {
		const sorts = memory();
		sorts.write('C:\\Musica', { key: 'size', ascending: false });
		const s = new TabsStore(fakeBackend(), sorts);
		await s.openTab('C:\\Musica');
		expect(s.activeTab?.sort).toEqual({ key: 'size', ascending: false });
	});
});

describe('queued navigation', () => {
	it('two «Up» pressed in a row go up two levels even with a slow disk', async () => {
		const slow = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 15));
		const s = new TabsStore(
			fakeBackend({
				listDir: (path: string) => slow({ path, entries: [] }),
				navigate: (path: string) => slow(path.slice(0, path.lastIndexOf('\\')) || path)
			})
		);
		const id = await s.openTab('C:\\a\\b\\c');

		await Promise.all([s.goUp(id), s.goUp(id)]);
		expect(s.activeTab?.path).toBe('C:\\a');
	});

	it('two «Back» in a row go back two steps', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		await s.navigate(id, 'C:\\due');
		await s.navigate(id, 'C:\\tre');

		await Promise.all([s.goBack(id), s.goBack(id)]);
		expect(s.activeTab?.path).toBe('C:\\uno');
	});
});
