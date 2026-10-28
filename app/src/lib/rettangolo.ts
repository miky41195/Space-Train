/**
 * Selezione col rettangolo e clic sul vuoto, come in Esplora.
 *
 * Si attacca alla viewport che scorre di una lista o di una griglia: premendo
 * il tasto sinistro sullo spazio vuoto e trascinando si disegna un
 * rettangolo, e sono selezionate le voci che tocca. Un clic sul vuoto senza
 * trascinare toglie la selezione.
 *
 * Le voci si riconoscono dall'attributo `data-voce` col loro path. Con le
 * liste virtualizzate contano solo quelle disegnate: lo scorrimento
 * automatico vicino ai bordi le porta a schermo man mano.
 */

export interface Riquadro {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Il rettangolo fra due punti, con larghezza e altezza mai negative. */
export function riquadroFra(x0: number, y0: number, x1: number, y1: number): Riquadro {
	return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function siToccano(a: Riquadro, b: Riquadro): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export interface OpzioniRettangolo {
	/** Si preme sul vuoto: la selezione di partenza va ricordata. */
	oninizio?: () => void;
	/** Le voci dentro il rettangolo; `aggiungi` se si teneva Ctrl o Maiusc. */
	oncambia: (paths: string[], aggiungi: boolean) => void;
	/** Clic sul vuoto senza trascinare e senza Ctrl: niente selezionato. */
	onvuoto: () => void;
}

/** Pixel oltre i quali la pressione diventa un rettangolo. */
const SOGLIA = 5;
/** Pixel di scorrimento massimi per fotogramma, col puntatore fuori dalla lista. */
const BORDO = 24;

export function selezioneRettangolo(nodo: HTMLElement, opzioni: OpzioniRettangolo) {
	let o = opzioni;

	function giu(e: MouseEvent) {
		if (e.button !== 0) return;
		const bersaglio = e.target as HTMLElement | null;
		if (!bersaglio || bersaglio.closest('input, button')) return;
		// Sopra una voce comandano lei e il trascinamento dei file: il
		// rettangolo parte solo dal vuoto.
		if (bersaglio.closest('[data-voce]')) return;
		const fuori = nodo.getBoundingClientRect();
		// Il clic sulla barra di scorrimento non è un clic sul vuoto.
		if (e.clientX - fuori.left >= nodo.clientWidth || e.clientY - fuori.top >= nodo.clientHeight) return;

		const aggiungi = e.ctrlKey || e.shiftKey;
		// I limiti del contenuto si misurano prima di disegnare: il rettangolo
		// sta dentro la viewport, e senza questi limiti la allungherebbe da sé,
		// facendola scorrere all'infinito.
		const limiteX = nodo.clientWidth;
		const limiteY = Math.max(nodo.scrollHeight, nodo.clientHeight);
		const contenuto = (cx: number, cy: number) => {
			const r = nodo.getBoundingClientRect();
			return {
				x: Math.min(limiteX, Math.max(0, cx - r.left + nodo.scrollLeft)),
				y: Math.min(limiteY, Math.max(0, cy - r.top + nodo.scrollTop))
			};
		};
		const inizio = contenuto(e.clientX, e.clientY);
		let ultimo = { x: e.clientX, y: e.clientY };
		let riquadro: HTMLDivElement | null = null;
		let giro = 0;
		/**
		 * Dove sta ogni voce vista durante il gesto, in coordinate del
		 * contenuto. Le liste sono virtualizzate: una voce uscita dallo
		 * schermo sparisce dalla pagina, ma resta dentro il rettangolo.
		 */
		const posizioni = new Map<string, Riquadro>();

		// Niente selezione del testo mentre si trascina.
		e.preventDefault();
		o.oninizio?.();

		function aggiorna() {
			const fine = contenuto(ultimo.x, ultimo.y);
			const r = riquadroFra(inizio.x, inizio.y, fine.x, fine.y);
			if (riquadro) {
				riquadro.style.transform = `translate(${r.x}px, ${r.y}px)`;
				riquadro.style.width = `${r.w}px`;
				riquadro.style.height = `${r.h}px`;
			}
			const base = nodo.getBoundingClientRect();
			for (const el of nodo.querySelectorAll<HTMLElement>('[data-voce]')) {
				const b = el.getBoundingClientRect();
				posizioni.set(el.dataset.voce!, {
					x: b.left - base.left + nodo.scrollLeft,
					y: b.top - base.top + nodo.scrollTop,
					w: b.width,
					h: b.height
				});
			}
			const dentro: string[] = [];
			for (const [path, voce] of posizioni) if (siToccano(r, voce)) dentro.push(path);
			o.oncambia(dentro, aggiungi);
		}

		// Col puntatore oltre il bordo, sopra o sotto, la lista scorre e il
		// rettangolo la segue. Dentro la lista non scorre: partire vicino al
		// fondo non deve far scappare tutto verso il basso.
		function scorri() {
			const r = nodo.getBoundingClientRect();
			let passo = 0;
			if (ultimo.y < r.top) passo = -Math.min(BORDO, r.top - ultimo.y);
			else if (ultimo.y > r.bottom) passo = Math.min(BORDO, ultimo.y - r.bottom);
			if (passo !== 0) {
				nodo.scrollTop += passo;
				aggiorna();
			}
			giro = requestAnimationFrame(scorri);
		}

		function muovi(m: MouseEvent) {
			ultimo = { x: m.clientX, y: m.clientY };
			if (!riquadro) {
				const a = contenuto(m.clientX, m.clientY);
				if (Math.abs(a.x - inizio.x) + Math.abs(a.y - inizio.y) < SOGLIA) return;
				riquadro = document.createElement('div');
				riquadro.className = 'rettangolo-selezione';
				nodo.appendChild(riquadro);
				giro = requestAnimationFrame(scorri);
			}
			aggiorna();
		}

		function su() {
			window.removeEventListener('mousemove', muovi);
			window.removeEventListener('mouseup', su);
			cancelAnimationFrame(giro);
			if (riquadro) {
				riquadro.remove();
				// Il clic che chiude il gesto cadrebbe su una riga e la
				// selezionerebbe da sola, cancellando il rettangolo.
				const ingoia = (c: MouseEvent) => {
					c.stopPropagation();
					c.preventDefault();
				};
				window.addEventListener('click', ingoia, { capture: true, once: true });
				setTimeout(() => window.removeEventListener('click', ingoia, { capture: true }), 0);
			} else if (!aggiungi) o.onvuoto();
		}

		window.addEventListener('mousemove', muovi);
		window.addEventListener('mouseup', su);
	}

	nodo.addEventListener('mousedown', giu);
	return {
		update(nuove: OpzioniRettangolo) {
			o = nuove;
		},
		destroy() {
			nodo.removeEventListener('mousedown', giu);
		}
	};
}
