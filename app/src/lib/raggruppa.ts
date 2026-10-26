import type { Entry } from './ipc';
import { categoryFor } from './icons';

export type ModoGruppi = 'nessuno' | 'nome' | 'tipo' | 'data' | 'dimensione';

export interface Zona {
	etichetta: string;
	quante: number;
	/** Preferiti e recenti hanno un colore loro; le altre zone sono neutre. */
	tono?: 'preferiti' | 'recenti';
}

export interface Impaginato {
	/** Le voci nell'ordine in cui vanno disegnate, zona dopo zona. */
	voci: Entry[];
	/** Vuoto = lista non divisa, nessuna testata. */
	zone: Zona[];
}

/** Gruppi per tipo, nell'ordine in cui compaiono. */
const GRUPPI_TIPO: Array<{ etichetta: string; categorie: string[] }> = [
	{ etichetta: 'Cartelle', categorie: ['dir'] },
	{ etichetta: 'Documenti', categorie: ['doc', 'text', 'sheet', 'slide'] },
	{ etichetta: 'Immagini', categorie: ['image'] },
	{ etichetta: 'Video', categorie: ['video'] },
	{ etichetta: 'Audio', categorie: ['audio'] },
	{ etichetta: 'Archivi', categorie: ['archive'] },
	{ etichetta: 'Programmi', categorie: ['exec'] },
	{ etichetta: 'Codice e dati', categorie: ['code', 'markup', 'style', 'data', 'config'] },
	{ etichetta: 'Caratteri', categorie: ['font'] },
	{ etichetta: 'Altri file', categorie: ['plain'] }
];

function gruppoTipo(e: Entry): string {
	const categoria = e.kind === 'dir' ? 'dir' : categoryFor(e.name);
	return GRUPPI_TIPO.find((g) => g.categorie.includes(categoria))?.etichetta ?? 'Altri file';
}

const GRUPPI_DATA = [
	'Oggi',
	'Ieri',
	'Questa settimana',
	'Questo mese',
	'Quest’anno',
	'Più di un anno fa',
	'Senza data'
] as const;

function gruppoData(e: Entry, adesso: number): string {
	if (e.modified === null) return 'Senza data';

	const oggi = new Date(adesso);
	oggi.setHours(0, 0, 0, 0);
	const inizio = oggi.getTime();
	const giorno = 24 * 60 * 60 * 1000;

	if (e.modified >= inizio) return 'Oggi';
	if (e.modified >= inizio - giorno) return 'Ieri';
	if (e.modified >= inizio - 6 * giorno) return 'Questa settimana';
	if (e.modified >= inizio - 30 * giorno) return 'Questo mese';
	if (e.modified >= inizio - 365 * giorno) return 'Quest’anno';
	return 'Più di un anno fa';
}

const GRUPPI_NOME = ['0–9', 'A–H', 'I–P', 'Q–Z', 'Altri'] as const;

/** Fasce di nome come in Esplora: per iniziale, a blocchi. */
function gruppoNome(e: Entry): string {
	const c = e.name.charAt(0).toUpperCase();
	if (c >= '0' && c <= '9') return '0–9';
	if (c >= 'A' && c <= 'H') return 'A–H';
	if (c >= 'I' && c <= 'P') return 'I–P';
	if (c >= 'Q' && c <= 'Z') return 'Q–Z';
	return 'Altri';
}

const GRUPPI_DIMENSIONE = [
	'Cartelle',
	'Vuoto',
	'Minuscolo (0–16 KB)',
	'Piccolo (16 KB–1 MB)',
	'Medio (1–128 MB)',
	'Grande (128 MB–1 GB)',
	'Enorme (1–4 GB)',
	'Gigantesco (> 4 GB)'
] as const;

/** Le stesse fasce di dimensione di Esplora. */
function gruppoDimensione(e: Entry): string {
	if (e.kind === 'dir') return 'Cartelle';
	const kb = 1024;
	const mb = 1024 * kb;
	const gb = 1024 * mb;
	if (e.size === 0) return 'Vuoto';
	if (e.size < 16 * kb) return 'Minuscolo (0–16 KB)';
	if (e.size < mb) return 'Piccolo (16 KB–1 MB)';
	if (e.size < 128 * mb) return 'Medio (1–128 MB)';
	if (e.size < gb) return 'Grande (128 MB–1 GB)';
	if (e.size < 4 * gb) return 'Enorme (1–4 GB)';
	return 'Gigantesco (> 4 GB)';
}

