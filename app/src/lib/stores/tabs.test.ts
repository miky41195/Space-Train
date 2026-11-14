import { describe, it, expect } from 'vitest';
import { TabsStore } from './tabs.svelte';
import type { Backend, Listing, SortSpec } from '../ipc';
import { fakeBackend as sharedFakeBackend } from '../test-doubles';

/** Fake backend: answers with synthetic items and controllable latency. */
function fakeBackend(opts: { delays?: Record<string, number> } = {}): Backend {
	return {
		...sharedFakeBackend(),
		async listDir(path: string, _sort: SortSpec): Promise<Listing> {
			const d = opts.delays?.[path] ?? 0;
			if (d > 0) await new Promise((r) => setTimeout(r, d));
			return {
				path,
				entries: [
					{
						name: `file-in-${path}`,
						path: `${path}#f`,
						kind: 'file',
						size: 1,
						modified: 1,
						hidden: false
					}
				]
			};
		},
		async openEntry() {},
		async navigate(path: string) {
			return path.replace(/\\[^\\]+$/, '') || 'C:\\';
		},
		async drives() {
			return [];
		},
		async knownFolders() {
			return [];
		},
		async revealInExplorer() {},
		async createFolder(parent: string, name: string) {
			return `${parent}\\${name}`;
		},
		async renameEntry(path: string, name: string) {
			return `${path}#${name}`;
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

describe('TabsStore', () => {
	it('opens a tab and loads its contents', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');

		expect(s.tabs.length).toBe(1);
		expect(s.activeTab?.id).toBe(id);
		expect(s.activeTab?.path).toBe('C:\\uno');
		expect(s.activeTab?.entries[0].name).toBe('file-in-C:\\uno');
	});

	it('closes a tab and activates the previous one', async () => {
		const s = new TabsStore(fakeBackend());
		const first = await s.openTab('C:\\uno');
		const second = await s.openTab('C:\\due');

		s.closeTab(second);

		expect(s.tabs.length).toBe(1);
		expect(s.activeTab?.id).toBe(first);
	});

	it('closing the last tab leaves the list empty', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');

		s.closeTab(id);

		expect(s.tabs.length).toBe(0);
		expect(s.activeTab).toBeUndefined();
	});

	it('goes back and forward in the history', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		await s.navigate(id, 'C:\\due');
		await s.navigate(id, 'C:\\tre');

		await s.goBack(id);
		expect(s.activeTab?.path).toBe('C:\\due');

		await s.goBack(id);
		expect(s.activeTab?.path).toBe('C:\\uno');

		await s.goForward(id);
		expect(s.activeTab?.path).toBe('C:\\due');
	});

	it('back from the first entry does nothing', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');

		await s.goBack(id);

		expect(s.activeTab?.path).toBe('C:\\uno');
	});

	it('navigating after going back cuts the forward history', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		await s.navigate(id, 'C:\\due');
		await s.goBack(id);
		await s.navigate(id, 'C:\\tre');

		await s.goForward(id);
		expect(s.activeTab?.path).toBe('C:\\tre');
	});

	it('drops the slow answer that arrives after a more recent navigation', async () => {
		const s = new TabsStore(fakeBackend({ delays: { 'C:\\slow': 50 } }));
		const id = await s.openTab('C:\\uno');

		const slow = s.navigate(id, 'C:\\slow');
		await s.navigate(id, 'C:\\fast');
		await slow;

		expect(s.activeTab?.path).toBe('C:\\fast');
		expect(s.activeTab?.entries[0].name).toBe('file-in-C:\\fast');
	});

	it('the dropped answer does not enter the history', async () => {
		const s = new TabsStore(fakeBackend({ delays: { 'C:\\slow': 50 } }));
		const id = await s.openTab('C:\\uno');

		const slow = s.navigate(id, 'C:\\slow');
		await s.navigate(id, 'C:\\fast');
		await slow;

		await s.goBack(id);
		expect(s.activeTab?.path).toBe('C:\\uno');
	});

	it('once loading is done the tab is no longer reading', async () => {
		const s = new TabsStore(fakeBackend());
		await s.openTab('C:\\uno');

		// If it stays true, everything that depends on `loading` — the
		// electric rails — stays on forever.
		expect(s.activeTab?.loading).toBe(false);
	});

	it('loading also ends after a navigation', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		await s.navigate(id, 'C:\\due');

		expect(s.activeTab?.loading).toBe(false);
	});

	it('reload reads again without lengthening the history', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		await s.navigate(id, 'C:\\due');
		const lengthBefore = s.activeTab!.history.length;

		await s.reload(id);

		expect(s.activeTab?.path).toBe('C:\\due');
		expect(s.activeTab?.history.length).toBe(lengthBefore);
	});

	it('a new tab starts without a search filter', async () => {
		const s = new TabsStore(fakeBackend());
		await s.openTab('C:\\uno');

		expect(s.activeTab?.query).toBe('');
	});

	it('setting the query does not reload the folder', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		const requestsBefore = s.activeTab!.reqSeq;

		s.setQuery(id, 'cargo');

		expect(s.activeTab?.query).toBe('cargo');
		expect(s.activeTab?.reqSeq).toBe(requestsBefore);
	});

	it('navigating clears the query', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		s.setQuery(id, 'cargo');

		await s.navigate(id, 'C:\\due');

		expect(s.activeTab?.query).toBe('');
	});

	it('clearQuery empties the filter', async () => {
		const s = new TabsStore(fakeBackend());
		const id = await s.openTab('C:\\uno');
		s.setQuery(id, 'cargo');

		s.clearQuery(id);

		expect(s.activeTab?.query).toBe('');
	});

	it('an error leaves the tab where it is', async () => {
		const backend = fakeBackend();
		backend.listDir = async () => {
			throw { kind: 'accessDenied' };
		};
		const s = new TabsStore(backend);
		s.tabs.push({
			id: 1,
			path: 'C:\\uno',
			entries: [],
			sort: { key: 'name', ascending: true },
			selection: [],
			anchor: null,
			query: '',
			history: ['C:\\uno'],
			historyIndex: 0,
			reqSeq: 0,
			lastApplied: 0,
			error: null,
			failedPath: null,
			loading: false,
			results: null,
			searching: false,
			searchOp: null,
			duplicates: null,
			comparison: null,
			label: null,
			archive: null,
			space: false
		});
		s.setActive(1);

		await s.navigate(1, 'C:\\denied');

		expect(s.activeTab?.path).toBe('C:\\uno');
		expect(s.activeTab?.error).toEqual({ kind: 'accessDenied' });
	});
});
