/**
 * Cosa cambia in ogni versione, mostrato una volta sola alla prima apertura
 * dopo un aggiornamento.
 *
 * Per una nuova release si aggiunge una voce in cima, con la versione che
 * `npm run rilascia` pubblicherà: chi aggiorna vede tutte le versioni che
 * ha saltato, dalla più recente.
 */

export interface Novita {
	versione: string;
	voci: string[];
}

export const NOVITA: Novita[] = [
	{
		versione: '0.7.0',
		voci: [
			'Coda dei trasferimenti: una copia lanciata mentre un’altra è in corso aspetta il suo turno. «+1 in coda» sulla barra apre l’elenco, dove si mette in pausa, si anticipa o si toglie un lavoro.',
			'Archivi 7z, RAR e TAR (oltre a ZIP) si aprono con un doppio clic come cartelle: si sfogliano, si apre un file e si estrae solo ciò che serve.',
			'Palette dei comandi: Ctrl+Maiusc+P cerca azioni, cartelle, temi e impostazioni scrivendo poche lettere.',
			'Anteprima più ricca: Markdown formattato, codice con i colori della sintassi, file CSV come tabella e contenuto degli archivi.',
			'Somma di controllo: dal menu di un file si calcola SHA-256, SHA-1 o MD5 e si confronta con il valore pubblicato da un sito.',
			'Strumenti per le immagini: «Ruota a destra/a sinistra» dal menu (Ctrl+Z la annulla) e «Converti e ridimensiona…» in JPG, PNG o WebP, con i file nuovi accanto agli originali.',
			'Backup verso un amico: dalla finestra Amici una cartella resta allineata ogni giorno sul PC di un amico, mandando solo i file nuovi o cambiati e senza cancellare niente. L’amico accetta la prima volta, poi i backup arrivano da soli.',
			'Scorciatoie personalizzabili: in Impostazioni → Scorciatoie ogni azione si può cambiare. Prima di salvare si viene avvisati se la combinazione è già usata da Space Train, riservata da Windows o presa da un altro programma.',
			'Animazioni dei temi: nell’editor dei temi si sceglie l’animazione all’avvio (treno, corrente, pioggia di stelle o una figura a scelta) e una breve animazione all’apertura delle cartelle.',
			'Spostando nel Cestino o eliminando più elementi, un file bloccato non ferma più gli altri: alla fine si vede quali non è stato possibile eliminare e perché.',
			'Il treno e il binario non scattano più avanti e indietro mentre una cartella si carica.',
			'Nel doppio pannello ogni lato ricorda dove si era arrivati nell’elenco. Su Linux arrivano le miniature delle immagini e gli appunti condivisi con gli altri programmi.'
		]
	},
	{
		versione: '0.6.0',
		voci: [
			'Doppio pannello: Ctrl+Maiusc+D (o il pulsante nella barra dei comandi) mostra due cartelle affiancate. F6 passa da un lato all’altro, Ctrl+Maiusc+C e Ctrl+Maiusc+X copiano o spostano la selezione nell’altra cartella, e si può trascinare da un lato all’altro.',
			'Confronta due cartelle: dal menu di una cartella, «Confronta con…» mostra cosa manca da una parte, cosa manca dall’altra e quali file sono diversi. «Allinea» copia ciò che manca e le versioni più recenti, senza cancellare niente.',
			'Analizza spazio: dal menu di una cartella o di un disco, l’elenco si ordina per peso con una barra per ogni elemento, per trovare subito cosa occupa più spazio.',
			'Etichette colorate: anche i file possono avere un colore. Nella barra laterale il gruppo «Etichette» raccoglie tutti gli elementi di un colore, ovunque siano.',
			'Cartelle intelligenti: nella ricerca nelle sottocartelle si filtra per tipo, peso e data, anche senza scrivere niente. «Salva ricerca» la tiene nella barra laterale; «Modificati questa settimana» e «File oltre 1 GB» sono già pronte.',
			'La ricerca nel contenuto dei file mostra la riga in cui ha trovato il testo, con il testo evidenziato.',
			'Nei risultati di ricerca il nome del file resta leggibile anche quando la cartella è lunga.',
			'Protezione più stretta contro i contenuti esterni: l’app non carica script o immagini da internet.'
		]
	},
	{
		versione: '0.5.1',
		voci: [
			'Trova duplicati mostra in cima quanti gruppi di copie ha trovato e quanto spazio si può recuperare.',
			'«Seleziona le copie in più» seleziona tutte le copie tranne la più vecchia di ogni gruppo: poi Canc le sposta nel Cestino.',
			'Nella barra dell’indirizzo i duplicati sono una fermata dopo la cartella: un clic sulla cartella torna al suo contenuto.'
		]
	},
	{
		versione: '0.5.0',
		voci: [
			'Rinomina multipla: seleziona più file e premi F2 per dare a tutti un nome con un contatore (per esempio Vacanze_### diventa Vacanze_001, 002…) o per sostituire un pezzo di testo. L’anteprima mostra i nuovi nomi prima di confermare e Ctrl+Z li rimette come prima.',
			'Trova duplicati: dal menu di una cartella, «Trova duplicati qui» cerca nelle sottocartelle i file con lo stesso contenuto e li raggruppa, con lo spazio che si può recuperare.',
			'Ogni tema disegna le cartelle a modo suo: in pixel, a vagone, piatte o a contorno. Nell’editor dei temi si può scegliere lo stile, compresa l’icona di Windows.',
			'Il colore delle cartelle segue il tema e non cambia più insieme al colore d’evidenziazione.',
			'Nelle impostazioni c’è l’elenco di tutte le scorciatoie da tastiera, con una ricerca.',
			'Con l’apertura a un clic, fermare il puntatore su un file lo seleziona.',
			'La scorciatoia che riporta Space Train in primo piano da qualsiasi programma è ora Win+Maiusc+E: quella di prima intercettava AltGr+E e impediva di scrivere € ed é.'
		]
	},
	{
		versione: '0.4.0',
		voci: [
			'Anche l’eliminazione ha la sua barra di avanzamento: spostare nel cestino, eliminare definitivamente e svuotare il cestino mostrano quanti elementi mancano, e si possono annullare a metà.',
			'Space Train arriva su Linux: dischi e chiavette montati, cartelle personali, cestino del sistema e apertura dei file con il programma predefinito.'
		]
	},
	{
		versione: '0.3.0',
		voci: [
			'Quattro mondi nuovi con forme tutte loro: Cianografia, Abisso, Atlante e Orient Express, ognuno con i suoi personaggi sul binario.',
			'Nell’editor dei temi si scelgono anche gli angoli (arrotondati, smussati, a tacca, a pillola), la forma delle schede, il disegno del cielo e la cornice della finestra.',
			'I titoli hanno una dimensione propria, separata da quella del testo.',
			'I temi si scelgono da una galleria divisa per categorie, con un’anteprima dei colori di ciascuno.',
			'Tutte le impostazioni sono raccolte in una finestra sola, dall’ingranaggio in alto a destra.',
			'Impostazioni nuove: dimensione delle cartelle (per la cartella aperta o su richiesta), apertura con un clic, conferma prima del cestino disattivabile, cartella predefinita per i file ricevuti.',
			'Dimensioni e date dei file usano il carattere del testo invece di quello dei titoli.',
			'I menu aperti vicino al bordo della finestra non mandano più a capo le voci.'
		]
	},
	{
		versione: '0.2.6',
		voci: [
			'Tema Spazio rifinito: la corrente sul binario ha un nucleo di luce bianca, e dietro la testata scorre un cielo di stelle in pixel.',
			'Le posizioni della barra laterale sono fermate sul binario: quella in cui ti trovi si accende, un PC o un amico raggiungibile ha la fermata verde.',
			'Niente più vetro sfocato: testata, barra laterale, menu e finestre di conferma hanno superfici piene e più leggibili.',
			'Icone disegnate al posto dei simboli di testo, e date, dimensioni e conteggi in caratteri da orario ferroviario.',
			'Lo spazio libero dei dischi nella barra laterale si aggiorna anche quando lo cambiano altri programmi.',
			'Più sicurezza con gli altri PC: un file con un nome strano non può più avviare comandi, si apre solo il file chiesto e mai un programma, e i file nascosti della cartella condivisa non si possono scaricare.',
			'Il riquadro dei file in arrivo mostra il totale e i nomi reali di ciò che arriva.'
		]
	},
	{
		versione: '0.2.5',
		voci: [
			'L’editor dei temi si apre in una finestra sua: spostala dove vuoi e guarda il tema applicato nella finestra principale.',
			'Editor dei temi: «Sfondo» cambia davvero il colore di fondo, e la dimensione del testo si sceglie in pixel; le righe dell’elenco si adattano.',
			'Angoli della finestra puliti, senza il bordo squadrato di Windows.',
			'Nella vista dettagli una riga si trascina da qualunque punto; il rettangolo di selezione parte dallo spazio vuoto.',
			'Trascina una cartella nello spazio libero della barra delle schede per aprirla in una scheda nuova.',
			'I file ricevuti da un altro PC passano dall’antivirus di Windows e vengono segnati come scaricati da internet; quelli bloccati si saltano e gli altri arrivano comunque.',
			'Prima di accettare dei file in arrivo puoi scegliere in quale cartella salvarli.',
			'I programmi in una cartella condivisa da un altro PC non si avviano direttamente dalla rete: scaricali prima.',
			'Il tasto destro fuori dai campi di testo non mostra più il menu del browser.'
		]
	},
	{
		versione: '0.2.4',
		voci: [
			'Amici: scambia file e cartelle con altri PC ovunque siano, senza VPN né porte da aprire. Barra laterale → Aggiungi amici: dai il tuo codice (anche come QR) e incolla il loro.',
			'L’amicizia vale solo se confermata da entrambi; il collegamento è cifrato da un capo all’altro.',
			'Ogni amico vede la tua cartella condivisa solo se glielo permetti, e i file che ti manda vanno sempre accettati.',
			'Clic destro → Invia a un amico, come in rete locale.',
			'Editor dei temi: immagini e spritesheet fermi o che attraversano possono restare sempre in scena, in loop senza durata; chi attraversa riparte all’infinito, con una pausa a scelta fra un giro e l’altro.',
			'Nuove regolazioni per ogni voce del corteo: verso destra o sinistra, altezza dal binario e immagine allo specchio.',
			'Chi riceve file da un altro PC può annullare dalla barra d’avanzamento; chi invia viene avvisato.',
			'Un trasferimento interrotto non lascia file a metà nella cartella di arrivo.'
		]
	},
	{
		versione: '0.2.3',
		voci: [
			'Rete locale → «Aggiungi PC per indirizzo»: raggiungi un PC fuori casa attraverso una VPN come Tailscale, scrivendo il suo IP o il suo nome.',
			'Basta che uno dei due PC aggiunga l’altro: la risposta torna da sola.',
			'I file di una cartella condivisa da un altro PC si possono trascinare sul desktop o in Esplora.',
			'Editor dei temi: ogni immagine o spritesheet del corteo può camminare con gli altri, restare ferma in un punto del binario o attraversarlo da sola fino in fondo, con ritardo e durata a scelta.',
			'Se il PC aggiunto resta in attesa, controlla che Space Train sia consentito nel firewall di Windows anche per la rete della VPN.'
		]
	},
	{
		versione: '0.2.2',
		voci: [
			'L’editor dei temi si sposta trascinandolo per la testata: scostalo per vedere il tema applicato dietro.',
			'L’anteprima di uno spritesheet nell’editor non fa più muovere i campi accanto mentre si anima.'
		]
	},
	{
		versione: '0.2.1',
		voci: [
			'Selezione col rettangolo più precisa: resta dentro la lista e non perde le voci che escono dallo schermo.',
			'Nella vista dettagli il rettangolo parte anche dalla parte vuota di una riga; il file si trascina per icona o nome.',
			'Nell’editor degli spritesheet i fotogrammi si agganciano ai vicini con le linee guida (Alt per muoverli liberi).'
		]
	},
	{
		versione: '0.2.0',
		voci: [
			'Clic sul vuoto per togliere la selezione, e selezione trascinando col tasto sinistro.',
			'Visualizza → All’apertura: riprendi le schede della volta scorsa.',
			'Clic destro su una cartella → Apri sempre all’avvio.',
			'Le cartelle fissate stanno nella barra laterale, accanto a Documenti e Download.',
			'Space Train si apre anche dai programmi che chiedono di aprire una cartella.'
		]
	}
];

/** Confronto fra versioni `a.b.c`: negativo se `a` viene prima di `b`. */
export function confrontaVersioni(a: string, b: string): number {
	const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
	const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d !== 0) return d;
	}
	return 0;
}

/**
 * Le novità da mostrare: quelle delle versioni dopo `vista` fino a
 * `attuale`, dalla più recente.
 *
 * `vista` è l'ultima versione di cui l'utente ha già visto le novità.
 * Senza, conta `giaUsata`: chi aveva già l'app (aggiornata da una versione
 * che non le mostrava ancora) vede quelle della versione attuale; chi la
 * installa adesso per la prima volta non vede niente, è tutto nuovo.
 */
export function novitaDaMostrare(
	vista: string | null,
	attuale: string,
	giaUsata: boolean,
	elenco: readonly Novita[] = NOVITA
): Novita[] {
	if (vista === null) {
		return giaUsata ? elenco.filter((n) => confrontaVersioni(n.versione, attuale) === 0) : [];
	}
	return elenco
		.filter((n) => confrontaVersioni(n.versione, vista) > 0 && confrontaVersioni(n.versione, attuale) <= 0)
		.sort((a, b) => confrontaVersioni(b.versione, a.versione));
}
