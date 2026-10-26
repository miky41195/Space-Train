/**
 * Spritesheet: un'immagine con i fotogrammi di un personaggio. Sul foglio si
 * sceglie una zona rettangolare libera, che contiene i fotogrammi della
 * camminata in fila o in una griglia; sul binario se ne mostra uno alla volta,
 * facendo scorrere lo sfondo a scatti: è così che camminano gli sprite dei
 * giochi.
 *
 * Nel corteo di un tema uno spritesheet è una voce `sprite:<json>`.
 */

export interface Spritesheet {
	/** Percorso dell'immagine salvata nella cartella dell'app. */
	src: string;
	/** Dimensioni dell'immagine intera, in pixel. */
	larghezza: number;
	altezza: number;
	/** La zona scelta sul foglio, in pixel dell'immagine. */
	x: number;
	y: number;
	w: number;
	h: number;
	/**
	 * Quanti fotogrammi usare. Si contano da sinistra a destra e poi riga
	 * per riga; con una riga sola la zona si divide in tante colonne.
	 */
	fotogrammi: number;
	/**
	 * Griglia dentro la zona, solo se le righe sono più di una: allora le
	 * colonne si dicono a parte e l'ultima riga può essere incompleta.
	 */
	righe?: number;
	colonne?: number;
	/** Spazio vuoto fra una cella e l'altra della griglia, in pixel del foglio. */
	spazioX?: number;
	spazioY?: number;
	/**
	 * Fotogrammi a mano: ognuno è un riquadro suo, anche di misure diverse
	 * (un colpo che si allunga, un'onda di energia). Se ci sono, valgono loro
	 * e la griglia non conta.
	 */
	riquadri?: Riquadro[];
	/**
	 * In che ordine mostrarli, da 0: per una camminata da tre fotogrammi
	 * (fermo, piede sinistro, piede destro) è `[1, 0, 2, 0]`. Senza, si
	 * mostrano di fila.
	 */
	ordine?: number[];
	fps: number;
	/** Pixel art: ingrandire senza sfocare. */
	nitido: boolean;
	/** Altezza del personaggio sul binario, in pixel; senza, `ALTEZZA_BINARIO`. */
	alto?: number;
	/**
	 * Larghezza di un fotogramma sul binario, in pixel. Senza, segue
	 * l'altezza mantenendo le proporzioni del fotogramma.
	 */
	largo?: number;
}

/** Un rettangolo sul foglio, in pixel dell'immagine. */
export interface Riquadro {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Quanti fotogrammi a mano al massimo. */
export const RIQUADRI_MAX = 64;

/** Limiti delle misure sul binario, in pixel. */
export const ALTO_MIN = 12;
export const ALTO_MAX = 240;
export const LARGO_MIN = 4;
export const LARGO_MAX = 480;

/** Altezza a cui si disegna un personaggio sul binario. */
export const ALTEZZA_BINARIO = 30;

export const PREFISSO = 'sprite:';

export function codifica(s: Spritesheet): string {
	return PREFISSO + JSON.stringify(s);
}

/** I temi salvati prima della zona libera descrivevano una griglia. */
interface Vecchio {
	colonne?: number;
	righe?: number;
	riga?: number;
	inizio?: number;
}

/** Legge una voce del corteo; `null` se non è uno spritesheet valido. */
export function decodifica(voce: string): Spritesheet | null {
	if (!voce.startsWith(PREFISSO)) return null;
	try {
		const s = JSON.parse(voce.slice(PREFISSO.length)) as Partial<Spritesheet> & Vecchio;
		if (!s.src || !(s.larghezza! > 0) || !(s.altezza! > 0)) return null;
		let { x, y, w, h, fotogrammi } = s;
		if (w === undefined && s.colonne !== undefined) {
			// Griglia di una volta: la sequenza diventa la zona equivalente.
			const fw = s.larghezza! / Math.max(1, s.colonne);
			const fh = s.altezza! / Math.max(1, s.righe ?? 1);
			const inizio = s.inizio ?? 0;
			fotogrammi = fotogrammi ?? s.colonne - inizio;
			x = inizio * fw;
			y = (s.riga ?? 0) * fh;
			w = fotogrammi * fw;
			h = fh;
		}
		return normalizza({
			src: s.src,
			larghezza: s.larghezza!,
			altezza: s.altezza!,
			x: x ?? 0,
			y: y ?? 0,
			w: w ?? s.larghezza!,
			h: h ?? s.altezza!,
			fotogrammi: fotogrammi ?? 1,
			...(s.w !== undefined
				? { righe: s.righe, colonne: s.colonne, spazioX: s.spazioX, spazioY: s.spazioY, riquadri: s.riquadri }
				: {}),
			ordine: s.ordine,
			fps: s.fps ?? 8,
			nitido: s.nitido ?? true,
			alto: s.alto,
			largo: s.largo
		});
	} catch {
		return null;
	}
}

/** Numero finito o il valore di riserva. */
function numero(v: unknown, riserva: number): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : riserva;
}

