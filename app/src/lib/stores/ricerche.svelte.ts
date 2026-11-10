import type { Archivio } from './preferiti.svelte';
import { alCambioDi } from './sincronizza';
import { NESSUN_FILTRO, type Filtri } from '../filtri';

const CHIAVE = 'space-train.ricerche';

/** A search kept as a stop in the sidebar: a smart folder. */
export interface RicercaSalvata {
	nome: string;
	/** Where it searches; `null` = the folder open at the moment (ready-made ones). */
	cartella: string | null;
	testo: string;
	contenuto: boolean;
	filtri: Filtri;
}

/** Always there, searching the folder you are in. */
export const RICERCHE_PRONTE: RicercaSalvata[] = [
	{ nome: 'Modificati questa settimana', cartella: null, testo: '', contenuto: false, filtri: { ...NESSUN_FILTRO, data: '7' } },
	{ nome: 'File oltre 1 GB', cartella: null, testo: '', contenuto: false, filtri: { ...NESSUN_FILTRO, peso: '1gb' } }
];

export class RicercheStore {
	voci = $state<RicercaSalvata[]>([]);

	constructor(private archivio: Archivio | null = archivioPredefinito()) {
		this.#leggi(archivio?.getItem(CHIAVE) ?? null);
		alCambioDi(CHIAVE, (v) => this.#leggi(v));
	}

	#leggi(grezzo: string | null): void {
		try {
			const v = grezzo ? JSON.parse(grezzo) : [];
			this.voci = Array.isArray(v) ? v.filter((x) => x && typeof x.nome === 'string' && x.filtri) : [];
		} catch {
			this.voci = [];
		}
	}

	/** Saving the same name twice replaces the old one. */
	salva(r: RicercaSalvata): void {
		this.#scrivi([...this.voci.filter((v) => v.nome !== r.nome), r]);
	}

	togli(nome: string): void {
		this.#scrivi(this.voci.filter((v) => v.nome !== nome));
	}

	#scrivi(voci: RicercaSalvata[]): void {
		this.voci = voci;
		try {
			this.archivio?.setItem(CHIAVE, JSON.stringify(voci));
		} catch {
			// Storage refused: saved searches last for this session.
		}
	}
}

function archivioPredefinito(): Archivio | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
