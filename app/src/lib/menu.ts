import type { Entry, SortKey, SortSpec } from './ipc';
import { eEseguibile, eZip } from './posizioni';
import type { ModoGruppi } from './raggruppa';
import { TAGLIE, type Vista } from './vista';
import { TEMI, ACCENTI, type IdAccento, type Tema } from './temi';
import { COLORI_CARTELLA, type IdColore } from './stores/colori.svelte';

export type AzioneMenu =
	| 'apri'
	| 'apriNuovaScheda'
	| 'apriNuovaFinestra'
	| 'fissa'
	| 'sgancia'
	| 'suAccesso'
	| 'giuAccesso'
	| 'apriCon'
	| 'apriPercorso'
	| 'amministratore'
	| 'rinomina'
	| 'copia'
	| 'taglia'
	| 'incolla'
	| 'cestina'
	| 'eliminaDefinitivo'
	| 'copiaPercorso'
	| 'mostraInEsplora'
	| 'terminale'
	| 'paginaIniziale'
	| `iniziale:${'pc' | 'c' | 'ultima' | 'attuale'}`
	| 'nuovaCartella'
	| 'preferito'
	| 'comprimi'
	| 'estrai'
	| 'proprieta'
	| 'altreOpzioni'
	| 'annulla'
	| 'aggiorna'
	| 'ripristina'
	| 'svuotaCestino'
	| 'coloreCartella'
	| 'menuNuovo'
	| `invia:${string}`
	| 'condividi'
	| 'nonCondividere'
	| 'scarica'
	| `nuovo:${string}`
	| `colore:${IdColore}`
	| 'coloreNessuno'
	// Ordina
	| `ordina:${SortKey}`
	| 'crescente'
	| 'decrescente'
	| `gruppi:${ModoGruppi}`
	// Visualizza
	| `vista:${Vista}`
	| `lato:${number}`
	| 'compatta'
	// Aspetto
	| `tema:${string}`
	| 'accento'
	| 'animazioneAvvio'
	| `pausa:${number}`
	| 'editorTemi'
	| `accento:${IdAccento}`
	| 'colonnaTipo'
	| 'colonnaDimensione'
	| 'colonnaData'
	| 'estensioni'
	| 'nascosti'
	| 'anteprima';

export interface VoceMenu {
	azione: AzioneMenu;
	etichetta: string;
	scorciatoia?: string;
	/** Separatore prima di questa voce. */
	stacca?: boolean;
	pericolosa?: boolean;
	/** Voce a spunta: presente = si può accendere e spegnere. */
	spunta?: boolean;
	/** Titolo di sezione mostrato sopra la voce, come «Raggruppa per». */
	sezione?: string;
	/**
	 * Nome per gli screen reader quando l'etichetta da sola è ambigua:
	 * «Tipo» sotto «Raggruppa per» non è il «Tipo» dell'ordinamento.
	 */
	nomeAccessibile?: string;
	/** Una fila di colori da scegliere al posto di una voce sola. */
	tavolozza?: Array<{
		azione: AzioneMenu;
		nome: string;
		colore: string | null;
		attivo: boolean;
		/** Il campione che apre il selettore di colore. */
		personalizzato?: boolean;
	}>;
}

/** Dove si trova l'utente: ogni posizione ha le sue operazioni. */
export type Posizione = 'normale' | 'cestino' | 'pc' | 'rete' | 'lan';

export interface ContestoMenu {
	/** Voci selezionate al momento del clic destro. Vuoto = clic sul vuoto. */
	selezione: readonly Entry[];
	/** Vero se gli appunti contengono qualcosa da incollare. */
	appuntiPieni: boolean;
	/** Vero se tutte le voci selezionate sono già nella zona preferiti. */
	giaPreferiti?: boolean;
	posizione?: Posizione;
	/** La lista mostra risultati di ricerca nelle sottocartelle. */
	ricerca?: boolean;
	/** Cosa disferebbe Ctrl+Z, se c'è qualcosa da disfare. */
	annullabile?: string | null;
	/** Colore comune delle cartelle selezionate, se ne hanno uno. */
	coloreAttuale?: IdColore | null;
	/** Altri PC con Space Train in rete locale, a cui si può inviare. */
	pari?: ReadonlyArray<{ id: string; nome: string }>;
	/** La cartella aperta è quella che questo PC condivide in rete locale. */
	condivisaQui?: boolean;
	/** Path della cartella condivisa in rete locale, se ce n'è una. */
	condivisa?: string | null;
	/**
	 * La cartella a cui si riferisce il menu (selezionata o, sullo sfondo,
	 * quella aperta) è nell'Accesso rapido.
	 */
	fissata?: boolean;
	/**
	 * La cartella a cui si riferisce il menu è già la pagina iniziale:
	 * la voce per sceglierla non compare.
	 */
	iniziale?: boolean;
}