/**
 * Riporta la zona dentro l'immagine, a pixel interi e grande almeno un
 * pixel; i fotogrammi sono almeno uno e non più dei pixel della zona.
 */
export function normalizza(s: Spritesheet): Spritesheet {
	const L = s.larghezza;
	const A = s.altezza;
	const x = Math.min(Math.max(Math.round(numero(s.x, 0)), 0), L - 1);
	const y = Math.min(Math.max(Math.round(numero(s.y, 0)), 0), A - 1);
	const w = Math.min(Math.max(Math.round(numero(s.w, L)), 1), L - x);
	const h = Math.min(Math.max(Math.round(numero(s.h, A)), 1), A - y);
	const righe = Math.min(Math.max(Math.round(numero(s.righe, 1)), 1), h);
	const riquadri = Array.isArray(s.riquadri)
		? s.riquadri.slice(0, RIQUADRI_MAX).map((r) => dentro(r, L, A))
		: [];
	const voluti = Math.max(Math.round(numero(s.fotogrammi, 1)), 1);
	const colonne = righe > 1 ? Math.min(Math.max(Math.round(numero(s.colonne, Math.ceil(voluti / righe))), 1), w) : 0;
	const fotogrammi = riquadri.length > 0 ? riquadri.length : Math.min(voluti, righe > 1 ? colonne * righe : w);
	const spazioX = misura(s.spazioX, 0, w);
	const spazioY = misura(s.spazioY, 0, h);
	// Restano solo i fotogrammi che esistono ancora; un ordine vuoto non serve.
	const ordine = Array.isArray(s.ordine)
		? s.ordine.filter((k) => Number.isInteger(k) && k >= 0 && k < fotogrammi).slice(0, 64)
		: [];
	const alto = misura(s.alto, ALTO_MIN, ALTO_MAX);
	const largo = misura(s.largo, LARGO_MIN, LARGO_MAX);
	const { ordine: _o, alto: _a, largo: _l, righe: _r, colonne: _c, spazioX: _sx, spazioY: _sy, riquadri: _q, ...resto } = s;
	return {
		...resto,
		...(righe > 1 ? { righe, colonne } : {}),
		...(spazioX ? { spazioX } : {}),
		...(spazioY ? { spazioY } : {}),
		...(riquadri.length > 0 ? { riquadri } : {}),
		...(alto !== undefined ? { alto } : {}),
		...(largo !== undefined ? { largo } : {}),
		x,
		y,
		w,
		h,
		fotogrammi,
		...(ordine.length > 0 ? { ordine } : {}),
		fps: Math.min(Math.max(numero(s.fps, 8), 1), 30)
	};
}

/** Un riquadro a pixel interi, grande almeno un pixel, dentro l'immagine. */
function dentro(r: Partial<Riquadro>, L: number, A: number): Riquadro {
	const x = Math.min(Math.max(Math.round(numero(r.x, 0)), 0), L - 1);
	const y = Math.min(Math.max(Math.round(numero(r.y, 0)), 0), A - 1);
	return {
		x,
		y,
		w: Math.min(Math.max(Math.round(numero(r.w, 1)), 1), L - x),
		h: Math.min(Math.max(Math.round(numero(r.h, 1)), 1), A - y)
	};
}

