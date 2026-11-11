import { azioneTasto, SHORTCUT_GROUPS, type AzioneTasto, type Tasto } from './scorciatoie';

/**
 * Custom shortcuts: the user can give an action other keys. Stored as
 * action → key combinations; an action listed here loses its default keys.
 * Combinations are written like the settings list shows them: «Ctrl+Maiusc+D».
 */
export type Personalizzate = Partial<Record<string, string[]>>;

/** Actions that can take other keys: the ones listed in the settings with an action. */
export type AzioneSemplice = Extract<AzioneTasto, string>;

export function predefiniti(azione: AzioneSemplice): string[] {
	return SHORTCUT_GROUPS.flatMap((g) => g.items)
		.filter((i) => i.action === azione)
		.flatMap((i) => i.keys);
}

export function tastiDi(azione: AzioneSemplice, p: Personalizzate): string[] {
	return p[azione] ?? predefiniti(azione);
}

export function nomeAzione(azione: AzioneSemplice): string {
	return SHORTCUT_GROUPS.flatMap((g) => g.items).find((i) => i.action === azione)?.label ?? azione;
}

const NOMI_TASTI: Record<string, string> = {
	Delete: 'Canc',
	Enter: 'Invio',
	Escape: 'Esc',
	ArrowLeft: '←',
	ArrowRight: '→',
	ArrowUp: '↑',
	ArrowDown: '↓',
	PageDown: 'PagGiù',
	PageUp: 'PagSu',
	' ': 'Spazio',
	End: 'Fine',
	Insert: 'Ins'
};

/** The combination of a key press, or `null` while only modifiers are down. */
export function combinazione(e: Tasto & { metaKey?: boolean }): string | null {
	if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(e.key)) return null;
	const cifra = /^(?:Digit|Numpad)(\d)$/.exec(e.code ?? '');
	const lettera = /^Key([A-Z])$/.exec(e.code ?? '');
	const tasto = cifra?.[1] ?? NOMI_TASTI[e.key] ?? (e.key.length === 1 ? (lettera?.[1] ?? e.key.toUpperCase()) : e.key);
	const parti = [e.metaKey && 'Win', e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Maiusc'].filter(Boolean);
	return [...parti, tasto].join('+');
}

/** The action of a key press, custom keys first. */
export function azioneConPersonalizzate(e: Tasto & { metaKey?: boolean }, p: Personalizzate): AzioneTasto | null {
	const c = combinazione(e);
	if (c !== null) {
		for (const [azione, tasti] of Object.entries(p)) if (tasti?.includes(c)) return azione as AzioneTasto;
	}
	const base = azioneTasto(e);
	// Moved elsewhere: its default keys no longer do it.
	if (typeof base === 'string' && p[base] !== undefined) return null;
	return base;
}

/** Windows takes these before any app sees them. */
const DI_WINDOWS = new Map<string, string>([
	['Ctrl+Alt+Canc', 'apre la schermata di sicurezza di Windows'],
	['Ctrl+Maiusc+Esc', 'apre Gestione attività'],
	['Ctrl+Esc', 'apre il menu Start'],
	['Alt+Tab', 'passa da una finestra all’altra'],
	['Alt+Maiusc+Tab', 'passa da una finestra all’altra'],
	['Alt+Esc', 'passa da una finestra all’altra'],
	['Win+L', 'blocca il PC'],
	['Win+D', 'mostra il desktop'],
	['Win+E', 'apre Esplora risorse'],
	['Win+R', 'apre Esegui'],
	['Win+I', 'apre Impostazioni di Windows'],
	['Win+Tab', 'apre la visualizzazione attività'],
	['Win+X', 'apre il menu Start avanzato'],
	['Win+S', 'apre la ricerca di Windows'],
	['Win+V', 'apre la cronologia degli appunti'],
	['Win+Maiusc+S', 'cattura una parte dello schermo']
]);

/** Keys that work, but that every Windows program gives the same meaning. */
const CONVENZIONI = new Map<string, string>([
	['Alt+F4', 'chiude la finestra'],
	['F1', 'apre la guida'],
	['Alt+Spazio', 'apre il menu della finestra'],
	['F10', 'attiva la barra dei menu'],
	['F11', 'mette a schermo intero'],
	['Ctrl+P', 'stampa'],
	['Ctrl+S', 'salva'],
	['Ctrl+O', 'apre un file']
]);

