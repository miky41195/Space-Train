import type { CategoriaPulizia, Trovato } from './ipc';

/** How a category goes away: rebuilt by its program, worth a look first, or already deleted. */
export type TipoPulizia = 'ricrea' | 'progetti' | 'guarda' | 'cestino';

export interface Categoria {
	id: CategoriaPulizia;
	nome: string;
	dettaglio: string;
	tipo: TipoPulizia;
}

export const CATEGORIE: readonly Categoria[] = [
	{ id: 'temp', nome: 'File temporanei', dettaglio: 'Cartella dei temporanei, solo ciò che ha più di un giorno', tipo: 'ricrea' },
	{ id: 'cache', nome: 'Cache dei programmi', dettaglio: 'npm, Cargo, pip, NuGet, Gradle, VS Code, schede video', tipo: 'ricrea' },
	{ id: 'progetti', nome: 'Cartelle di compilazione', dettaglio: 'node_modules, target, bin e obj dei progetti', tipo: 'progetti' },
	{ id: 'modelli', nome: 'Modelli di IA scaricati', dettaglio: 'Hugging Face, Ollama, LM Studio', tipo: 'guarda' },
	{ id: 'download', nome: 'Download vecchi', dettaglio: 'Installer e archivi non aperti da 90 giorni', tipo: 'guarda' },
	{ id: 'cestino', nome: 'Cestino', dettaglio: 'Già eliminato: si svuota tutto', tipo: 'cestino' }
];

export const ETICHETTE: Record<TipoPulizia, string> = {
	ricrea: 'si ricrea',
	progetti: 'progetti',
	guarda: 'da guardare',
	cestino: 'già eliminato'
};

const GIORNO = 24 * 60 * 60 * 1000;
/** A build folder used in the last week is still being worked on. */
const IN_USO = 7 * GIORNO;

/** What starts ticked: never what needs a look, never a project touched this week. */
export function preselezione(tipo: TipoPulizia, voci: Trovato[], adesso: number): string[] {
	if (tipo === 'guarda') return [];
	if (tipo === 'progetti') return voci.filter((v) => adesso - v.used > IN_USO).map((v) => v.path);
	return voci.map((v) => v.path);
}

export interface Piano {
	/** Deleted for good: rebuilt by their program. */
	disco: string[];
	/** To the Trash: can come back. */
	cestino: string[];
	/** Empty the Trash. */
	svuota: boolean;
	byte: number;
}

/** The deletions for what is ticked, per category. */
export function piano(trovati: Partial<Record<CategoriaPulizia, Trovato[]>>, scelti: Partial<Record<CategoriaPulizia, string[]>>): Piano {
	const p: Piano = { disco: [], cestino: [], svuota: false, byte: 0 };
	for (const c of CATEGORIE) {
		const presi = new Set(scelti[c.id] ?? []);
		const voci = (trovati[c.id] ?? []).filter((v) => presi.has(v.path));
		if (voci.length === 0) continue;
		p.byte += voci.reduce((n, v) => n + v.size, 0);
		if (c.tipo === 'cestino') p.svuota = true;
		else (c.tipo === 'guarda' ? p.cestino : p.disco).push(...voci.map((v) => v.path));
	}
	return p;
}

/** «oggi», «ieri», «12 giorni», «3 mesi», «2 anni». */
export function eta(used: number, adesso: number): string {
	const giorni = Math.floor((adesso - used) / GIORNO);
	if (used <= 0) return '';
	if (giorni < 1) return 'oggi';
	if (giorni < 2) return 'ieri';
	if (giorni < 60) return `${giorni} giorni`;
	if (giorni < 730) return `${Math.floor(giorni / 30)} mesi`;
	return `${Math.floor(giorni / 365)} anni`;
}

/** The path below the folder it was found in, for a short row. */
export function corto(path: string, radici: string[]): string {
	const p = path.toLowerCase();
	for (const r of radici) {
		const base = r.replace(/[\\/]+$/, '');
		if (p.startsWith(base.toLowerCase() + '\\') || p.startsWith(base.toLowerCase() + '/')) {
			return path.slice(base.length + 1);
		}
	}
	return path;
}
