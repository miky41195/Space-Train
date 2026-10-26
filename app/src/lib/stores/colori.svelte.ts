import type { Archivio } from './preferiti.svelte';
import { alCambioDi } from './sincronizza';

const CHIAVE = 'space-train.colori';

/** I colori che si possono dare a una cartella, nell'ordine del menu. */
export const COLORI_CARTELLA = [
	{ id: 'rosso', nome: 'Rosso', esadecimale: '#ef4444' },
	{ id: 'arancione', nome: 'Arancione', esadecimale: '#f97316' },
	{ id: 'giallo', nome: 'Giallo', esadecimale: '#eab308' },
	{ id: 'verde', nome: 'Verde', esadecimale: '#22c55e' },
	{ id: 'azzurro', nome: 'Azzurro', esadecimale: '#06b6d4' },
	{ id: 'blu', nome: 'Blu', esadecimale: '#3b82f6' },
	{ id: 'viola', nome: 'Viola', esadecimale: '#a855f7' },
	{ id: 'rosa', nome: 'Rosa', esadecimale: '#ec4899' },
	{ id: 'grigio', nome: 'Grigio', esadecimale: '#9ca3af' }
] as const;

export type IdColore = (typeof COLORI_CARTELLA)[number]['id'];

/**
 * Colore assegnato a ogni cartella, per riconoscerla a colpo d'occhio.
 *
 * La chiave è il path completo in minuscolo: il colore segue la cartella
 * ovunque compaia (lista, barra laterale, risultati di ricerca), non solo
 * nella cartella in cui è stato scelto.
 */
export class ColoriStore {
	#mappa = $state<Record<string, IdColore>>({});

	constructor(private archivio: Archivio | null = archivioPredefinito()) {
		this.#leggi(archivio?.getItem(CHIAVE) ?? null);
		alCambioDi(CHIAVE, (v) => this.#leggi(v));
	}

	#leggi(grezzo: string | null): void {
		try {
			this.#mappa = grezzo ? JSON.parse(grezzo) : {};
		} catch {
			// Archivio illeggibile: si riparte senza colori.
		}
	}

	/** Il colore della cartella in esadecimale, o `undefined`. */
	di(path: string): string | undefined {
		const id = this.#mappa[path.toLowerCase()];
		return COLORI_CARTELLA.find((c) => c.id === id)?.esadecimale;
	}

	idDi(path: string): IdColore | undefined {
		return this.#mappa[path.toLowerCase()];
	}

	/** `null` toglie il colore. */
	imposta(paths: readonly string[], colore: IdColore | null): void {
		const copia = { ...this.#mappa };
		for (const p of paths) {
			if (colore === null) delete copia[p.toLowerCase()];
			else copia[p.toLowerCase()] = colore;
		}
		this.#scrivi(copia);
	}

	/**
	 * La cartella è stata rinominata o spostata: il colore la segue, e con
	 * lui quello delle sottocartelle colorate.
	 */
	sposta(da: string, a: string): void {
		const vecchio = da.toLowerCase();
		const nuovo = a.toLowerCase();
		let cambiato = false;
		const copia: Record<string, IdColore> = {};
		for (const [k, v] of Object.entries(this.#mappa)) {
			if (k === vecchio || k.startsWith(vecchio + '\\')) {
				copia[nuovo + k.slice(vecchio.length)] = v;
				cambiato = true;
			} else {
				copia[k] = v;
			}
		}
		if (cambiato) this.#scrivi(copia);
	}

	#scrivi(mappa: Record<string, IdColore>): void {
		this.#mappa = mappa;
		try {
			this.archivio?.setItem(CHIAVE, JSON.stringify(mappa));
		} catch {
			// Archivio negato: i colori valgono per questa sessione.
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
