/**
 * Interface language. The Italian text is the key: `t('Apri')` gives
 * «Apri» in Italian and its entry in `EN` in English, so the code reads
 * like the interface and a missing entry shows the Italian rather than
 * nothing. `{0}`, `{1}`… take the values passed after the text.
 *
 * The language is fixed when a window loads: choosing another one in
 * Settings saves it and reloads every window (the tabs come back).
 */
import { EN } from './i18n/en';

export type Language = 'it' | 'en';
export type LanguageChoice = 'auto' | Language;

/** Own key, read before anything else on the page is built. */
export const LANGUAGE_KEY = 'space-train.language';
/** Set just before a reload for the language: the tabs open again. */
export const RESUME_KEY = 'space-train.resume-tabs';

function stored(): LanguageChoice {
	try {
		const v = globalThis.localStorage?.getItem(LANGUAGE_KEY);
		return v === 'it' || v === 'en' ? v : 'auto';
	} catch {
		return 'auto';
	}
}

/** Windows' language as WebView2 reports it: Italian for Italian, English for the rest. */
export function systemLanguage(): Language {
	const l = (globalThis.navigator?.language ?? 'it').toLowerCase();
	return l.startsWith('it') ? 'it' : 'en';
}

function resolve(choice: LanguageChoice): Language {
	if (choice !== 'auto') return choice;
	// Tests read the Italian texts they were written with.
	if (import.meta.env?.MODE === 'test') return 'it';
	return systemLanguage();
}

export const languageChoice: LanguageChoice = stored();
export const language: Language = resolve(languageChoice);

/** For dates and numbers: Italian, or the English variant Windows uses. */
export const locale: string =
	language === 'it' ? 'it-IT' : /^en(-|$)/i.test(globalThis.navigator?.language ?? '') ? globalThis.navigator.language : 'en-GB';

const KEY_NAMES: Record<string, string> = {
	Maiusc: 'Shift',
	Canc: 'Del',
	Invio: 'Enter',
	Spazio: 'Space',
	PagGiù: 'PgDn',
	PagSu: 'PgUp',
	Fine: 'End',
	Inizio: 'Home',
	clic: 'click',
	rotella: 'wheel'
};

/** A key combination as the list shows it («Ctrl+Maiusc+N»), in English. */
function keysText(s: string): string | null {
	if (!/^[^\s+]+(\+[^\s+]+)*$/.test(s)) return null;
	const parts = s.split('+');
	if (!parts.some((p) => p in KEY_NAMES)) return null;
	return parts.map((p) => KEY_NAMES[p] ?? p).join('+');
}

function fill(s: string, args?: readonly unknown[]): string {
	return args ? s.replace(/\{(\d+)\}/g, (m, i) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : s;
}

export function t(it: string, args?: readonly unknown[]): string {
	if (language === 'it') return fill(it, args);
	return fill(EN[it] ?? keysText(it) ?? it, args);
}

/** Entries with `{n}`, as patterns to recognise a message already filled in. */
let patterns: Array<{ re: RegExp; en: string }> | null = null;
function compiled() {
	if (patterns) return patterns;
	patterns = Object.entries(EN)
		.filter(([k]) => /\{\d+\}/.test(k))
		.map(([k, en]) => {
			const order: number[] = [];
			const source = k
				.split(/(\{\d+\})/)
				.map((part) => {
					const m = part.match(/^\{(\d+)\}$/);
					if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
					order.push(Number(m[1]));
					return '(.+?)';
				})
				.join('');
			return { re: new RegExp(`^${source}$`, 's'), en, order };
		})
		.map(({ re, en, order }) => ({
			re,
			en: order.length ? en.replace(/\{(\d+)\}/g, (_, i) => `{${order.indexOf(Number(i))}}`) : en
		}));
	return patterns;
}

/**
 * A text that arrives already written, from the Rust side (errors,
 * outcomes): exact entry, or the entry whose pattern it fits.
 */
export function tr(message: string): string {
	if (language === 'it' || !message) return message;
	const exact = EN[message];
	if (exact) return exact;
	for (const p of compiled()) {
		const m = message.match(p.re);
		if (m) return fill(p.en, m.slice(1).map(tr));
	}
	return message;
}

/** Saves the choice and reloads every window, which picks it up while loading. */
export function setLanguage(choice: LanguageChoice) {
	try {
		if (choice === 'auto') localStorage.removeItem(LANGUAGE_KEY);
		else localStorage.setItem(LANGUAGE_KEY, choice);
		sessionStorage.setItem(RESUME_KEY, '1');
	} catch {
		return;
	}
	location.reload();
}

// Another window changed the language: this one follows.
if (typeof window !== 'undefined' && import.meta.env?.MODE !== 'test') {
	window.addEventListener('storage', (e) => {
		if (e.key !== LANGUAGE_KEY) return;
		try {
			sessionStorage.setItem(RESUME_KEY, '1');
		} catch {
			/* reload anyway */
		}
		location.reload();
	});
}
