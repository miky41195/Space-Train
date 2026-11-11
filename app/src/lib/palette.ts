import { fuzzyMatch } from './fuzzy';

export type TipoComando = 'azione' | 'cartella' | 'ricerca' | 'tema' | 'impostazione';

export const ETICHETTE_TIPO: Record<TipoComando, string> = {
	azione: 'Azione',
	cartella: 'Cartella',
	ricerca: 'Ricerca',
	tema: 'Tema',
	impostazione: 'Impostaz.'
};

/** One line of the command palette. */
export interface Comando {
	tipo: TipoComando;
	nome: string;
	/** Second, dimmer text: a path, the current state of a setting. */
	dettaglio?: string;
	/** The shortcut that does the same, shown at the right. */
	tasti?: string;
	esegui: () => void;
}

export interface Trovato {
	comando: Comando;
	/** Characters of `nome` to highlight. */
	posizioni: number[];
}

/**
 * The commands matching `testo`, best first; with no text, the first ones
 * in the order given (actions first). Ties keep the given order.
 */
export function filtraComandi(comandi: Comando[], testo: string, massimo = 12): Trovato[] {
	const q = testo.trim();
	if (q === '') return comandi.slice(0, massimo).map((comando) => ({ comando, posizioni: [] }));
	return comandi
		.map((comando, i) => ({ comando, i, m: fuzzyMatch(q, comando.nome) }))
		.filter((x) => x.m !== null)
		.sort((a, b) => b.m!.score - a.m!.score || a.i - b.i)
		.slice(0, massimo)
		.map((x) => ({ comando: x.comando, posizioni: x.m!.positions }));
}
