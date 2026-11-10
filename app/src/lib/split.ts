/**
 * Dual pane: two tabs shown side by side in one window. The active tab is
 * the pane the commands act on; the other one is shown passive.
 */
export interface Split {
	left: number;
	right: number;
}

/** The tab on the other side of `active`, or null when `active` is not in the split. */
export function otherPane(split: Split | null, active: number | null): number | null {
	if (!split || active === null) return null;
	if (active === split.left) return split.right;
	if (active === split.right) return split.left;
	return null;
}

/**
 * Keeps the split in step with the tab bar. A tab picked outside the pair
 * takes the place of the pane that was active before; a closed tab ends
 * the split.
 */
export function followActive(
	split: Split | null,
	active: number | null,
	previous: number | null,
	tabIds: readonly number[]
): Split | null {
	if (!split || active === null) return null;
	if (!tabIds.includes(split.left) || !tabIds.includes(split.right)) return null;
	if (active === split.left || active === split.right) return split;
	if (previous === split.left && active !== split.right) return { left: active, right: split.right };
	if (previous === split.right && active !== split.left) return { left: split.left, right: active };
	return { left: active, right: split.right === active ? split.left : split.right };
}
