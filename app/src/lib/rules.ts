import type { Entry } from './ipc';
import { categoryFor } from './icons';
import { estensione, nomeDi } from './posizioni';
import { COLORI_CARTELLA, type IdColore } from './stores/colori.svelte';

/** When a rule looks at the folder. */
export type When = 'arrival' | 'daily';

export type Condition =
	| { type: 'any' }
	| { type: 'category'; category: Category }
	| { type: 'ext'; exts: string[] }
	| { type: 'name'; text: string }
	| { type: 'olderThan'; days: number }
	| { type: 'largerThan'; mb: number };

export type Category = 'image' | 'video' | 'audio' | 'doc' | 'archive' | 'exec';

export type Action =
	| { type: 'move'; dest: string }
	| { type: 'copy'; dest: string }
	| { type: 'label'; color: IdColore }
	| { type: 'trash' };

/** «When · if · then», on the files (never folders) of one folder. */
export interface Rule {
	id: string;
	folder: string;
	when: When;
	if: Condition;
	then: Action;
	enabled: boolean;
}

export const CATEGORIES: ReadonlyArray<{ id: Category; name: string; plural: string }> = [
	{ id: 'image', name: 'un’immagine', plural: 'Immagini' },
	{ id: 'video', name: 'un video', plural: 'Video' },
	{ id: 'audio', name: 'un file audio', plural: 'Audio' },
	{ id: 'doc', name: 'un documento', plural: 'Documenti' },
	{ id: 'archive', name: 'un archivio', plural: 'Archivi' },
	{ id: 'exec', name: 'un programma', plural: 'Programmi' }
];

/** Files still being written by a browser or a download manager: never touched. */
const PARTIAL = new Set(['crdownload', 'part', 'partial', 'download', 'tmp', 'opdownload', '!ut', 'filepart']);

const DAY = 24 * 60 * 60 * 1000;

export function isPartial(name: string): boolean {
	return PARTIAL.has(estensione(name).toLowerCase()) || name.startsWith('~$');
}

/** Extensions typed by the user, «PDF, .docx» → ['pdf', 'docx']. */
export function parseExts(text: string): string[] {
	return [...new Set(text.split(/[\s,;]+/).map((e) => e.replace(/^\*?\./, '').toLowerCase()).filter(Boolean))];
}

export function matches(c: Condition, e: Entry, now: number): boolean {
	if (e.kind !== 'file' || isPartial(e.name)) return false;
	switch (c.type) {
		case 'any':
			return true;
		case 'category': {
			const cat = categoryFor(e.name);
			if (c.category === 'doc') return ['doc', 'sheet', 'slide', 'text'].includes(cat) || estensione(e.name).toLowerCase() === 'pdf';
			return cat === c.category;
		}
		case 'ext':
			return c.exts.includes(estensione(e.name).toLowerCase());
		case 'name':
			return c.text.trim() !== '' && e.name.toLowerCase().includes(c.text.trim().toLowerCase());
		case 'olderThan':
			return e.modified !== null && now - e.modified > c.days * DAY;
		case 'largerThan':
			return e.size > c.mb * 1024 * 1024;
	}
}

/** What is wrong with a rule, in words for the user; null when it can be saved. */
export function problem(r: Rule): string | null {
	if ((r.then.type === 'move' || r.then.type === 'copy') && !r.then.dest.trim()) return 'Scegli la cartella di destinazione.';
	if ((r.then.type === 'move' || r.then.type === 'copy') && samePath(r.then.dest, r.folder)) {
		return 'La destinazione è la cartella stessa.';
	}
	if (r.if.type === 'ext' && r.if.exts.length === 0) return 'Scrivi almeno un’estensione, per esempio pdf.';
	if (r.if.type === 'name' && !r.if.text.trim()) return 'Scrivi il testo da cercare nel nome.';
	if ((r.if.type === 'olderThan' && !(r.if.days > 0)) || (r.if.type === 'largerThan' && !(r.if.mb > 0))) {
		return 'Scrivi un numero maggiore di zero.';
	}
	// A slip of the mouse must not empty a whole folder into the Recycle Bin.
	if (r.then.type === 'trash' && r.if.type === 'any') return 'Per il cestino serve una condizione: scegli quali file.';
	return null;
}

export function describeCondition(c: Condition): string {
	switch (c.type) {
		case 'any':
			return 'è un file qualsiasi';
		case 'category':
			return `è ${CATEGORIES.find((x) => x.id === c.category)?.name ?? c.category}`;
		case 'ext':
			return `ha estensione ${c.exts.map((e) => e.toUpperCase()).join(', ')}`;
		case 'name':
			return `il nome contiene «${c.text}»`;
		case 'olderThan':
			return `è più vecchio di ${c.days} ${c.days === 1 ? 'giorno' : 'giorni'}`;
		case 'largerThan':
			return `è più grande di ${c.mb} MB`;
	}
}

export function describeAction(a: Action, labelName: (id: IdColore) => string = defaultLabel): string {
	switch (a.type) {
		case 'move':
			return `spostalo in ${nomeDi(a.dest) || a.dest}`;
		case 'copy':
			return `copialo in ${nomeDi(a.dest) || a.dest}`;
		case 'label':
			return `dagli l’etichetta ${labelName(a.color)}`;
		case 'trash':
			return 'mandalo nel cestino';
	}
}

export function describeRule(r: Rule, labelName?: (id: IdColore) => string): string {
	const when = r.when === 'arrival' ? 'Quando arriva un file' : 'Ogni giorno';
	return `${when}, se ${describeCondition(r.if)}, ${describeAction(r.then, labelName)}`;
}

function defaultLabel(id: IdColore): string {
	return COLORI_CARTELLA.find((c) => c.id === id)?.nome ?? id;
}

export function samePath(a: string, b: string): boolean {
	const n = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase();
	return n(a) === n(b);
}

/**
 * Files of a folder that arrived and stopped changing: seen at the
 * previous look with the same size and date, and not at the one before.
 * Returns the files ready for «arrival» rules and the state for next time.
 */
export function settled(
	previous: ReadonlyMap<string, string> | null,
	waiting: ReadonlyMap<string, string>,
	files: readonly Entry[]
): { ready: Entry[]; seen: Map<string, string>; waiting: Map<string, string> } {
	const seen = new Map(files.map((f) => [f.path, `${f.size}|${f.modified}`]));
	// First look at a folder: what is already there did not «arrive».
	if (previous === null) return { ready: [], seen, waiting: new Map() };
	const ready: Entry[] = [];
	const still = new Map<string, string>();
	for (const f of files) {
		const sig = seen.get(f.path)!;
		const wait = waiting.get(f.path);
		if (wait !== undefined) {
			if (wait === sig) ready.push(f);
			else still.set(f.path, sig);
		} else if (!previous.has(f.path)) {
			still.set(f.path, sig);
		}
	}
	return { ready, seen, waiting: still };
}

/** Start of the local day, for «once a day». */
export function dayStart(now: number): number {
	const d = new Date(now);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}
