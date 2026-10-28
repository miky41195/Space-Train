/**
 * L'editor dei temi in una finestra sua.
 *
 * La finestra dell'editor non tocca le impostazioni: dice a quella che l'ha
 * aperto cosa succede (anteprima, salva, elimina) e lei fa il resto, come
 * quando l'editor stava dentro di lei. Si chiude da sé; la chiusura la
 * annuncia Rust, così arriva anche con Alt+F4.
 */
import type { TemaPersonale } from './temi';

/** Nome dell'evento, uguale all'etichetta della finestra in Rust. */
export const EVENTO_EDITOR = 'editor-temi';

export type MessaggioEditor =
	| { tipo: 'anteprima'; tema: TemaPersonale }
	| { tipo: 'salva'; tema: TemaPersonale }
	| { tipo: 'elimina'; id: string }
	| { tipo: 'chiudi' };

/** La finestra da avvisare, se questa pagina è l'editor dei temi. */
export function finestraDaAvvisare(): string | null {
	const da = (window as unknown as { __SPACE_TRAIN_EDITOR?: unknown }).__SPACE_TRAIN_EDITOR;
	return typeof da === 'string' && da ? da : null;
}