/**
 * Voci del menu contestuale per un dato contesto.
 *
 * Le voci che non si possono eseguire non compaiono, invece di comparire
 * disabilitate: un menu di cinque voci tutte attive si legge più in fretta
 * di uno da nove di cui quattro grigie.
 */
export function vociMenu(c: ContestoMenu): VoceMenu[] {
	const posizione = c.posizione ?? 'normale';
	if (posizione === 'cestino') return vociCestino(c);
	if (posizione === 'pc' || posizione === 'rete') return vociVirtuali(c, posizione);
	if (posizione === 'lan') return vociReteLocale(c);
	return c.selezione.length === 0 ? vociSfondo(c) : vociElementi(c);
}

function vociSfondo({
	appuntiPieni,
	annullabile,
	ricerca,
	condivisaQui = false,
	fissata = false,
	iniziale = false
}: ContestoMenu): VoceMenu[] {
	const voci: VoceMenu[] = [];
	if (!ricerca) {
		voci.push({ azione: 'menuNuovo', etichetta: 'Nuovo…' });
		voci.push({ azione: 'nuovaCartella', etichetta: 'Nuova cartella', scorciatoia: 'Ctrl+Maiusc+N' });
		if (appuntiPieni) {
			voci.push({ azione: 'incolla', etichetta: 'Incolla', scorciatoia: 'Ctrl+V', stacca: true });
		}
	}
	if (annullabile) {
		voci.push({
			azione: 'annulla',
			etichetta: `Annulla ${annullabile}`,
			scorciatoia: 'Ctrl+Z',
			stacca: true
		});
	}
	voci.push({ azione: 'aggiorna', etichetta: 'Aggiorna', scorciatoia: 'F5', stacca: true });
	if (!ricerca) {
		voci.push(
			fissata
				? { azione: 'sgancia', etichetta: 'Rimuovi da Accesso rapido', stacca: true }
				: { azione: 'fissa', etichetta: 'Aggiungi ad Accesso rapido', stacca: true }
		);
		voci.push(
			condivisaQui
				? { azione: 'nonCondividere', etichetta: 'Smetti di condividere in rete locale' }
				: { azione: 'condividi', etichetta: 'Condividi questa cartella in rete locale' }
		);
		if (!iniziale) voci.push({ azione: 'paginaIniziale', etichetta: 'Imposta come pagina iniziale' });
		voci.push({ azione: 'terminale', etichetta: 'Apri nel terminale', stacca: true });
		voci.push({ azione: 'altreOpzioni', etichetta: 'Altre opzioni di Windows', stacca: true });
		voci.push({ azione: 'proprieta', etichetta: 'Proprietà', scorciatoia: 'Alt+Invio' });
	}
	return voci;
}