/**
 * Le celle della griglia come riquadri: il punto di partenza per i
 * fotogrammi a mano, da ritoccare uno per uno.
 */
export function riquadriDellaGriglia(s: Spritesheet): Riquadro[] {
	const lato = latoFotogramma(s);
	const passo = passoFotogramma(s);
	return Array.from({ length: Math.min(s.fotogrammi, RIQUADRI_MAX) }, (_, k) => {
		const c = cella(s, k);
		return dentro(
			{ x: s.x + c.colonna * passo.x, y: s.y + c.riga * passo.y, w: lato.larghezza, h: lato.altezza },
			s.larghezza,
			s.altezza
		);
	});
}

/** Una misura in pixel interi dentro i limiti; `undefined` se non c'è. */
function misura(v: unknown, min: number, max: number): number | undefined {
	if (v === undefined || v === null) return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : undefined;
}

/** Colonne e righe in cui è divisa la zona. */
export function griglia(s: Spritesheet): { colonne: number; righe: number } {
	const righe = s.righe ?? 1;
	return righe > 1 ? { colonne: s.colonne ?? Math.ceil(s.fotogrammi / righe), righe } : { colonne: s.fotogrammi, righe: 1 };
}

/** Colonna e riga del fotogramma `k`, da 0. */
export function cella(s: Spritesheet, k: number): { colonna: number; riga: number } {
	const { colonne } = griglia(s);
	return { colonna: k % colonne, riga: Math.floor(k / colonne) };
}

/** Quanto è grande un fotogramma sul binario, in pixel. */
export function misuraBinario(s: Spritesheet): { larghezza: number; altezza: number } {
	const altezza = s.alto ?? ALTEZZA_BINARIO;
	const lato = latoFotogramma(s);
	return { larghezza: s.largo ?? (lato.larghezza / lato.altezza) * altezza, altezza };
}

/** I fotogrammi nell'ordine in cui si mostrano, da 0. */
export function sequenza(s: Spritesheet): number[] {
	return s.ordine?.length ? s.ordine : Array.from({ length: s.fotogrammi }, (_, k) => k);
}

/**
 * L'ordine scritto dall'utente, contando da 1: "2, 1, 3, 1" o "2 1 3 1".
 * Numeri fuori dai fotogrammi e parole si ignorano.
 */
export function leggiOrdine(testo: string, fotogrammi: number): number[] {
	return (testo.match(/\d+/g) ?? [])
		.map((t) => Number(t) - 1)
		.filter((k) => k >= 0 && k < fotogrammi);
}

export function scriviOrdine(s: Spritesheet): string {
	return sequenza(s)
		.map((k) => k + 1)
		.join(', ');
}

/** Il passo classico: il primo fotogramma (fermo) tra ognuno degli altri. */
export function alternaConPrimo(fotogrammi: number): number[] {
	return Array.from({ length: fotogrammi - 1 }, (_, k) => [k + 1, 0]).flat();
}

/** Avanti fino all'ultimo e indietro, senza ripetere gli estremi. */
export function avantiIndietro(fotogrammi: number): number[] {
	const avanti = Array.from({ length: fotogrammi }, (_, k) => k);
	return [...avanti, ...avanti.slice(1, -1).reverse()];
}

/**
 * Il nome dell'animazione per una sequenza. Il CSS non sa mostrare i
 * fotogrammi in un ordine qualsiasi con `steps()`: ogni sequenza ha i suoi
 * keyframes, uno per fotogramma, aggiunti alla pagina la prima volta che
 * servono. Le misure arrivano dalle variabili dell'elemento, così la stessa
 * animazione va bene sul binario e nell'anteprima.
 */
