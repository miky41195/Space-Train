/**
 * Batch rename: from a rule to the new name of every selected item.
 *
 * Pure: the dialog shows the plan as a live preview, the page executes it.
 */

import { senzaEstensione } from './posizioni';

export type RenameRule =
	| {
			mode: 'pattern';
			/** `#` runs become the counter, padded to the run's length: `Foto_###` → `Foto_001`. */
			pattern: string;
			start: number;
			keepExtension: boolean;
	  }
	| {
			mode: 'replace';
			find: string;
			replace: string;
			matchCase: boolean;
			keepExtension: boolean;
	  };

export interface RenameItem {
	path: string;
	name: string;
	isDir: boolean;
}

export interface PlannedRename {
	item: RenameItem;
	/** The name after the rule; equal to `item.name` when nothing changes. */
	newName: string;
	/** Why this name cannot be used; the plan is blocked while any is set. */
	problem?: string;
}

// Same rules as `validate_name` in src-tauri/src/fs/names.rs.
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = new Set([
	'CON', 'PRN', 'AUX', 'NUL',
	'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
	'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

export function nameProblem(name: string): string | undefined {
	if (name.trim() === '') return 'nome vuoto';
	if ([...name].length > 255) return 'nome troppo lungo';
	const bad = FORBIDDEN.exec(name);
	if (bad) return `carattere non ammesso «${bad[0]}»`;
	if (name.endsWith('.') || name.endsWith(' ')) return 'finisce con punto o spazio';
	if (RESERVED.has(name.split('.')[0].toUpperCase())) return 'nome riservato da Windows';
	return undefined;
}

function counter(pattern: string, n: number): string {
	if (!pattern.includes('#')) return `${pattern} (${n})`;
	return pattern.replace(/#+/g, (run) => String(n).padStart(run.length, '0'));
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function apply(rule: RenameRule, item: RenameItem, index: number): string {
	// Folders have no extension: a dot in a folder name is part of the name.
	const split = rule.keepExtension && !item.isDir;
	const base = split ? senzaEstensione(item.name) : item.name;
	// The original spelling of the extension: `.JPG` stays `.JPG`.
	const tail = item.name.slice(base.length);

	if (rule.mode === 'pattern') return counter(rule.pattern, rule.start + index) + tail;
	if (rule.find === '') return item.name;
	const re = new RegExp(escapeRegExp(rule.find), rule.matchCase ? 'g' : 'gi');
	return base.replace(re, () => rule.replace) + tail;
}

/**
 * New names in list order. `taken` holds the lowercase names already in the
 * folder; the selected items' own names don't count, they are being freed.
 */
export function planRename(items: RenameItem[], rule: RenameRule, taken: Set<string>): PlannedRename[] {
	const freed = new Set(items.map((i) => i.name.toLowerCase()));
	const plan: PlannedRename[] = items.map((item, i) => ({ item, newName: apply(rule, item, i) }));

	const seen = new Map<string, number>();
	for (const p of plan) {
		const key = p.newName.toLowerCase();
		seen.set(key, (seen.get(key) ?? 0) + 1);
	}

	for (const p of plan) {
		if (p.newName === p.item.name) continue;
		const key = p.newName.toLowerCase();
		p.problem =
			nameProblem(p.newName) ??
			((seen.get(key) ?? 0) > 1
				? 'nome ripetuto'
				: taken.has(key) && !freed.has(key)
					? 'esiste già'
					: undefined);
	}
	return plan;
}

/**
 * The single renames to run, in order. An item whose new name is still held
 * by another selected item (A→B while B→C, or a swap) first moves to a
 * temporary name, so no step ever finds its target occupied.
 */
export function renameSteps(plan: PlannedRename[]): Array<{ from: string; to: string }> {
	const changing = plan.filter((p) => p.newName !== p.item.name);
	const held = new Set(changing.map((p) => p.item.name.toLowerCase()));
	const first: Array<{ from: string; to: string }> = [];
	const second: Array<{ from: string; to: string }> = [];

	changing.forEach((p, i) => {
		const parent = p.item.path.slice(0, p.item.path.length - p.item.name.length);
		// Same name with different case is also held: Windows sees one file.
		if (held.has(p.newName.toLowerCase())) {
			const temp = `${p.item.name}.~st${i}`;
			first.push({ from: p.item.path, to: temp });
			second.push({ from: parent + temp, to: p.newName });
		} else {
			second.push({ from: p.item.path, to: p.newName });
		}
	});
	return [...first, ...second];
}