function vociElementi({
	selezione,
	appuntiPieni,
	giaPreferiti = false,
	ricerca = false,
	coloreAttuale = null,
	pari = [],
	condivisa = null,
	fissata = false,
	iniziale = false
}: ContestoMenu): VoceMenu[] {
	const voci: VoceMenu[] = [];
	const quante = selezione.length;
	const unica = quante === 1 ? selezione[0] : null;

	// Aprire ha senso su una voce sola: aprire venti file insieme è quasi
	// sempre un incidente, non un'intenzione.
	if (unica) {
		voci.push({ azione: 'apri', etichetta: 'Apri', scorciatoia: 'Invio' });
		if (unica.kind === 'dir') {
			voci.push({ azione: 'apriNuovaScheda', etichetta: 'Apri in una nuova scheda' });
			voci.push({ azione: 'apriNuovaFinestra', etichetta: 'Apri in una nuova finestra' });
			voci.push(
				fissata
					? { azione: 'sgancia', etichetta: 'Rimuovi da Accesso rapido' }
					: { azione: 'fissa', etichetta: 'Aggiungi ad Accesso rapido' }
			);
			if (!iniziale) voci.push({ azione: 'paginaIniziale', etichetta: 'Imposta come pagina iniziale' });
			voci.push({ azione: 'terminale', etichetta: 'Apri nel terminale' });
		} else {
			voci.push({ azione: 'apriCon', etichetta: 'Apri con…' });
			if (eEseguibile(unica.name)) {
				voci.push({ azione: 'amministratore', etichetta: 'Esegui come amministratore' });
			}
		}
		if (ricerca) voci.push({ azione: 'apriPercorso', etichetta: 'Apri percorso file' });
	}

	voci.push({ azione: 'copia', etichetta: 'Copia', scorciatoia: 'Ctrl+C', stacca: true });
	voci.push({ azione: 'taglia', etichetta: 'Taglia', scorciatoia: 'Ctrl+X' });

	if (appuntiPieni && !ricerca) {
		voci.push({ azione: 'incolla', etichetta: 'Incolla', scorciatoia: 'Ctrl+V' });
	}

	if (unica) {
		voci.push({ azione: 'rinomina', etichetta: 'Rinomina', scorciatoia: 'F2', stacca: true });
	}

	// I preferiti appartengono alla cartella aperta: fra i risultati di una
	// ricerca le voci vengono da cartelle diverse e non avrebbe senso.
	if (!ricerca) {
		voci.push({
			azione: 'preferito',
			etichetta: giaPreferiti ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti',
			scorciatoia: 'Ctrl+D',
			// Con una voce sola il gruppo è già aperto da Rinomina.
			stacca: quante > 1
		});
	}

	// Il colore si dà alle cartelle: con una selezione mista si colorano
	// solo quelle, i file restano come sono.
	if (selezione.some((e) => e.kind === 'dir')) {
		voci.push(tavolozzaCartelle(coloreAttuale));
	}

	voci.push({
		azione: 'copiaPercorso',
		etichetta: quante === 1 ? 'Copia percorso' : 'Copia percorsi',
		stacca: quante > 1 && ricerca
	});

	if (unica) {
		voci.push({ azione: 'mostraInEsplora', etichetta: 'Mostra in Esplora risorse' });
	}

	if (!ricerca) {
		voci.push({ azione: 'comprimi', etichetta: 'Comprimi in file ZIP', stacca: true });
	}

	// Un invio per ogni PC trovato in rete locale: chi riceve deve accettare.
	pari.forEach((p, i) => {
		voci.push({ azione: `invia:${p.id}` as AzioneMenu, etichetta: `Invia a ${p.nome}`, stacca: i === 0 });
	});
	if (unica?.kind === 'dir') {
		const giaCondivisa = condivisa !== null && condivisa.toLowerCase() === unica.path.toLowerCase();
		voci.push(
			giaCondivisa
				? { azione: 'nonCondividere', etichetta: 'Smetti di condividere in rete locale', stacca: pari.length === 0 }
				: { azione: 'condividi', etichetta: 'Condividi in rete locale', stacca: pari.length === 0 }
		);
	}
	if (unica && eZip(unica.name)) {
		voci.push({ azione: 'estrai', etichetta: 'Estrai tutto', stacca: ricerca });
	}

	voci.push({
		azione: 'cestina',
		etichetta: quante === 1 ? 'Sposta nel Cestino' : `Sposta ${quante} elementi nel Cestino`,
		scorciatoia: 'Canc',
		stacca: true,
		pericolosa: true
	});
	voci.push({
		azione: 'eliminaDefinitivo',
		etichetta: 'Elimina definitivamente',
		scorciatoia: 'Maiusc+Canc',
		pericolosa: true
	});

	voci.push({ azione: 'altreOpzioni', etichetta: 'Altre opzioni di Windows', stacca: true });
	voci.push({ azione: 'proprieta', etichetta: 'Proprietà', scorciatoia: 'Alt+Invio' });

	return voci;
}

/** Nella cartella condivisa da un altro PC si legge e si copia, non si modifica. */
function vociReteLocale({ selezione }: ContestoMenu): VoceMenu[] {
	if (selezione.length === 0) {
		return [{ azione: 'aggiorna', etichetta: 'Aggiorna', scorciatoia: 'F5' }];
	}
	const unica = selezione.length === 1 ? selezione[0] : null;
	const voci: VoceMenu[] = [];
	if (unica) voci.push({ azione: 'apri', etichetta: 'Apri', scorciatoia: 'Invio' });
	voci.push({ azione: 'copia', etichetta: 'Copia', scorciatoia: 'Ctrl+C', stacca: unica !== null });
	voci.push({ azione: 'scarica', etichetta: 'Scarica nella cartella Ricevuti' });
	return voci;
}

