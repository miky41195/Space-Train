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
		versione: '0.2.4',
		voci: [
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
