/**
 * Temi: colori, forme e personaggi.
 *
 * Un tema riscrive le variabili CSS di `app.css` sulla radice del
 * documento: i componenti non sanno nulla dei temi, leggono solo i nomi
 * funzionali (`--surface`, `--radius`, `--font-ui`…). I temi «mondo»
 * cambiano anche le forme, lo sfondo e chi sfila sul binario.
 */
import { FIGURE, CORTEI, motivoFigura } from './figure';

export interface Forme {
	/** Arrotondamento di finestre e pannelli, in pixel. */
	raggio: number;
	/** Arrotondamento di righe, pulsanti e menu. */
	raggioPiccolo: number;
	/** Carattere del testo. */
	carattere: string;
	/** Carattere di titoli, intestazioni ed etichette. */
	carattereTitoli: string;
	/**
	 * Dimensione del testo normale, in pixel. Note ed etichette crescono e
	 * calano nella stessa proporzione.
	 */
	dimensione: number;
	/**
	 * Dimensione dei titoli (tutto ciò che usa il carattere dei titoli), in
	 * pixel sulla stessa base del testo. Assente = segue `dimensione`.
	 */
	dimensioneTitoli?: number;
	/** Come finiscono gli angoli; il raggio diventa la misura del taglio. */
	angolo: Angolo;
	/** Il profilo delle schede nella testata. */
	scheda: Scheda;
	/** Il disegno nel cielo della testata e della linea principale. */
	cielo: Cielo;
	/** Il bordo della finestra. */
	cornice: Cornice;
}

export type Angolo = 'tondo' | 'smusso' | 'tacca' | 'pillola';
export type Scheda = 'tetto' | 'trapezio' | 'arco' | 'pillola';
export type Cielo = 'stelle' | 'griglia' | 'bolle' | 'curve' | 'ventagli' | 'nessuno';
export type Cornice = 'filo' | 'doppia';

/** Le scelte di forma con il nome che l'editor mostra. */
export const ANGOLI: readonly { valore: Angolo; nome: string }[] = [
	{ valore: 'tondo', nome: 'Arrotondati' },
	{ valore: 'smusso', nome: 'Smussati' },
	{ valore: 'tacca', nome: 'A tacca' },
	{ valore: 'pillola', nome: 'A pillola' }
];
export const SCHEDE: readonly { valore: Scheda; nome: string }[] = [
	{ valore: 'tetto', nome: 'A tetto' },
	{ valore: 'trapezio', nome: 'A trapezio' },
	{ valore: 'arco', nome: 'Ad arco' },
	{ valore: 'pillola', nome: 'A pillola' }
];
export const CIELI: readonly { valore: Cielo; nome: string }[] = [
	{ valore: 'stelle', nome: 'Stelle (solo temi scuri)' },
	{ valore: 'griglia', nome: 'Griglia' },
	{ valore: 'bolle', nome: 'Bolle' },
	{ valore: 'curve', nome: 'Curve di livello' },
	{ valore: 'ventagli', nome: 'Ventagli' },
	{ valore: 'nessuno', nome: 'Nessuno' }
];
export const CORNICI: readonly { valore: Cornice; nome: string }[] = [
	{ valore: 'filo', nome: 'Filo sottile' },
	{ valore: 'doppia', nome: 'Doppio filo' }
];

/** Il valore se è una delle scelte ammesse, altrimenti quello di base. */
function scelta<T extends string>(valore: unknown, ammessi: readonly { valore: T }[], base: T): T {
	return ammessi.some((a) => a.valore === valore) ? (valore as T) : base;
}

export interface Tema {
	id: string;
	nome: string;
	/** Chiaro o scuro: serve a scegliere i colori derivati. */
	chiaro: boolean;
	/** «colori» cambia solo la tavolozza; «mondo» anche forme e personaggi. */
	gruppo: 'colori' | 'mondo' | 'personale';
	variabili: Record<string, string>;
	forme?: Partial<Forme>;
	/**
	 * Chi sfila sul binario: id di figure o `img:<percorso>` per immagini
	 * dell'utente. Assente = il treno.
	 */
	corteo?: string[];
	/** Figura usata come sfondo decorativo della lista. */
	motivo?: string;
}

