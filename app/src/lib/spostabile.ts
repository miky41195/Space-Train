/**
 * Rende spostabile una finestra di dialogo trascinandola per la testata,
 * così si può scostare e guardare cosa c'è dietro (l'anteprima di un tema).
 *
 * Si attacca alla finestra; `maniglia` è il selettore della parte da cui la
 * si prende. I pulsanti e i campi dentro la maniglia restano cliccabili.
 * La finestra non può uscire dallo schermo oltre la testata: deve sempre
 * restare un pezzo da cui riprenderla.
 */

/** Quanto della testata deve restare a schermo, in pixel. */
const MARGINE = 48;

/** Lo spostamento consentito perché il rettangolo `r` resti raggiungibile. */
export function limitaSpostamento(
	dx: number,
	dy: number,
	r: { left: number; top: number; width: number },
	schermo: { width: number; height: number }
): { dx: number; dy: number } {
	const minX = MARGINE - (r.left + r.width);
	const maxX = schermo.width - MARGINE - r.left;
	const minY = -r.top;
	const maxY = schermo.height - MARGINE - r.top;
	return { dx: Math.min(maxX, Math.max(minX, dx)), dy: Math.min(maxY, Math.max(minY, dy)) };
}

export function spostabile(finestra: HTMLElement, maniglia = 'header') {
	let x = 0;
	let y = 0;

	function giu(e: PointerEvent) {
		if (e.button !== 0) return;
		const bersaglio = e.target as HTMLElement;
		const presa = bersaglio.closest<HTMLElement>(maniglia);
		if (!presa || !finestra.contains(presa)) return;
		if (bersaglio.closest('button, input, select, textarea, a')) return;
		e.preventDefault();

		const partenza = { px: e.clientX, py: e.clientY, x, y };
		// Il rettangolo senza lo spostamento già fatto: i limiti si
		// calcolano dalla posizione d'origine.
		const b = finestra.getBoundingClientRect();
		const origine = { left: b.left - x, top: b.top - y, width: b.width };
		presa.setPointerCapture?.(e.pointerId);
		finestra.classList.add('in-spostamento');

		function muovi(m: PointerEvent) {
			const d = limitaSpostamento(
				partenza.x + m.clientX - partenza.px,
				partenza.y + m.clientY - partenza.py,
				origine,
				{ width: window.innerWidth, height: window.innerHeight }
			);
			x = d.dx;
			y = d.dy;
			finestra.style.translate = `${x}px ${y}px`;
		}

		function su() {
			presa!.removeEventListener('pointermove', muovi);
			presa!.removeEventListener('pointerup', su);
			presa!.removeEventListener('pointercancel', su);
			finestra.classList.remove('in-spostamento');
		}

		presa.addEventListener('pointermove', muovi);
		presa.addEventListener('pointerup', su);
		presa.addEventListener('pointercancel', su);
	}

	finestra.addEventListener('pointerdown', giu);
	return {
		destroy() {
			finestra.removeEventListener('pointerdown', giu);
		}
	};
}
