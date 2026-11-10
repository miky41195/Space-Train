import { describe, it, expect } from 'vitest';
import { followActive, otherPane } from './split';

describe('dual pane', () => {
	const split = { left: 1, right: 2 };

	it('finds the other pane', () => {
		expect(otherPane(split, 1)).toBe(2);
		expect(otherPane(split, 2)).toBe(1);
		expect(otherPane(split, 3)).toBeNull();
		expect(otherPane(null, 1)).toBeNull();
	});

	it('switching between the two panes keeps the split', () => {
		expect(followActive(split, 2, 1, [1, 2, 3])).toBe(split);
	});

	it('a tab picked from the tab bar replaces the pane that was active', () => {
		expect(followActive(split, 3, 1, [1, 2, 3])).toEqual({ left: 3, right: 2 });
		expect(followActive(split, 3, 2, [1, 2, 3])).toEqual({ left: 1, right: 3 });
	});

	it('closing either tab ends the split', () => {
		expect(followActive(split, 1, 2, [1, 3])).toBeNull();
		expect(followActive(split, null, 1, [])).toBeNull();
	});
});
