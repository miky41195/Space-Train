import type { Backend, CriteriRicerca, Entry, FsError, SortSpec } from '../ipc';
import { stessoPath } from '../posizioni';

export interface Tab {
	id: number;
	path: string;
	entries: Entry[];
	sort: SortSpec;
	/** Path selezionati, nell'ordine in cui compaiono nella lista. */
	selection: string[];
	/**
	 * Punto d'ancoraggio per la selezione con Maiusc: è la voce da cui
	 * parte l'intervallo, e non coincide con l'ultima cliccata.
	 */
	anchor: string | null;
	/** Filtro di ricerca applicato alle voci già caricate. Vuoto = nessun filtro. */
	query: string;
	history: string[];
	historyIndex: number;
	/** Contatore monotono delle richieste emesse da questo tab. */
	reqSeq: number;
	/** Numero della richiesta il cui risultato è attualmente a schermo. */
	lastApplied: number;
	error: FsError | null;
	loading: boolean;
	/**
	 * Risultati della ricerca nelle sottocartelle. `null` = nessuna ricerca
	 * ricorsiva: la lista mostra il contenuto della cartella.
	 */
	risultati: Entry[] | null;
	cercando: boolean;
	/** Operazione di ricerca in corso, per poterla annullare. */
	ricercaOp: number | null;
}

/** Gli id delle ricerche stanno lontani da quelli dei trasferimenti. */
let prossimaRicerca = 1_000_000;

const SORT_DEFAULT: SortSpec = { key: 'name', ascending: true };

export class TabsStore {
	tabs = $state<Tab[]>([]);
	activeId = $state<number | null>(null);
	showHidden = $state(false);

	#nextId = 1;

	/**
	 * Comandi di navigazione in fila, uno per scheda.
	 *
	 * «Su» e «Indietro» leggono la posizione corrente e poi aspettano il
	 * disco: premuti due volte di fila, il secondo partiva dalla cartella
	 * vecchia e si risaliva di un livello solo. In fila, ognuno parte da
	 * dove il precedente è arrivato.
	 */
	#fila = new Map<number, Promise<unknown>>();

