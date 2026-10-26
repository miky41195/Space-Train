export interface Match {
	score: number;
	/** Indici dei caratteri del nome che corrispondono alla query. */
	positions: number[];
}

/** Il carattere continua la catena iniziata dal precedente. */
const BONUS_CATENA = 16;
/** Il carattere apre una parola: dopo un separatore o su maiuscola camelCase. */
const BONUS_INIZIO_PAROLA = 10;
/** Il match parte dal primo carattere del nome. */
const BONUS_PRIMO_CARATTERE = 8;
/** Il nome coincide esattamente con la query. */
const BONUS_ESATTO = 50;

const PENALITA_SALTO = 1;
/** Oltre questa soglia i salti non peggiorano più: un nome lungo non è un errore. */
const PENALITA_SALTO_MAX = 20;

const SEPARATORI = new Set(['_', '-', '.', ' ', '(', ')', '[', ']']);

function inizioParola(target: string, i: number): boolean {
	if (i === 0) return true;

	const prec = target[i - 1];
	if (SEPARATORI.has(prec)) return true;

	// camelCase: minuscola seguita da maiuscola.
	const cur = target[i];
	const precMinuscola = prec === prec.toLowerCase() && prec !== prec.toUpperCase();
	const curMaiuscola = cur === cur.toUpperCase() && cur !== cur.toLowerCase();
	return precMinuscola && curMaiuscola;
}

/**
 * Cerca `query` dentro `target` come sottosequenza, dal primo carattere utile.
 *
 * La scansione è greedy: prende sempre la prima occorrenza disponibile invece
 * di esplorare tutte le combinazioni. Per nomi di file — corti e con
 * separatori chiari — dà lo stesso risultato di una ricerca esaustiva a una
 * frazione del costo, e resta sotto il millisecondo su migliaia di voci.
 *
 * Restituisce `null` se i caratteri non ci sono, o non nell'ordine giusto.
 */
export function fuzzyMatch(query: string, target: string): Match | null {
	if (query === '') return { score: 0, positions: [] };

	const q = query.toLowerCase();
	const t = target.toLowerCase();

	const positions: number[] = [];
	let score = 0;
	let da = 0;
	let saltati = 0;
	let precedente = -2;

	for (const carattere of q) {
		const trovato = t.indexOf(carattere, da);
		if (trovato === -1) return null;

		saltati += trovato - da;

		if (trovato === precedente + 1) score += BONUS_CATENA;
		if (inizioParola(target, trovato)) score += BONUS_INIZIO_PAROLA;
		if (trovato === 0) score += BONUS_PRIMO_CARATTERE;

		positions.push(trovato);
		precedente = trovato;
		da = trovato + 1;
	}

	score -= Math.min(saltati * PENALITA_SALTO, PENALITA_SALTO_MAX);
	if (t === q) score += BONUS_ESATTO;

	return { score, positions };
}

export interface Risultato<T> {
	item: T;
	positions: number[];
}

/**
 * Filtra e riordina per pertinenza. A parità di punteggio vince il nome più
 * corto: fra due match equivalenti, quello che "riempie" meglio la query.
 *
 * Con query vuota restituisce tutto nell'ordine originale — cioè quello
 * deciso da Rust, cartelle prima.
 */
export function filterEntries<T extends { name: string }>(
	entries: T[],
	query: string
): Risultato<T>[] {
	if (query.trim() === '') {
		return entries.map((item) => ({ item, positions: [] }));
	}

	const trovati: Array<Risultato<T> & { score: number }> = [];

	for (const item of entries) {
		const m = fuzzyMatch(query, item.name);
		if (m !== null) {
			trovati.push({ item, positions: m.positions, score: m.score });
		}
	}

	trovati.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length);

	return trovati.map(({ item, positions }) => ({ item, positions }));
}
