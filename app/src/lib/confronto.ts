import type { Entry } from './ipc';
import { cartellaDi, nomePosizione, separatore } from './posizioni';
import type { Zona } from './raggruppa';
import type { Tab } from './stores/tabs.svelte';

type Confronto = NonNullable<Tab['confronto']>;

/** The comparison list in three zones, in the order the store lays out the results. */
export function compareZones(c: Confronto): Zona[] {
	const altro = nomePosizione(c.altro);
	return [
		{ etichetta: `Mancano in ${altro}`, quante: c.onlyHere },
		{ etichetta: 'Diversi', quante: c.different.length },
		{ etichetta: 'Mancano qui', quante: c.onlyThere }
	].filter((z) => z.quante > 0);
}

/** One copy job: these sources go into `dest`. */
export interface CopyGroup {
	dest: string;
	sources: string[];
}

function senzaSeparatore(p: string): string {
	return p.replace(/[\\/]+$/, '');
}

/** `path` moved from under `from` to under `to`, keeping its relative folder. */
function riporta(path: string, from: string, to: string): string {
	const rel = senzaSeparatore(cartellaDi(path)).slice(senzaSeparatore(from).length);
	const dest = senzaSeparatore(to) + rel;
	// A drive root needs its separator back: «C:» alone means the current folder of C:.
	return /^[A-Za-z]:$/.test(dest) || dest === '' ? dest + separatore(to) : dest;
}

/**
 * What to copy to make one side complete: towards `altro` («la») the items
 * only here plus the different ones that are newer here; towards this
 * folder («qui») the reverse. Grouped by destination folder.
 */
export function alignPlan(c: Confronto, risultati: Entry[], here: string, verso: 'la' | 'qui'): CopyGroup[] {
	const soloQui = risultati.slice(0, c.onlyHere);
	const soloLa = risultati.slice(c.onlyHere + c.different.length);
	const [from, to] = verso === 'la' ? [here, c.altro] : [c.altro, here];
	const sorgenti =
		verso === 'la'
			? [...soloQui, ...c.different.filter((d) => d.newerHere).map((d) => d.here)]
			: [...soloLa, ...c.different.filter((d) => !d.newerHere).map((d) => d.there)];

	const gruppi = new Map<string, string[]>();
	for (const e of sorgenti) {
		const dest = riporta(e.path, from, to);
		gruppi.set(dest, [...(gruppi.get(dest) ?? []), e.path]);
	}
	return [...gruppi].map(([dest, sources]) => ({ dest, sources }));
}
