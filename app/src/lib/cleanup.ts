import { t } from './i18n';
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
	{ id: 'temp', name: t('File temporanei'), detail: t('Cartella dei temporanei, solo ciò che ha più di un giorno'), kind: 'rebuilt' },
	{ id: 'cache', name: t('Cache dei programmi'), detail: t('npm, Cargo, pip, NuGet, Gradle, VS Code, schede video'), kind: 'rebuilt' },
	{ id: 'projects', name: t('Cartelle di compilazione'), detail: t('node_modules, target, bin e obj dei progetti'), kind: 'projects' },
	{ id: 'models', name: t('Modelli di IA scaricati'), detail: t('Hugging Face, Ollama, LM Studio'), kind: 'review' },
	{ id: 'download', name: t('Download vecchi'), detail: t('Installer e archivi non aperti da 90 giorni'), kind: 'review' },
	{
		id: 'leftovers',
		name: t('Resti di programmi'),
		detail: t('Cartelle in Programmi e ProgramData di programmi non più installati: controlla prima di toglierle'),
		kind: 'review'
	},
	{ id: 'trash', name: t('Cestino'), detail: t('Già eliminato: si svuota tutto'), kind: 'trash' }
];

export const KIND_LABELS: Record<CleanupKind, string> = {
	rebuilt: t('si ricrea'),
	projects: 'progetti',
	review: t('da guardare'),
	trash: t('già eliminato')
};

const DAY = 24 * 60 * 60 * 1000;

/** What starts ticked: never what needs a look, never projects: they must be installed or built again. */
export function preselection(kind: CleanupKind, items: CleanupCandidate[]): string[] {
	if (kind === 'review' || kind === 'projects') return [];
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
	if (days < 60) return t('{0} giorni', [days]);
	if (days < 730) return t('{0} mesi', [Math.floor(days / 30)]);
	return t('{0} anni', [Math.floor(days / 365)]);
}

/** «ultimo accesso ieri · ultima modifica 3 mesi fa»; the access only when newer than the change. */
export function lastUse(used: number, opened: number, now: number): string {
	const ago = (at: number) => {
		const a = age(at, now);
		return a === 'oggi' || a === 'ieri' ? a : t('{0} fa', [a]);
	};
	const parts: string[] = [];
	if (opened > used) parts.push(t('ultimo accesso {0}', [ago(opened)]));
	if (used > 0) parts.push(t('ultima modifica {0}', [ago(used)]));
	return parts.join(' · ');
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