	#inFila<T>(id: number, lavoro: () => Promise<T>): Promise<T> {
		const prima = this.#fila.get(id) ?? Promise.resolve();
		const dopo = prima.catch(() => {}).then(lavoro);
		this.#fila.set(id, dopo);
		return dopo;
	}

	/**
	 * `ordini` ricorda l'ordinamento scelto per ogni cartella, come fa
	 * Esplora. Senza, l'ordinamento resta quello del tab qualunque sia la
	 * cartella.
	 */
	constructor(
		private backend: Backend,
		private ordini?: {
			leggi(cartella: string): SortSpec | undefined;
			scrivi(cartella: string, spec: SortSpec): void;
		}
	) {}

	get activeTab(): Tab | undefined {
		return this.tabs.find((t) => t.id === this.activeId);
	}

	async openTab(path: string): Promise<number> {
		const tab: Tab = {
			id: this.#nextId++,
			path,
			entries: [],
			sort: { ...(this.ordini?.leggi(path) ?? SORT_DEFAULT) },
			selection: [],
			anchor: null,
			query: '',
			history: [path],
			historyIndex: 0,
			reqSeq: 0,
			lastApplied: 0,
			error: null,
			loading: false,
			risultati: null,
			cercando: false,
			ricercaOp: null
		};
		this.tabs.push(tab);

		// Da qui in poi si lavora sul proxy che vive nell'array, non
		// sull'oggetto grezzo: scrivere su quest'ultimo aggiorna il valore
		// ma non emette alcun segnale, e l'interfaccia resta ferma su ciò
		// che aveva letto all'inizio.
		const vivo = this.tabs[this.tabs.length - 1];

		this.activeId = vivo.id;
		await this.#load(vivo, path, { pushHistory: false });
		return vivo.id;
	}

	closeTab(id: number): void {
		const i = this.tabs.findIndex((t) => t.id === id);
		if (i === -1) return;

		this.tabs.splice(i, 1);

		if (this.activeId !== id) return;
		const vicino = this.tabs[i - 1] ?? this.tabs[i];
		this.activeId = vicino ? vicino.id : null;
	}

	setActive(id: number): void {
		if (this.tabs.some((t) => t.id === id)) this.activeId = id;
	}

	/** Passa al tab vicino, girando in tondo come Ctrl+Tab nei browser. */
	attivaVicino(delta: number): void {
		const n = this.tabs.length;
		if (n === 0) return;
		const i = this.tabs.findIndex((t) => t.id === this.activeId);
		this.activeId = this.tabs[(i + delta + n) % n].id;
	}

	/** Ctrl+1…8 vanno al tab in quella posizione; Ctrl+9 sempre all'ultimo. */
	attivaIndice(indice: number): void {
		const tab = indice >= 8 ? this.tabs[this.tabs.length - 1] : this.tabs[indice];
		if (tab) this.activeId = tab.id;
	}

	/**
	 * Fuori dalla fila: andare in una cartella precisa non dipende da dove
	 * si è, e fra due clic rapidi deve vincere l'ultimo, non il primo.
	 */
	async navigate(id: number, path: string): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.#load(tab, path, { pushHistory: true });
	}

	goBack(id: number): Promise<void> {
		return this.#inFila(id, async () => {
			const tab = this.#get(id);
			if (!tab || tab.historyIndex === 0) return;
			const target = tab.history[tab.historyIndex - 1];
			const ok = await this.#load(tab, target, { pushHistory: false });
			if (ok) tab.historyIndex -= 1;
		});
	}

	goForward(id: number): Promise<void> {
		return this.#inFila(id, async () => {
			const tab = this.#get(id);
			if (!tab || tab.historyIndex >= tab.history.length - 1) return;
			const target = tab.history[tab.historyIndex + 1];
			const ok = await this.#load(tab, target, { pushHistory: false });
			if (ok) tab.historyIndex += 1;
		});
	}

	goUp(id: number): Promise<void> {
		return this.#inFila(id, async () => {
			const tab = this.#get(id);
			if (!tab) return;
			try {
				const parent = await this.backend.navigate(tab.path, 'up');
				await this.#load(tab, parent, { pushHistory: true });
			} catch {
				// Siamo già a una radice: nessun parent, nessun cambiamento.
			}
		});
	}

	/**
	 * Rilegge la cartella corrente senza toccare la cronologia.
	 * Serve dopo un'operazione che ha cambiato il contenuto sul disco.
	 */
	async reload(id: number): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.#load(tab, tab.path, { pushHistory: false });
	}

	/**
	 * Rilegge senza disturbare: selezione, ricerca e risultati restano.
	 * È la ricarica dell'aggiornamento automatico e di F5, che non deve
	 * far perdere all'utente ciò che stava facendo.
	 */
	async aggiorna(id: number): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.#load(tab, tab.path, { pushHistory: false, mantieni: true });
	}

	/** Aggiorna ogni tab che mostra questa cartella. */
	async aggiornaCartella(path: string): Promise<void> {
		const coinvolti = this.tabs.filter((t) => stessoPath(t.path, path) && t.risultati === null);
		await Promise.all(coinvolti.map((t) => this.aggiorna(t.id)));
	}

	selezionaPercorsi(id: number, paths: string[]): void {
		const tab = this.#get(id);
		if (!tab) return;
		tab.selection = [...paths];
		tab.anchor = paths[paths.length - 1] ?? null;
	}

	/**
	 * Cerca nelle sottocartelle della cartella corrente. I risultati
	 * arrivano a lotti e si aggiungono man mano: una ricerca nuova annulla
	 * quella in corso.
	 */
	async cercaRicorsivo(id: number, criteri: CriteriRicerca): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		await this.fermaRicerca(id, { tieniRisultati: true });

		const op = prossimaRicerca++;
		tab.ricercaOp = op;
		tab.risultati = [];
		tab.cercando = true;
		tab.selection = [];
		tab.anchor = null;

		try {
			await this.backend.search({
				opId: op,
				root: tab.path,
				criteri,
				onResults: (lotto) => {
					// Un lotto in ritardo di una ricerca già sostituita non
					// deve mescolarsi ai risultati della nuova.
					if (tab.ricercaOp === op && tab.risultati) tab.risultati = [...tab.risultati, ...lotto];
				}
			});
		} finally {
			if (tab.ricercaOp === op) {
				tab.cercando = false;
				tab.ricercaOp = null;
			}
		}
	}

	/** Ferma la ricerca e, salvo richiesta, torna al contenuto della cartella. */
	async fermaRicerca(id: number, opts: { tieniRisultati?: boolean } = {}): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		const op = tab.ricercaOp;
		tab.ricercaOp = null;
		tab.cercando = false;
		if (!opts.tieniRisultati) tab.risultati = null;
		if (op !== null) await this.backend.cancelTransfer(op);
	}

	/** Non tocca il backend: filtra le voci già in memoria. */
	setQuery(id: number, q: string): void {
		const tab = this.#get(id);
		if (tab) tab.query = q;
	}

	clearQuery(id: number): void {
		this.setQuery(id, '');
	}

	async setSort(id: number, spec: SortSpec): Promise<void> {
		const tab = this.#get(id);
		if (!tab) return;
		tab.sort = spec;
		this.ordini?.scrivi(tab.path, spec);
		await this.#load(tab, tab.path, { pushHistory: false });
	}

	/**
	 * Applica un clic sulla voce `path` dentro l'elenco `visibili`.
	 *
	 * `visibili` è la lista come la vede l'utente — già filtrata dalla
	 * ricerca — perché l'intervallo con Maiusc deve seguire ciò che è a
	 * schermo, non l'ordine interno del tab.
	 *
	 * - senza modificatori: seleziona solo quella voce
	 * - Ctrl: aggiunge o toglie, lasciando il resto
	 * - Maiusc: seleziona dall'ancora fino a qui
	 */
	seleziona(
		id: number,
		path: string,
		visibili: readonly Entry[],
		modificatori: { ctrl?: boolean; shift?: boolean } = {}
	): void {
		const tab = this.#get(id);
		if (!tab) return;

		if (modificatori.shift && tab.anchor) {
			const da = visibili.findIndex((e) => e.path === tab.anchor);
			const a = visibili.findIndex((e) => e.path === path);

			if (da !== -1 && a !== -1) {
				const [inizio, fine] = da <= a ? [da, a] : [a, da];
				tab.selection = visibili.slice(inizio, fine + 1).map((e) => e.path);
				// L'ancora resta dov'era: estendere due volte parte sempre
				// dallo stesso capo, come in qualsiasi elenco.
				return;
			}
		}

		if (modificatori.ctrl) {
			tab.selection = tab.selection.includes(path)
				? tab.selection.filter((p) => p !== path)
				: [...tab.selection, path];
			tab.anchor = path;
			return;
		}

		tab.selection = [path];
		tab.anchor = path;
	}

	selezionaTutto(id: number, visibili: readonly Entry[]): void {
		const tab = this.#get(id);
		if (!tab) return;
		tab.selection = visibili.map((e) => e.path);
		tab.anchor = visibili[0]?.path ?? null;
	}

	pulisciSelezione(id: number): void {
		const tab = this.#get(id);
		if (!tab) return;
		tab.selection = [];
		tab.anchor = null;
	}

	/** Mostra o nasconde i file di sistema, ricaricando la cartella. */
	async setShowHidden(mostra: boolean): Promise<void> {
		this.showHidden = mostra;
		if (this.activeId !== null) await this.reload(this.activeId);
	}

	#get(id: number): Tab | undefined {
		return this.tabs.find((t) => t.id === id);
	}

	/**
	 * Unico punto in cui un tab cambia contenuto.
	 *
	 * Ogni richiesta riceve un numero progressivo. Al ritorno, se nel frattempo
	 * è già stata applicata una richiesta più recente, il risultato si scarta:
	 * senza questo controllo due click rapidi possono lasciare il tab nella
	 * cartella sbagliata, con un bug non riproducibile a comando.
	 *
	 * Ritorna true se il risultato è stato applicato.
	 */
	async #load(
		tab: Tab,
		path: string,
		opts: { pushHistory: boolean; mantieni?: boolean }
	): Promise<boolean> {
		const req = ++tab.reqSeq;
		tab.loading = true;

		// Entrando in un'altra cartella vale il suo ordinamento ricordato,
		// o quello predefinito se l'utente non ne ha mai scelto uno.
		const altrove = !stessoPath(path, tab.path);
		const sort =
			this.ordini && altrove ? (this.ordini.leggi(path) ?? { ...SORT_DEFAULT }) : tab.sort;

		try {
			const listing = await this.backend.listDir(path, sort, this.showHidden);

			if (req <= tab.lastApplied) return false;
			tab.lastApplied = req;

			tab.path = listing.path;
			tab.entries = listing.entries;
			tab.sort = sort;
			tab.error = null;
			tab.loading = false;

			if (opts.mantieni) {
				// Restano selezionate solo le voci che esistono ancora.
				const presenti = new Set(listing.entries.map((e) => e.path));
				tab.selection = tab.selection.filter((p) => presenti.has(p));
				if (tab.anchor && !presenti.has(tab.anchor)) tab.anchor = null;
				return true;
			}

			tab.selection = [];
			tab.anchor = null;
			// Cartella nuova, ricerca vecchia senza senso.
			tab.query = '';
			if (tab.ricercaOp !== null) void this.backend.cancelTransfer(tab.ricercaOp);
			tab.ricercaOp = null;
			tab.cercando = false;
			tab.risultati = null;

			if (opts.pushHistory) {
				tab.history = tab.history.slice(0, tab.historyIndex + 1);
				tab.history.push(listing.path);
				tab.historyIndex = tab.history.length - 1;
			}
			return true;
		} catch (e) {
			if (req <= tab.lastApplied) return false;
			tab.lastApplied = req;
			// Il path corrente non cambia: l'utente resta dove si trova.
			tab.error = e as FsError;
			tab.loading = false;
			return false;
		}
	}
}