/** Le categorie della galleria dei temi, nell'ordine in cui compaiono. */
export const CATEGORIE = [
	{ id: 'scuri', nome: 'Scuri' },
	{ id: 'chiari', nome: 'Chiari' },
	{ id: 'mondi', nome: 'Mondi' },
	{ id: 'stagioni', nome: 'Stagioni' },
	{ id: 'feste', nome: 'Feste' },
	{ id: 'tuoi', nome: 'I tuoi temi' }
] as const;
export type IdCategoria = (typeof CATEGORIE)[number]['id'];

const STAGIONI = new Set(['primavera', 'estate', 'autunno', 'inverno']);
const FESTE = new Set(['natale', 'capodanno', 'sanvalentino', 'carnevale', 'pasqua', 'halloween']);

export function categoriaDi(tema: Tema): IdCategoria {
	if (tema.gruppo === 'personale') return 'tuoi';
	if (tema.gruppo === 'colori') return tema.chiaro ? 'chiari' : 'scuri';
	if (STAGIONI.has(tema.id)) return 'stagioni';
	if (FESTE.has(tema.id)) return 'feste';
	return 'mondi';
}

/** Il tema personale come lo salva l'editor. */
export type TemaPersonale = Tema & { gruppo: 'personale' };

export const FORME_BASE: Forme = {
	raggio: 12,
	raggioPiccolo: 8,
	carattere: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
	// Uguale alla voce dell'elenco CARATTERI: l'editor la riconosce solo se
	// la stringa coincide.
	carattereTitoli: "'Bahnschrift', 'Segoe UI', sans-serif",
	dimensione: 13,
	angolo: 'tondo',
	scheda: 'tetto',
	cielo: 'stelle',
	cornice: 'filo'
};

/** I limiti della dimensione del testo che si può scegliere, in pixel. */
export const DIMENSIONE_MIN = 9;
export const DIMENSIONE_MAX = 24;

/** Quanto il testo del tema è più grande (o più piccolo) di quello di base. */
export function scalaTesto(tema: Tema): number {
	return scala(tema.forme?.dimensione ?? FORME_BASE.dimensione);
}

/** Come `scalaTesto`, per i titoli; senza una dimensione propria seguono il testo. */
export function scalaTitoli(tema: Tema): number {
	const d = tema.forme?.dimensioneTitoli;
	return d === undefined ? scalaTesto(tema) : scala(d);
}

function scala(d: number): number {
	const valida = Number.isFinite(d) ? Math.min(DIMENSIONE_MAX, Math.max(DIMENSIONE_MIN, d)) : FORME_BASE.dimensione;
	return valida / FORME_BASE.dimensione;
}

/** Caratteri presenti in Windows tra cui scegliere nell'editor. */
export const CARATTERI = [
	{ nome: 'Segoe UI', valore: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif" },
	{ nome: 'Bahnschrift (segnaletica)', valore: "'Bahnschrift', 'Segoe UI', sans-serif" },
	{ nome: 'Trebuchet (morbido)', valore: "'Trebuchet MS', 'Segoe UI', sans-serif" },
	{ nome: 'Comic Sans (giocoso)', valore: "'Comic Sans MS', 'Segoe UI', sans-serif" },
	{ nome: 'Segoe Print (a mano)', valore: "'Segoe Print', 'Segoe UI', sans-serif" },
	{ nome: 'Ink Free (pennarello)', valore: "'Ink Free', 'Segoe UI', sans-serif" },
	{ nome: 'Gabriola (elegante)', valore: "'Gabriola', 'Georgia', serif" },
	{ nome: 'Georgia (classico)', valore: "'Georgia', serif" },
	{ nome: 'Cascadia (monospazio)', valore: "'Cascadia Code', 'Consolas', monospace" },
	{ nome: 'Candara (rotondo)', valore: "'Candara', 'Segoe UI', sans-serif" }
] as const;

const car = (nome: string) => CARATTERI.find((c) => c.nome.startsWith(nome))!.valore;

interface Tavolozza {
	void: string;
	hull: string;
	rail: string;
	current: string;
	plasma: string;
	signal: string;
	text: string;
	dim: string;
	errore?: string;
}

/** Tutte le variabili di colore da una tavolozza, chiara o scura. */
export function variabiliDa(t: Tavolozza, chiaro: boolean): Record<string, string> {
	return {
		'--void': t.void,
		'--hull': t.hull,
		'--hull-glass': trasparente(t.hull, chiaro ? 0.88 : 0.76),
		'--rail-metal': t.rail,
		'--current': t.current,
		'--plasma': t.plasma,
		'--signal': t.signal,
		'--text': t.text,
		'--text-dim': t.dim,
		'--border': chiaro ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.08)',
		'--row-hover': chiaro ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)',
		'--scroll': chiaro ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.14)',
		'--errore-testo': t.errore ?? (chiaro ? '#b3261e' : '#ffb4ab')
	};
}

