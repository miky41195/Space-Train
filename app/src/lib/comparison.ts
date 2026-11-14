import type { Entry } from './ipc';
import { folderOf, locationName, separator } from './locations';
import type { Zone } from './grouping';
import type { Tab } from './stores/tabs.svelte';

type Comparison = NonNullable<Tab['comparison']>;

/** The comparison list in three zones, in the order the store lays out the results. */
export function compareZones(c: Comparison): Zone[] {
	const other = locationName(c.other);
	return [
		{ label: `Mancano in ${other}`, count: c.onlyHere },
		{ label: 'Diversi', count: c.different.length },
		{ label: 'Mancano qui', count: c.onlyThere }
	].filter((z) => z.count > 0);
}

/** One copy job: these sources go into `dest`. */
export interface CopyGroup {
	dest: string;
	sources: string[];
}

function withoutSeparator(p: string): string {
	return p.replace(/[\\/]+$/, '');
}

/** `path` moved from under `from` to under `to`, keeping its relative folder. */
function carryOver(path: string, from: string, to: string): string {
	const rel = withoutSeparator(folderOf(path)).slice(withoutSeparator(from).length);
	const dest = withoutSeparator(to) + rel;
	// A drive root needs its separator back: «C:» alone means the current folder of C:.
	return /^[A-Za-z]:$/.test(dest) || dest === '' ? dest + separator(to) : dest;
}

/**
 * What to copy to make one side complete: towards `other` («there») the
 * items only here plus the different ones that are newer here; towards this
 * folder («here») the reverse. Grouped by destination folder.
 */
export function alignPlan(c: Comparison, results: Entry[], here: string, direction: 'there' | 'here'): CopyGroup[] {
	const onlyHere = results.slice(0, c.onlyHere);
	const onlyThere = results.slice(c.onlyHere + c.different.length);
	const [from, to] = direction === 'there' ? [here, c.other] : [c.other, here];
	const sources =
		direction === 'there'
			? [...onlyHere, ...c.different.filter((d) => d.newerHere).map((d) => d.here)]
			: [...onlyThere, ...c.different.filter((d) => !d.newerHere).map((d) => d.there)];

	const groups = new Map<string, string[]>();
	for (const e of sources) {
		const dest = carryOver(e.path, from, to);
		groups.set(dest, [...(groups.get(dest) ?? []), e.path]);
	}
	return [...groups].map(([dest, sources]) => ({ dest, sources }));
}
