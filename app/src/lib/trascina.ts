/** Pixel di movimento oltre i quali una pressione diventa un trascinamento. */
export const SOGLIA_TRASCINA = 5;

/**
 * Da chiamare su mousedown: se il puntatore si sposta oltre la soglia con
 * il pulsante ancora premuto, chiama `avvia` una volta sola.
 *
 * Senza soglia ogni clic un po' tremolante partirebbe come trascinamento
 * e la selezione non funzionerebbe più.
 */
export function seTrascina(inizio: MouseEvent, avvia: () => void): void {
	if (inizio.button !== 0) return;
	const x0 = inizio.clientX;
	const y0 = inizio.clientY;

	function muovi(e: MouseEvent) {
		if ((e.buttons & 1) === 0) return fine();
		if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < SOGLIA_TRASCINA) return;
		fine();
		avvia();
	}

	function fine() {
		window.removeEventListener('mousemove', muovi);
		window.removeEventListener('mouseup', fine);
	}

	window.addEventListener('mousemove', muovi);
	window.addEventListener('mouseup', fine);
}

/** How long the pointer rests on an item before one-click mode selects it. */
export const HOVER_SELECT_MS = 500;

// One timer for the whole page: the pointer rests on one item at a time.
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Explorer's "point to select" for one-click mode: resting on an item selects
 * it. Skipped while a button is down (drag or selection rectangle).
 */
export function hoverSelect(e: MouseEvent, select: () => void): void {
	clearTimeout(hoverTimer);
	if (e.buttons !== 0) return;
	hoverTimer = setTimeout(select, HOVER_SELECT_MS);
}

export function cancelHoverSelect(): void {
	clearTimeout(hoverTimer);
}
