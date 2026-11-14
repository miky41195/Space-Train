import type { CleanupCategory, CleanupCandidate } from './ipc';

/** How a category goes away: rebuilt by its program, worth a look first, or already deleted. */
export type CleanupKind = 'rebuilt' | 'projects' | 'review' | 'trash';

export interface Category {
	id: CleanupCategory;
	name: string;
	detail: string;
	kind: CleanupKind;
}

export const CATEGORIES: readonly Category[] = [
	{ id: 'temp', name: 'File temporanei', detail: 'Cartella dei temporanei, solo ciò che ha più di un giorno', kind: 'rebuilt' },
	{ id: 'cache', name: 'Cache dei programmi', detail: 'npm, Cargo, pip, NuGet, Gradle, VS Code, schede video', kind: 'rebuilt' },
	{ id: 'projects', name: 'Cartelle di compilazione', detail: 'node_modules, target, bin e obj dei progetti', kind: 'projects' },
	{ id: 'models', name: 'Modelli di IA scaricati', detail: 'Hugging Face, Ollama, LM Studio', kind: 'review' },
	{ id: 'download', name: 'Download vecchi', detail: 'Installer e archivi non aperti da 90 giorni', kind: 'review' },
	{
		id: 'leftovers',
		name: 'Resti di programmi',
		detail: 'Cartelle in Programmi e ProgramData di programmi non più installati: controlla prima di toglierle',
		kind: 'review'
	},
	{ id: 'trash', name: 'Cestino', detail: 'Già eliminato: si svuota tutto', kind: 'trash' }
];

export const KIND_LABELS: Record<CleanupKind, string> = {
	rebuilt: 'si ricrea',
	projects: 'progetti',
	review: 'da guardare',
	trash: 'già eliminato'
};

const DAY = 24 * 60 * 60 * 1000;
/** A build folder used in the last week is still being worked on. */
const IN_USE = 7 * DAY;

/** What starts ticked: never what needs a look, never a project touched this week. */
export function preselection(kind: CleanupKind, items: CleanupCandidate[], now: number): string[] {
	if (kind === 'review') return [];
	if (kind === 'projects') return items.filter((v) => now - v.used > IN_USE).map((v) => v.path);
	return items.map((v) => v.path);
}

export interface Plan {
	/** Deleted for good: rebuilt by their program. */
	permanent: string[];
	/** To the Trash: can come back. */
	trash: string[];
	/** To the Trash too, but in Program Files and ProgramData: Windows asks for administrator rights. */
	asAdmin: string[];
	/** Empty the Trash. */
	emptyTrash: boolean;
	bytes: number;
}

/** The deletions for what is ticked, per category. */
export function plan(
	found: Partial<Record<CleanupCategory, CleanupCandidate[]>>,
	chosen: Partial<Record<CleanupCategory, string[]>>
): Plan {
	const p: Plan = { permanent: [], trash: [], asAdmin: [], emptyTrash: false, bytes: 0 };
	for (const c of CATEGORIES) {
		const taken = new Set(chosen[c.id] ?? []);
		const items = (found[c.id] ?? []).filter((v) => taken.has(v.path));
		if (items.length === 0) continue;
		p.bytes += items.reduce((n, v) => n + v.size, 0);
		if (c.kind === 'trash') p.emptyTrash = true;
		else (c.id === 'leftovers' ? p.asAdmin : c.kind === 'review' ? p.trash : p.permanent).push(...items.map((v) => v.path));
	}
	return p;
}

/** «oggi», «ieri», «12 giorni», «3 mesi», «2 anni». */
export function age(used: number, now: number): string {
	const days = Math.floor((now - used) / DAY);
	if (used <= 0) return '';
	if (days < 1) return 'oggi';
	if (days < 2) return 'ieri';
	if (days < 60) return `${days} giorni`;
	if (days < 730) return `${Math.floor(days / 30)} mesi`;
	return `${Math.floor(days / 365)} anni`;
}

/** The path below the folder it was found in, for a short row. */
export function shortPath(path: string, roots: string[]): string {
	const p = path.toLowerCase();
	for (const r of roots) {
		const base = r.replace(/[\\/]+$/, '');
		if (p.startsWith(base.toLowerCase() + '\\') || p.startsWith(base.toLowerCase() + '/')) {
			return path.slice(base.length + 1);
		}
	}
	return path;
}