function vociCestino({ selezione }: ContestoMenu): VoceMenu[] {
	if (selezione.length === 0) {
		return [
			{ azione: 'aggiorna', etichetta: 'Aggiorna', scorciatoia: 'F5' },
			{ azione: 'svuotaCestino', etichetta: 'Svuota Cestino', stacca: true, pericolosa: true }
		];
	}
	return [
		{
			azione: 'ripristina',
			etichetta: selezione.length === 1 ? 'Ripristina' : `Ripristina ${selezione.length} elementi`
		},
		{
			azione: 'eliminaDefinitivo',
			etichetta: 'Elimina definitivamente',
			scorciatoia: 'Canc',
			stacca: true,
			pericolosa: true
		}
	];
}

function vociVirtuali({ selezione, iniziale = false }: ContestoMenu, posizione: 'pc' | 'rete'): VoceMenu[] {
	if (selezione.length !== 1) {
		const voci: VoceMenu[] = [{ azione: 'aggiorna', etichetta: 'Aggiorna', scorciatoia: 'F5' }];
		if (posizione === 'pc' && selezione.length === 0 && !iniziale) {
			voci.push({ azione: 'iniziale:pc', etichetta: 'Imposta come pagina iniziale', stacca: true });
		}
		return voci;
	}
	const voci: VoceMenu[] = [
		{ azione: 'apri', etichetta: 'Apri', scorciatoia: 'Invio' },
		{ azione: 'apriNuovaScheda', etichetta: 'Apri in una nuova scheda' },
		{ azione: 'copiaPercorso', etichetta: 'Copia percorso', stacca: true }
	];
	if (posizione === 'pc') {
		voci.push({ azione: 'altreOpzioni', etichetta: 'Altre opzioni di Windows', stacca: true });
		voci.push({ azione: 'proprieta', etichetta: 'Proprietà', scorciatoia: 'Alt+Invio' });
	}
	return voci;
}

/** La tavolozza «Colore cartella», con il colore attuale segnato. */
export function tavolozzaCartelle(attuale: IdColore | null): VoceMenu {
	return {
		azione: 'coloreCartella',
		etichetta: 'Colore cartella',
		stacca: true,
		tavolozza: [
			{ azione: 'coloreNessuno', nome: 'Nessun colore', colore: null, attivo: attuale === null },
			...COLORI_CARTELLA.map((c) => ({
				azione: `colore:${c.id}` as AzioneMenu,
				nome: c.nome,
				colore: c.esadecimale,
				attivo: attuale === c.id
			}))
		]
	};
}

/**
 * Il menu «Nuovo» di Esplora: prima la cartella, poi i tipi di file che
 * i programmi installati hanno registrato in Windows.
 */
export function vociNuovo(tipi: ReadonlyArray<{ ext: string; nome: string }>): VoceMenu[] {
	return [
		{ azione: 'nuovaCartella', etichetta: 'Cartella', scorciatoia: 'Ctrl+Maiusc+N' },
		...tipi.map((t, i) => ({
			azione: `nuovo:${t.ext}` as AzioneMenu,
			etichetta: t.nome,
			stacca: i === 0
		}))
	];
}

/** Il menu di una cartella dell'Accesso rapido nella barra laterale. */
export function vociAccessoRapido(primo: boolean, ultimo: boolean): VoceMenu[] {
	const voci: VoceMenu[] = [
		{ azione: 'apriNuovaScheda', etichetta: 'Apri in una nuova scheda' },
		{ azione: 'apriNuovaFinestra', etichetta: 'Apri in una nuova finestra' }
	];
	if (!primo) voci.push({ azione: 'suAccesso', etichetta: 'Sposta su', stacca: true });
	if (!ultimo) voci.push({ azione: 'giuAccesso', etichetta: 'Sposta giù', stacca: primo });
	voci.push({ azione: 'sgancia', etichetta: 'Rimuovi da Accesso rapido', stacca: true });
	return voci;
}

const CHIAVI_ORDINE: Array<{ chiave: SortKey; nome: string }> = [
	{ chiave: 'name', nome: 'Nome' },
	{ chiave: 'modified', nome: 'Data di modifica' },
	{ chiave: 'kind', nome: 'Tipo' },
	{ chiave: 'size', nome: 'Dimensione' }
];