export function animazione(seq: number[], colonne = Infinity): string {
	// In una griglia lo stesso numero è un'altra cella: le colonne entrano nel nome.
	const nome = Number.isFinite(colonne) ? `sprite-g${colonne}-${seq.join('-')}` : `sprite-${seq.join('-')}`;
	if (typeof document === 'undefined' || registrate.has(nome)) return nome;
	registrate.add(nome);
	const passo = (k: number) =>
		Number.isFinite(colonne)
			? `background-position:calc(var(--x) - var(--passo) * ${k % colonne}) calc(var(--y) - var(--passo-y) * ${Math.floor(k / colonne)})`
			: `background-position:calc(var(--x) - var(--passo) * ${k}) var(--y)`;
	const fermate = seq.map((k, i) => `${((i / seq.length) * 100).toFixed(4)}%{${passo(k)}}`);
	const el = document.createElement('style');
	el.dataset.sprite = nome;
	el.textContent = `@keyframes ${nome}{${fermate.join('')}100%{${passo(seq[seq.length - 1])}}}`;
	document.head.appendChild(el);
	return nome;
}
const registrate = new Set<string>();

/**
 * L'animazione dei fotogrammi a mano: ogni tappa dice dove sta il riquadro
 * sul foglio e quanto è grande, moltiplicato per la scala dell'elemento
 * (`--sx`, `--sy`), così la stessa animazione serve anteprima e binario.
 */
export function animazioneRiquadri(riquadri: Riquadro[], seq: number[]): string {
	const testo = JSON.stringify([riquadri.map((r) => [r.x, r.y, r.w, r.h]), seq]);
	let h = 5381;
	for (let i = 0; i < testo.length; i++) h = ((h * 33) ^ testo.charCodeAt(i)) >>> 0;
	const nome = `sprite-r${h.toString(36)}`;
	if (typeof document === 'undefined' || registrate.has(nome)) return nome;
	registrate.add(nome);
	const tappa = (k: number) => {
		const r = riquadri[k];
		return (
			`background-position:calc(var(--sx) * ${-r.x}px) calc(var(--sy) * ${-r.y}px);` +
			`width:calc(var(--sx) * ${r.w}px);height:calc(var(--sy) * ${r.h}px)`
		);
	};
	const fermate = seq.map((k, i) => `${((i / seq.length) * 100).toFixed(4)}%{${tappa(k)}}`);
	const el = document.createElement('style');
	el.dataset.sprite = nome;
	el.textContent = `@keyframes ${nome}{${fermate.join('')}100%{${tappa(seq[seq.length - 1])}}}`;
	document.head.appendChild(el);
	return nome;
}

/**
 * Proposta iniziale per un'immagine appena caricata. Una striscia
 * orizzontale con fotogrammi quadrati è il caso più comune: si contano i
 * quadrati. Altrimenti si parte da un fotogramma solo e l'utente corregge.
 */
export function indovina(src: string, larghezza: number, altezza: number): Spritesheet {
	const quadrati = Math.round(larghezza / altezza);
	const striscia = larghezza > altezza && Math.abs(larghezza / altezza - quadrati) < 0.05;
	return {
		src,
		larghezza,
		altezza,
		x: 0,
		y: 0,
		w: larghezza,
		h: altezza,
		fotogrammi: striscia ? quadrati : 1,
		fps: 8,
		nitido: true
	};
}

/**
 * Lato di un fotogramma in pixel dell'immagine originale: nella griglia
 * tolti gli spazi fra le celle; coi fotogrammi a mano, il più grande.
 */
export function latoFotogramma(s: Spritesheet): { larghezza: number; altezza: number } {
	if (s.riquadri?.length) {
		return {
			larghezza: Math.max(...s.riquadri.map((r) => r.w)),
			altezza: Math.max(...s.riquadri.map((r) => r.h))
		};
	}
	const { colonne, righe } = griglia(s);
	const gx = s.spazioX ?? 0;
	const gy = s.spazioY ?? 0;
	return {
		larghezza: Math.max(1, (s.w - (colonne - 1) * gx) / colonne),
		altezza: Math.max(1, (s.h - (righe - 1) * gy) / righe)
	};
}

/** Di quanto ci si sposta sul foglio da una cella alla successiva: lato più spazio. */
export function passoFotogramma(s: Spritesheet): { x: number; y: number } {
	const lato = latoFotogramma(s);
	return { x: lato.larghezza + (s.spazioX ?? 0), y: lato.altezza + (s.spazioY ?? 0) };
}

/** Una zona nuova sul foglio, riportata dentro l'immagine. */
export function zona(s: Spritesheet, x: number, y: number, w: number, h: number): Spritesheet {
	return normalizza({ ...s, x, y, w, h });
}

