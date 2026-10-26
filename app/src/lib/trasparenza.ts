/**
 * Togliere lo sfondo da uno spritesheet: i pixel del colore dello sfondo
 * diventano trasparenti. Lavora sui byte RGBA di un'immagine, senza DOM.
 */

export interface Pixel {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export type Colore = [number, number, number];

export interface OpzioniSfondo {
	colore: Colore;
	/** Quanto può scostarsi ogni canale dal colore dello sfondo, 0–255. */
	tolleranza: number;
	/**
	 * Solo lo sfondo collegato ai bordi dell'immagine: i pixel dello stesso
	 * colore chiusi dentro il personaggio (gli occhi bianchi su sfondo
	 * bianco) restano.
	 */
	soloBordi: boolean;
}

export function colorePixel(img: Pixel, x: number, y: number): Colore {
	const i = (Math.floor(y) * img.width + Math.floor(x)) * 4;
	return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/**
 * Il colore dello sfondo, letto dai quattro angoli: vince quello che si
 * ripete di più (un personaggio può toccare un angolo, non tutti).
 * `null` se gli angoli sono già trasparenti.
 */
export function coloreSfondo(img: Pixel): Colore | null {
	const { width: w, height: h } = img;
	const angoli = [
		[0, 0],
		[w - 1, 0],
		[0, h - 1],
		[w - 1, h - 1]
	].filter(([x, y]) => img.data[(y * w + x) * 4 + 3] > 0);
	if (angoli.length === 0) return null;
	const conta = new Map<string, number>();
	for (const [x, y] of angoli) {
		const k = colorePixel(img, x, y).join(',');
		conta.set(k, (conta.get(k) ?? 0) + 1);
	}
	const [migliore] = [...conta.entries()].sort((a, b) => b[1] - a[1])[0];
	return migliore.split(',').map(Number) as Colore;
}

/** Rende trasparente lo sfondo, sul posto. Ritorna quanti pixel ha tolto. */
export function togliSfondo(img: Pixel, { colore, tolleranza, soloBordi }: OpzioniSfondo): number {
	const { data, width: w, height: h } = img;
	const [r, g, b] = colore;
	const simile = (p: number) =>
		data[p * 4 + 3] > 0 &&
		Math.abs(data[p * 4] - r) <= tolleranza &&
		Math.abs(data[p * 4 + 1] - g) <= tolleranza &&
		Math.abs(data[p * 4 + 2] - b) <= tolleranza;
	let tolti = 0;
	const togli = (p: number) => {
		data[p * 4 + 3] = 0;
		tolti++;
	};

	if (!soloBordi) {
		for (let p = 0; p < w * h; p++) if (simile(p)) togli(p);
		return tolti;
	}

	// Riempimento dai bordi: si allarga solo tra pixel vicini dello stesso colore.
	const visto = new Uint8Array(w * h);
	const coda: number[] = [];
	const prova = (p: number) => {
		if (!visto[p] && simile(p)) {
			visto[p] = 1;
			coda.push(p);
		}
	};
	for (let x = 0; x < w; x++) {
		prova(x);
		prova((h - 1) * w + x);
	}
	for (let y = 0; y < h; y++) {
		prova(y * w);
		prova(y * w + w - 1);
	}
	while (coda.length > 0) {
		const p = coda.pop()!;
		togli(p);
		const x = p % w;
		if (x > 0) prova(p - 1);
		if (x < w - 1) prova(p + 1);
		if (p >= w) prova(p - w);
		if (p < w * (h - 1)) prova(p + w);
	}
	return tolti;
}

/** `#rrggbb` per il selettore di colore. */
export function esadecimale([r, g, b]: Colore): string {
	return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function daEsadecimale(hex: string): Colore {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
