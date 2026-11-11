/**
 * Readers for the preview pane: Markdown, source code and CSV. They return
 * plain data that Svelte renders as text, never HTML, so a file cannot
 * inject markup into the app.
 */

// ── Markdown ─────────────────────────────────────────────────────────

export interface Tratto {
	testo: string;
	forte?: boolean;
	corsivo?: boolean;
	codice?: boolean;
}

export type Blocco =
	| { tipo: 'titolo'; livello: number; tratti: Tratto[] }
	| { tipo: 'paragrafo'; tratti: Tratto[] }
	| { tipo: 'elenco'; ordinato: boolean; voci: Tratto[][] }
	| { tipo: 'codice'; testo: string }
	| { tipo: 'citazione'; tratti: Tratto[] }
	| { tipo: 'linea' };

/** Inline marks: `code`, **bold**, *italic* / _italic_, [text](url) shown as text. */
export function tratti(riga: string): Tratto[] {
	const out: Tratto[] = [];
	const re = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\([^)]*\)/g;
	let ultimo = 0;
	for (const m of riga.matchAll(re)) {
		if (m.index! > ultimo) out.push({ testo: riga.slice(ultimo, m.index) });
		if (m[1] !== undefined) out.push({ testo: m[1], codice: true });
		else if (m[2] !== undefined || m[3] !== undefined) out.push({ testo: (m[2] ?? m[3])!, forte: true });
		else if (m[4] !== undefined || m[5] !== undefined) out.push({ testo: (m[4] ?? m[5])!, corsivo: true });
		else out.push({ testo: m[6]! });
		ultimo = m.index! + m[0].length;
	}
	if (ultimo < riga.length) out.push({ testo: riga.slice(ultimo) });
	return out;
}

export function markdown(sorgente: string): Blocco[] {
	const righe = sorgente.replace(/\r\n?/g, '\n').split('\n');
	const out: Blocco[] = [];
	let paragrafo: string[] = [];
	const chiudi = () => {
		if (paragrafo.length) out.push({ tipo: 'paragrafo', tratti: tratti(paragrafo.join(' ')) });
		paragrafo = [];
	};
	for (let i = 0; i < righe.length; i++) {
		const r = righe[i];
		if (/^\s*```/.test(r)) {
			chiudi();
			const codice: string[] = [];
			while (++i < righe.length && !/^\s*```/.test(righe[i])) codice.push(righe[i]);
			out.push({ tipo: 'codice', testo: codice.join('\n') });
			continue;
		}
		const titolo = /^(#{1,6})\s+(.*)$/.exec(r);
		const voce = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(r);
		if (titolo) {
			chiudi();
			out.push({ tipo: 'titolo', livello: titolo[1].length, tratti: tratti(titolo[2]) });
		} else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(r)) {
			chiudi();
			out.push({ tipo: 'linea' });
		} else if (voce) {
			chiudi();
			const ordinato = /\d/.test(voce[1]);
			const prima = out[out.length - 1];
			if (prima?.tipo === 'elenco' && prima.ordinato === ordinato) prima.voci.push(tratti(voce[2]));
			else out.push({ tipo: 'elenco', ordinato, voci: [tratti(voce[2])] });
		} else if (/^\s*>/.test(r)) {
			chiudi();
			out.push({ tipo: 'citazione', tratti: tratti(r.replace(/^\s*>\s?/, '')) });
		} else if (r.trim() === '') {
			chiudi();
		} else {
			paragrafo.push(r.trim());
		}
	}
	chiudi();
	return out;
}

// ── Source code ──────────────────────────────────────────────────────

export interface Gettone {
	testo: string;
	classe?: 'commento' | 'stringa' | 'numero' | 'parola';
}

const PAROLE = new Set(
	`abstract and as async await break case catch class const continue def default del do elif else enum except export extends false final finally fn for from func function if impl import in interface is let loop match mod mut new nil none not null or package pass private protected pub public raise return self static struct super switch this throw true try type typeof use var void where while with yield`.split(
		' '
	)
);

/** Languages whose line comments start with `#` rather than `//`. */
const CANCELLETTO = new Set(['py', 'rb', 'sh', 'bash', 'yaml', 'yml', 'toml', 'ps1', 'r', 'conf', 'ini', 'env']);

/** Splits code into coloured tokens: comments, strings, numbers and keywords. */
export function evidenzia(codice: string, ext: string): Gettone[] {
	const commento = CANCELLETTO.has(ext) ? '#[^\\n]*' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
	const re = new RegExp(`(${commento})|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`[^\`]*\`)|(\\b\\d[\\d_.]*\\b)|([A-Za-z_]\\w*)`, 'g');
	const out: Gettone[] = [];
	let ultimo = 0;
	for (const m of codice.matchAll(re)) {
		const classe = m[1] ? 'commento' : m[2] ? 'stringa' : m[3] ? 'numero' : PAROLE.has(m[4]!) ? 'parola' : undefined;
		if (!classe) continue;
		if (m.index! > ultimo) out.push({ testo: codice.slice(ultimo, m.index) });
		out.push({ testo: m[0], classe });
		ultimo = m.index! + m[0].length;
	}
	if (ultimo < codice.length) out.push({ testo: codice.slice(ultimo) });
	return out;
}

// ── CSV ──────────────────────────────────────────────────────────────

/** Rows of a CSV, delimiter guessed from the first line (; , tab or |), quotes honoured. */
export function csv(testo: string, massimo = 200): string[][] {
	const prima = testo.slice(0, testo.indexOf('\n') === -1 ? undefined : testo.indexOf('\n'));
	const sep = [';', ',', '\t', '|'].map((s) => [s, prima.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
	const righe: string[][] = [];
	let riga: string[] = [];
	let campo = '';
	let virgolette = false;
	for (let i = 0; i < testo.length && righe.length < massimo; i++) {
		const c = testo[i];
		if (virgolette) {
			if (c === '"' && testo[i + 1] === '"') {
				campo += '"';
				i++;
			} else if (c === '"') virgolette = false;
			else campo += c;
		} else if (c === '"' && campo === '') virgolette = true;
		else if (c === sep) {
			riga.push(campo);
			campo = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && testo[i + 1] === '\n') i++;
			riga.push(campo);
			righe.push(riga);
			riga = [];
			campo = '';
		} else campo += c;
	}
	if ((campo !== '' || riga.length > 0) && righe.length < massimo) righe.push([...riga, campo]);
	return righe;
}
