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
