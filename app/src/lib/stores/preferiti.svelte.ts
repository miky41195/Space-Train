import type { Entry } from '../ipc';
import { alCambioDi } from './sincronizza';

const CHIAVE = 'space-train.preferiti';

/** Il minimo di Storage che serve: così nei test basta un oggetto qualsiasi. */
export type Archivio = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Preferiti per cartella: ogni cartella tiene il suo elenco di nomi da
 * mostrare nella zona in cima, separati dal resto.
 *
 * Si salvano i nomi, non i path completi: il preferito appartiene alla
 * cartella in cui è stato scelto, e il path del genitore è già la chiave.
 * Tutto in minuscolo perché su Windows `Foto` e `foto` sono lo stesso file.
 */
export class PreferitiStore {
	#mappa = $state<Record<string, string[]>>({});

	constructor(private archivio: Archivio | null = archivioPredefinito()) {
		this.#leggi(archivio?.getItem(CHIAVE) ?? null);
		alCambioDi(CHIAVE, (v) => this.#leggi(v));
	}

	#leggi(grezzo: string | null): void {
		try {
			this.#mappa = grezzo ? JSON.parse(grezzo) : {};
		} catch {
			// Archivio illeggibile o corrotto: si riparte senza preferiti
			// invece di bloccare l'avvio.
		}
	}

	/** Nomi preferiti della cartella, già normalizzati. */
	di(cartella: string): ReadonlySet<string> {
		return new Set(this.#mappa[chiave(cartella)] ?? []);
	}

	/** Vero se tutte le voci indicate sono già preferite. Con zero voci, falso. */
	tutti(cartella: string, nomi: readonly string[]): boolean {
		if (nomi.length === 0) return false;
		const insieme = this.di(cartella);
		return nomi.every((n) => insieme.has(n.toLowerCase()));
	}

	/**
	 * Se sono già tutte preferite le toglie, altrimenti le aggiunge tutte.
	 * Su una selezione mista vince l'aggiunta: è il gesto che l'utente
	 * fa più spesso, e ripeterlo poi le toglie.
	 */
	alterna(cartella: string, nomi: readonly string[]): void {
		if (nomi.length === 0) return;
		const insieme = new Set(this.di(cartella));
		const togli = this.tutti(cartella, nomi);

		for (const n of nomi) {
			if (togli) insieme.delete(n.toLowerCase());
			else insieme.add(n.toLowerCase());
		}

		this.#scrivi(cartella, insieme);
	}

	/** Dopo una rinomina il preferito segue il file, invece di perdersi. */
	rinomina(cartella: string, vecchio: string, nuovo: string): void {
		const insieme = new Set(this.di(cartella));
		if (!insieme.delete(vecchio.toLowerCase())) return;
		insieme.add(nuovo.toLowerCase());
		this.#scrivi(cartella, insieme);
	}

	#scrivi(cartella: string, insieme: Set<string>): void {
		const k = chiave(cartella);
		const copia = { ...this.#mappa };

		if (insieme.size === 0) delete copia[k];
		else copia[k] = [...insieme];

		this.#mappa = copia;

		try {
			this.archivio?.setItem(CHIAVE, JSON.stringify(copia));
		} catch {
			// Quota piena o archivio negato: i preferiti restano validi per
			// questa sessione.
		}
	}
}

/**
 * Separa le voci nelle due zone mantenendo l'ordine di partenza: dentro
 * ciascuna zona vale l'ordinamento scelto con le intestazioni.
 */
export function dividi(
	entries: readonly Entry[],
	preferiti: ReadonlySet<string>
): { preferiti: Entry[]; comuni: Entry[] } {
	const sopra: Entry[] = [];
	const sotto: Entry[] = [];

	for (const e of entries) {
		if (preferiti.has(e.name.toLowerCase())) sopra.push(e);
		else sotto.push(e);
	}

	return { preferiti: sopra, comuni: sotto };
}

function chiave(cartella: string): string {
	return cartella.toLowerCase();
}

function archivioPredefinito(): Archivio | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
