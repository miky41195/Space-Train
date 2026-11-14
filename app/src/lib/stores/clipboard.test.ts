import { describe, it, expect } from 'vitest';
import { ClipboardStore } from './clipboard.svelte';

describe('ClipboardStore', () => {
	it('starts empty', () => {
		const c = new ClipboardStore();
		expect(c.empty).toBe(true);
		expect(c.mode).toBeNull();
	});

	it('copy records the paths in copy mode', () => {
		const c = new ClipboardStore();
		c.copy(['C:\\a.txt', 'C:\\b.txt']);

		expect(c.mode).toBe('copy');
		expect(c.paths).toEqual(['C:\\a.txt', 'C:\\b.txt']);
		expect(c.empty).toBe(false);
	});

	it('cut records the paths in cut mode', () => {
		const c = new ClipboardStore();
		c.cut(['C:\\a.txt']);

		expect(c.mode).toBe('cut');
		expect(c.isCut('C:\\a.txt')).toBe(true);
	});

	it('a copied item is not cut', () => {
		const c = new ClipboardStore();
		c.copy(['C:\\a.txt']);

		expect(c.isCut('C:\\a.txt')).toBe(false);
	});

	it('a new copy replaces the previous one', () => {
		const c = new ClipboardStore();
		c.copy(['C:\\a.txt']);
		c.cut(['C:\\b.txt']);

		expect(c.mode).toBe('cut');
		expect(c.paths).toEqual(['C:\\b.txt']);
	});

	it('clearing resets mode and paths', () => {
		const c = new ClipboardStore();
		c.copy(['C:\\a.txt']);
		c.clear();

		expect(c.empty).toBe(true);
		expect(c.paths).toEqual([]);
		expect(c.mode).toBeNull();
	});

	it('copying an empty list leaves the clipboard empty', () => {
		const c = new ClipboardStore();
		c.copy([]);

		expect(c.empty).toBe(true);
	});

	it('copies the paths instead of keeping a reference to the array', () => {
		const c = new ClipboardStore();
		const original = ['C:\\a.txt'];
		c.copy(original);
		original.push('C:\\intruder.txt');

		expect(c.paths).toEqual(['C:\\a.txt']);
	});
});
