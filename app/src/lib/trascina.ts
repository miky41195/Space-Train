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
