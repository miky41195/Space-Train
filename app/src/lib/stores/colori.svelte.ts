import type { Archivio } from './preferiti.svelte';
import { alCambioDi } from './sincronizza';

const CHIAVE = 'space-train.colori';
const NAMES_KEY = 'space-train.nomi-colori';
const MAX_NAME = 40;

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
	/** Names the user gave to colours ("Rosso" → "Lavoro"); missing = default name. */
	#names = $state<Partial<Record<IdColore, string>>>({});

	constructor(private archivio: Archivio | null = archivioPredefinito()) {
		this.#leggi(archivio?.getItem(CHIAVE) ?? null);
		this.#readNames(archivio?.getItem(NAMES_KEY) ?? null);
		alCambioDi(CHIAVE, (v) => this.#leggi(v));
		alCambioDi(NAMES_KEY, (v) => this.#readNames(v));
	}

	#readNames(raw: string | null): void {
		try {
			const parsed: unknown = raw ? JSON.parse(raw) : {};
			const names: Partial<Record<IdColore, string>> = {};
			if (parsed && typeof parsed === 'object') {
				for (const c of COLORI_CARTELLA) {
					const v = (parsed as Record<string, unknown>)[c.id];
					if (typeof v === 'string' && v.trim()) names[c.id] = v.trim().slice(0, MAX_NAME);
				}
			}
			this.#names = names;
		} catch {
			this.#names = {};
		}
	}

	/** The label's name: the one the user chose, or the colour's own. */
	nameOf(id: IdColore): string {
		return this.#names[id] ?? COLORI_CARTELLA.find((c) => c.id === id)?.nome ?? id;
	}

	/** Blank restores the colour's own name. */
	rename(id: IdColore, name: string): void {
		const clean = name.trim().slice(0, MAX_NAME);
		const names = { ...this.#names };
		if (clean && clean !== COLORI_CARTELLA.find((c) => c.id === id)?.nome) names[id] = clean;
		else delete names[id];
		this.#names = names;
		try {
			this.archivio?.setItem(NAMES_KEY, JSON.stringify(names));
		} catch {
			// Storage denied: names last for this session.
		}
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

	/** Colours in use, in palette order, with how many items carry each. */
	get usati(): Array<{ id: IdColore; nome: string; esadecimale: string; quante: number }> {
		const valori = Object.values(this.#mappa);
		return COLORI_CARTELLA.map((c) => ({
			...c,
			nome: this.nameOf(c.id),
			quante: valori.filter((v) => v === c.id).length
		})).filter(
			(c) => c.quante > 0
		);
	}

	/** Every path carrying `colore`, in lowercase as stored. */
	percorsiDi(colore: IdColore): string[] {
		return Object.entries(this.#mappa)
			.filter(([, v]) => v === colore)
			.map(([k]) => k);
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
			if (k === vecchio || k.startsWith(vecchio + (vecchio.startsWith('/') ? '/' : '\\'))) {
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
