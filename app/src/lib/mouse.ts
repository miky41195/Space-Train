/**
 * Azione di cronologia associata a un pulsante del mouse.
 *
 * I due tasti laterali sono standardizzati in `MouseEvent.button`:
 * 3 = indietro, 4 = avanti. Gli altri pulsanti non toccano la cronologia.
 */
export type HistoryAction = 'back' | 'forward';

export function historyActionFor(button: number): HistoryAction | null {
	if (button === 3) return 'back';
	if (button === 4) return 'forward';
	return null;
}