export interface Disegno {
	/** Dimensioni del fotogramma a schermo. */
	larghezza: number;
	altezza: number;
	/** Dimensioni dell'immagine intera a schermo, per `background-size`. */
	foglioL: number;
	foglioA: number;
	/** Spostamento dello sfondo per mostrare il primo fotogramma. */
	x: number;
	y: number;
	/** Di quanto scorre lo sfondo in un giro d'animazione. */
	corsa: number;
	/** Di quanto scorre lo sfondo da una cella alla successiva, spazio compreso. */
	passoX: number;
	passoY: number;
	/** Pixel a schermo per ogni pixel del foglio. */
	scalaX: number;
	scalaY: number;
	/** Durata di un giro, in secondi. */
	durata: number;
	passi: number;
}

/**
 * Misure per disegnare lo spritesheet: com'è sul binario, oppure in
 * piccolo all'altezza `alto` (l'anteprima) con le stesse proporzioni.
 * Larghezza e altezza possono scalare in modo diverso: lo sprite si stira.
 */
export function disegno(s: Spritesheet, alto?: number): Disegno {
	const binario = misuraBinario(s);
	const fattore = alto === undefined ? 1 : alto / binario.altezza;
	const larghezza = binario.larghezza * fattore;
	const altezza = binario.altezza * fattore;
	const lato = latoFotogramma(s);
	const scalaX = larghezza / lato.larghezza;
	const scalaY = altezza / lato.altezza;
	return {
		larghezza,
		altezza,
		foglioL: s.larghezza * scalaX,
		foglioA: s.altezza * scalaY,
		x: -s.x * scalaX,
		y: -s.y * scalaY,
		corsa: s.w * scalaX,
		passoX: passoFotogramma(s).x * scalaX,
		passoY: passoFotogramma(s).y * scalaY,
		scalaX,
		scalaY,
		durata: sequenza(s).length / s.fps,
		passi: sequenza(s).length
	};
}

/** Lo stile in linea per l'elemento che mostra lo sprite. */
export function stile(s: Spritesheet, src: string, alto?: number): string {
	const d = disegno(s, alto);
	// Dentro url("…") backslash e virgolette sono caratteri speciali del CSS:
	// un percorso Windows non protetto diventerebbe un indirizzo rotto.
	const protetto = src.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	if (s.riquadri?.length) {
		// Fotogrammi a mano: ogni passo cambia anche larghezza e altezza.
		const seq = sequenza(s);
		const primo = s.riquadri[seq[0]];
		return [
			`width:${primo.w * d.scalaX}px`,
			`height:${primo.h * d.scalaY}px`,
			`background-image:url("${protetto}")`,
			`background-size:${d.foglioL}px ${d.foglioA}px`,
			`background-position:${-primo.x * d.scalaX}px ${-primo.y * d.scalaY}px`,
			`--sx:${d.scalaX}`,
			`--sy:${d.scalaY}`,
			`animation-name:${animazioneRiquadri(s.riquadri, seq)}`,
			`animation-duration:${d.durata}s`,
			`animation-timing-function:step-end`,
			`image-rendering:${s.nitido ? 'pixelated' : 'auto'}`
		].join(';');
	}
	return [
		`width:${d.larghezza}px`,
		`height:${d.altezza}px`,
		`background-image:url("${protetto}")`,
		`background-size:${d.foglioL}px ${d.foglioA}px`,
		`background-position:${d.x}px ${d.y}px`,
		`--x:${d.x}px`,
		`--fine:${d.x - d.corsa}px`,
		`--y:${d.y}px`,
		`--passo:${d.passoX}px`,
		`--passo-y:${d.passoY}px`,
		`animation-name:${animazione(sequenza(s), (s.righe ?? 1) > 1 ? griglia(s).colonne : Infinity)}`,
		`animation-duration:${d.durata}s`,
		// Ogni fotogramma resta fermo fino al successivo, senza scorrere.
		`animation-timing-function:step-end`,
		`image-rendering:${s.nitido ? 'pixelated' : 'auto'}`
	].join(';');
}
