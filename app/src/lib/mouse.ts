/**
 * History action tied to a mouse button.
 *
 * The two side buttons are standardised in `MouseEvent.button`:
 * 3 = back, 4 = forward. The other buttons do not touch the history.
 */
export type HistoryAction = 'back' | 'forward';

export function historyActionFor(button: number): HistoryAction | null {
	if (button === 3) return 'back';
	if (button === 4) return 'forward';
	return null;
}
