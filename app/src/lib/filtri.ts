import { estensioniDi } from './icons';
import type { CriteriRicerca } from './ipc';

/** Smart folder filters chosen in the search bar. `null` = no limit. */
export interface Filtri {
	tipo: TipoFiltro | null;
	peso: PesoFiltro | null;
	data: DataFiltro | null;
}

export const NESSUN_FILTRO: Filtri = { tipo: null, peso: null, data: null };

export const TIPI = [
	{ id: 'video', nome: 'Video', categorie: ['video'] },
	{ id: 'immagini', nome: 'Immagini', categorie: ['image'] },
	{ id: 'audio', nome: 'Audio', categorie: ['audio'] },
	{ id: 'documenti', nome: 'Documenti', categorie: ['doc', 'sheet', 'slide', 'text'] },
	{ id: 'archivi', nome: 'Archivi', categorie: ['archive'] }
] as const;
export type TipoFiltro = (typeof TIPI)[number]['id'];

const MB = 1024 * 1024;
export const PESI = [
	{ id: '100mb', nome: 'oltre 100 MB', byte: 100 * MB },
	{ id: '1gb', nome: 'oltre 1 GB', byte: 1024 * MB }
] as const;
export type PesoFiltro = (typeof PESI)[number]['id'];

const GIORNO = 24 * 60 * 60 * 1000;
export const DATE = [
	{ id: 'oggi', nome: 'oggi' },
	{ id: '7', nome: 'negli ultimi 7 giorni' },
	{ id: '30', nome: 'negli ultimi 30 giorni' },
	{ id: 'anno', nome: 'più di un anno fa' }
] as const;
export type DataFiltro = (typeof DATE)[number]['id'];

export function filtriAttivi(f: Filtri): boolean {
	return f.tipo !== null || f.peso !== null || f.data !== null;
}

/** The filters as search criteria for Rust, with dates relative to `ora`. */
export function criteriFiltri(f: Filtri, ora: Date = new Date()): Partial<CriteriRicerca> {
	const out: Partial<CriteriRicerca> = {};
	const tipo = TIPI.find((t) => t.id === f.tipo);
	if (tipo) out.extensions = estensioniDi([...tipo.categorie]);
	const peso = PESI.find((p) => p.id === f.peso);
	if (peso) out.minSize = peso.byte;
	if (f.data === 'oggi') out.modifiedAfter = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate()).getTime();
	else if (f.data === '7') out.modifiedAfter = ora.getTime() - 7 * GIORNO;
	else if (f.data === '30') out.modifiedAfter = ora.getTime() - 30 * GIORNO;
	else if (f.data === 'anno') out.modifiedBefore = ora.getTime() - 365 * GIORNO;
	return out;
}

/** A short name for a search: «Video oltre 1 GB», «“fattura” modificati oggi». */
export function descriviRicerca(testo: string, f: Filtri): string {
	const parti: string[] = [];
	const tipo = TIPI.find((t) => t.id === f.tipo);
	parti.push(tipo ? tipo.nome : testo ? `«${testo}»` : 'File');
	if (tipo && testo) parti.push(`con «${testo}»`);
	const peso = PESI.find((p) => p.id === f.peso);
	if (peso) parti.push(peso.nome);
	const data = DATE.find((d) => d.id === f.data);
	if (data) parti.push(`modificati ${data.nome}`);
	return parti.join(' ');
}
