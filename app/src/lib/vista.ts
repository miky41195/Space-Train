/**
 * Viste della lista come in Esplora risorse di Windows 11.
 *
 * Le icone non hanno taglie fisse: il lato va da 16 a 256 pixel e si cambia
 * con Ctrl+rotella o col cursore nella barra di stato. Le voci «Icone
 * grandi», «medie» ecc. del menu sono solo scorciatoie verso un lato.
 */

export type Vista = 'dettagli' | 'elenco' | 'riquadri' | 'contenuto' | 'icone';

export const LATO_MIN = 16;
export const LATO_MAX = 256;

/** Le taglie con un nome, come nel menu Visualizza di Windows. */
export const TAGLIE = [
	{ nome: 'Icone molto grandi', lato: 256 },
	{ nome: 'Icone grandi', lato: 128 },
	{ nome: 'Icone medie', lato: 64 },
	{ nome: 'Icone piccole', lato: 24 }
] as const;

export interface StatoVista {
	vista: Vista;
	/** Lato delle icone in vista «icone». Ignorato dalle altre viste. */
	lato: number;
}

export function limita(lato: number): number {
	return Math.round(Math.min(LATO_MAX, Math.max(LATO_MIN, lato)));
}

/**
 * Un colpo di Ctrl+rotella. Come in Windows: dentro le icone il lato cresce
 * o cala del 15%; sotto le icone più piccole si passa a Elenco e poi a
 * Dettagli, e da lì risalendo si torna alle icone.
 */
export function zoom(s: StatoVista, verso: 1 | -1): StatoVista {
	if (verso > 0) {
		if (s.vista === 'dettagli') return { vista: 'elenco', lato: s.lato };
		if (s.vista !== 'icone') return { vista: 'icone', lato: LATO_MIN };
		return { vista: 'icone', lato: limita(Math.max(s.lato + 2, s.lato * 1.15)) };
	}
	if (s.vista === 'icone') {
		if (s.lato <= LATO_MIN) return { vista: 'elenco', lato: LATO_MIN };
		return { vista: 'icone', lato: limita(Math.min(s.lato - 2, s.lato / 1.15)) };
	}
	if (s.vista === 'elenco') return { vista: 'dettagli', lato: s.lato };
	if (s.vista === 'riquadri' || s.vista === 'contenuto') return { vista: 'elenco', lato: s.lato };
	return s;
}

/** Come sono fatte le celle di una vista a griglia. */
export interface MisuraCella {
	larghezza: number;
	altezza: number;
	/** Lato dell'immagine dentro la cella. */
	icona: number;
	/** Icona accanto al nome invece che sopra. */
	orizzontale: boolean;
	/** Una cella sola per riga, larga quanto la lista. */
	piena: boolean;
	/** Mostra tipo, dimensione e data accanto al nome. */
	dettagli: boolean;
}

/** Sotto questo lato le icone stanno accanto al nome, come «Icone piccole». */
const SOGLIA_ORIZZONTALE = 40;

export function misuraCella(s: StatoVista): MisuraCella {
	switch (s.vista) {
		case 'elenco':
			return { larghezza: 240, altezza: 28, icona: 16, orizzontale: true, piena: false, dettagli: false };
		case 'riquadri':
			return { larghezza: 280, altezza: 72, icona: 48, orizzontale: true, piena: false, dettagli: true };
		case 'contenuto':
			return { larghezza: 0, altezza: 64, icona: 40, orizzontale: true, piena: true, dettagli: true };
		default: {
			const lato = limita(s.lato);
			if (lato < SOGLIA_ORIZZONTALE) {
				return {
					larghezza: 200 + lato,
					altezza: lato + 12,
					icona: lato,
					orizzontale: true,
					piena: false,
					dettagli: false
				};
			}
			// Il nome sta sotto su due righe: la cella cresce con l'icona ma
			// non scende sotto una larghezza in cui un nome ci stia.
			return {
				larghezza: Math.max(96, lato + 32),
				altezza: lato + 56,
				icona: lato,
				orizzontale: false,
				piena: false,
				dettagli: false
			};
		}
	}
}

/** Il nome della taglia corrente, se coincide con una del menu. */
export function nomeTaglia(s: StatoVista): string | null {
	if (s.vista !== 'icone') return null;
	return TAGLIE.find((t) => t.lato === s.lato)?.nome ?? null;
}