const MODI_GRUPPO: Array<{ modo: ModoGruppi; nome: string }> = [
	{ modo: 'nessuno', nome: 'Nessuno' },
	{ modo: 'nome', nome: 'Nome' },
	{ modo: 'data', nome: 'Data di modifica' },
	{ modo: 'tipo', nome: 'Tipo' },
	{ modo: 'dimensione', nome: 'Dimensione' }
];

/** Il menu «Ordina» di Esplora: colonna, verso e raggruppamento. */
export function vociOrdina(sort: SortSpec, raggruppa: ModoGruppi): VoceMenu[] {
	return [
		...CHIAVI_ORDINE.map((c) => ({
			azione: `ordina:${c.chiave}` as AzioneMenu,
			etichetta: c.nome,
			spunta: sort.key === c.chiave
		})),
		{ azione: 'crescente', etichetta: 'Crescente', spunta: sort.ascending, stacca: true },
		{ azione: 'decrescente', etichetta: 'Decrescente', spunta: !sort.ascending },
		...MODI_GRUPPO.map((g, i) => ({
			azione: `gruppi:${g.modo}` as AzioneMenu,
			etichetta: g.nome,
			spunta: raggruppa === g.modo,
			nomeAccessibile: g.modo === 'nessuno' ? 'Nessun raggruppamento' : `Raggruppa per ${g.nome.toLowerCase()}`,
			stacca: i === 0,
			sezione: i === 0 ? 'Raggruppa per' : undefined
		}))
	];
}

export interface StatoVista {
	vista: Vista;
	lato: number;
	compatta: boolean;
	colonne: { tipo: boolean; dimensione: boolean; data: boolean };
	estensioni: boolean;
	nascosti: boolean;
	anteprima: boolean;
	/** La pagina iniziale scelta: `::pc`, `::ultima` o il path di una cartella. */
	iniziale?: string;
}

/** La pagina iniziale predefinita: il disco di sistema, come prima della scelta. */
export const INIZIALE_PREDEFINITA = 'C:\\';
/** Pagina iniziale speciale: riprende l'ultima cartella aperta. */
export const INIZIALE_ULTIMA = '::ultima';

/** Le pagine iniziali fra cui scegliere nel menu «Visualizza». */
export function vociIniziale(iniziale: string = INIZIALE_PREDEFINITA): VoceMenu[] {
	const scelte: Array<[AzioneMenu, string, string]> = [
		['iniziale:pc', 'Questo PC', '::pc'],
		['iniziale:c', 'Disco locale (C:)', INIZIALE_PREDEFINITA],
		['iniziale:ultima', 'Ultima cartella aperta', INIZIALE_ULTIMA]
	];
	const voci: VoceMenu[] = scelte.map(([azione, etichetta, valore]) => ({
		azione,
		etichetta,
		spunta: iniziale.toLowerCase() === valore.toLowerCase()
	}));
	// Una cartella scelta col menu contestuale compare col suo nome.
	if (!scelte.some(([, , v]) => v.toLowerCase() === iniziale.toLowerCase())) {
		const nome = iniziale.replace(/\\+$/, '').split('\\').pop() || iniziale;
		voci.push({ azione: 'iniziale:attuale', etichetta: nome, spunta: true, nomeAccessibile: iniziale });
	}
	return voci.map((v, i) => (i === 0 ? { ...v, stacca: true, sezione: 'All’apertura' } : v));
}

/** Il menu «Visualizza» di Esplora: viste, taglie delle icone, opzioni. */
export function vociVista(s: StatoVista): VoceMenu[] {
	const taglia = (lato: number) => s.vista === 'icone' && s.lato === lato;
	return [
		...TAGLIE.map((t) => ({
			azione: `lato:${t.lato}` as AzioneMenu,
			etichetta: t.nome,
			spunta: taglia(t.lato)
		})),
		{ azione: 'vista:elenco', etichetta: 'Elenco', spunta: s.vista === 'elenco' },
		{ azione: 'vista:dettagli', etichetta: 'Dettagli', spunta: s.vista === 'dettagli' },
		{ azione: 'vista:riquadri', etichetta: 'Riquadri', spunta: s.vista === 'riquadri' },
		{ azione: 'vista:contenuto', etichetta: 'Contenuto', spunta: s.vista === 'contenuto' },
		{ azione: 'compatta', etichetta: 'Visualizzazione compatta', spunta: s.compatta, stacca: true },
		...vociColonne(s.colonne).map((v, i) =>
			i === 0 ? { ...v, stacca: true, sezione: 'Colonne dei dettagli' } : v
		),
		{
			azione: 'anteprima',
			etichetta: 'Riquadro di anteprima',
			spunta: s.anteprima,
			scorciatoia: 'Alt+P',
			stacca: true,
			sezione: 'Mostra'
		},
		{ azione: 'estensioni', etichetta: 'Estensioni dei nomi file', spunta: s.estensioni },
		{ azione: 'nascosti', etichetta: 'Elementi nascosti', spunta: s.nascosti },
		...vociIniziale(s.iniziale)
	];
}

