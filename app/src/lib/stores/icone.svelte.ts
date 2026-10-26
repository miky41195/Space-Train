import { SvelteMap } from 'svelte/reactivity';
import type { Backend, Entry } from '../ipc';
import { chiaveIcona, vuoleMiniatura } from '../icons';

/**
 * Tetto alle miniature tenute in memoria. Ognuna è un PNG in base64 da
 * qualche decina di KB: senza limite, scorrere una cartella di fotografie
 * gonfierebbe la memoria senza mai restituirla.
 */
const TETTO_MINIATURE = 400;

/**
 * Quante miniature si estraggono contemporaneamente.
 *
 * Dietro c'è un unico thread STA che legge e decodifica i file: alzare
 * questo numero non lo rende più veloce, allunga solo la coda.
 */
const PARALLELE_MAX = 3;

export class IconeStore {
	/** Icone di tipo: poche decine, non serve limitarle. */
	#icone = new SvelteMap<string, string>();
	/** Miniature per path, in ordine di inserimento per poter sfrattare. */
	#miniature = new SvelteMap<string, string>();

	/** Richieste già partite, per non chiedere due volte la stessa cosa. */
	#inCorso = new Set<string>();

	/** Miniature ancora da estrarre, in ordine di priorità. */
	#coda: Entry[] = [];
	#attive = 0;
	#lato = 64;

	constructor(private backend: Backend) {}

	/**
	 * Icona già in cache, o `null`. **Non** avvia alcun caricamento.
	 *
	 * Leggere è puro di proposito: il rendering di una riga non deve
	 * generare lavoro, altrimenti ogni ridisegno riaccoda richieste.
	 * A chiedere ci pensa `richiedi`.
	 */
	icona(entry: Entry, large = false): string | null {
		return this.#icone.get(chiaveIcona(entry, large)) ?? null;
	}

	/** Miniatura già in cache, o `null`. Non avvia alcun caricamento. */
	miniatura(entry: Entry): string | null {
		return this.#miniature.get(entry.path) ?? null;
	}

	/** Lato con cui è stata estratta ogni miniatura in cache. */
	#latiMiniature = new Map<string, number>();

	/**
	 * Vero se la voce va (ri)chiesta al lato `lato`: assente, o estratta
	 * troppo piccola. Ingrandendo le icone una miniatura da 64 pixel
	 * stirata a 256 si vedrebbe sgranata.
	 */
	#serve(e: Entry, lato: number, tutti: boolean): boolean {
		if (!tutti && !vuoleMiniatura(e)) return false;
		if (this.#inCorso.has(`t:${e.path}`)) return false;
		const avuto = this.#latiMiniature.get(e.path);
		return avuto === undefined || lato > avuto * 1.25;
	}

	/**
	 * Dichiara quali voci sono visibili adesso.
	 *
	 * La coda viene **sostituita**, non allungata: ciò che è uscito dallo
	 * schermo non va più estratto. Senza questo, uno scorrimento veloce
	 * lascia dietro centinaia di richieste per righe che nessuno guarda
	 * più, e le poche utili aspettano il loro turno dietro le inutili.
	 */
	richiedi(entries: Entry[], lato = 64, tutti = false): void {
		this.#lato = lato;

		// Le icone di tipo sono poche e non leggono il disco: si chiedono
		// subito, senza passare dalla coda.
		for (const e of entries) {
			const chiave = chiaveIcona(e, false);
			if (!this.#icone.has(chiave) && !this.#inCorso.has(chiave)) {
				this.#caricaIcona(e, chiave, false);
			}
		}

		// `tutti`: alle taglie grandi anche cartelle e programmi si chiedono
		// alla Shell, che restituisce la loro icona vera a quel lato invece
		// dell'icona di tipo a 32 pixel ingrandita.
		this.#coda = entries.filter((e) => this.#serve(e, lato, tutti));

		this.#pompa();
	}

	#pompa(): void {
		while (this.#attive < PARALLELE_MAX && this.#coda.length > 0) {
			const prossima = this.#coda.shift();
			if (prossima) this.#caricaMiniatura(prossima, this.#lato);
		}
	}

	async #caricaIcona(entry: Entry, chiave: string, large: boolean): Promise<void> {
		if (this.#inCorso.has(chiave)) return;
		this.#inCorso.add(chiave);

		const i = entry.name.lastIndexOf('.');
		const ext = entry.kind === 'dir' ? '' : i > 0 ? entry.name.slice(i + 1) : '';

		try {
			const url = await this.backend.iconForExtension(ext, entry.kind === 'dir', large);
			// Una risposta vuota si memorizza comunque: senza, ogni ridisegno
			// ritenterebbe all'infinito un'estensione senza icona.
			this.#icone.set(chiave, url ?? '');
		} catch {
			this.#icone.set(chiave, '');
		} finally {
			this.#inCorso.delete(chiave);
		}
	}

	async #caricaMiniatura(entry: Entry, lato: number): Promise<void> {
		const chiave = `t:${entry.path}`;
		if (this.#inCorso.has(chiave)) return;
		this.#inCorso.add(chiave);
		this.#attive += 1;

		try {
			const url = await this.backend.thumbnail(entry.path, lato);
			this.#sfratta();
			// Una risposta vuota lascia l'immagine che c'era: meglio una
			// miniatura più piccola che nessuna.
			if (url || !this.#miniature.get(entry.path)) this.#miniature.set(entry.path, url ?? '');
			this.#latiMiniature.set(entry.path, lato);
		} catch {
			this.#miniature.set(entry.path, '');
		} finally {
			this.#inCorso.delete(chiave);
			this.#attive -= 1;
			this.#pompa();
		}
	}

	/** Butta via le più vecchie: SvelteMap conserva l'ordine di inserimento. */
	#sfratta(): void {
		while (this.#miniature.size >= TETTO_MINIATURE) {
			const piuVecchia = this.#miniature.keys().next();
			if (piuVecchia.done) return;
			this.#miniature.delete(piuVecchia.value);
			this.#latiMiniature.delete(piuVecchia.value);
		}
	}

	/** Numero di miniature in memoria. Serve ai test. */
	get miniatureInMemoria(): number {
		return this.#miniature.size;
	}

	/** Estrazioni in volo in questo momento. Serve ai test. */
	get inVolo(): number {
		return this.#attive;
	}
}
