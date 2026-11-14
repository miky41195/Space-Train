import { describe, it, expect } from 'vitest';
import { TabsStore } from './tabs.svelte';
import { fakeBackend } from '../test-doubles';
import type { Entry } from '../ipc';

function items(...names: string[]): Entry[] {
	return names.map((name) => ({
		name,
		path: `C:\\${name}`,
		kind: 'file' as const,
		size: 1,
		modified: 1,
		hidden: false
	}));
}

const list = items('a', 'b', 'c', 'd', 'e');
const p = (n: string) => `C:\\${n}`;

async function withTab() {
	const s = new TabsStore(fakeBackend());
	const id = await s.openTab('C:\\uno');
	return { s, id };
}

describe('selection', () => {
	it('a new tab has nothing selected', async () => {
		const { s } = await withTab();
		expect(s.activeTab?.selection).toEqual([]);
	});

	it('a plain click selects that item only', async () => {
		const { s, id } = await withTab();

		s.select(id, p('b'), list);
		s.select(id, p('d'), list);

		expect(s.activeTab?.selection).toEqual([p('d')]);
	});

	it('Ctrl adds without removing the rest', async () => {
		const { s, id } = await withTab();

		s.select(id, p('a'), list);
		s.select(id, p('c'), list, { ctrl: true });
		s.select(id, p('e'), list, { ctrl: true });

		expect(s.activeTab?.selection).toEqual([p('a'), p('c'), p('e')]);
	});

	it('Ctrl on an item already taken removes it', async () => {
		const { s, id } = await withTab();

		s.select(id, p('a'), list);
		s.select(id, p('c'), list, { ctrl: true });
		s.select(id, p('a'), list, { ctrl: true });

		expect(s.activeTab?.selection).toEqual([p('c')]);
	});

	it('Shift takes the range from the anchor', async () => {
		const { s, id } = await withTab();

		s.select(id, p('b'), list);
		s.select(id, p('d'), list, { shift: true });

		expect(s.activeTab?.selection).toEqual([p('b'), p('c'), p('d')]);
	});

	it('Shift works backwards too', async () => {
		const { s, id } = await withTab();

		s.select(id, p('d'), list);
		s.select(id, p('b'), list, { shift: true });

		expect(s.activeTab?.selection).toEqual([p('b'), p('c'), p('d')]);
	});

	it('extending twice always starts from the same anchor', async () => {
		const { s, id } = await withTab();

		s.select(id, p('c'), list);
		s.select(id, p('e'), list, { shift: true });
		s.select(id, p('a'), list, { shift: true });

		// If the anchor followed the last click, here only a..e starting from
		// 'e' would remain, that is everything: unlike any system list.
		expect(s.activeTab?.selection).toEqual([p('a'), p('b'), p('c')]);
	});

	it('Shift without an anchor behaves like a plain click', async () => {
		const { s, id } = await withTab();

		s.select(id, p('c'), list, { shift: true });

		expect(s.activeTab?.selection).toEqual([p('c')]);
	});

	it('the selection follows the list order, not the click order', async () => {
		const { s, id } = await withTab();

		s.select(id, p('e'), list);
		s.select(id, p('b'), list, { shift: true });

		expect(s.activeTab?.selection).toEqual([p('b'), p('c'), p('d'), p('e')]);
	});

	it('select all takes every visible item', async () => {
		const { s, id } = await withTab();

		s.selectAll(id, list);

		expect(s.activeTab?.selection.length).toBe(5);
	});

	it('clearing resets the anchor too', async () => {
		const { s, id } = await withTab();

		s.select(id, p('b'), list);
		s.clearSelection(id);
		s.select(id, p('d'), list, { shift: true });

		expect(s.activeTab?.selection).toEqual([p('d')]);
	});

	it('changing folder empties the selection', async () => {
		const { s, id } = await withTab();

		s.select(id, p('b'), list);
		await s.navigate(id, 'C:\\due');

		expect(s.activeTab?.selection).toEqual([]);
	});
});
