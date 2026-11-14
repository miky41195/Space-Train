/**
 * Readers for the preview pane: Markdown, source code and CSV. They return
 * plain data that Svelte renders as text, never HTML, so a file cannot
 * inject markup into the app.
 */

// ── Markdown ─────────────────────────────────────────────────────────

export interface Span {
	text: string;
	bold?: boolean;
	italic?: boolean;
	code?: boolean;
}

export type Block =
	| { kind: 'heading'; level: number; spans: Span[] }
	| { kind: 'paragraph'; spans: Span[] }
	| { kind: 'list'; ordered: boolean; items: Span[][] }
	| { kind: 'code'; text: string }
	| { kind: 'quote'; spans: Span[] }
	| { kind: 'rule' };

/** Inline marks: `code`, **bold**, *italic* / _italic_, [text](url) shown as text. */
export function spans(line: string): Span[] {
	const out: Span[] = [];
	const re = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\([^)]*\)/g;
	let last = 0;
	for (const m of line.matchAll(re)) {
		if (m.index! > last) out.push({ text: line.slice(last, m.index) });
		if (m[1] !== undefined) out.push({ text: m[1], code: true });
		else if (m[2] !== undefined || m[3] !== undefined) out.push({ text: (m[2] ?? m[3])!, bold: true });
		else if (m[4] !== undefined || m[5] !== undefined) out.push({ text: (m[4] ?? m[5])!, italic: true });
		else out.push({ text: m[6]! });
		last = m.index! + m[0].length;
	}
	if (last < line.length) out.push({ text: line.slice(last) });
	return out;
}

export function markdown(source: string): Block[] {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const out: Block[] = [];
	let paragraph: string[] = [];
	const close = () => {
		if (paragraph.length) out.push({ kind: 'paragraph', spans: spans(paragraph.join(' ')) });
		paragraph = [];
	};
	for (let i = 0; i < lines.length; i++) {
		const r = lines[i];
		if (/^\s*```/.test(r)) {
			close();
			const code: string[] = [];
			while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
			out.push({ kind: 'code', text: code.join('\n') });
			continue;
		}
		const heading = /^(#{1,6})\s+(.*)$/.exec(r);
		const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(r);
		if (heading) {
			close();
			out.push({ kind: 'heading', level: heading[1].length, spans: spans(heading[2]) });
		} else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(r)) {
			close();
			out.push({ kind: 'rule' });
		} else if (item) {
			close();
			const ordered = /\d/.test(item[1]);
			const previous = out[out.length - 1];
			if (previous?.kind === 'list' && previous.ordered === ordered) previous.items.push(spans(item[2]));
			else out.push({ kind: 'list', ordered, items: [spans(item[2])] });
		} else if (/^\s*>/.test(r)) {
			close();
			out.push({ kind: 'quote', spans: spans(r.replace(/^\s*>\s?/, '')) });
		} else if (r.trim() === '') {
			close();
		} else {
			paragraph.push(r.trim());
		}
	}
	close();
	return out;
}

// ── Source code ──────────────────────────────────────────────────────

export interface Token {
	text: string;
	kind?: 'comment' | 'string' | 'number' | 'keyword';
}

const KEYWORDS = new Set(
	`abstract and as async await break case catch class const continue def default del do elif else enum except export extends false final finally fn for from func function if impl import in interface is let loop match mod mut new nil none not null or package pass private protected pub public raise return self static struct super switch this throw true try type typeof use var void where while with yield`.split(
		' '
	)
);

/** Languages whose line comments start with `#` rather than `//`. */
const HASH_COMMENTS = new Set(['py', 'rb', 'sh', 'bash', 'yaml', 'yml', 'toml', 'ps1', 'r', 'conf', 'ini', 'env']);

/** Splits code into coloured tokens: comments, strings, numbers and keywords. */
export function highlight(code: string, ext: string): Token[] {
	const comment = HASH_COMMENTS.has(ext) ? '#[^\\n]*' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
	const re = new RegExp(`(${comment})|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`[^\`]*\`)|(\\b\\d[\\d_.]*\\b)|([A-Za-z_]\\w*)`, 'g');
	const out: Token[] = [];
	let last = 0;
	for (const m of code.matchAll(re)) {
		const kind = m[1] ? 'comment' : m[2] ? 'string' : m[3] ? 'number' : KEYWORDS.has(m[4]!) ? 'keyword' : undefined;
		if (!kind) continue;
		if (m.index! > last) out.push({ text: code.slice(last, m.index) });
		out.push({ text: m[0], kind });
		last = m.index! + m[0].length;
	}
	if (last < code.length) out.push({ text: code.slice(last) });
	return out;
}

// ── CSV ──────────────────────────────────────────────────────────────

/** Rows of a CSV, delimiter guessed from the first line (; , tab or |), quotes honoured. */
export function csv(text: string, max = 200): string[][] {
	const first = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'));
	const sep = [';', ',', '\t', '|'].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length && rows.length < max; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"' && field === '') quoted = true;
		else if (c === sep) {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else field += c;
	}
	if ((field !== '' || row.length > 0) && rows.length < max) rows.push([...row, field]);
	return rows;
}
