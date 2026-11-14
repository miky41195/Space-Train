import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { TabsStore } from './tabs.svelte';
import { observe } from './observe.svelte';
import type { Backend, Listing } from '../ipc';
import { fakeBackend as sharedFakeBackend } from '../test-doubles';

function fakeBackend(): Backend {
	return {
		...sharedFakeBackend(),
		async listDir(path: string): Promise<Listing> {
			return { path, entries: [] };
		},
		async openEntry() {},
		async navigate(path: string) {
			return path;
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
		async iconForExtension() {
			return null;
		},
		async thumbnail() {
			return null;
		},
		async scanConflicts() {
			return [];
		},
		async transfer() {
			return { copied: 0, skipped: 0, cancelled: false, pairs: [] };
		},
		async cancelTransfer() {
			return true;
		}
	};
}

/** Collects the values the interface would really see. */
function spy<T>(read: () => T) {
	const seen: T[] = [];
	const stop = observe(read, (v) => seen.push(v));
	return { seen, stop };
}

describe('TabsStore — signals seen by the interface', () => {
	it('the end of the first load reaches whoever observes', async () => {
		const s = new TabsStore(fakeBackend());
		const { seen, stop } = spy(() => s.activeTab?.loading ?? false);

		const opening = s.openTab('C:\\uno');
		flushSync();
		await opening;
		flushSync();
		stop();

		// Writing to the raw object instead of the proxy, the last value
		// observed stays `true`: the electric rails, which read this state,
		// never turn off again.
		expect(seen.at(-1)).toBe(false);
	});

	it('the folder change reaches whoever observes too', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');

		const { seen, stop } = spy(() => s.activeTab?.path ?? '');
		await s.navigate(id, 'C:\\due');
		flushSync();
		stop();

		expect(seen.at(-1)).toBe('C:\\due');
	});
});
