/**
 * Come si muove una voce del corteo sul binario.
 *
 * - `cammina`: sfila insieme agli altri, da sinistra a destra (com'è sempre
 *   stato, e com'è senza indicazioni).
 * - `fermo`: resta in un punto del binario e si anima sul posto, per esempio
 *   un combattimento in corso.
 * - `attraversa`: parte da un punto e va da solo fino in fondo, per esempio
 *   un'onda di energia lanciata da un personaggio fermo.
 *
 * Fermo e attraversa possono comparire solo durante un passaggio, coi loro
 * tempi, oppure restare `continuo`: sempre in scena, e chi attraversa
 * riparte all'infinito, con una pausa a scelta fra un giro e l'altro.
 *
 * Nel corteo il movimento precede la voce: `mov:{json}|img:C:\…` oppure
 * `mov:{json}|sprite:{…}`. Le voci senza prefisso camminano.
 */

export type TipoMovimento = 'cammina' | 'fermo' | 'attraversa';
export type Verso = 'destra' | 'sinistra';

export interface Movimento {
	tipo: TipoMovimento;
	/** Dove sta (fermo) o da dove parte (attraversa): 0 bordo sinistro, 100 destro. */
	posizione: number;
	/** Secondi prima di comparire: dall'inizio del passaggio, o dall'apertura se continuo. */
	ritardo: number;
	/**
	 * Secondi: quanto resta in scena (fermo) o quanto ci mette ad arrivare
	 * (attraversa). Fermo e continuo non ne ha: resta sempre.
	 */
	durata: number;
	/** Sempre in scena, fuori dai passaggi; chi attraversa ricomincia all'infinito. */
	continuo: boolean;
	/** Secondi d'attesa fra un giro e l'altro di chi attraversa in continuo. */
	pausa: number;
	/** Verso dove va chi attraversa. */
	verso: Verso;
	/** Disegnato allo specchio, rivolto dall'altra parte. */
	specchia: boolean;
	/** Pixel sopra il binario: un'onda all'altezza delle mani, un uccello in volo. */
	altezza: number;
}

const EXTRA = { continuo: false, pausa: 0, verso: 'destra' as Verso, specchia: false, altezza: 0 };

export const CAMMINA: Movimento = { tipo: 'cammina', posizione: 0, ritardo: 0, durata: 0, ...EXTRA };

/**
 * I valori con cui si parte scegliendo un tipo di movimento: in loop, come
 * si anima di solito uno sprite. Le voci salvate prima, senza `continuo`,
 * restano legate ai passaggi.
 */
export function movimentoPredefinito(tipo: TipoMovimento): Movimento {
	if (tipo === 'fermo') return { tipo, posizione: 50, ritardo: 0, durata: 8, ...EXTRA, continuo: true };
	if (tipo === 'attraversa') return { tipo, posizione: 0, ritardo: 0, durata: 4, ...EXTRA, continuo: true };
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
		durata: limita(m.durata, 0.5, 120, base.durata),
		continuo: m.continuo === true,
		pausa: limita(m.pausa, 0, 120, 0),
		verso: m.verso === 'sinistra' ? 'sinistra' : 'destra',
		specchia: m.specchia === true,
		altezza: Math.round(limita(m.altezza, 0, 200, 0))
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
export function conMovimento(voce: string, m: Partial<Movimento>): string {
	const n = normalizzaMovimento(m);
	if (n.tipo === 'cammina') return voce;
	return `${PREFISSO}${JSON.stringify(n)}|${voce}`;
}

/**
 * Secondi dall'inizio del passaggio a quando la voce è uscita di scena.
 * Chi cammina va col convoglio, chi è continuo non fa parte dei passaggi.
 */
export function fineInScena(m: Movimento): number {
	return m.tipo === 'cammina' || m.continuo ? 0 : m.ritardo + m.durata;
}

/**
 * Le chiavi dell'animazione di chi attraversa in continuo: il viaggio occupa
 * la prima parte del giro, la pausa il resto, nascosto. In CSS perché la
 * proporzione cambia voce per voce.
 */
export function giroContinuo(nome: string, m: Movimento): string {
	const giro = m.durata + m.pausa;
	const arrivo = Math.min(100, (m.durata / giro) * 100);
	const partenza = 'translateX(calc(var(--da) * (100cqw - 100%) / 100))';
	const fondo = m.verso === 'sinistra' ? 'translateX(calc(-100% - 20px))' : 'translateX(calc(100cqw + 20px))';
	const fine =
		arrivo < 100
			? `${(arrivo + 0.01).toFixed(3)}%,100%{visibility:hidden;transform:${fondo}}`
			: '';
	return `@keyframes ${nome}{0%{visibility:visible;transform:${partenza}}${arrivo.toFixed(3)}%{visibility:visible;transform:${fondo}}${fine}}`;
}
