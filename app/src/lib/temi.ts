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

/** Il tema personale come lo salva l'editor. */
export type TemaPersonale = Tema & { gruppo: 'personale' };

export const FORME_BASE: Forme = {
	raggio: 12,
	raggioPiccolo: 8,
	carattere: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
	// Uguale alla voce dell'elenco CARATTERI: l'editor la riconosce solo se
	// la stringa coincide.
	carattereTitoli: "'Bahnschrift', 'Segoe UI', sans-serif"
};

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
		'--accent-soft': trasparente(accento, tema.chiaro ? 0.16 : 0.2),
		'--radius': `${forme.raggio}px`,
		'--radius-sm': `${forme.raggioPiccolo}px`,
		'--font-ui': forme.carattere,
		'--font-display': forme.carattereTitoli,
		'--motivo': figura ? motivoFigura(figura, tema.chiaro ? 0.1 : 0.07) : 'none'
	};
}

/** Applica tema e accento al documento. */
export function applicaTema(tema: Tema, accento: string, radice = document.documentElement): void {
	for (const [k, v] of Object.entries(variabiliPer(tema, accento))) radice.style.setProperty(k, v);
	radice.dataset.tema = tema.chiaro ? 'chiaro' : 'scuro';
	radice.dataset.mondo = tema.gruppo === 'colori' ? '' : tema.id;
}