/**
 * Il cielo dietro la testata, dove passa il convoglio: stelle di un pixel o
 * due, in una tessera che si ripete in larghezza. Solo nei temi scuri: su un
 * fondo chiaro diventerebbero sporco.
 */
export function stelle(testo: string, corrente: string, segnale: string): string {
	const punti: [number, number, number, string][] = [
		[18, 9, 2, 'a'], [61, 27, 1, 'b'], [104, 5, 2, 'c'], [139, 19, 1, 'b'],
		[177, 31, 2, 'a'], [214, 11, 1, 'a'], [252, 24, 2, 'b'], [293, 6, 1, 'd'],
		[331, 33, 1, 'a'], [368, 14, 2, 'b'], [402, 28, 1, 'a'], [447, 8, 2, 'a']
	];
	const tinta = { a: [testo, 0.55], b: [testo, 0.25], c: [corrente, 0.8], d: [segnale, 0.7] } as const;
	const rect = punti
		.map(([x, y, l, k]) => {
			const [colore, alfa] = tinta[k as keyof typeof tinta];
			return `<rect x='${x}' y='${y}' width='${l}' height='${l}' fill='${colore}' fill-opacity='${alfa}'/>`;
		})
		.join('');
	const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='40' shape-rendering='crispEdges'>${rect}</svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const colori = (id: string, nome: string, chiaro: boolean, t: Tavolozza): Tema => ({
	id,
	nome,
	chiaro,
	gruppo: 'colori',
	variabili: variabiliDa(t, chiaro)
});

const mondo = (
	id: string,
	nome: string,
	chiaro: boolean,
	t: Tavolozza,
	forme: Partial<Forme>,
	motivo: string
): Tema => ({
	id,
	nome,
	chiaro,
	gruppo: 'mondo',
	variabili: variabiliDa(t, chiaro),
	forme,
	corteo: CORTEI[id],
	motivo
});

export const TEMI: Tema[] = [
	// ── Solo colori ──
	colori('spazio', 'Spazio', false, {
		void: '#0c0a13', hull: '#171420', rail: '#3a3350', current: '#7cf5ff',
		plasma: '#8b5cf6', signal: '#ffb454', text: '#e9e6f0', dim: '#948da8'
	}),
	colori('notte', 'Notte', false, {
		void: '#111214', hull: '#1c1d21', rail: '#3a3d45', current: '#60a5fa',
		plasma: '#60a5fa', signal: '#fbbf24', text: '#e8e8ea', dim: '#9a9ba3'
	}),
	colori('oceano', 'Oceano', false, {
		void: '#06121c', hull: '#0d1e2c', rail: '#24435a', current: '#5ee6c8',
		plasma: '#22a6d6', signal: '#ffd166', text: '#e3f1fb', dim: '#8aa6bb'
	}),
	colori('tramonto', 'Tramonto', false, {
		void: '#160c0e', hull: '#22141a', rail: '#4a2a33', current: '#ffb26b',
		plasma: '#f0607a', signal: '#ffd166', text: '#f6e9e6', dim: '#b0949a', errore: '#ffc2b8'
	}),
	colori('chiaro', 'Chiaro', true, {
		void: '#f3f3f6', hull: '#ffffff', rail: '#c9c9d4', current: '#0a84c6',
		plasma: '#6d4ae0', signal: '#c46a00', text: '#1d1d24', dim: '#6b6b78'
	}),
	colori('sakura', 'Sakura', false, {
		void: '#1a0f16', hull: '#26161f', rail: '#53304a', current: '#ff9ad5',
		plasma: '#f472b6', signal: '#ffd1e8', text: '#fbe7f1', dim: '#c39bb2', errore: '#ffc2d4'
	}),
	colori('confetto', 'Confetto', true, {
		void: '#fdf1f6', hull: '#fff8fb', rail: '#efc6d8', current: '#d6337a',
		plasma: '#db2777', signal: '#b4235f', text: '#3b1d2e', dim: '#8a5c73'
	}),
	colori('lavanda', 'Lavanda', true, {
		void: '#f4f1fb', hull: '#fbfaff', rail: '#d3cbe9', current: '#6d4ae0',
		plasma: '#8b5cf6', signal: '#a16207', text: '#231c3a', dim: '#6e6688'
	}),
	colori('foresta', 'Foresta', false, {
		void: '#0b130e', hull: '#142019', rail: '#2c4636', current: '#86efac',
		plasma: '#22c55e', signal: '#facc15', text: '#e5f2e9', dim: '#8fab98'
	}),
	colori('caffe', 'Caffè', false, {
		void: '#15100c', hull: '#211912', rail: '#4a3829', current: '#f2c38b',
		plasma: '#c08a5a', signal: '#ffd89c', text: '#f4ebe1', dim: '#ab9783', errore: '#ffc2b0'
	}),
	colori('neon', 'Neon', false, {
		void: '#07060d', hull: '#100e1c', rail: '#2d2850', current: '#00f0ff',
		plasma: '#ff2bd6', signal: '#fff200', text: '#f2f0ff', dim: '#9a94c2', errore: '#ff8fa3'
	}),
	colori('contrasto', 'Contrasto elevato', false, {
		void: '#000000', hull: '#000000', rail: '#ffffff', current: '#ffff00',
		plasma: '#1aebff', signal: '#ffff00', text: '#ffffff', dim: '#e0e0e0', errore: '#ff6b6b'
	}),

	// ── Mondi: colori, forme, sfondo e personaggi ──
	mondo('cianografia', 'Cianografia', false, {
		void: '#0a2744', hull: '#0e3257', rail: '#4f80b2', current: '#b8f0ff',
		plasma: '#5db8ff', signal: '#ffd36b', text: '#eaf4ff', dim: '#9cb9d9'
	}, { raggio: 12, raggioPiccolo: 5, carattereTitoli: car('Cascadia'), angolo: 'smusso', scheda: 'trapezio', cielo: 'griglia' }, 'compasso'),
	mondo('abisso', 'Abisso', false, {
		void: '#02121b', hull: '#06202d', rail: '#144a5c', current: '#52ffd6',
		plasma: '#2fb4ff', signal: '#ff8ade', text: '#dcf6f3', dim: '#7fa8ab'
	}, { raggio: 22, raggioPiccolo: 15, carattere: car('Candara'), carattereTitoli: car('Candara'), angolo: 'pillola', scheda: 'pillola', cielo: 'bolle' }, 'medusa'),
	mondo('atlante', 'Atlante', true, {
		void: '#e3ece6', hull: '#f7faf6', rail: '#9fb5ab', current: '#0f6a8c',
		plasma: '#c27a1a', signal: '#b4432f', text: '#17283a', dim: '#5a6c78'
	}, { raggio: 14, raggioPiccolo: 6, carattereTitoli: car('Georgia'), angolo: 'tacca', cielo: 'curve' }, 'mongolfiera'),
	mondo('orient', 'Orient Express', false, {
		void: '#0c1512', hull: '#13201b', rail: '#6b5c34', current: '#f6dc96',
		plasma: '#cfa24a', signal: '#8fd1b8', text: '#f1ead8', dim: '#a99f86'
	}, { raggio: 10, raggioPiccolo: 4, carattereTitoli: car('Bahnschrift'), angolo: 'smusso', scheda: 'arco', cielo: 'ventagli', cornice: 'doppia' }, 'locoOro'),
	mondo('anime', 'Anime', false, {
		void: '#12101f', hull: '#1c1830', rail: '#3d3566', current: '#5ee7ff',
		plasma: '#ff5fa2', signal: '#ffd166', text: '#f5f0ff', dim: '#a59bc4'
	}, { raggio: 14, raggioPiccolo: 10, carattereTitoli: car('Trebuchet') }, 'stellina'),
	mondo('pokemon', 'Pokémon', true, {
		void: '#eef1f8', hull: '#ffffff', rail: '#c7cde0', current: '#3b4cca',
		plasma: '#e3350d', signal: '#ffcb05', text: '#1a1a2e', dim: '#5c6178'
	}, { raggio: 16, raggioPiccolo: 12, carattere: car('Trebuchet'), carattereTitoli: car('Trebuchet') }, 'scintilla'),
	mondo('gatti', 'Gatti', true, {
		void: '#f8efe4', hull: '#fffaf3', rail: '#e5d3bf', current: '#8a5a44',
		plasma: '#e07a2f', signal: '#d4a017', text: '#3b2a20', dim: '#8c7564'
	}, { raggio: 16, raggioPiccolo: 12, carattereTitoli: car('Ink Free') }, 'gattoArancio'),
	mondo('kawaii', 'Kawaii', true, {
		void: '#fff0f6', hull: '#ffffff', rail: '#ffd3e8', current: '#5bb8f0',
		plasma: '#ff7ab8', signal: '#ffc94d', text: '#5a3d55', dim: '#a58aa0'
	}, { raggio: 24, raggioPiccolo: 16, carattere: car('Candara'), carattereTitoli: car('Comic Sans') }, 'mochi'),
	mondo('primavera', 'Primavera', true, {
		void: '#eef7ea', hull: '#fbfef9', rail: '#cfe3c6', current: '#3f9b46',
		plasma: '#ec4899', signal: '#f59e0b', text: '#233623', dim: '#6b8a6b'
	}, { raggio: 16, raggioPiccolo: 10, carattereTitoli: car('Segoe Print') }, 'farfalla'),
	mondo('estate', 'Estate', true, {
		void: '#fff6df', hull: '#fffdf6', rail: '#f3e2b5', current: '#0891b2',
		plasma: '#ff6b4a', signal: '#f59e0b', text: '#2b2a20', dim: '#7a7460'
	}, { raggio: 14, raggioPiccolo: 10, carattereTitoli: car('Trebuchet') }, 'sole'),
	mondo('autunno', 'Autunno', false, {
		void: '#1b130e', hull: '#261a12', rail: '#5a3b24', current: '#f2b134',
		plasma: '#e8743b', signal: '#c2410c', text: '#f6eadf', dim: '#b49a85', errore: '#ffc2b0'
	}, { raggio: 12, raggioPiccolo: 8, carattereTitoli: car('Georgia') }, 'foglia'),
	mondo('inverno', 'Inverno', true, {
		void: '#eaf2fb', hull: '#fbfdff', rail: '#cfdcec', current: '#0ea5e9',
		plasma: '#3b82f6', signal: '#64748b', text: '#1e2a3a', dim: '#64748b'
	}, { raggio: 14, raggioPiccolo: 10, carattereTitoli: car('Candara') }, 'pupazzo'),
	mondo('natale', 'Natale', false, {
		void: '#0e1a14', hull: '#15261c', rail: '#2f4a39', current: '#facc15',
		plasma: '#dc2626', signal: '#22c55e', text: '#f3f6f1', dim: '#a3b8a8'
	}, { raggio: 12, raggioPiccolo: 8, carattereTitoli: car('Gabriola') }, 'regalo'),
	mondo('capodanno', 'Capodanno', false, {
		void: '#0b0b12', hull: '#141420', rail: '#3b3a52', current: '#f8f4e3',
		plasma: '#d4af37', signal: '#c0c0c0', text: '#f4f1e8', dim: '#a39e8c'
	}, { raggio: 10, raggioPiccolo: 6, carattereTitoli: car('Georgia') }, 'razzo'),
	mondo('sanvalentino', 'San Valentino', true, {
		void: '#fff0f3', hull: '#ffffff', rail: '#fbcfd8', current: '#db2777',
		plasma: '#e11d48', signal: '#fb7185', text: '#4c0519', dim: '#9f5d6d'
	}, { raggio: 20, raggioPiccolo: 14, carattereTitoli: car('Gabriola') }, 'cuore'),
	mondo('carnevale', 'Carnevale', false, {
		void: '#160b24', hull: '#22123a', rail: '#47306b', current: '#22d3ee',
		plasma: '#f59e0b', signal: '#ec4899', text: '#f8f0ff', dim: '#b39ccf'
	}, { raggio: 14, raggioPiccolo: 10, carattereTitoli: car('Comic Sans') }, 'maschera'),
	mondo('pasqua', 'Pasqua', true, {
		void: '#f6f2ff', hull: '#ffffff', rail: '#ddd3f5', current: '#16a34a',
		plasma: '#8b5cf6', signal: '#eab308', text: '#3b2f5c', dim: '#8579a8'
	}, { raggio: 20, raggioPiccolo: 14, carattereTitoli: car('Candara') }, 'uovo'),
	mondo('halloween', 'Halloween', false, {
		void: '#120a16', hull: '#1d1022', rail: '#3f2547', current: '#a3e635',
		plasma: '#f97316', signal: '#a855f7', text: '#f6ead8', dim: '#a8949f'
	}, { raggio: 8, raggioPiccolo: 6, carattereTitoli: car('Ink Free') }, 'fantasma')
];

/** Colori d'accento: selezione, cartelle, pulsanti attivi. */
export const ACCENTI = [
	{ id: 'tema', nome: 'Quello del tema', colore: null },
	{ id: 'viola', nome: 'Viola', colore: '#8b5cf6' },
	{ id: 'blu', nome: 'Blu', colore: '#3b82f6' },
	{ id: 'ciano', nome: 'Ciano', colore: '#06b6d4' },
	{ id: 'verde', nome: 'Verde', colore: '#22c55e' },
	{ id: 'ambra', nome: 'Ambra', colore: '#f59e0b' },
	{ id: 'rosso', nome: 'Rosso', colore: '#ef4444' },
	{ id: 'rosa', nome: 'Rosa', colore: '#ec4899' },
	{ id: 'lilla', nome: 'Lilla', colore: '#c084fc' },
	{ id: 'corallo', nome: 'Corallo', colore: '#fb7185' },
	{ id: 'personalizzato', nome: 'Personalizzato…', colore: null }
] as const;

export type IdAccento = (typeof ACCENTI)[number]['id'];

/** Il tema con questo id, fra quelli inclusi e quelli dell'utente. */
export function temaDa(id: string, personali: readonly Tema[] = []): Tema {
	return TEMI.find((t) => t.id === id) ?? personali.find((t) => t.id === id) ?? TEMI[0];
}

/** `#rrggbb` → `rgba(r, g, b, a)`. */
export function trasparente(esadecimale: string, alfa: number): string {
	const n = parseInt(esadecimale.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

/** Il colore d'accento effettivo per la scelta dell'utente. */
export function coloreAccento(tema: Tema, accento: IdAccento, personalizzato: string): string {
	if (accento === 'personalizzato') return personalizzato;
	return ACCENTI.find((a) => a.id === accento)?.colore ?? tema.variabili['--plasma'];
}

/** Tutte le variabili da scrivere sulla radice per tema e accento scelti. */
export function variabiliPer(tema: Tema, accento: string): Record<string, string> {
	const forme = { ...FORME_BASE, ...tema.forme };
	const figura = tema.motivo ? FIGURE[tema.motivo] : undefined;
	return {
		...tema.variabili,
		'--plasma': accento,
		'--accent': accento,
		// Su fondo chiaro la tinta della selezione deve essere più decisa
		// per staccarsi dal bianco.
		'--accent-soft': trasparente(accento, tema.chiaro ? 0.18 : 0.26),
		'--font-ui': forme.carattere,
		'--font-display': forme.carattereTitoli,
		'--scala-testo': String(scalaTesto(tema)),
		'--scala-titoli': String(scalaTitoli(tema)),
		'--motivo': figura ? motivoFigura(figura, tema.chiaro ? 0.1 : 0.07) : 'none',
		...variabiliForme(forme),
		// Calcolate qui e non salvate col tema: valgono anche per i temi
		// personali fatti prima che il cielo esistesse.
		...variabiliCielo(scelta(forme.cielo, CIELI, 'stelle'), tema)
	};
}

const px = (n: number) => `${n}px`;

/** Taglia i quattro angoli a 45°. */
function poligonoSmusso(n: number): string {
	const c = px(n);
	return `polygon(${c} 0, calc(100% - ${c}) 0, 100% ${c}, 100% calc(100% - ${c}), calc(100% - ${c}) 100%, ${c} 100%, 0 calc(100% - ${c}), 0 ${c})`;
}

/** Scava gli angoli verso l'interno, come i cartigli delle mappe. */
function mascheraTacca(n: number, soloSopra = false): string {
	const angolo = (x: string, y: string) =>
		`radial-gradient(circle at ${x} ${y}, #0000 ${px(n)}, #000 ${px(n + 0.5)}) ${x} ${y} / 51% ${soloSopra ? '100%' : '51%'} no-repeat`;
	const sopra = [angolo('0', '0'), angolo('100%', '0')];
	return (soloSopra ? sopra : [...sopra, angolo('0', '100%'), angolo('100%', '100%')]).join(', ');
}

/**
 * Le variabili delle forme. Con angoli smussati o a tacca il raggio non
 * arrotonda più: diventa la misura del taglio, e il bordo resta squadrato
 * sotto il ritaglio. Il focus va dentro l'elemento, che il ritaglio
 * altrimenti nasconderebbe.
 */
export function variabiliForme(forme: Forme): Record<string, string> {
	const angolo = scelta(forme.angolo, ANGOLI, 'tondo');
	const scheda = scelta(forme.scheda, SCHEDE, 'tetto');
	const r = Math.max(0, forme.raggio);
	const rs = Math.max(0, forme.raggioPiccolo);
	const ritaglia = angolo === 'smusso' || angolo === 'tacca';
	const v: Record<string, string> = {
		'--radius': ritaglia ? '0px' : px(r),
		'--radius-sm': ritaglia ? '0px' : angolo === 'pillola' ? '999px' : px(rs),
		'--forma': angolo === 'smusso' ? poligonoSmusso(r) : 'none',
		'--forma-sm': angolo === 'smusso' ? poligonoSmusso(rs) : 'none',
		'--maschera': angolo === 'tacca' ? mascheraTacca(r) : 'none',
		'--maschera-sm': angolo === 'tacca' ? mascheraTacca(rs) : 'none',
		'--fuoco-scarto': ritaglia ? '-2px' : '2px',
		'--cornice': scelta(forme.cornice, CORNICI, 'filo') === 'doppia' ? '3px double var(--rail-metal)' : '1px solid var(--border)'
	};
	// La scheda a tetto segue gli angoli; le altre hanno un profilo loro.
	const tetto = Math.min(rs, 12);
	const schede: Record<Scheda, [raggio: string, forma: string, maschera: string]> = {
		tetto:
			angolo === 'smusso'
				? ['0', `polygon(${px(rs)} 0, calc(100% - ${px(rs)}) 0, 100% ${px(rs)}, 100% 100%, 0 100%, 0 ${px(rs)})`, 'none']
				: angolo === 'tacca'
					? ['0', 'none', mascheraTacca(rs, true)]
					: [`${px(tetto)} ${px(tetto)} 0 0`, 'none', 'none'],
		trapezio: ['0', 'polygon(10px 0, calc(100% - 10px) 0, 100% 100%, 0 100%)', 'none'],
		arco: ['16px 16px 0 0 / 14px 14px 0 0', 'none', 'none'],
		pillola: ['999px', 'none', 'none']
	};
	const [raggio, forma, maschera] = schede[scheda];
	v['--scheda-raggio'] = raggio;
	v['--scheda-forma'] = forma;
	v['--scheda-maschera'] = maschera;
	// La pillola si stacca dal bordo; il trapezio ha bisogno di spazio ai lati.
	v['--scheda-altezza'] = scheda === 'pillola' ? '26px' : '32px';
	v['--scheda-stacco'] = scheda === 'pillola' ? '4px' : '0px';
	v['--scheda-margini'] = scheda === 'trapezio' ? '0 16px 0 20px' : scheda === 'arco' ? '0 12px 0 16px' : '0 8px 0 12px';
	return v;
}

/** Un SVG come immagine di sfondo. */
const svgUrl = (l: number, a: number, corpo: string) =>
	`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${l}' height='${a}'>${corpo}</svg>`)}")`;

/**
 * Il cielo della testata e della linea principale e la misura della sua
 * tessera. Le stelle restano solo per i temi scuri: su un fondo chiaro
 * diventerebbero sporco. Gli altri cieli sono disegnati per entrambi.
 */
export function variabiliCielo(cielo: Cielo, tema: Tema): Record<string, string> {
	const testo = tema.variabili['--text'] ?? '#e9e6f0';
	const corrente = tema.variabili['--current'] ?? '#7cf5ff';
	const plasma = tema.variabili['--plasma'] ?? '#8b5cf6';
	const segnale = tema.variabili['--signal'] ?? '#ffb454';
	const tinta = tema.chiaro ? 0.16 : 0.1;
	const v = (immagine: string, misura: string) => ({ '--stelle': immagine, '--cielo-misura': misura });
	switch (cielo) {
		case 'stelle':
			return v(tema.chiaro ? 'none' : stelle(testo, corrente, segnale), '480px 40px');
		case 'griglia':
			return v(svgUrl(16, 16, `<path d='M0 .5H16M.5 0V16' stroke='${corrente}' stroke-opacity='${tinta}'/>`), '16px 16px');
		case 'bolle': {
			const bolle: [number, number, number, string, number][] = [
				[29, 28, 1.5, corrente, 0.5], [65, 12, 3, corrente, 0.22], [110, 25, 1.5, segnale, 0.4],
				[151, 9, 2.5, plasma, 0.3], [194, 23, 4, corrente, 0.2], [223, 11, 1.2, testo, 0.35]
			];
			const corpo = bolle.map(([x, y, r, c, o]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='${c}' fill-opacity='${o}'/>`).join('');
			return v(svgUrl(240, 40, corpo), '240px 40px');
		}
		case 'curve':
			return v(
				svgUrl(
					300,
					40,
					`<g fill='none' stroke='${corrente}' stroke-opacity='${tema.chiaro ? 0.14 : 0.12}'><path d='M-10 30C40 10 80 38 130 22S220 6 310 26'/><path d='M-10 36C40 18 85 44 135 30S225 14 310 33'/><path d='M-10 22C35 2 78 30 125 14S215-2 310 18'/><ellipse cx='200' cy='20' rx='22' ry='8'/><ellipse cx='200' cy='20' rx='12' ry='4'/></g>`
				),
				'300px 40px'
			);
		case 'ventagli':
			return v(
				svgUrl(34, 20, `<path d='M11 20a6 6 0 0 1 12 0M6 20a11 11 0 0 1 22 0M1 20a16 16 0 0 1 32 0' fill='none' stroke='${plasma}' stroke-opacity='0.3'/>`),
				'34px 20px'
			);
		case 'nessuno':
			return v('none', '480px 40px');
	}
}

/** Applica tema e accento al documento. */
export function applicaTema(tema: Tema, accento: string, radice = document.documentElement): void {
	for (const [k, v] of Object.entries(variabiliPer(tema, accento))) radice.style.setProperty(k, v);
	radice.dataset.tema = tema.chiaro ? 'chiaro' : 'scuro';
	radice.dataset.mondo = tema.gruppo === 'colori' ? '' : tema.id;
}
