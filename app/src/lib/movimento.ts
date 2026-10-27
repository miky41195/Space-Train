/**
 * Come si muove una voce del corteo sul binario.
 *
 * - `cammina`: sfila insieme agli altri, da sinistra a destra (com'è sempre
 *   stato, e com'è senza indicazioni).
 * - `fermo`: resta in un punto del binario e si anima sul posto, per esempio
 *   un combattimento in corso.
 * - `attraversa`: parte da un punto e va da solo fino in fondo a destra, per
 *   esempio un'onda di energia lanciata da un personaggio fermo.
 *
 * Nel corteo il movimento precede la voce: `mov:{json}|img:C:\…` oppure
 * `mov:{json}|sprite:{…}`. Le voci senza prefisso camminano.
 */

export type TipoMovimento = 'cammina' | 'fermo' | 'attraversa';

export interface Movimento {
	tipo: TipoMovimento;
	/** Dove sta (fermo) o da dove parte (attraversa): 0 bordo sinistro, 100 destro. */
	posizione: number;
	/** Secondi dall'inizio del passaggio prima di comparire. */
	ritardo: number;
	/** Secondi: quanto resta in scena (fermo) o quanto ci mette ad arrivare (attraversa). */
	durata: number;
}

export const CAMMINA: Movimento = { tipo: 'cammina', posizione: 0, ritardo: 0, durata: 0 };

/** I valori con cui si parte scegliendo un tipo di movimento. */
export function movimentoPredefinito(tipo: TipoMovimento): Movimento {
	if (tipo === 'fermo') return { tipo, posizione: 50, ritardo: 0, durata: 8 };
	if (tipo === 'attraversa') return { tipo, posizione: 0, ritardo: 0, durata: 4 };
	return CAMMINA;
}

const PREFISSO = 'mov:';
const SEPARATORE = '}|';

function limita(n: unknown, min: number, max: number, riserva: number): number {
	const v = Number(n);
	return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : riserva;
}

/** Riporta i numeri dentro limiti sensati. */
export function normalizzaMovimento(m: Partial<Movimento>): Movimento {
	const tipo: TipoMovimento = m.tipo === 'fermo' || m.tipo === 'attraversa' ? m.tipo : 'cammina';
	if (tipo === 'cammina') return CAMMINA;
	const base = movimentoPredefinito(tipo);
	return {
		tipo,
		posizione: Math.round(limita(m.posizione, 0, 100, base.posizione)),
		ritardo: limita(m.ritardo, 0, 60, base.ritardo),
		durata: limita(m.durata, 0.5, 120, base.durata)
	};
}

/** Separa una voce del corteo nel suo movimento e in ciò che mostra. */
export function leggiMovimento(voce: string): { movimento: Movimento; voce: string } {
	if (!voce.startsWith(PREFISSO)) return { movimento: CAMMINA, voce };
	const fine = voce.indexOf(SEPARATORE);
	if (fine === -1) return { movimento: CAMMINA, voce };
	try {
		const m = JSON.parse(voce.slice(PREFISSO.length, fine + 1)) as Partial<Movimento>;
		return { movimento: normalizzaMovimento(m), voce: voce.slice(fine + SEPARATORE.length) };
	} catch {
		return { movimento: CAMMINA, voce: voce.slice(fine + SEPARATORE.length) };
	}
}

/** La voce del corteo col suo movimento; chi cammina resta senza prefisso. */
export function conMovimento(voce: string, m: Movimento): string {
	const n = normalizzaMovimento(m);
	if (n.tipo === 'cammina') return voce;
	return `${PREFISSO}${JSON.stringify(n)}|${voce}`;
}

/** Secondi dall'inizio del passaggio a quando la voce è uscita di scena. */
export function fineInScena(m: Movimento): number {
	return m.tipo === 'cammina' ? 0 : m.ritardo + m.durata;
}