/** I periodi del cursore «Recenti», in giorni. */
export const PERIODI_RECENTI = [
	{ giorni: 1, nome: 'Ultimo giorno' },
	{ giorni: 3, nome: 'Ultimi 3 giorni' },
	{ giorni: 7, nome: 'Ultima settimana' },
	{ giorni: 14, nome: 'Ultime 2 settimane' },
	{ giorni: 30, nome: 'Ultimo mese' },
	{ giorni: 90, nome: 'Ultimi 3 mesi' },
	{ giorni: 180, nome: 'Ultimi 6 mesi' },
	{ giorni: 365, nome: 'Ultimo anno' }
] as const;

/**
 * Divide le voci in zone: recenti in cima (se richiesti), poi preferiti,
 * poi i gruppi scelti.
 *
 * `recentiDal` è un istante in millisecondi: ciò che è stato modificato da
 * allora sale nella zona «Modificati di recente», dal più nuovo, e non si
 * ripete più sotto — nemmeno fra i preferiti.
 */
export function impagina(
	voci: readonly Entry[],
	preferiti: ReadonlySet<string>,
	modo: ModoGruppi,
	adesso = Date.now(),
	recentiDal: number | null = null
): Impaginato {
	if (recentiDal === null) return impaginaBase(voci, preferiti, modo, adesso);

	const recenti = voci
		.filter((e) => e.modified !== null && e.modified >= recentiDal)
		.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
	const resto = voci.filter((e) => !recenti.includes(e));
	const base = impaginaBase(resto, preferiti, modo, adesso);

	// La zona dei recenti c'è anche vuota: dice che nel periodo scelto non
	// è cambiato niente, invece di far sparire il pulsante appena premuto.
	const zone: Zona[] = [{ etichetta: 'Modificati di recente', quante: recenti.length, tono: 'recenti' }];
	if (base.zone.length > 0) zone.push(...base.zone);
	else if (resto.length > 0) zone.push({ etichetta: 'Tutti gli altri', quante: resto.length });

	return { voci: [...recenti, ...base.voci], zone };
}

function impaginaBase(
	voci: readonly Entry[],
	preferiti: ReadonlySet<string>,
	modo: ModoGruppi,
	adesso: number
): Impaginato {
	const sopra: Entry[] = [];
	const sotto: Entry[] = [];
	for (const e of voci) {
		if (preferiti.has(e.name.toLowerCase())) sopra.push(e);
		else sotto.push(e);
	}

	if (modo === 'nessuno') {
		if (sopra.length === 0) return { voci: [...voci], zone: [] };
		return {
			voci: [...sopra, ...sotto],
			zone: [
				{ etichetta: 'Preferiti', quante: sopra.length, tono: 'preferiti' },
				{ etichetta: 'Comuni', quante: sotto.length }
			]
		};
	}

	const { ordine, chiave } = {
		nome: { ordine: GRUPPI_NOME as readonly string[], chiave: gruppoNome },
		tipo: { ordine: GRUPPI_TIPO.map((g) => g.etichetta), chiave: gruppoTipo },
		data: { ordine: GRUPPI_DATA as readonly string[], chiave: (e: Entry) => gruppoData(e, adesso) },
		dimensione: { ordine: GRUPPI_DIMENSIONE as readonly string[], chiave: gruppoDimensione }
	}[modo];

	const gruppi = new Map<string, Entry[]>(ordine.map((o) => [o, []]));
	for (const e of sotto) gruppi.get(chiave(e))!.push(e);

	const zone: Zona[] = [];
	const ordinate: Entry[] = [];
	if (sopra.length > 0) {
		zone.push({ etichetta: 'Preferiti', quante: sopra.length, tono: 'preferiti' });
		ordinate.push(...sopra);
	}
	for (const [etichetta, membri] of gruppi) {
		if (membri.length === 0) continue;
		zone.push({ etichetta, quante: membri.length });
		ordinate.push(...membri);
	}

	return { voci: ordinate, zone };
}
