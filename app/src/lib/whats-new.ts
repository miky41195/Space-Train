/**
 * What changes in each version, shown only once at the first opening after
 * an update.
 *
 * For a new release an entry goes on top, with the version `npm run
 * release` will publish: whoever updates sees every version they skipped,
 * newest first.
 */

export interface WhatsNew {
	version: string;
	items: string[];
}

export const WHATS_NEW: WhatsNew[] = [
	{
		version: '0.10.1',
		items: [
			'Aggiornamenti dentro l’app: lo scaricamento si vede in una barra in alto, e l’installazione non apre più la finestra dell’installer. Space Train si chiude e si riapre da solo già aggiornato (da questo aggiornamento in poi).',
			'Nelle finestre «Somma di controllo» e «Converti e ridimensiona» il pulsante scelto torna evidenziato.',
			'Nella Pulizia disco il Cestino conta di nuovo gli «elementi».'
		]
	},
	{
		version: '0.10.0',
		items: [
			'Modifica veloce dei testi: clic destro su un file di testo (txt, md, json, codice, configurazioni…) e «Modifica» lo apre in un editor. Ctrl+S salva mantenendo gli a capo del file; se nel frattempo un altro programma l’ha cambiato, Space Train chiede prima di sovrascrivere. Chiudendo con modifiche non salvate chiede cosa fare.',
			'Terminale integrato: Ctrl+Maiusc+T (o «Apri nel terminale integrato» dal menu di una cartella) apre un terminale sotto la lista, già nella cartella in cui sei. Si allunga trascinando il bordo in alto; «Vai alla cartella aperta» lo porta dove sei arrivato.',
			'Guida di benvenuto: alla prima apertura dopo l’installazione, poche schermate mostrano le cose principali. Si salta con un clic o con Esc, e si ritrova nella palette.',
			'Pulizia disco: la nuova categoria «Resti di programmi» trova le cartelle in Programmi e ProgramData lasciate da programmi non più installati. Un programma rimosso a metà, il cui programma di disinstallazione non esiste più, compare come «già rimosso» con «Togli i resti». Tutto va nel Cestino, e Windows chiede il permesso di amministratore.',
			'Corretta l’animazione all’avvio del treno, che muoveva tutto lo schermo invece del solo treno.'
		]
	},
	{
		version: '0.9.0',
		items: [
			'Pulizia disco: dal menu di un disco in Questo PC (o dalla palette) si vede cosa occupa spazio e si può togliere: file temporanei, cache dei programmi, cartelle di compilazione dei progetti, modelli di IA scaricati, vecchi download e Cestino. Ciò che si ricrea da solo si elimina, ciò che va guardato finisce nel Cestino e non è mai spuntato in partenza. In fondo, i programmi più grandi con il pulsante «Disinstalla».',
			'Rinomina con i dati di foto e musica: nella rinomina multipla si inseriscono [Data], [Ora], [Anno], [Fotocamera], [Artista], [Album], [Titolo], [Traccia] e [Nome]. Se a un file manca un dato resta com’è, e l’anteprima lo dice.',
			'Confronto fra due file: con due file selezionati, «Confronta i due file» li mette affiancati. Nei testi le differenze sono evidenziate e F7 passa alla successiva; le immagini si confrontano trascinando il confine; gli altri file si dicono uguali o diversi.',
			'Cartelle che crescono: «Analizza spazio» ricorda le misure precedenti e mostra quanto è cresciuta ogni cartella, con «Ordina per crescita».',
			'Promemoria disco pieno: quando un disco scende sotto la quota libera scelta nelle impostazioni (10% in partenza), una banda propone la Pulizia disco. «Non ora» la rimanda di una settimana.'
		]
	},
	{
		version: '0.8.0',
		items: [
			'Server remoti: dalla barra laterale, «Aggiungi server» collega un server SFTP, FTP, FTPS o WebDAV, che si sfoglia come una cartella: si apre, si copia, si incolla o si trascina dentro, si rinomina e si eliminano file. La password può restare nel Gestore credenziali di Windows; al primo collegamento SFTP si conferma l’impronta del server, e se cambia Space Train si ferma.',
			'Cassaforte: «Nuovo → Cassaforte…» crea una cartella cifrata con una password. Si apre come un archivio, ci si trascinano dentro i file e si richiude da sola dopo qualche minuto (il tempo si sceglie nelle impostazioni). Dentro sono cifrati anche i nomi. Senza la password i file non si possono recuperare.',
			'Regole automatiche: dal menu di una cartella, «Regole automatiche…» mette in ordine da sola, per esempio spostando i PDF che arrivano in Download o mandando nel cestino i file più vecchi di 30 giorni. Prima di salvare si vede su quali file agirebbe; niente viene sovrascritto e ogni azione si può annullare.',
			'Aree di lavoro: il pulsante prima delle schede salva le schede aperte (e il doppio pannello) con un nome, per tornarci con un clic.',
			'Foto, video e musica: nelle cartelle che ne contengono soprattutto compaiono colonne come «Scattata il», «Durata», «Dimensioni», «Artista» e «Album», e si può ordinare per queste. Dal clic destro sulle intestazioni si scelgono a mano; l’anteprima mostra tutti i dettagli.',
			'Stato Git: nelle cartelle dei progetti i file modificati e nuovi hanno una lettera accanto all’icona, quelli ignorati sono più chiari e il ramo compare dopo il percorso. Si spegne dalle impostazioni.',
			'Le etichette colorate si possono rinominare: clic destro sull’etichetta nella barra laterale.'
		]
	},
	{
		version: '0.7.0',
		items: [
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
		version: '0.6.0',
		items: [
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
		version: '0.5.1',
		items: [
			'Trova duplicati mostra in cima quanti gruppi di copie ha trovato e quanto spazio si può recuperare.',
			'«Seleziona le copie in più» seleziona tutte le copie tranne la più vecchia di ogni gruppo: poi Canc le sposta nel Cestino.',
			'Nella barra dell’indirizzo i duplicati sono una fermata dopo la cartella: un clic sulla cartella torna al suo contenuto.'
		]
	},
	{
		version: '0.5.0',
		items: [
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
		version: '0.4.0',
		items: [
			'Anche l’eliminazione ha la sua barra di avanzamento: spostare nel cestino, eliminare definitivamente e svuotare il cestino mostrano quanti elementi mancano, e si possono annullare a metà.',
			'Space Train arriva su Linux: dischi e chiavette montati, cartelle personali, cestino del sistema e apertura dei file con il programma predefinito.'
		]
	},
	{
		version: '0.3.0',
		items: [
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
		version: '0.2.6',
		items: [
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
		version: '0.2.5',
		items: [
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
		version: '0.2.4',
		items: [
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
		version: '0.2.3',
		items: [
			'Rete locale → «Aggiungi PC per indirizzo»: raggiungi un PC fuori casa attraverso una VPN come Tailscale, scrivendo il suo IP o il suo nome.',
			'Basta che uno dei due PC aggiunga l’altro: la risposta torna da sola.',
			'I file di una cartella condivisa da un altro PC si possono trascinare sul desktop o in Esplora.',
			'Editor dei temi: ogni immagine o spritesheet del corteo può camminare con gli altri, restare ferma in un punto del binario o attraversarlo da sola fino in fondo, con ritardo e durata a scelta.',
			'Se il PC aggiunto resta in attesa, controlla che Space Train sia consentito nel firewall di Windows anche per la rete della VPN.'
		]
	},
	{
		version: '0.2.2',
		items: [
			'L’editor dei temi si sposta trascinandolo per la testata: scostalo per vedere il tema applicato dietro.',
			'L’anteprima di uno spritesheet nell’editor non fa più muovere i campi accanto mentre si anima.'
		]
	},
	{
		version: '0.2.1',
		items: [
			'Selezione col rettangolo più precisa: resta dentro la lista e non perde le voci che escono dallo schermo.',
			'Nella vista dettagli il rettangolo parte anche dalla parte vuota di una riga; il file si trascina per icona o nome.',
			'Nell’editor degli spritesheet i fotogrammi si agganciano ai vicini con le linee guida (Alt per muoverli liberi).'
		]
	},
	{
		version: '0.2.0',
		items: [
			'Clic sul vuoto per togliere la selezione, e selezione trascinando col tasto sinistro.',
			'Visualizza → All’apertura: riprendi le schede della volta scorsa.',
			'Clic destro su una cartella → Apri sempre all’avvio.',
			'Le cartelle fissate stanno nella barra laterale, accanto a Documenti e Download.',
			'Space Train si apre anche dai programmi che chiedono di aprire una cartella.'
		]
	}
];

/** Comparison between `a.b.c` versions: negative when `a` comes before `b`. */
export function compareVersions(a: string, b: string): number {
	const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
	const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d !== 0) return d;
	}
	return 0;
}

/**
 * The news to show: the ones of the versions after `seen` up to `current`,
 * newest first.
 *
 * `seen` is the last version whose news the user already saw. Without it,
 * `alreadyUsed` counts: whoever already had the app (updated from a version
 * that did not show them yet) sees the current version's; whoever installs
 * it now for the first time sees nothing, it is all new.
 */
export function whatsNewToShow(
	seen: string | null,
	current: string,
	alreadyUsed: boolean,
	list: readonly WhatsNew[] = WHATS_NEW
): WhatsNew[] {
	if (seen === null) {
		return alreadyUsed ? list.filter((n) => compareVersions(n.version, current) === 0) : [];
	}
	return list
		.filter((n) => compareVersions(n.version, seen) > 0 && compareVersions(n.version, current) <= 0)
		.sort((a, b) => compareVersions(b.version, a.version));
}