/** Plain keys the lists and dialogs need: they are not given away. */
const DI_BASE = new Set(['←', '→', '↑', '↓', 'Invio', 'Esc', 'Tab', 'Maiusc+Tab', 'Spazio']);
const SENZA_MODIFICATORI_AMMESSI = /^(F\d{1,2}|Canc|Backspace|Ins|Home|Fine|PagSu|PagGiù)$/;

export interface Verifica {
	/** Not usable at all: the reason. */
	rifiuto?: string;
	/** Usable after confirmation: what the user must know first. */
	avvisi: string[];
	/** Actions that lose this combination if confirmed. */
	daTogliere: AzioneSemplice[];
}

/** What to tell before giving `combo` to `azione`. «Taken by another program» is checked apart (it asks Windows). */
export function verifica(combo: string, azione: AzioneSemplice, p: Personalizzate, tutte: readonly AzioneSemplice[]): Verifica {
	if (DI_BASE.has(combo)) return { rifiuto: `${combo} serve a muoversi nelle liste e nei dialoghi: non si può cambiare.`, avvisi: [], daTogliere: [] };
	const conModificatore = /^(Win|Ctrl|Alt)\+/.test(combo) || combo.startsWith('Maiusc+') && SENZA_MODIFICATORI_AMMESSI.test(combo.slice(7));
	if (!conModificatore && !SENZA_MODIFICATORI_AMMESSI.test(combo)) {
		return { rifiuto: `${combo} da solo serve a scrivere: aggiungi Ctrl, Alt o Win.`, avvisi: [], daTogliere: [] };
	}
	const windows = DI_WINDOWS.get(combo);
	if (windows) return { rifiuto: `${combo} è riservata da Windows (${windows}): non arriverebbe mai a Space Train.`, avvisi: [], daTogliere: [] };

	const avvisi: string[] = [];
	if (combo.startsWith('Win+')) avvisi.push(`Windows usa molte combinazioni con il tasto Win: ${combo} potrebbe non arrivare a Space Train.`);
	const conv = CONVENZIONI.get(combo);
	if (conv) avvisi.push(`In Windows ${combo} di solito ${conv}: qui farebbe un’altra cosa.`);
	const daTogliere = tutte.filter((a) => a !== azione && tastiDi(a, p).includes(combo));
	for (const a of daTogliere) avvisi.push(`Già usata in Space Train per «${nomeAzione(a)}»: confermando, quell’azione la perde.`);
	return { avvisi, daTogliere };
}

/** Gives `azione` the combination `combo` alone, taking it away from the others. */
export function assegna(p: Personalizzate, azione: AzioneSemplice, combo: string, daTogliere: readonly AzioneSemplice[]): Personalizzate {
	const nuove: Personalizzate = { ...p, [azione]: [combo] };
	for (const a of daTogliere) nuove[a] = tastiDi(a, p).filter((t) => t !== combo);
	return nuove;
}

/** Back to the default keys of `azione`. */
export function ripristina(p: Personalizzate, azione: AzioneSemplice): Personalizzate {
	const { [azione]: _, ...resto } = p;
	return resto;
}

/** The combination in the syntax Windows registration expects, or `null` if it cannot be probed. */
export function acceleratore(combo: string): string | null {
	const parti = combo.split('+');
	const tasto = parti.pop()!;
	const mod: Record<string, string> = { Win: 'super', Ctrl: 'ctrl', Alt: 'alt', Maiusc: 'shift' };
	const speciali: Record<string, string> = {
		'←': 'ArrowLeft',
		'→': 'ArrowRight',
		'↑': 'ArrowUp',
		'↓': 'ArrowDown',
		Canc: 'Delete',
		Invio: 'Enter',
		Esc: 'Escape',
		PagGiù: 'PageDown',
		PagSu: 'PageUp',
		Spazio: 'Space',
		Fine: 'End',
		Ins: 'Insert',
		Home: 'Home',
		Backspace: 'Backspace',
		Tab: 'Tab'
	};
	const codice = /^[A-Z]$/.test(tasto)
		? `Key${tasto}`
		: /^\d$/.test(tasto)
			? `Digit${tasto}`
			: /^F\d{1,2}$/.test(tasto)
				? tasto
				: speciali[tasto];
	if (!codice || parti.some((m) => !mod[m])) return null;
	return [...parti.map((m) => mod[m]), codice].join('+');
}
