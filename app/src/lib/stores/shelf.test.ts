import { describe, expect, it } from 'vitest';
import { ShelfStore } from './shelf.svelte';
import { ActionsStore, parseExtensions } from './actions.svelte';
import type { Entry } from '../ipc';

function memory() {
	const m = new Map<string, string>();
	return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const file = (name: string, kind = 'file') => ({ name, path: `C:\\${name}`, kind }) as Entry;

describe('ShelfStore', () => {
	it('keeps each path once, follows moves, survives a restart', () => {
		const s = memory();
		const shelf = new ShelfStore(s);
		expect(shelf.add(['C:\\a.txt', 'c:\\A.TXT', 'C:\\b.txt'])).toBe(2);
		shelf.move('C:\\a.txt', 'D:\\a.txt');
		shelf.remove('C:\\b.txt');
		expect(new ShelfStore(s).items).toEqual(['D:\\a.txt']);
	});
});

describe('ActionsStore', () => {
	it('starts with examples turned off, and filters by extension', () => {
		const s = memory();
		const actions = new ActionsStore(s);
		expect(actions.fitting([file('a.mp4')])).toEqual([]);
		for (const a of actions.items) actions.save({ ...a, enabled: true });
		expect(actions.fitting([file('a.MP4')]).map((a) => a.id)).toEqual(['vscode', 'video', 'scp']);
		expect(actions.fitting([file('a.mp4'), file('b.txt')]).map((a) => a.id)).toEqual(['vscode', 'scp']);
		expect(actions.fitting([file('x.mp4', 'dir')]).map((a) => a.id)).toEqual(['vscode', 'scp']);
		// Deleting them all does not bring the examples back.
		for (const a of [...actions.items]) actions.remove(a.id);
		expect(new ActionsStore(s).items).toEqual([]);
	});

	it('reads extensions however they are written', () => {
		expect(parseExtensions('MP4, .mkv;*.mov  mp4')).toEqual(['mp4', 'mkv', 'mov']);
	});
});