/** Il menu delle colonne, aperto anche col clic destro sulle intestazioni. */
export function vociColonne(c: StatoVista['colonne']): VoceMenu[] {
	return [
		{ azione: 'colonnaTipo', etichetta: 'Tipo', spunta: c.tipo },
		{ azione: 'colonnaDimensione', etichetta: 'Dimensione', spunta: c.dimensione },
		{ azione: 'colonnaData', etichetta: 'Data di modifica', spunta: c.data }
	];
}

export interface StatoAspetto {
	tema: string;
	accento: IdAccento;
	/** Il colore personalizzato, mostrato nel suo campione. */
	coloreAccento?: string;
	animazioneAvvio?: boolean;
	/** Secondi fra un passaggio del treno e il successivo; -1 mai. */
	pausaTreno?: number;
	personali?: readonly Tema[];
}

/** Le pause fra un passaggio e l'altro che si possono scegliere, in secondi. */
export const PAUSE_TRENO: ReadonlyArray<[number, string]> = [
	[0, 'Di continuo'],
	[15, 'Ogni 15 secondi'],
	[30, 'Ogni 30 secondi'],
	[60, 'Ogni minuto'],
	[120, 'Ogni 2 minuti'],
	[300, 'Ogni 5 minuti'],
	[600, 'Ogni 10 minuti'],
	[-1, 'Solo durante i trasferimenti']
];

/** Il menu «Aspetto»: temi di colore, mondi, temi propri, accento, editor. */
export function vociAspetto(s: StatoAspetto): VoceMenu[] {
	const voce = (t: Tema, i: number, sezione: string): VoceMenu => ({
		azione: `tema:${t.id}` as AzioneMenu,
		etichetta: t.nome,
		spunta: s.tema === t.id,
		sezione: i === 0 ? sezione : undefined,
		stacca: i === 0
	});
	return [
		...TEMI.filter((t) => t.gruppo === 'colori').map((t, i) => voce(t, i, 'Colori')),
		...TEMI.filter((t) => t.gruppo === 'mondo').map((t, i) => voce(t, i, 'Mondi: forme e personaggi')),
		...(s.personali ?? []).map((t, i) => voce(t, i, 'I tuoi temi')),
		{
			azione: 'accento',
			etichetta: 'Colore d’evidenziazione',
			stacca: true,
			tavolozza: ACCENTI.map((a) => ({
				azione: `accento:${a.id}` as AzioneMenu,
				nome: a.nome,
				colore: a.id === 'personalizzato' ? (s.coloreAccento ?? null) : a.colore,
				attivo: s.accento === a.id,
				personalizzato: a.id === 'personalizzato'
			}))
		},
		{ azione: 'editorTemi', etichetta: 'Crea o modifica un tema…', stacca: true },
		{
			azione: 'animazioneAvvio',
			etichetta: 'Animazione all’avvio',
			spunta: s.animazioneAvvio ?? false
		},
		...PAUSE_TRENO.map(
			([secondi, etichetta], i): VoceMenu => ({
				azione: `pausa:${secondi}` as AzioneMenu,
				etichetta,
				spunta: (s.pausaTreno ?? 30) === secondi,
				sezione: i === 0 ? 'Passaggi del treno e dei personaggi' : undefined,
				stacca: i === 0
			})
		)
	];
}

/**
 * Posizione del menu perché resti dentro la finestra.
 *
 * Aprendolo vicino al bordo destro o in basso, un menu piazzato al puntatore
 * finirebbe fuori schermo e diventerebbe irraggiungibile.
 */
export function posizionaMenu(
	x: number,
	y: number,
	menu: { larghezza: number; altezza: number },
	finestra: { larghezza: number; altezza: number },
	margine = 8
): { x: number; y: number } {
	const maxX = finestra.larghezza - menu.larghezza - margine;
	const maxY = finestra.altezza - menu.altezza - margine;

	return {
		x: Math.max(margine, Math.min(x, maxX)),
		y: Math.max(margine, Math.min(y, maxY))
	};
}
