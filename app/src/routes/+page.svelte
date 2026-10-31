<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { untrack } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { getCurrentWebview } from '@tauri-apps/api/webview';
	import {
		tauriBackend,
		type Entry,
		type FsError,
		type TipoNuovo,
		type StatoLan,
		type Pari,
		type RichiestaInvio,
		type StatoAmici
	} from '$lib/ipc';
	import { TabsStore } from '$lib/stores/tabs.svelte';
	import TitleBar from '$lib/components/TitleBar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import BarraComandi from '$lib/components/BarraComandi.svelte';
	import BarraRecenti from '$lib/components/BarraRecenti.svelte';
	import RichiestaLan from '$lib/components/RichiestaLan.svelte';
	import NovitaFinestra from '$lib/components/Novita.svelte';
	import AmiciFinestra from '$lib/components/Amici.svelte';
	import { NOVITA, novitaDaMostrare, type Novita } from '$lib/novita';
	import FileList from '$lib/components/FileList.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import ConfermaCestino from '$lib/components/ConfermaCestino.svelte';
	import ConfermaConflitti from '$lib/components/ConfermaConflitti.svelte';
	import BarraProgresso from '$lib/components/BarraProgresso.svelte';
	import Rail from '$lib/components/Rail.svelte';
	import Icona from '$lib/components/Icona.svelte';
	import Treno from '$lib/components/Treno.svelte';
	import { decodifica as leggiSprite, misuraBinario } from '$lib/spritesheet';
	import Anteprima from '$lib/components/Anteprima.svelte';
	import { ClipboardStore } from '$lib/stores/clipboard.svelte';
	import { IconeStore } from '$lib/stores/icone.svelte';
	import { AggiornamentiStore, fonteTauri, INTERVALLO_CONTROLLO } from '$lib/stores/aggiornamenti.svelte';
	import { PreferitiStore } from '$lib/stores/preferiti.svelte';
	import { AccessoRapidoStore } from '$lib/stores/accessoRapido.svelte';
	import { ImpostazioniStore, type Colonne } from '$lib/stores/impostazioni.svelte';
	import { AnnullaStore } from '$lib/stores/annulla.svelte';
	import type { Politica, Progresso, SortKey } from '$lib/ipc';
	import MenuContestuale from '$lib/components/MenuContestuale.svelte';
	import StatoVuoto from '$lib/components/StatoVuoto.svelte';
	import FileGrid from '$lib/components/FileGrid.svelte';
	import Avvio from '$lib/components/Avvio.svelte';
	import { motoRidotto } from '$lib/moto';
	import {
		vociMenu,
		vociVista,
		vociOrdina,
		vociAspetto,
		vociNuovo,
		vociAccessoRapido,
		vociColonne,
		INIZIALE_PREDEFINITA,
		INIZIALE_ULTIMA,
		type AzioneMenu,
		type Posizione,
		type VoceMenu
	} from '$lib/menu';
	import { historyActionFor } from '$lib/mouse';
	import { filterEntries } from '$lib/fuzzy';
	import { impagina, type ModoGruppi } from '$lib/raggruppa';
	import { misuraCella, zoom, LATO_MIN, LATO_MAX, type Vista } from '$lib/vista';
	import { applicaTema, coloreAccento, scalaTesto, temaDa, type IdAccento, type TemaPersonale } from '$lib/temi';
	import EditorTemi from '$lib/components/EditorTemi.svelte';
	import { EVENTO_EDITOR, type MessaggioEditor } from '$lib/editor-finestra';
	import { ColoriStore, type IdColore } from '$lib/stores/colori.svelte';
	import { azioneTasto } from '$lib/scorciatoie';
	import {
		CESTINO,
		QUESTO_PC,
		RETE,
		RETE_LOCALE,
		AMICI,
		NUOVA_SCHEDA,
		impostaNomiAmici,
		cartellaDi,
		eReteLocale,
		eVirtuale,
		nomeDi,
		stessoPath,
		stessoVolume
	} from '$lib/posizioni';

	const impostazioni = new ImpostazioniStore();
	// Come Esplora, ogni cartella ricorda come l'utente l'ha ordinata.
	const store = new TabsStore(tauriBackend, {
		leggi: (cartella) => impostazioni.ordinamentoDi(cartella),
		scrivi: (cartella, spec) => impostazioni.ricordaOrdinamento(cartella, spec)
	});
	const preferiti = new PreferitiStore();
	const colori = new ColoriStore();
	const accessoRapido = new AccessoRapidoStore();

	/**
	 * Quale finestra è questa. «main» è quella aperta all'avvio; le altre
	 * nascono con Ctrl+N e ricevono la cartella da aprire da Rust.
	 */
	const finestra = (() => {
		try {
			return getCurrentWindow().label;
		} catch {
			return 'main';
		}
	})();

	/** Ascolta un evento solo se è rivolto a questa finestra. */
	function soloQui<T>(nome: string, f: (payload: T) => void) {
		return listen<T>(nome, (e) => f(e.payload), { target: { kind: 'WebviewWindow', label: finestra } });
	}

	async function nuovaFinestra(path: string | null) {
		try {
			await tauriBackend.newWindow(path);
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	/** Il tema scelto, fra quelli inclusi e quelli creati con l'editor. */
	let temaCorrente = $derived(temaDa(impostazioni.tema, impostazioni.temiPersonali));
	/** Il tema che l'editor sta mostrando dal vivo, prima di salvarlo. */
	let anteprimaTema = $state<TemaPersonale | null>(null);
	let corteo = $derived(anteprimaTema?.corteo ?? temaCorrente.corteo);
	/**
	 * Spazio in più sopra il binario per i personaggi ingranditi: la linea
	 * del treno è alta 40 px e sta in fondo alla testata; uno sprite più alto
	 * uscirebbe dalla finestra. Con i personaggi normali non cambia niente.
	 */
	let spazioCorteo = $derived(
		Math.max(0, ...(corteo ?? []).map((v) => {
			const foglio = leggiSprite(v);
			return foglio ? misuraBinario(foglio).altezza + 10 - 40 : 0;
		}))
	);
	/** Col testo più grande le righe si alzano, perché non si taglino. */
	let altezzaRiga = $derived(
		Math.round((impostazioni.compatta ? 26 : 32) * Math.max(1, scalaTesto(anteprimaTema ?? temaCorrente)))
	);
	/** L'editor dentro la pagina: solo se non si è potuta aprire la sua finestra. */
	let editorAperto = $state(false);

	/**
	 * L'editor dei temi in una finestra sua, che si sposta anche fuori
	 * dall'app. Se non si apre (anteprima nel browser) resta dentro la pagina.
	 */
	async function apriEditor() {
		try {
			await tauriBackend.apriEditorTemi();
		} catch {
			editorAperto = true;
		}
	}

	/** Cosa fa l'editor, dalla sua finestra o da dentro la pagina. */
	function daEditor(m: MessaggioEditor) {
		if (m.tipo === 'anteprima') {
			anteprimaTema = m.tema;
			return;
		}
		if (m.tipo === 'salva') {
			impostazioni.salvaTema(m.tema);
			impostazioni.imposta('tema', m.tema.id);
			avvisa(`Tema «${m.tema.nome}» salvato.`);
		} else if (m.tipo === 'elimina') {
			impostazioni.eliminaTema(m.id);
		}
		anteprimaTema = null;
		editorAperto = false;
	}
	let selettoreColore = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (anteprimaTema) {
			applicaTema(anteprimaTema, anteprimaTema.variabili['--plasma']);
			return;
		}
		applicaTema(temaCorrente, coloreAccento(temaCorrente, impostazioni.accento, impostazioni.coloreAccento));
	});

	/** Il colore che l'utente ha dato a una cartella, se gliene ha dato uno. */
	function coloreVoce(e: Entry): string | undefined {
		return e.kind === 'dir' ? colori.di(e.path) : undefined;
	}
	const annulla = new AnnullaStore(tauriBackend);
	const appunti = new ClipboardStore();
	const icone = new IconeStore(tauriBackend);
	const aggiornamenti = new AggiornamentiStore(fonteTauri);

	// Solo la finestra principale controlla: con più finestre aperte non
	// servono più download dello stesso aggiornamento. In sviluppo no:
	// non c'è una release da confrontare.
	$effect(() => {
		if (finestra !== 'main' || import.meta.env.DEV) return;
		const primo = setTimeout(() => void aggiornamenti.controlla(), 5000);
		const ciclo = setInterval(() => void aggiornamenti.controlla(), INTERVALLO_CONTROLLO);
		return () => {
			clearTimeout(primo);
			clearInterval(ciclo);
		};
	});

	async function installaAggiornamento() {
		try {
			await aggiornamenti.installa();
		} catch (e) {
			avvisa(e instanceof Error ? e.message : String(e));
		}
	}

	const NESSUNO = new Set<string>();

	// ── Posizione e contenuto ────────────────────────────────────────

	/** Che genere di posizione mostra il tab: decide menu e operazioni. */
	let posizione = $derived.by((): Posizione => {
		const p = store.activeTab?.path ?? '';
		if (p === CESTINO) return 'cestino';
		if (p === QUESTO_PC) return 'pc';
		if (p === RETE || /^\\\\[^\\]+\\?$/.test(p)) return 'rete';
		if (eReteLocale(p)) return 'lan';
		return 'normale';
	});

	/** Vero se il tab mostra i risultati di una ricerca nelle sottocartelle. */
	let inRicerca = $derived(store.activeTab?.risultati != null);

	/** Si può creare, incollare, rinominare: una cartella vera, non risultati. */
	let modificabile = $derived(posizione === 'normale' && !inRicerca);

	let ricercaAperta = $state(false);
	let ricercaRicorsiva = $state(false);
	let ricercaContenuto = $state(false);

	let risultati = $derived.by(() => {
		const tab = store.activeTab;
		if (!tab) return [];
		// I risultati ricorsivi sono già filtrati da Rust: niente secondo
		// filtro fuzzy, che scarterebbe le corrispondenze nel contenuto.
		if (tab.risultati) return tab.risultati.map((item) => ({ item, positions: [] as number[] }));
		return filterEntries(tab.entries, tab.query);
	});
	let filtrate = $derived(risultati.map((r) => r.item));

	/**
	 * Preferiti in cima e gruppi scelti nel menu Visualizza. Con un filtro
	 * attivo la divisione si sospende: lì conta il punteggio, e il match
	 * migliore deve restare primo anche se non è un preferito.
	 */
	let impaginato = $derived.by(() => {
		const tab = store.activeTab;
		if (!tab || tab.query !== '' || tab.risultati) return { voci: filtrate, zone: [] };
		const prefs = posizione === 'normale' ? preferiti.di(tab.path) : NESSUNO;
		// I recenti valgono dove le voci hanno una data vera: non in Questo
		// PC o nella Rete, dove la data non dice niente.
		const recentiDal =
			impostazioni.recenti && (posizione === 'normale' || posizione === 'cestino')
				? Date.now() - impostazioni.giorniRecenti * 24 * 60 * 60 * 1000
				: null;
		return impagina(filtrate, prefs, impostazioni.raggruppa, Date.now(), recentiDal);
	});
	let vociVisibili = $derived(impaginato.voci);
	let evidenziazioni = $derived(new Map(risultati.map((r) => [r.item.path, r.positions])));

	let selezione = $derived(store.activeTab?.selection ?? []);
	let insiemeSelezione = $derived(new Set(selezione));

	/**
	 * Posizione della voce che fa da cursore: l'ultima toccata, non la
	 * prima selezionata. È da lì che ripartono le frecce.
	 */
	let indice = $derived(
		selezione.length === 0
			? -1
			: vociVisibili.findIndex((e) => e.path === selezione[selezione.length - 1])
	);

	/** Accanto al nome: la cartella dei risultati di ricerca, l'origine nel Cestino. */
	function cartellaVoce(e: Entry): string | undefined {
		if (posizione === 'cestino') return e.origine;
		if (inRicerca) return cartellaDi(e.path);
		return undefined;
	}

	// Con la ricerca aperta, ogni battuta rimescola i risultati: la selezione
	// segue la prima voce, così Invio apre sempre il match migliore.
	$effect(() => {
		if (!ricercaAperta || store.activeId === null) return;
		vociVisibili;
		if (indice === -1 && vociVisibili.length > 0) {
			store.seleziona(store.activeId, vociVisibili[0].path, vociVisibili);
		}
	});

	function spostaSelezione(delta: number, estendi = false) {
		if (store.activeId === null || vociVisibili.length === 0) return;
		const corrente = indice === -1 ? 0 : indice;
		const prossimo = Math.min(vociVisibili.length - 1, Math.max(0, corrente + delta));
		store.seleziona(store.activeId, vociVisibili[prossimo].path, vociVisibili, {
			shift: estendi
		});
	}

	// ── Ricerca ──────────────────────────────────────────────────────

	function apriRicerca() {
		if (store.activeId !== null) ricercaAperta = true;
	}

	function chiudiRicerca() {
		ricercaAperta = false;
		if (store.activeId === null) return;
		store.clearQuery(store.activeId);
		void store.fermaRicerca(store.activeId);
	}

	/**
	 * Nelle sottocartelle la ricerca parte da sola dopo una breve pausa
	 * nella digitazione: lanciarla a ogni tasto rifarebbe la visita del
	 * disco per ogni lettera.
	 */
	$effect(() => {
		const tab = store.activeTab;
		if (!ricercaAperta || !ricercaRicorsiva || !tab) return;
		const id = tab.id;
		const testo = tab.query.trim();
		const contenuto = ricercaContenuto;
		const nascosti = store.showHidden;

		if (testo === '') {
			void store.fermaRicerca(id);
			return;
		}
		const attesa = setTimeout(() => {
			void store.cercaRicorsivo(id, { testo, contenuto, nascosti }).catch((e) => {
				erroreOp = descriviErrore(e);
			});
		}, 350);
		return () => clearTimeout(attesa);
	});

	function alternaRicorsiva() {
		ricercaRicorsiva = !ricercaRicorsiva;
		if (!ricercaRicorsiva && store.activeId !== null) void store.fermaRicerca(store.activeId);
	}

	// ── Stato delle operazioni ───────────────────────────────────────

	let rinominando = $state<string | null>(null);
	let daCestinare = $state<Entry[]>([]);
	/** Eliminazione senza ritorno: dal disco, dal Cestino o svuotandolo. */
	let daEliminare = $state<{ voci: Entry[]; tipo: 'disco' | 'cestino' | 'svuota' } | null>(null);
	let erroreOp = $state<string | null>(null);
	/** Messaggio informativo che sparisce da solo. */
	let avviso = $state<string | null>(null);
	let timerAvviso: ReturnType<typeof setTimeout> | undefined;

	function avvisa(testo: string) {
		avviso = testo;
		clearTimeout(timerAvviso);
		timerAvviso = setTimeout(() => (avviso = null), 4000);
	}

	/** Le voci selezionate, nell'ordine in cui compaiono nella lista. */
	function selezionate(): Entry[] {
		return vociVisibili.filter((e) => insiemeSelezione.has(e.path));
	}

	/** La voce singola su cui agiscono rinomina, apertura e anteprima. */
	function selezionata(): Entry | null {
		const scelte = selezionate();
		const cursore = selezione[selezione.length - 1];
		return scelte.find((e) => e.path === cursore) ?? scelte[scelte.length - 1] ?? null;
	}

	let voceAnteprima = $derived.by(() => {
		insiemeSelezione;
		vociVisibili;
		return selezionata();
	});

	/** Gli errori del backend arrivano come FsError, non come Error. */
	function descriviErrore(e: unknown): string {
		const err = e as FsError;
		if (err?.kind === 'io') return err.message;
		return messaggioErrore(err ?? null) || 'Operazione non riuscita.';
	}

	/**
	 * Lo spazio sui dischi va riletto dopo ogni operazione che lo cambia.
	 * Lo cambiano anche gli altri programmi (download, aggiornamenti): per
	 * quelli si rilegge quando la finestra torna in primo piano e una volta
	 * al minuto mentre è visibile.
	 */
	let aggiornamentoDischi = $state(0);
	$effect(() => {
		const giro = setInterval(() => {
			if (document.visibilityState === 'visible') aggiornamentoDischi++;
		}, 60_000);
		return () => clearInterval(giro);
	});

	async function ricarica() {
		if (store.activeId !== null) await store.aggiorna(store.activeId);
		aggiornamentoDischi++;
	}

	// ── Rinomina, cartelle, cestino ──────────────────────────────────

	async function confermaRinomina(voce: Entry, nuovoNome: string) {
		rinominando = null;
		erroreOp = null;
		try {
			const nuovo = await tauriBackend.renameEntry(voce.path, nuovoNome);
			if (store.activeTab) preferiti.rinomina(store.activeTab.path, voce.name, nuovoNome);
			colori.sposta(voce.path, nuovo);
			accessoRapido.sposta(voce.path, nuovo);
			annulla.registra({ tipo: 'rinomina', da: voce.path, a: nuovo });
			if (store.activeId !== null) {
				await store.reload(store.activeId);
				if (store.activeTab) store.activeTab.selection = [nuovo];
			}
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	/**
	 * Crea "Nuova cartella", numerando se il nome è occupato. La numerazione
	 * sta qui perché riguarda il nome, non il path: la composizione del path
	 * resta in Rust.
	 */
	async function nuovaCartella() {
		if (!store.activeTab || store.activeId === null || !modificabile) return;
		erroreOp = null;

		const parent = store.activeTab.path;

		for (let n = 1; n <= 100; n++) {
			const nome = n === 1 ? 'Nuova cartella' : `Nuova cartella (${n})`;
			try {
				const creata = await tauriBackend.createFolder(parent, nome);
				annulla.registra({ tipo: 'crea', paths: [creata], descrizione: `creazione di «${nome}»` });
				await store.reload(store.activeId);
				if (store.activeTab) store.activeTab.selection = [creata];
				rinominando = creata;
				return;
			} catch (e) {
				const err = e as FsError;
				// Nome occupato: prova il successivo. Qualsiasi altro errore
				// (permessi, disco pieno) va mostrato subito.
				if (err?.kind === 'io' && err.message.includes('Esiste già')) continue;
				erroreOp = descriviErrore(e);
				return;
			}
		}

		erroreOp = 'Troppe cartelle con lo stesso nome.';
	}

	/** I tipi del menu «Nuovo»: si chiedono a Windows una volta sola. */
	let tipiNuovo = $state<TipoNuovo[]>([]);
	$effect(() => {
		tauriBackend
			.newFileTypes()
			.then((t) => (tipiNuovo = t))
			.catch(() => {});
	});

	/**
	 * Crea un file nuovo come fa Esplora: col nome del tipo, numerato se
	 * occupato, e subito pronto da rinominare.
	 */
	async function nuovoFile(ext: string) {
		if (!store.activeTab || store.activeId === null || !modificabile) return;
		erroreOp = null;
		try {
			const creato = await tauriBackend.createNewFile(store.activeTab.path, ext);
			annulla.registra({ tipo: 'crea', paths: [creato], descrizione: `creazione di «${nomeDi(creato)}»` });
			await store.reload(store.activeId);
			store.selezionaPercorsi(store.activeId, [creato]);
			rinominando = creato;
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	function chiediCestino() {
		const scelte = selezionate();
		if (scelte.length === 0) return;
		// Nel Cestino «elimina» non può che essere definitivo.
		if (posizione === 'cestino') daEliminare = { voci: scelte, tipo: 'cestino' };
		else if (posizione === 'normale') daCestinare = scelte;
	}

	function chiediEliminaDefinitivo() {
		const scelte = selezionate();
		if (scelte.length === 0) return;
		if (posizione === 'cestino') daEliminare = { voci: scelte, tipo: 'cestino' };
		else if (posizione === 'normale') daEliminare = { voci: scelte, tipo: 'disco' };
	}

	async function cestina(voci = daCestinare) {
		daCestinare = [];
		erroreOp = null;
		try {
			await tauriBackend.moveToTrash(voci.map((v) => v.path));
			annulla.registra({ tipo: 'cestino', originali: voci.map((v) => v.path) });
			await ricarica();
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	async function eliminaDefinitivo() {
		const richiesta = daEliminare;
		daEliminare = null;
		if (!richiesta) return;
		erroreOp = null;
		try {
			const paths = richiesta.voci.map((v) => v.path);
			if (richiesta.tipo === 'disco') await tauriBackend.deletePermanently(paths);
			else if (richiesta.tipo === 'cestino') await tauriBackend.trashPurge(paths);
			else await tauriBackend.trashEmpty();
			await ricarica();
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	async function ripristina() {
		const scelte = selezionate();
		if (scelte.length === 0) return;
		try {
			await tauriBackend.trashRestore(scelte.map((e) => e.path));
			avvisa(scelte.length === 1 ? `«${scelte[0].name}» ripristinato.` : `${scelte.length} elementi ripristinati.`);
			await ricarica();
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	async function annullaUltima() {
		erroreOp = null;
		try {
			const fatta = await annulla.annulla();
			if (fatta) {
				avvisa(`Annullata: ${fatta}.`);
				await ricarica();
			}
		} catch (e) {
			erroreOp = descriviErrore(e);
			await ricarica();
		}
	}

	// ── Appunti e trasferimenti ──────────────────────────────────────

	let progresso = $state<Progresso | null>(null);
	let modoInCorso = $state<'copy' | 'move' | 'comprimi' | 'estrai' | 'invio' | 'ricezione'>('copy');
	let opInCorso = $state<number | null>(null);
	/** Trasferimento in attesa che l'utente risolva i conflitti di nome. */
	let inSospeso = $state<{ sources: string[]; dest: string; mode: 'copy' | 'move' } | null>(null);
	let conflitti = $state<string[]>([]);

	let prossimoOpId = 1;

	/**
	 * Vero quando il sistema sta effettivamente muovendo dati: un
	 * trasferimento in corso o una cartella in lettura. È l'unica cosa che
	 * accende i binari — senza questo aggancio sarebbero decorazione.
	 */
	let sottoCarico = $derived(
		opInCorso !== null || (store.activeTab?.loading ?? false) || (store.activeTab?.cercando ?? false)
	);

	/**
	 * Cambia colonna d'ordinamento, o inverte il verso se è già quella.
	 *
	 * L'ordinamento avviene in Rust: il tab si ricarica. Nome e tipo
	 * partono crescenti, dimensione e data decrescenti — il file più
	 * grande e quello più recente sono ciò che si cerca quasi sempre.
	 */
	function ordinaPer(chiave: SortKey) {
		const tab = store.activeTab;
		if (!tab || store.activeId === null) return;

		const ascendente =
			tab.sort.key === chiave ? !tab.sort.ascending : chiave === 'name' || chiave === 'kind';

		store.setSort(store.activeId, { key: chiave, ascending: ascendente });
	}

	/**
	 * Copia e taglia scrivono negli appunti di Windows, così si incolla
	 * anche in Esplora o in un'altra app. La copia interna resta per
	 * mostrare sbiadite le voci tagliate.
	 */
	async function mettiNegliAppunti(taglia: boolean) {
		if (posizione === 'cestino') return;
		const scelte = selezionate();
		if (scelte.length === 0) return;
		const paths = scelte.map((e) => e.path);
		// La cartella di un altro PC è in sola lettura e Windows non saprebbe
		// cosa farsene di quei path: si copia solo negli appunti interni.
		if (posizione === 'lan') {
			appunti.copy(paths);
			return;
		}
		if (taglia) appunti.cut(paths);
		else appunti.copy(paths);
		try {
			await tauriBackend.clipboardWrite(paths, taglia);
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	/** Cosa c'è da incollare: gli appunti di Windows vincono su quelli interni. */
	async function daIncollare(): Promise<{ paths: string[]; mode: 'copy' | 'move' } | null> {
		// Voci copiate da un altro PC vivono solo negli appunti interni.
		if (!appunti.vuoto && eReteLocale(appunti.paths[0])) {
			return { paths: [...appunti.paths], mode: 'copy' };
		}
		try {
			const sistema = await tauriBackend.clipboardRead();
			if (sistema && sistema.paths.length > 0) {
				return { paths: sistema.paths, mode: sistema.taglia ? 'move' : 'copy' };
			}
		} catch {
			// Appunti illeggibili: si ripiega su quelli interni.
		}
		if (appunti.vuoto) return null;
		return { paths: [...appunti.paths], mode: appunti.mode === 'cut' ? 'move' : 'copy' };
	}

	async function incolla() {
		if (!store.activeTab || opInCorso !== null || !modificabile) return;
		erroreOp = null;
		const contenuto = await daIncollare();
		if (!contenuto) return;
		await trasferisci(contenuto.paths, store.activeTab.path, contenuto.mode);
	}

	/**
	 * Copia o sposta in due tempi: prima si cercano i conflitti, e solo se
	 * ce ne sono si interrompe per chiedere. Senza collisioni non compare
	 * nessuna finestra e l'operazione parte subito.
	 */
	async function trasferisci(sources: string[], dest: string, mode: 'copy' | 'move') {
		// Da un altro PC si copia sempre, e i nomi occupati si numerano da soli.
		if (sources.length > 0 && eReteLocale(sources[0])) {
			await scaricaDaRete(sources, dest);
			return;
		}
		try {
			const trovati = await tauriBackend.scanConflicts(sources, dest);
			if (trovati.length > 0) {
				inSospeso = { sources, dest, mode };
				conflitti = trovati;
				return;
			}
			await esegui('rinomina', { sources, dest, mode });
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	async function esegui(
		policy: Politica,
		op: { sources: string[]; dest: string; mode: 'copy' | 'move' } | null = inSospeso
	) {
		conflitti = [];
		inSospeso = null;
		if (!op || store.activeId === null) return;

		const { sources, dest, mode } = op;
		const opId = prossimoOpId++;

		modoInCorso = mode;
		opInCorso = opId;
		progresso = { transferred: 0, total: 0 };

		try {
			const esito = await tauriBackend.transfer({
				opId,
				sources,
				dest,
				mode,
				policy,
				onProgress: (p) => (progresso = p)
			});

			if (mode === 'move') {
				annulla.registra({ tipo: 'sposta', coppie: esito.coppie });
				for (const [da, a] of esito.coppie) {
					colori.sposta(da, a);
					accessoRapido.sposta(da, a);
				}
			}
			else
				annulla.registra({
					tipo: 'crea',
					paths: esito.coppie.map((c) => c[1]),
					descrizione: `copia di ${esito.coppie.length === 1 ? '1 elemento' : `${esito.coppie.length} elementi`}`
				});

			// Tagliare consuma gli appunti, come in Esplora; copiare no, così
			// puoi incollare lo stesso elemento in più cartelle di fila.
			const daiAppunti =
				appunti.paths.length > 0 && sources.every((s) => appunti.paths.includes(s));
			if (mode === 'move' && !esito.annullato && (daiAppunti || appunti.mode === 'cut')) {
				appunti.clear();
				void tauriBackend.clipboardClear().catch(() => {});
			}

			if (esito.annullato) erroreOp = 'Operazione annullata. I file già trasferiti restano.';
			else if (esito.saltati > 0)
				erroreOp = `${esito.saltati} ${esito.saltati === 1 ? 'elemento saltato' : 'elementi saltati'}.`;

			await ricarica();
		} catch (e) {
			erroreOp = descriviErrore(e);
		} finally {
			opInCorso = null;
			progresso = null;
		}
	}

	/** Copia dalla cartella condivisa di un altro PC, con la barra d'avanzamento. */
	async function scaricaDaRete(sources: string[], dest: string) {
		if (opInCorso !== null) return;
		const opId = prossimoOpId++;
		modoInCorso = 'ricezione';
		opInCorso = opId;
		progresso = { transferred: 0, total: 0 };
		erroreOp = null;
		try {
			const esito = await tauriBackend.lanScarica({
				opId,
				sources,
				dest,
				onProgress: (p) => (progresso = p)
			});
			annulla.registra({
				tipo: 'crea',
				paths: esito.coppie.map((c) => c[1]),
				descrizione: `copia di ${esito.coppie.length === 1 ? '1 elemento' : `${esito.coppie.length} elementi`} dalla rete locale`
			});
			await ricarica();
			return esito;
		} catch (e) {
			erroreOp = descriviErrore(e);
		} finally {
			opInCorso = null;
			progresso = null;
		}
	}

	/** Invia la selezione a un altro PC: parte solo quando l'altro accetta. */
	async function inviaA(peer: string) {
		const scelte = selezionate();
		if (scelte.length === 0 || opInCorso !== null) return;
		const nome = destinatari.find((p) => p.id === peer)?.nome ?? peer;
		const opId = prossimoOpId++;
		modoInCorso = 'invio';
		opInCorso = opId;
		progresso = { transferred: 0, total: 0 };
		erroreOp = null;
		avvisa(`In attesa che ${nome} accetti…`);
		try {
			await tauriBackend.lanInvia({
				opId,
				peer,
				paths: scelte.map((e) => e.path),
				onProgress: (p) => (progresso = p)
			});
			avvisa(
				`${scelte.length === 1 ? `«${scelte[0].name}» inviato` : `${scelte.length} elementi inviati`} a ${nome}.`
			);
		} catch (e) {
			erroreOp = descriviErrore(e);
		} finally {
			opInCorso = null;
			progresso = null;
		}
	}

	// ── Rete locale ──────────────────────────────────────────────────

	let statoLan = $state<StatoLan | null>(null);
	let pariLan = $state<Pari[]>([]);
	/** Richieste d'invio in attesa di risposta, la più vecchia per prima. */
	let richiesteLan = $state<RichiestaInvio[]>([]);

	$effect(() => {
		tauriBackend.lanStato().then((s) => (statoLan = s)).catch(() => {});
		tauriBackend.lanPari().then((p) => (pariLan = p)).catch(() => {});
	});

	$effect(() => {
		const smonta: Array<() => void> = [];
		let attivo = true;
		// La lista dei PC vale per tutte le finestre; consenso e ricezione
		// arrivano solo all'ultima usata, a cui Rust li indirizza.
		const ascolta = <T,>(nome: string, f: (payload: T) => void) =>
			(nome === 'lan-pari' || nome === 'amici' ? listen<T>(nome, (e) => f(e.payload)) : soloQui<T>(nome, f))
				.then((u) => (attivo ? smonta.push(u) : u()))
				.catch(() => {});

		void ascolta<Pari[]>('lan-pari', (p) => (pariLan = p));
		void ascolta<MessaggioEditor>(EVENTO_EDITOR, daEditor);
		void ascolta<StatoAmici>('amici', (s) => {
			statoAmici = s;
			// La posizione «Amici» elenca gli amici confermati: si aggiorna con loro.
			void store.aggiornaCartella(AMICI);
		});
		void ascolta<{ id: string; nome: string }>('amici-richiesta', (r) =>
			avvisa(`${r.nome} ti ha chiesto l’amicizia: rispondi da Amici nella barra laterale.`)
		);
		void ascolta<RichiestaInvio>('lan-richiesta', (r) => (richiesteLan = [...richiesteLan, r]));
		void ascolta<{ id: number; fatti: number; totale: number }>('lan-ricezione', (r) => {
			if (opInCorso !== null && modoInCorso !== 'ricezione') return;
			modoInCorso = 'ricezione';
			ricezioneInCorso = r.id;
			progresso = { transferred: r.fatti, total: r.totale };
		});
		void ascolta<{
			id: number;
			da: string;
			cartella: string;
			quanti: number;
			errore: string | null;
			annullato?: boolean;
			bloccati?: string | null;
		}>(
			'lan-ricevuto',
			(r) => {
				if (ricezioneInCorso === r.id) ricezioneInCorso = null;
				if (opInCorso === null) progresso = null;
				if (r.annullato) avvisa(`Ricezione da ${r.da} annullata.`);
				else if (r.errore) erroreOp = `Ricezione da ${r.da} interrotta: ${r.errore}`;
				else if (r.bloccati) erroreOp = `Ricezione da ${r.da}: ${r.bloccati}`;
				else avvisa(`Ricevuti ${r.quanti === 1 ? '1 elemento' : `${r.quanti} elementi`} da ${r.da} in ${r.cartella}.`);
				void store.aggiornaCartella(r.cartella);
			}
		);
		return () => {
			attivo = false;
			smonta.forEach((u) => u());
		};
	});

	// ── Amici ────────────────────────────────────────────────────────

	let statoAmici = $state<StatoAmici | null>(null);
	let amiciAperti = $state(false);

	$effect(() => {
		tauriBackend.amiciStato().then((s) => (statoAmici = s)).catch(() => {});
	});

	// Le briciole e le schede mostrano il nome dell'amico, non il suo codice.
	$effect(() => {
		impostaNomiAmici(Object.fromEntries((statoAmici?.amici ?? []).map((a) => [a.id, a.nome])));
	});

	/**
	 * A chi si può inviare: i PC della rete locale e gli amici confermati.
	 * Un amico ha `@` davanti al codice, per distinguerlo da un PC di casa.
	 */
	let destinatari = $derived([
		...pariLan,
		...(statoAmici?.amici ?? [])
			.filter((a) => a.stato === 'confermato')
			.map((a) => ({ id: '@' + a.id, nome: a.nome }))
	]);

	async function impostaLan(modifica: Partial<StatoLan>) {
		if (!statoLan) return;
		try {
			const { visibile, condivisa, ricevuti, indirizzi } = { ...statoLan, ...modifica };
			statoLan = await tauriBackend.lanImposta({ visibile, condivisa, ricevuti, indirizzi: indirizzi ?? [] });
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	/**
	 * Condividere rende anche visibili: una cartella condivisa da un PC
	 * invisibile non la vedrebbe nessuno, e l'utente penserebbe a un guasto.
	 */
	async function condividi(cartella: string | null) {
		await impostaLan(cartella ? { condivisa: cartella, visibile: true } : { condivisa: null });
		if (cartella) avvisa(`«${nomeDi(cartella)}» è condivisa in rete locale, in sola lettura.`);
	}

	function rispondiLan(accetta: boolean, dove: string | null) {
		const r = richiesteLan[0];
		if (!r) return;
		richiesteLan = richiesteLan.slice(1);
		void tauriBackend.lanRispondi(r.id, accetta, dove);
	}

	/**
	 * La ricezione da un altro PC che si sta mostrando nella barra. Non è
	 * un'operazione partita da qui: si ferma col suo id, e chi invia lo
	 * scopre quando la connessione si chiude.
	 */
	let ricezioneInCorso = $state<number | null>(null);

	async function annullaTrasferimento() {
		if (opInCorso !== null) await tauriBackend.cancelTransfer(opInCorso);
		else if (ricezioneInCorso !== null) await tauriBackend.lanAnnullaRicezione(ricezioneInCorso);
	}

	/** Comprime o estrae con la stessa barra d'avanzamento dei trasferimenti. */
	async function archivio(tipo: 'comprimi' | 'estrai') {
		const tab = store.activeTab;
		const scelte = selezionate();
		if (!tab || scelte.length === 0 || opInCorso !== null) return;
		const opId = prossimoOpId++;
		modoInCorso = tipo;
		opInCorso = opId;
		progresso = { transferred: 0, total: 0 };
		erroreOp = null;
		try {
			const creato =
				tipo === 'comprimi'
					? await tauriBackend.compress({
							opId,
							sources: scelte.map((e) => e.path),
							dest: tab.path,
							onProgress: (p) => (progresso = p)
						})
					: await tauriBackend.extract({
							opId,
							archive: scelte[0].path,
							onProgress: (p) => (progresso = p)
						});
			annulla.registra({
				tipo: 'crea',
				paths: [creato],
				descrizione: tipo === 'comprimi' ? `compressione in «${nomeDi(creato)}»` : `estrazione in «${nomeDi(creato)}»`
			});
			if (store.activeId !== null) {
				await store.reload(store.activeId);
				store.selezionaPercorsi(store.activeId, [creato]);
			}
			aggiornamentoDischi++;
		} catch (e) {
			erroreOp = descriviErrore(e);
		} finally {
			opInCorso = null;
			progresso = null;
		}
	}

	// ── Trascinamento ────────────────────────────────────────────────

	/** Cartella sotto il puntatore durante un trascinamento. */
	let bersaglio = $state<string | null>(null);

	/**
	 * La voce trascinata entra nella selezione se non c'era: si trascina ciò
	 * che si vede evidenziato. Da qui il giro lo prende Windows, che sa
	 * consegnare i file a Esplora, al desktop o a qualsiasi altra app.
	 */
	async function trascina(voce: Entry) {
		if (posizione === 'cestino' || posizione === 'rete' || posizione === 'pc') return;
		// L'elenco dei PC in rete locale: trascinarne uno vorrebbe dire
		// scaricare tutta la sua cartella condivisa.
		if (posizione === 'lan' && store.activeTab?.path === RETE_LOCALE) return;
		if (!insiemeSelezione.has(voce.path)) seleziona(voce);
		let paths = insiemeSelezione.has(voce.path) ? selezionate().map((e) => e.path) : [voce.path];
		try {
			// I file della cartella condivisa da un altro PC non esistono su
			// questo disco: Windows li accetta solo dopo averli scaricati.
			if (posizione === 'lan') {
				avvisa('Preparo i file da trascinare…');
				paths = await tauriBackend.lanPreparaTrascina(paths);
			}
			await tauriBackend.startDrag(paths);
		} catch (e) {
			erroreOp = descriviErrore(e);
		} finally {
			bersaglio = null;
		}
	}

	/**
	 * Cartella di destinazione per un punto della finestra, in pixel CSS.
	 * Lo spazio libero fra le schede vale `NUOVA_SCHEDA`.
	 */
	function cartellaSotto(x: number, y: number): string | null {
		const sotto = document.elementFromPoint(x, y);
		const el = sotto?.closest<HTMLElement>('[data-cartella]');
		if (el) return el.dataset.cartella ?? null;
		return sotto?.closest('[data-nuova-scheda]') ? NUOVA_SCHEDA : null;
	}

	/** Ogni elemento rilasciato fra le schede si apre in una scheda sua: un file, nella sua cartella. */
	async function apriInSchede(paths: string[]) {
		for (const p of paths) {
			try {
				await apriDestinazione(await tauriBackend.resolvePath(p));
			} catch (e) {
				erroreOp = descriviErrore(e);
			}
		}
	}

	/**
	 * File rilasciati sulla finestra: da Esplora, dal desktop o da questa
	 * stessa app. Come in Esplora, sullo stesso disco si sposta e fra dischi
	 * diversi si copia; Ctrl forza la copia, Maiusc lo spostamento.
	 */
	async function rilascia(paths: string[], x: number, y: number) {
		bersaglio = null;
		const sopra = cartellaSotto(x, y);
		if (sopra === NUOVA_SCHEDA) return apriInSchede(paths);
		const dest = sopra ?? (modificabile ? (store.activeTab?.path ?? null) : null);
		if (!dest || paths.length === 0) return;

		if (dest === CESTINO) {
			const voci = paths.map((p) => ({ name: nomeDi(p), path: p }) as Entry);
			await cestina(voci);
			return;
		}
		// Una cartella dentro sé stessa, o elementi rilasciati dove già sono.
		if (paths.some((p) => stessoPath(p, dest))) return;

		const tasti = await tauriBackend.keyModifiers().catch(() => ({ ctrl: false, shift: false, alt: false }));
		const mode = tasti.ctrl ? 'copy' : tasti.shift ? 'move' : stessoVolume(paths[0], dest) ? 'move' : 'copy';
		const giaQui = await Promise.all(
			paths.map((p) => tauriBackend.navigate(p, 'up').then((g) => stessoPath(g, dest)).catch(() => false))
		);
		if (mode === 'move' && giaQui.every(Boolean)) return;

		await trasferisci(paths, dest, mode);
	}

	$effect(() => {
		let smonta: (() => void) | undefined;
		let attivo = true;
		try {
			getCurrentWebview()
				.onDragDropEvent((evento) => {
					const p = evento.payload;
					const scala = window.devicePixelRatio || 1;
					if (p.type === 'over' || p.type === 'enter') {
						bersaglio = cartellaSotto(p.position.x / scala, p.position.y / scala);
					} else if (p.type === 'drop') {
						void rilascia(p.paths, p.position.x / scala, p.position.y / scala);
					} else {
						bersaglio = null;
					}
				})
				.then((f) => (attivo ? (smonta = f) : f()))
				.catch(() => {});
		} catch {
			// Fuori da Tauri (anteprima nel browser) non c'è trascinamento di file.
		}
		return () => {
			attivo = false;
			smonta?.();
		};
	});

	// ── Aggiornamento automatico ─────────────────────────────────────

	// Rust osserva le cartelle aperte nei tab; quando una cambia, lo dice.
	//
	// Una richiesta alla volta, e dopo quella in corso solo l'ultima: aprendo
	// cartelle in fretta, due richieste in volo insieme potevano arrivare
	// in ordine inverso e lasciare osservata la cartella vecchia.
	let osservaInVolo = false;
	let osservaProssima: string[] | null = null;

	async function osserva(cartelle: string[]) {
		osservaProssima = cartelle;
		if (osservaInVolo) return;
		osservaInVolo = true;
		try {
			while (osservaProssima) {
				const ora = osservaProssima;
				osservaProssima = null;
				await tauriBackend.watchDirs(ora).catch(() => {});
			}
		} finally {
			osservaInVolo = false;
		}
	}

	$effect(() => {
		void osserva(store.tabs.map((t) => t.path));
	});

	$effect(() => {
		let smonta: (() => void) | undefined;
		let attivo = true;
		listen<string>('cartella-cambiata', (e) => {
			void store.aggiornaCartella(e.payload);
		})
			.then((f) => (attivo ? (smonta = f) : f()))
			.catch(() => {});
		return () => {
			attivo = false;
			smonta?.();
		};
	});

	// ── Tastiera ─────────────────────────────────────────────────────

	let indirizzoInModifica = $state(false);

	function tastiera(e: KeyboardEvent) {
		if (store.activeId === null) return;

		// Con una finestra modale aperta o un campo in modifica, le
		// scorciatoie della lista non devono sparare.
		if (daCestinare.length > 0 || daEliminare || rinominando !== null || conflitti.length > 0) return;

		// Dentro un campo di testo i tasti servono a scrivere. Dal campo di
		// ricerca passano solo quelli che muovono la selezione o la chiudono.
		const campo = e.target as HTMLElement | null;
		if (campo && (campo.tagName === 'INPUT' || campo.tagName === 'TEXTAREA')) {
			const ricerca = campo.getAttribute('aria-label') === 'Filtra i file in questa cartella';
			const ammessi = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'F3'];
			if (!ricerca || !(ammessi.includes(e.key) || (e.ctrlKey && e.key.toLowerCase() === 'f'))) return;
		}

		const azione = azioneTasto(e);
		if (azione !== null) {
			e.preventDefault();
			void eseguiTasto(azione);
			return;
		}

		if (e.key === 'Escape' && ricercaAperta) {
			e.preventDefault();
			chiudiRicerca();
			return;
		}

		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			// In griglia su e giù saltano una riga intera, non una cella.
			const passo = impostazioni.vista === 'dettagli' ? 1 : colonne;
			// Con Maiusc la freccia estende invece di spostare, come in
			// qualsiasi elenco di sistema.
			spostaSelezione(e.key === 'ArrowDown' ? passo : -passo, e.shiftKey);
			return;
		}

		if (impostazioni.vista !== 'dettagli' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
			e.preventDefault();
			spostaSelezione(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey);
			return;
		}

		if (e.key === 'Enter' && indice !== -1) {
			e.preventDefault();
			apri(vociVisibili[indice]);
		}
	}

	async function eseguiTasto(azione: NonNullable<ReturnType<typeof azioneTasto>>) {
		const id = store.activeId;
		if (id === null) return;

		if (typeof azione === 'object') {
			if ('scheda' in azione) {
				store.attivaIndice(azione.scheda);
				return;
			}
			// Lo stesso ordine di Esplora: quattro taglie di icone, poi
			// elenco, dettagli, riquadri e contenuto.
			const viste: Array<[Vista, number?]> = [
				['icone', 256],
				['icone', 128],
				['icone', 64],
				['icone', 24],
				['elenco'],
				['dettagli'],
				['riquadri'],
				['contenuto']
			];
			const [vista, lato] = viste[azione.vista] ?? viste[5];
			impostazioni.impostaVista(vista, lato);
			return;
		}

		switch (azione) {
			case 'copia':
				return mettiNegliAppunti(false);
			case 'taglia':
				return mettiNegliAppunti(true);
			case 'incolla':
				return incolla();
			case 'rinomina': {
				const voce = selezionata();
				if (voce && modificabile) rinominando = voce.path;
				return;
			}
			case 'nuovaCartella':
				return nuovaCartella();
			case 'cestina':
				return chiediCestino();
			case 'eliminaDefinitivo':
				return chiediEliminaDefinitivo();
			case 'cerca':
				return apriRicerca();
			case 'selezionaTutto':
				return store.selezionaTutto(id, vociVisibili);
			case 'preferito':
				return alternaPreferiti();
			case 'annulla':
				return annullaUltima();
			case 'ricarica':
				return ricarica();
			case 'indirizzo':
				indirizzoInModifica = true;
				return;
			case 'nuovaScheda':
				await store.openTab(store.activeTab?.path ?? 'C:\\');
				return;
			case 'nuovaFinestra':
				return nuovaFinestra(store.activeTab?.path ?? null);
			case 'chiudiScheda':
				return store.closeTab(id);
			case 'schedaSuccessiva':
				return store.attivaVicino(1);
			case 'schedaPrecedente':
				return store.attivaVicino(-1);
			case 'indietro':
				return store.goBack(id);
			case 'avanti':
				return store.goForward(id);
			case 'su':
				return store.goUp(id);
			case 'proprieta':
				return proprieta();
			case 'anteprima':
				return impostazioni.imposta('anteprima', !impostazioni.anteprima);
		}
	}

	/**
	 * All'avvio si apre la cartella che Windows ha passato all'app (doppio
	 * clic su una cartella quando Space Train è il predefinito), altrimenti
	 * il disco C:. Finché non si sa quale, nessun tab: aprirne uno su C: e
	 * poi cambiarlo farebbe lampeggiare la lista sbagliata.
	 */
	let avviato = $state(false);

	async function apriDestinazione(dest: { cartella: string; seleziona: string | null }) {
		const id = await store.openTab(dest.cartella);
		if (dest.seleziona) store.selezionaPercorsi(id, [dest.seleziona]);
	}

	/** Porta una scheda già aperta in `dest`, con la voce selezionata. */
	async function mostraDestinazione(id: number, dest: { cartella: string; seleziona: string | null }) {
		await store.navigate(id, dest.cartella);
		if (dest.seleziona) store.selezionaPercorsi(id, [dest.seleziona]);
	}

	/** L'ultima cartella aperta, per la pagina iniziale «Ultima cartella aperta». */
	const CHIAVE_ULTIMA = 'space-train.ultima-cartella';

	$effect(() => {
		const path = store.activeTab?.path;
		if (!avviato || !path) return;
		try {
			localStorage.setItem(CHIAVE_ULTIMA, path);
		} catch {
			// Archivio negato: all'avvio si ripiega sul disco C:.
		}
	});

	/**
	 * Dopo un aggiornamento, alla prima apertura, si racconta cosa è
	 * cambiato. Solo nella finestra principale, una volta per versione.
	 */
	const CHIAVE_VERSIONE = 'space-train.versione-vista';
	let novitaAperte = $state<Novita[]>([]);
	let versioneAttuale = $state('');

	/** Il megafono: le novità della versione installata, le altre a richiesta. */
	let novitaDalMegafono = $state(false);
	function riapriNovita() {
		const i = Math.max(0, NOVITA.findIndex((n) => n.versione === versioneAttuale));
		novitaDalMegafono = true;
		novitaAperte = [NOVITA[i]];
	}

	function chiudiNovita() {
		novitaDalMegafono = false;
		novitaAperte = [];
		try {
			localStorage.setItem(CHIAVE_VERSIONE, versioneAttuale);
		} catch {
			// Archivio negato: le novità si riproporranno, pazienza.
		}
	}

	$effect(() => {
		if (!avviato || finestra !== 'main') return;
		// Per provarla in sviluppo: `VITE_PROVA_NOVITA=1` la apre sempre, con
		// le novità della versione più recente dell'elenco.
		if (import.meta.env.DEV && import.meta.env.VITE_PROVA_NOVITA === '1') {
			untrack(() => (novitaAperte = NOVITA.slice(0, 1)));
			return;
		}
		untrack(() => {
			tauriBackend
				.appVersion()
				.then((v) => {
					if (typeof v !== 'string' || !v) return;
					versioneAttuale = v;
					let vista: string | null = null;
					let giaUsata = false;
					try {
						vista = localStorage.getItem(CHIAVE_VERSIONE);
						giaUsata = localStorage.getItem('space-train.impostazioni') !== null;
					} catch {
						return;
					}
					const da = novitaDaMostrare(vista, v, giaUsata);
					if (da.length > 0) novitaAperte = da;
					// Alla prima installazione non c'è niente da raccontare: si
					// ricorda la versione e basta.
					else if (vista !== v) localStorage.setItem(CHIAVE_VERSIONE, v);
				})
				.catch(() => {});
		});
	});

	/** Le schede aperte, per riprenderle al prossimo avvio. */
	const CHIAVE_SESSIONE = 'space-train.sessione';

	interface Sessione {
		schede: string[];
		attiva: number;
	}

	// Solo la finestra principale: le altre si chiudono e si riaprono a
	// piacere, e sovrascriverebbero la sessione con le loro poche schede.
	$effect(() => {
		const schede = store.tabs.map((t) => t.path);
		const attiva = store.tabs.findIndex((t) => t.id === store.activeId);
		if (!avviato || finestra !== 'main' || schede.length === 0) return;
		try {
			localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify({ schede, attiva } satisfies Sessione));
		} catch {
			// Archivio negato: la sessione non si riprenderà.
		}
	});

	function sessioneSalvata(): Sessione | null {
		try {
			const s = JSON.parse(localStorage.getItem(CHIAVE_SESSIONE) ?? 'null') as Sessione | null;
			return s && Array.isArray(s.schede) ? s : null;
		} catch {
			return null;
		}
	}

	/**
	 * Le schede con cui parte l'app quando Windows non chiede una cartella:
	 * quelle della volta scorsa, se l'utente vuole riprenderle, più le
	 * cartelle fissate per l'avvio. Quelle sparite nel frattempo si saltano;
	 * se non resta niente, la pagina iniziale.
	 */
	async function schedeIniziali(): Promise<Sessione> {
		const salvata = impostazioni.sessione ? sessioneSalvata() : null;
		const candidate = [...(salvata?.schede ?? [])];
		for (const c of impostazioni.cartelleAvvio) {
			if (!candidate.some((p) => stessoPath(p, c))) candidate.push(c);
		}
		const esistono = await Promise.all(
			candidate.map((p) =>
				p.startsWith('::')
					? Promise.resolve(p)
					: tauriBackend
							.resolvePath(p)
							.then((d) => (d.seleziona === null ? d.cartella : null))
							.catch(() => null)
			)
		);
		const schede = esistono.filter((p): p is string => p !== null);
		if (schede.length === 0) return { schede: [await paginaIniziale()], attiva: 0 };
		const attiva = salvata ? Math.min(Math.max(salvata.attiva, 0), schede.length - 1) : 0;
		return { schede, attiva };
	}

	/**
	 * La cartella da aprire quando Windows non ne chiede una. Una pagina
	 * iniziale sparita nel frattempo (disco staccato, cartella cancellata)
	 * non lascia l'utente davanti a un errore: si torna al disco C:.
	 */
	async function paginaIniziale(): Promise<string> {
		let scelta = impostazioni.paginaIniziale;
		if (scelta === INIZIALE_ULTIMA) {
			try {
				scelta = localStorage.getItem(CHIAVE_ULTIMA) ?? INIZIALE_PREDEFINITA;
			} catch {
				scelta = INIZIALE_PREDEFINITA;
			}
		}
		if (scelta.startsWith('::')) return scelta;
		return tauriBackend
			.resolvePath(scelta)
			.then((d) => d.cartella)
			.catch(() => INIZIALE_PREDEFINITA);
	}

	// Una volta sola, all'avvio. `untrack` è indispensabile: aprire una scheda
	// cambia la lista delle schede, e senza ogni scheda aperta qui faceva
	// ripartire l'effetto, che ne apriva un'altra, all'infinito.
	$effect(() => {
		untrack(() => {
			if (finestra !== 'main') {
				const apri = (window as unknown as { __SPACE_TRAIN_APRI?: string | null }).__SPACE_TRAIN_APRI;
				void store.openTab(apri ?? 'C:\\').then(() => (avviato = true));
				return;
			}
			tauriBackend
				.initialPath()
				.catch(() => null)
				.then(async (dest) => {
					if (dest) await apriDestinazione(dest);
					else {
						const { schede, attiva } = await schedeIniziali();
						// Tutte insieme: le schede entrano subito nell'ordine giusto,
						// e i loro contenuti arrivano in parallelo.
						const ids = await Promise.all(schede.map((p) => store.openTab(p)));
						// Una cartella arrivata da Windows nel frattempo resta davanti.
						if (store.activeId !== null && ids.includes(store.activeId)) {
							store.setActive(ids[attiva] ?? ids[0]);
						}
					}
					avviato = true;
				});
		});
	});

	$effect(() => {
		if (avviato && store.tabs.length === 0) void paginaIniziale().then((p) => store.openTab(p));
	});

	// Una cartella aperta da Windows mentre l'app è già in esecuzione arriva
	// qui, come scheda nuova, invece di avviare una seconda copia.
	$effect(() => {
		let smonta: (() => void) | undefined;
		let attivo = true;
		listen<{ finestra: string; dest: { cartella: string; seleziona: string | null } }>(
			'apri-percorso',
			(e) => {
				// Con più finestre la cartella va solo a quella scelta da Rust.
				if (e.payload.finestra === finestra) void apriDestinazione(e.payload.dest);
			}
		)
			.then((f) => (attivo ? (smonta = f) : f()))
			.catch(() => {});
		return () => {
			attivo = false;
			smonta?.();
		};
	});

	function apri(e: Entry) {
		if (store.activeId === null || posizione === 'cestino') return;
		if (e.kind === 'dir') store.navigate(store.activeId, e.path);
		// Un file di un altro PC si scarica in una cartella temporanea e si apre.
		else if (eReteLocale(e.path))
			tauriBackend.lanApri(e.path).catch((err) => (erroreOp = descriviErrore(err)));
		else tauriBackend.openEntry(e.path);
	}

	function seleziona(e: Entry, modificatori: { ctrl?: boolean; shift?: boolean } = {}) {
		if (store.activeId === null) return;
		store.seleziona(store.activeId, e.path, vociVisibili, modificatori);
	}

	/**
	 * Clic sul vuoto e rettangolo di selezione. Con Ctrl o Maiusc il
	 * rettangolo si aggiunge a ciò che era già selezionato quando è partito.
	 */
	let selezionePrimaDelRettangolo: string[] = [];
	const rettangolo = {
		oninizio: () => {
			selezionePrimaDelRettangolo = [...(store.activeTab?.selection ?? [])];
		},
		oncambia: (paths: string[], aggiungi: boolean) => {
			if (store.activeId === null) return;
			const scelte = aggiungi ? [...new Set([...selezionePrimaDelRettangolo, ...paths])] : paths;
			// Nell'ordine della lista, come ogni altra selezione.
			const dentro = new Set(scelte);
			store.selezionaPercorsi(
				store.activeId,
				vociVisibili.filter((v) => dentro.has(v.path)).map((v) => v.path)
			);
		},
		onvuoto: () => {
			if (store.activeId !== null) store.pulisciSelezione(store.activeId);
		}
	};

	function alternaPreferiti() {
		const scelte = selezionate();
		if (scelte.length === 0 || !store.activeTab || !modificabile) return;
		preferiti.alterna(store.activeTab.path, scelte.map((e) => e.name));
	}

	async function proprieta() {
		const tab = store.activeTab;
		if (!tab || posizione === 'cestino' || posizione === 'rete') return;
		const scelte = selezionate().map((e) => e.path);
		const paths = scelte.length > 0 ? scelte : eVirtuale(tab.path) ? [] : [tab.path];
		if (paths.length === 0) return;
		try {
			await tauriBackend.showProperties(paths);
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	async function vaiAIndirizzo(testo: string) {
		if (store.activeId === null) return;
		erroreOp = null;
		try {
			const dest = await tauriBackend.resolvePath(testo);
			await store.navigate(store.activeId, dest.cartella);
			if (dest.seleziona) store.selezionaPercorsi(store.activeId, [dest.seleziona]);
		} catch {
			erroreOp = `Impossibile trovare «${testo}». Controlla di averlo scritto correttamente.`;
		}
	}

	/**
	 * Quale schermata vuota mostrare, o `null` se c'è una lista da vedere.
	 *
	 * L'ordine conta: un errore va detto prima di dichiarare vuota una
	 * cartella che non siamo nemmeno riusciti a leggere.
	 */
	let statoVuoto = $derived.by(() => {
		const tab = store.activeTab;
		if (!tab || tab.loading) return null;
		if (tab.risultati) {
			return tab.risultati.length === 0 && !tab.cercando ? ('nessunRisultato' as const) : null;
		}

		if (tab.entries.length === 0) {
			switch (tab.error?.kind) {
				case 'accessDenied':
					return 'accessoNegato' as const;
				case 'deviceNotReady':
					return 'nonPronta' as const;
				case undefined:
					return 'cartellaVuota' as const;
				default:
					return null;
			}
		}

		return vociVisibili.length === 0 ? ('nessunRisultato' as const) : null;
	});

	let colonne = $state(1);

	/**
	 * L'apertura non viene nemmeno montata se l'utente ha chiesto meno
	 * movimento: nasconderla via CSS lascerebbe comunque girare i timer.
	 */
	// Spenta di default: l'avvio deve essere istantaneo. Chi la vuole la
	// riaccende dal menu Aspetto.
	let apertura = $state(impostazioni.animazioneAvvio && !motoRidotto());

	// ── Menu ─────────────────────────────────────────────────────────

	let menu = $state<{ voci: VoceMenu[]; x: number; y: number } | null>(null);

	/**
	 * Il clic destro su una voce già selezionata non tocca la selezione:
	 * altrimenti, dopo aver scelto dieci file, il menu ne opererebbe uno.
	 * Su una voce fuori dalla selezione, invece, la sposta lì.
	 */
	function menuSuVoce(e: Entry, evento: MouseEvent) {
		if (!insiemeSelezione.has(e.path)) seleziona(e);
		void apriMenu(evento);
	}

	function menuSulVuoto(evento: MouseEvent) {
		if (store.activeId !== null) store.pulisciSelezione(store.activeId);
		void apriMenu(evento);
	}

	/** La cartella a cui si riferisce il menu: quella selezionata o quella aperta. */
	function cartellaDelMenu(scelte: Entry[]): string | null {
		if (scelte.length === 1 && scelte[0].kind === 'dir') return scelte[0].path;
		const tab = store.activeTab;
		return tab && !eVirtuale(tab.path) ? tab.path : null;
	}

	/** La cartella del menu si apre già a ogni avvio. */
	function eAllAvvio(scelte: Entry[]): boolean {
		const cartella = cartellaDelMenu(scelte);
		return cartella !== null && impostazioni.cartelleAvvio.some((c) => stessoPath(c, cartella));
	}

	/** La cartella del menu è già la pagina iniziale. */
	function eIniziale(scelte: Entry[]): boolean {
		const pagina = impostazioni.paginaIniziale;
		if (posizione === 'pc' && scelte.length === 0) return pagina === '::pc';
		const cartella = cartellaDelMenu(scelte);
		return cartella !== null && stessoPath(cartella, pagina);
	}

	/** Voce dell'Accesso rapido su cui è stato aperto il menu della barra laterale. */
	let menuAccesso = $state<string | null>(null);

	function apriMenuAccesso(path: string, evento: MouseEvent) {
		menuAccesso = path;
		const i = accessoRapido.cartelle.findIndex((c) => stessoPath(c, path));
		menu = {
			voci: vociAccessoRapido(i === 0, i === accessoRapido.cartelle.length - 1),
			x: evento.clientX,
			y: evento.clientY
		};
	}

	async function apriMenu(evento: MouseEvent) {
		menuAccesso = null;
		const x = evento.clientX;
		const y = evento.clientY;
		const scelte = selezionate();
		const pieni = modificabile ? (await daIncollare()) !== null : false;
		menu = {
			voci: vociMenu({
				selezione: scelte,
				appuntiPieni: pieni,
				giaPreferiti:
					store.activeTab !== undefined &&
					preferiti.tutti(store.activeTab.path, scelte.map((e) => e.name)),
				posizione,
				ricerca: inRicerca,
				annullabile: annulla.prossima(),
				coloreAttuale: coloreComune(scelte),
				pari: destinatari,
				condivisa: statoLan?.condivisa ?? null,
				condivisaQui:
					!!statoLan?.condivisa &&
					store.activeTab !== undefined &&
					stessoPath(statoLan.condivisa, store.activeTab.path),
				fissata: accessoRapido.contiene(cartellaDelMenu(scelte) ?? ''),
				iniziale: eIniziale(scelte),
				allAvvio: eAllAvvio(scelte)
			}),
			x,
			y
		};
	}

	/** I menu della barra si aprono sotto il loro pulsante, come in Esplora. */
	function sottoIlPulsante(evento: MouseEvent, voci: VoceMenu[]) {
		const r = (evento.currentTarget as HTMLElement).getBoundingClientRect();
		menu = { voci, x: r.left, y: r.bottom + 4 };
	}

	function apriMenuVista(evento: MouseEvent) {
		sottoIlPulsante(
			evento,
			vociVista({
				vista: impostazioni.vista,
				lato: impostazioni.lato,
				compatta: impostazioni.compatta,
				colonne: impostazioni.colonne,
				estensioni: impostazioni.estensioni,
				nascosti: store.showHidden,
				anteprima: impostazioni.anteprima,
				iniziale: impostazioni.paginaIniziale,
				sessione: impostazioni.sessione
			})
		);
	}

	function apriMenuOrdina(evento: MouseEvent) {
		const tab = store.activeTab;
		if (!tab) return;
		sottoIlPulsante(evento, vociOrdina(tab.sort, impostazioni.raggruppa));
	}

	function apriMenuNuovo(evento: MouseEvent) {
		if (!modificabile) return;
		sottoIlPulsante(evento, vociNuovo(tipiNuovo));
	}

	function apriMenuAspetto(evento: MouseEvent) {
		sottoIlPulsante(
			evento,
			vociAspetto({
				tema: impostazioni.tema,
				accento: impostazioni.accento,
				coloreAccento: impostazioni.coloreAccento,
				animazioneAvvio: impostazioni.animazioneAvvio,
				pausaTreno: impostazioni.pausaTreno,
				personali: impostazioni.temiPersonali
			})
		);
	}

	/** Colore comune delle cartelle selezionate, o `null` se diverso o assente. */
	function coloreComune(scelte: Entry[]): IdColore | null {
		const cartelle = scelte.filter((e) => e.kind === 'dir');
		const primo = cartelle[0] ? colori.idDi(cartelle[0].path) : undefined;
		return primo && cartelle.every((e) => colori.idDi(e.path) === primo) ? primo : null;
	}

	/**
	 * Le azioni con un parametro arrivano come `tipo:valore`: ordina per una
	 * colonna, raggruppa, vista, lato delle icone, tema, accento, colore.
	 */
	function eseguiParametrica(azione: string, scelte: Entry[]): boolean {
		const [tipo, valore] = azione.split(':');
		if (valore === undefined) return false;
		const id = store.activeId;
		const tab = store.activeTab;

		switch (tipo) {
			case 'nuovo':
				void nuovoFile(valore);
				return true;
			case 'invia':
				void inviaA(valore);
				return true;
			case 'ordina':
				if (tab && id !== null) {
					const chiave = valore as SortKey;
					// Come le intestazioni: una colonna nuova parte nel verso
					// in cui di solito la si vuole, la stessa resta com'è.
					const ascendente =
						tab.sort.key === chiave ? tab.sort.ascending : chiave === 'name' || chiave === 'kind';
					void store.setSort(id, { key: chiave, ascending: ascendente });
				}
				return true;
			case 'gruppi':
				impostazioni.imposta('raggruppa', valore as ModoGruppi);
				return true;
			case 'vista':
				impostazioni.impostaVista(valore as Vista);
				return true;
			case 'lato':
				impostazioni.impostaVista('icone', Number(valore));
				return true;
			case 'tema':
				impostazioni.imposta('tema', valore);
				return true;
			case 'pausa':
				impostazioni.imposta('pausaTreno', Number(valore));
				return true;
			case 'iniziale': {
				const scelte: Record<string, string> = { pc: '::pc', c: INIZIALE_PREDEFINITA, ultima: INIZIALE_ULTIMA };
				if (scelte[valore]) impostazioni.imposta('paginaIniziale', scelte[valore]);
				if (valore === 'pc') avvisa('Questo PC si aprirà all’avvio.');
				return true;
			}
			case 'accento':
				impostazioni.imposta('accento', valore as IdAccento);
				// Il campione personalizzato apre il selettore di colore di sistema.
				if (valore === 'personalizzato') selettoreColore?.click();
				return true;
			case 'colore':
				colori.imposta(
					scelte.filter((e) => e.kind === 'dir').map((e) => e.path),
					valore as IdColore
				);
				return true;
		}
		return false;
	}

	/** Ctrl+rotella ingrandisce e rimpicciolisce, come in Esplora. */
	$effect(() => {
		function rotella(e: WheelEvent) {
			if (!e.ctrlKey || e.deltaY === 0) return;
			e.preventDefault();
			const s = zoom({ vista: impostazioni.vista, lato: impostazioni.lato }, e.deltaY < 0 ? 1 : -1);
			impostazioni.impostaVista(s.vista, s.lato);
		}
		// Non passivo: senza, il preventDefault non ferma lo zoom della pagina.
		window.addEventListener('wheel', rotella, { passive: false });
		return () => window.removeEventListener('wheel', rotella);
	});

	function apriMenuColonne(evento: MouseEvent) {
		menu = { voci: vociColonne(impostazioni.colonne), x: evento.clientX, y: evento.clientY };
	}

	const COLONNE: Partial<Record<AzioneMenu, keyof Colonne>> = {
		colonnaTipo: 'tipo',
		colonnaDimensione: 'dimensione',
		colonnaData: 'data'
	};

	async function eseguiAzione(azione: AzioneMenu) {
		const punto = menu ? { x: menu.x, y: menu.y } : { x: 0, y: 0 };
		menu = null;
		// Dal menu dell'Accesso rapido il bersaglio è la cartella cliccata
		// nella barra laterale, non la selezione nella lista.
		const dallaBarra = menuAccesso;
		menuAccesso = null;
		if (dallaBarra) {
			switch (azione) {
				case 'apriNuovaScheda':
					await store.openTab(dallaBarra);
					return;
				case 'apriNuovaFinestra':
					return nuovaFinestra(dallaBarra);
				case 'sgancia':
					return accessoRapido.sgancia(dallaBarra);
				case 'suAccesso':
					return accessoRapido.muovi(dallaBarra, -1);
				case 'giuAccesso':
					return accessoRapido.muovi(dallaBarra, 1);
			}
		}
		const scelte = selezionate();
		const id = store.activeId;
		const tab = store.activeTab;

		const colonna = COLONNE[azione];
		if (colonna) return impostazioni.alternaColonna(colonna);
		if (eseguiParametrica(azione, scelte)) return;

		try {
			switch (azione) {
				case 'apri':
					if (scelte[0]) apri(scelte[0]);
					break;
				case 'apriNuovaFinestra':
					if (scelte[0]) await nuovaFinestra(scelte[0].path);
					break;
				case 'fissa': {
					const cartella = cartellaDelMenu(scelte);
					if (cartella) {
						accessoRapido.fissa(cartella);
						avvisa(`«${nomeDi(cartella)}» fissata nella barra laterale.`);
					}
					break;
				}
				case 'sgancia': {
					const cartella = cartellaDelMenu(scelte);
					if (cartella) accessoRapido.sgancia(cartella);
					break;
				}
				case 'apriNuovaScheda':
					if (scelte[0]) await store.openTab(scelte[0].path);
					break;
				case 'apriCon':
					if (scelte[0]) await tauriBackend.openWith(scelte[0].path);
					break;
				case 'amministratore':
					if (scelte[0]) await tauriBackend.runAsAdmin(scelte[0].path);
					break;
				case 'apriPercorso':
					if (scelte[0] && id !== null) {
						const cartella = await tauriBackend.navigate(scelte[0].path, 'up');
						await store.navigate(id, cartella);
						store.selezionaPercorsi(id, [scelte[0].path]);
					}
					break;
				case 'rinomina':
					if (scelte[0]) rinominando = scelte[0].path;
					break;
				case 'copia':
					await mettiNegliAppunti(false);
					break;
				case 'taglia':
					await mettiNegliAppunti(true);
					break;
				case 'incolla':
					await incolla();
					break;
				case 'cestina':
					chiediCestino();
					break;
				case 'eliminaDefinitivo':
					chiediEliminaDefinitivo();
					break;
				case 'nuovaCartella':
					await nuovaCartella();
					break;
				case 'preferito':
					alternaPreferiti();
					break;
				case 'copiaPercorso':
					await copiaPercorsi(scelte);
					break;
				case 'terminale': {
					const cartella = cartellaDelMenu(scelte);
					if (cartella) await tauriBackend.openTerminal(cartella);
					break;
				}
				case 'cartellaAvvio': {
					const cartella = cartellaDelMenu(scelte);
					if (!cartella) break;
					if (eAllAvvio(scelte)) {
						impostazioni.imposta(
							'cartelleAvvio',
							impostazioni.cartelleAvvio.filter((c) => !stessoPath(c, cartella))
						);
					} else {
						impostazioni.imposta('cartelleAvvio', [...impostazioni.cartelleAvvio, cartella]);
						avvisa(`«${nomeDi(cartella)}» si aprirà a ogni avvio, in una scheda sua.`);
					}
					break;
				}
				case 'sessione':
					impostazioni.imposta('sessione', !impostazioni.sessione);
					break;
				case 'paginaIniziale': {
					const cartella = cartellaDelMenu(scelte);
					if (cartella) {
						impostazioni.imposta('paginaIniziale', cartella);
						avvisa(`«${nomeDi(cartella)}» si aprirà all’avvio.`);
					}
					break;
				}
				case 'mostraInEsplora':
					if (scelte[0]) await tauriBackend.revealInExplorer(scelte[0].path);
					break;
				case 'comprimi':
					await archivio('comprimi');
					break;
				case 'estrai':
					await archivio('estrai');
					break;
				case 'proprieta':
					await proprieta();
					break;
				case 'altreOpzioni':
					if (tab) {
						const esito = await tauriBackend.showShellMenu(
							scelte.map((e) => e.path),
							eVirtuale(tab.path) ? '' : tab.path,
							punto.x,
							punto.y
						);
						// «Apri percorso file» lo esegue l'app: la cartella si apre qui.
						if (esito.apri && id !== null) await mostraDestinazione(id, esito.apri);
						else if (esito.eseguito) await ricarica();
					}
					break;
				case 'annulla':
					await annullaUltima();
					break;
				case 'aggiorna':
					await ricarica();
					break;
				case 'ripristina':
					await ripristina();
					break;
				case 'svuotaCestino':
					daEliminare = { voci: tab?.entries ?? [], tipo: 'svuota' };
					break;
				case 'condividi': {
					const cartella = scelte.length === 1 && scelte[0].kind === 'dir' ? scelte[0].path : tab?.path;
					if (cartella && !eVirtuale(cartella)) await condividi(cartella);
					break;
				}
				case 'nonCondividere':
					await condividi(null);
					avvisa('La cartella non è più condivisa.');
					break;
				case 'scarica':
					if (statoLan) {
						const esito = await scaricaDaRete(scelte.map((e) => e.path), statoLan.cartellaRicevuti);
						if (esito) avvisa(`Scaricato in ${statoLan.cartellaRicevuti}.`);
					}
					break;
				case 'menuNuovo':
					// Dal menu sullo sfondo: il menu «Nuovo» si apre nello stesso punto.
					menu = { voci: vociNuovo(tipiNuovo), x: punto.x, y: punto.y };
					break;
				case 'coloreNessuno':
					colori.imposta(
						scelte.filter((e) => e.kind === 'dir').map((e) => e.path),
						null
					);
					break;
				case 'crescente':
				case 'decrescente':
					if (tab && id !== null) {
						await store.setSort(id, { key: tab.sort.key, ascending: azione === 'crescente' });
					}
					break;
				case 'compatta':
					impostazioni.imposta('compatta', !impostazioni.compatta);
					break;
				case 'editorTemi':
					void apriEditor();
					break;
				case 'animazioneAvvio':
					impostazioni.imposta('animazioneAvvio', !impostazioni.animazioneAvvio);
					break;
				case 'estensioni':
					impostazioni.imposta('estensioni', !impostazioni.estensioni);
					break;
				case 'nascosti':
					await store.setShowHidden(!store.showHidden);
					break;
				case 'anteprima':
					impostazioni.imposta('anteprima', !impostazioni.anteprima);
					break;
			}
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	/** Un percorso per riga: è la forma che si incolla in un terminale. */
	async function copiaPercorsi(scelte: Entry[]) {
		if (scelte.length === 0) return;
		try {
			await navigator.clipboard.writeText(scelte.map((e) => e.path).join('\n'));
		} catch (e) {
			erroreOp = descriviErrore(e);
		}
	}

	/**
	 * I tasti laterali arrivano su mousedown. Il preventDefault serve perché
	 * la WebView li interpreta come navigazione del browser, che qui non
	 * esiste: senza, il gesto verrebbe mangiato prima di arrivare allo store.
	 */
	function tastiLaterali(e: MouseEvent) {
		const azione = historyActionFor(e.button);
		if (azione === null || store.activeId === null) return;
		e.preventDefault();
		if (azione === 'back') store.goBack(store.activeId);
		else store.goForward(store.activeId);
	}

	let predefinito = $state(false);
	let messaggio = $state('');

	$effect(() => {
		invoke<boolean>('is_default').then((v) => (predefinito = v));
	});

	async function impostaPredefinito() {
		try {
			const backup = await invoke<string>('set_as_default');
			predefinito = true;
			messaggio = `Ora le cartelle si aprono con Space Train. Backup in ${backup}`;
		} catch (e) {
			// Prima l'errore si perdeva e il pulsante sembrava aver funzionato.
			erroreOp = `Impossibile impostare Space Train come predefinito: ${descriviErrore(e)}`;
		}
	}

	async function ripristinaEsplora() {
		try {
			await invoke('restore_windows_explorer');
			predefinito = false;
			messaggio = 'Esplora risorse di Windows ripristinato.';
		} catch (e) {
			erroreOp = `Impossibile ripristinare Esplora risorse: ${descriviErrore(e)}`;
		}
	}

	function messaggioErrore(err: FsError | null): string {
		switch (err?.kind) {
			case 'accessDenied':
				return 'Accesso negato a questa cartella.';
			case 'notFound':
				return 'Cartella non trovata.';
			case 'notADirectory':
				return 'Questo elemento non è una cartella.';
			case 'deviceNotReady':
				return 'Unità non pronta. Controlla che il supporto sia inserito.';
			case 'io':
				return err.message;
			default:
				return '';
		}
	}

	let chiaveContenuto = $derived(`${store.activeId}:${store.activeTab?.path}:${inRicerca}`);
</script>

<svelte:window
	onfocus={() => aggiornamentoDischi++}
	onmousedown={tastiLaterali}
	onauxclick={(e) => historyActionFor(e.button) !== null && e.preventDefault()}
	onkeydown={tastiera}
/>

{#if apertura}
	<Avvio onfine={() => (apertura = false)} />
{/if}

<div class="app">
	<TitleBar {store} {bersaglio} onnovita={riapriNovita} />

	<!-- La linea principale: corre per tutta la larghezza sotto la testata.
	     Si accende quando il sistema muove davvero qualcosa, e ogni tanto
	     ci passa sopra un convoglio. -->
	<div class="linea-principale" data-tauri-drag-region style:padding-top="{spazioCorteo}px">
		<Rail attivo={sottoCarico} />
		<Treno
			attivo={sottoCarico}
			{corteo}
			pausa={impostazioni.pausaTreno < 0 ? null : impostazioni.pausaTreno * 1000}
		/>
	</div>

	<div class="corpo">
		<!-- Le posizioni sono fermate: il binario verticale corre sopra la
		     barra laterale e ne attraversa i nodi. -->
		<div class="luoghi">
		<Sidebar
			{store}
			backend={tauriBackend}
			{bersaglio}
			aggiornamento={aggiornamentoDischi}
			coloreDi={(p) => colori.di(p)}
			lan={statoLan}
			pari={pariLan}
			ontogglevisibile={() => impostaLan({ visibile: !statoLan?.visibile })}
			amici={statoAmici}
			onapriamici={() => (amiciAperti = true)}
			onindirizzi={(indirizzi) =>
				// Chi aggiunge un PC lontano vuole farsi trovare: si rende visibile.
				impostaLan(indirizzi.length > (statoLan?.indirizzi?.length ?? 0) ? { indirizzi, visibile: true } : { indirizzi })}
			accessoRapido={accessoRapido.cartelle}
			onmenuaccesso={apriMenuAccesso}
		/>
		<Rail orientamento="verticale" attivo={sottoCarico} />
		</div>
		<main>
			<Breadcrumb
				{store}
				bind:inModifica={indirizzoInModifica}
				onindirizzo={vaiAIndirizzo}
				oncerca={apriRicerca}
				{bersaglio}
			/>
			<BarraComandi
				haSelezione={selezione.length > 0}
				{modificabile}
				mostraNascosti={store.showHidden}
				anteprima={impostazioni.anteprima}
				onnuovo={apriMenuNuovo}
				ontaglia={() => mettiNegliAppunti(true)}
				oncopia={() => mettiNegliAppunti(false)}
				onincolla={incolla}
				onrinomina={() => {
					const voce = selezionata();
					if (voce && modificabile) rinominando = voce.path;
				}}
				onelimina={chiediCestino}
				onordina={apriMenuOrdina}
				onvista={apriMenuVista}
				onaspetto={apriMenuAspetto}
				ontoggleanteprima={() => impostazioni.imposta('anteprima', !impostazioni.anteprima)}
				ontogglenascosti={() => store.setShowHidden(!store.showHidden)}
				recenti={impostazioni.recenti}
				ontogglerecenti={() => impostazioni.imposta('recenti', !impostazioni.recenti)}
			/>
			{#if impostazioni.recenti}
				<BarraRecenti
					giorni={impostazioni.giorniRecenti}
					quanti={impaginato.zone.find((z) => z.tono === 'recenti')?.quante ?? 0}
					oncambia={(g) => impostazioni.imposta('giorniRecenti', g)}
					onchiudi={() => impostazioni.imposta('recenti', false)}
				/>
			{/if}

			{#if ricercaAperta && store.activeTab}
				<SearchBar
					query={store.activeTab.query}
					risultati={vociVisibili.length}
					totale={store.activeTab.entries.length}
					posizione={indice + 1}
					onchange={(q) => store.activeId !== null && store.setQuery(store.activeId, q)}
					onclose={chiudiRicerca}
					sottocartelle={ricercaRicorsiva}
					contenuto={ricercaContenuto}
					cercando={store.activeTab.cercando}
					ontogglesottocartelle={posizione === 'normale' ? alternaRicorsiva : undefined}
					ontogglecontenuto={() => (ricercaContenuto = !ricercaContenuto)}
				/>
			{/if}

			<!-- L'errore resta anche come barra quando c'è già una lista a
			     schermo: sostituirla toglierebbe all'utente il contesto in cui
			     si trova. La schermata intera compare solo se non c'è nulla. -->
			{#if store.activeTab?.error && store.activeTab.entries.length > 0}
				<div class="errore">{messaggioErrore(store.activeTab.error)}</div>
			{/if}
			{#if progresso}
				<BarraProgresso {progresso} modo={modoInCorso} oncancel={annullaTrasferimento} />
			{/if}

			{#if erroreOp}
				<div class="errore">
					{erroreOp}
					<button class="chiudi-errore" onclick={() => (erroreOp = null)} aria-label="Chiudi"
						><Icona nome="chiudi" /></button
					>
				</div>
			{/if}
			{#if avviso}
				<div class="avviso" role="status">{avviso}</div>
			{/if}

			{#if aggiornamenti.daMostrare}
				<div class="avviso aggiornamento" role="status">
					<span>
						{aggiornamenti.stato === 'installa'
							? 'Installazione dell’aggiornamento…'
							: `È pronta la versione ${aggiornamenti.versione} di Space Train.`}
					</span>
					{#if aggiornamenti.stato === 'pronto'}
						<button onclick={() => aggiornamenti.rimanda()}>Più tardi</button>
						<button class="primario" onclick={installaAggiornamento}>Riavvia e aggiorna</button>
					{/if}
				</div>
			{/if}

			<div class="contenuto">
				{#if statoVuoto}
					<StatoVuoto
						variante={statoVuoto}
						azione={statoVuoto === 'cartellaVuota' && modificabile
							? 'Nuova cartella'
							: statoVuoto === 'nessunRisultato'
								? 'Azzera la ricerca'
								: undefined}
						onazione={statoVuoto === 'cartellaVuota' && modificabile
							? nuovaCartella
							: statoVuoto === 'nessunRisultato'
								? chiudiRicerca
								: undefined}
					/>
				{:else if store.activeTab && impostazioni.vista !== 'dettagli'}
					<FileGrid
						entries={vociVisibili}
						zone={impaginato.zone}
						chiave={chiaveContenuto}
						misura={misuraCella({ vista: impostazioni.vista, lato: impostazioni.lato })}
						coloreDi={coloreVoce}
						nascondiEstensione={!impostazioni.estensioni}
						{bersaglio}
						selection={insiemeSelezione}
						activeIndex={indice}
						cutPaths={appunti.mode === 'cut' ? appunti.paths : undefined}
						{icone}
						onactivate={apri}
						onselect={seleziona}
						oncontext={menuSuVoce}
						oncontextvuoto={menuSulVuoto}
						oncolonne={(n) => (colonne = n)}
						ontrascina={trascina}
						{rettangolo}
					/>
				{:else if store.activeTab}
					<FileList
						entries={vociVisibili}
						zone={impaginato.zone}
						chiave={chiaveContenuto}
						colonne={impostazioni.colonne}
						nascondiEstensione={!impostazioni.estensioni}
						cartellaDi={cartellaVoce}
						coloreDi={coloreVoce}
						{altezzaRiga}
						{bersaglio}
						selection={insiemeSelezione}
						matches={store.activeTab.query === '' || inRicerca ? undefined : evidenziazioni}
						activeIndex={indice}
						renamingPath={rinominando}
						cutPaths={appunti.mode === 'cut' ? appunti.paths : undefined}
						{icone}
						sort={store.activeTab.sort}
						onsort={ordinaPer}
						oncolonne={apriMenuColonne}
						onactivate={apri}
						onselect={seleziona}
						oncontext={menuSuVoce}
						oncontextvuoto={menuSulVuoto}
						onrename={confermaRinomina}
						oncancelrename={() => (rinominando = null)}
						ontrascina={trascina}
						{rettangolo}
					/>
				{/if}

				{#if impostazioni.anteprima}
					<Anteprima voce={voceAnteprima} quante={selezione.length} backend={tauriBackend} />
				{/if}
			</div>
		</main>
	</div>

	{#if menu}
		<MenuContestuale
			voci={menu.voci}
			x={menu.x}
			y={menu.y}
			onscegli={eseguiAzione}
			onchiudi={() => (menu = null)}
		/>
	{/if}

	{#if conflitti.length > 0}
		<ConfermaConflitti
			nomi={conflitti}
			modo={inSospeso?.mode ?? 'copy'}
			onscegli={(p) => esegui(p)}
			oncancel={() => {
				conflitti = [];
				inSospeso = null;
			}}
		/>
	{/if}

	{#if daCestinare.length > 0}
		<ConfermaCestino voci={daCestinare} onconfirm={() => cestina()} oncancel={() => (daCestinare = [])} />
	{/if}

	{#if amiciAperti && statoAmici}
		<AmiciFinestra
			backend={tauriBackend}
			stato={statoAmici}
			condivisa={statoLan?.condivisa ?? null}
			onchiudi={() => (amiciAperti = false)}
			onerrore={(e) => (erroreOp = descriviErrore(e))}
		/>
	{/if}

	{#if novitaAperte.length > 0}
		<NovitaFinestra
			novita={novitaAperte}
			onchiudi={chiudiNovita}
			installata={novitaDalMegafono ? versioneAttuale || NOVITA[0].versione : undefined}
			precedenti={novitaDalMegafono ? NOVITA.filter((n) => n.versione !== novitaAperte[0]?.versione) : []}
		/>
	{/if}

	{#if richiesteLan[0] && statoLan}
		<!-- Una richiesta nuova riparte dalla cartella dei ricevuti, non dalla
		     scelta fatta per quella prima. -->
		{#key richiesteLan[0].id}
			<RichiestaLan
				richiesta={richiesteLan[0]}
				cartella={statoLan.cartellaRicevuti}
				onscegli={(da) => tauriBackend.scegliCartella('Dove salvare i file in arrivo', da)}
				onrisposta={rispondiLan}
			/>
		{/key}
	{/if}

	{#if editorAperto}
		<EditorTemi
			temaAttuale={temaCorrente}
			personali={impostazioni.temiPersonali}
			backend={tauriBackend}
			onanteprima={(t) => daEditor({ tipo: 'anteprima', tema: t })}
			onsalva={(t) => daEditor({ tipo: 'salva', tema: t })}
			onelimina={(id) => daEditor({ tipo: 'elimina', id })}
			onchiudi={() => daEditor({ tipo: 'chiudi' })}
		/>
	{/if}

	<!-- Il selettore di colore di sistema per l'evidenziazione personalizzata:
	     nascosto, lo apre il campione arcobaleno del menu Aspetto. -->
	<input
		class="selettore-colore"
		type="color"
		bind:this={selettoreColore}
		value={impostazioni.coloreAccento}
		aria-label="Colore d'evidenziazione personalizzato"
		oninput={(e) => {
			impostazioni.imposta('coloreAccento', e.currentTarget.value);
			impostazioni.imposta('accento', 'personalizzato');
		}}
	/>

	{#if daEliminare}
		<ConfermaCestino
			voci={daEliminare.voci}
			definitivo
			onconfirm={eliminaDefinitivo}
			oncancel={() => (daEliminare = null)}
		/>
	{/if}

	<footer class="impostazioni">
		{#if predefinito}
			<button onclick={ripristinaEsplora}>Ripristina Esplora risorse</button>
		{:else}
			<button onclick={impostaPredefinito}>Imposta come predefinito</button>
		{/if}
		{#if messaggio}<span class="nota">{messaggio}</span>{/if}
		<span class="stato">
			<!-- Una sola espressione: Svelte toglie lo spazio in coda a un blocco
			     {#if}, e il testo diventava «1 selezionati ·10 elementi». -->
			{selezione.length > 0 ? `${selezione.length} selezionati · ` : ''}{vociVisibili.length} elementi
		</span>
		<!-- Come nella barra di stato di Esplora: passaggio rapido fra
		     dettagli e icone, più un cursore per la grandezza delle icone. -->
		<div class="vista-rapida">
			{#if impostazioni.vista === 'icone'}
				<input
					class="cursore"
					type="range"
					min={LATO_MIN}
					max={LATO_MAX}
					value={impostazioni.lato}
					aria-label="Dimensione delle icone"
					title="Dimensione delle icone (anche Ctrl+rotella)"
					oninput={(e) => impostazioni.impostaVista('icone', Number(e.currentTarget.value))}
				/>
			{/if}
			<button
				class="rapido"
				class:acceso={impostazioni.vista === 'dettagli'}
				aria-pressed={impostazioni.vista === 'dettagli'}
				aria-label="Dettagli"
				title="Dettagli"
				onclick={() => impostazioni.impostaVista('dettagli')}
			>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<rect x="2" y="3" width="12" height="2" fill="currentColor" />
					<rect x="2" y="7" width="12" height="2" fill="currentColor" />
					<rect x="2" y="11" width="12" height="2" fill="currentColor" />
				</svg>
			</button>
			<button
				class="rapido"
				class:acceso={impostazioni.vista === 'icone'}
				aria-pressed={impostazioni.vista === 'icone'}
				aria-label="Icone grandi"
				title="Icone grandi"
				onclick={() => impostazioni.impostaVista('icone', impostazioni.vista === 'icone' ? impostazioni.lato : 128)}
			>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<rect x="2" y="2" width="5" height="5" fill="currentColor" />
					<rect x="9" y="2" width="5" height="5" fill="currentColor" />
					<rect x="2" y="9" width="5" height="5" fill="currentColor" />
					<rect x="9" y="9" width="5" height="5" fill="currentColor" />
				</svg>
			</button>
		</div>
	</footer>
</div>

<style>
	/* Contiene il binario e fa da riferimento al convoglio, che sborda
	   verso l'alto sopra la testata. */
	/* Lo stesso cielo della testata continua fin sul binario; la tessera è
	   spostata perché le due strisce non si ripetano una sotto l'altra. */
	.linea-principale {
		position: relative;
		flex-shrink: 0;
		z-index: 3;
		background: var(--stelle, none) 210px 0 / var(--cielo-misura, 480px 40px) repeat, var(--bg);
	}
	/* Il binario è decorazione: il clic passa al contenitore, che sposta
	   la finestra. */
	.linea-principale > :global(*) {
		pointer-events: none;
	}
	.corpo {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	/* Il fondo sta qui e non sulla barra: così il binario passa fra i due e
	   i nodi delle fermate gli stanno sopra, come stazioni sulla linea. */
	.luoghi {
		position: relative;
		display: flex;
		flex-shrink: 0;
		background: var(--surface-glass);
	}
	.luoghi > :global(.binario) {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 13px;
		pointer-events: none;
	}
	.luoghi > :global(.sidebar) {
		position: relative;
		z-index: 1;
		background: transparent;
	}
	main {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		border-left: 1px solid var(--border);
	}
	/* Lista e anteprima affiancate: la lista prende tutto lo spazio libero. */
	.contenuto {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.contenuto > :global(:first-child) {
		flex: 1;
		min-width: 0;
	}
	.impostazioni {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 34px;
		padding: 0 12px;
		background: var(--surface-glass);
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}
	.impostazioni button {
		height: 24px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
	}
	.impostazioni button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.nota {
		color: var(--text-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.vista-rapida {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.impostazioni .rapido {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		padding: 0;
		border: none;
	}
	.impostazioni .rapido.acceso {
		color: var(--current);
		background: var(--accent-soft);
	}
	.cursore {
		width: 120px;
		margin-right: 6px;
		accent-color: var(--accent);
	}
	.stato {
		margin-left: auto;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.selettore-colore {
		position: fixed;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.chiudi-errore {
		float: right;
		border: none;
		background: transparent;
		color: inherit;
		font-size: calc(15px * var(--scala-testo, 1));
		cursor: default;
	}
	.errore {
		padding: 10px 16px;
		background: rgba(196, 43, 28, 0.12);
		border-bottom: 1px solid rgba(196, 43, 28, 0.3);
		color: var(--errore-testo);
	}
	.avviso {
		padding: 8px 16px;
		background: color-mix(in srgb, var(--current) 10%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--current) 30%, transparent);
		color: var(--current);
	}
	.aggiornamento {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.aggiornamento span {
		flex: 1;
	}
	.aggiornamento button {
		padding: 4px 12px;
		border: 1px solid color-mix(in srgb, var(--current) 40%, transparent);
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.aggiornamento button.primario {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
</style>
