import { describe, it, expect } from 'vitest';
import { csv, highlight, markdown, spans } from './text-preview';

describe('markdown preview', () => {
	it('reads headings, lists, code blocks, quotes and inline marks', () => {
		const b = markdown('# Trasloco\n\nPrima **scatoloni**, poi `libri`.\n\n- bollette\n- residenza\n\n```\nx = 1\n```\n> nota');
		expect(b.map((x) => x.kind)).toEqual(['heading', 'paragraph', 'list', 'code', 'quote']);
		expect(b[2]).toEqual({ kind: 'list', ordered: false, items: [[{ text: 'bollette' }], [{ text: 'residenza' }]] });
		expect(b[3]).toEqual({ kind: 'code', text: 'x = 1' });
	});

	it('keeps HTML as plain text and links as their text', () => {
		expect(spans('<img src=x onerror=alert(1)> [sito](https://a.b) *ok*')).toEqual([
			{ text: '<img src=x onerror=alert(1)> ' },
			{ text: 'sito' },
			{ text: ' ' },
			{ text: 'ok', italic: true }
		]);
	});
});

describe('code preview', () => {
	it('colours comments, strings, numbers and keywords; # comments in Python', () => {
		const g = highlight('for f in foto: # anno\n    sposta(f, "2024")', 'py');
		const of = (c: string) => g.filter((x) => x.kind === c).map((x) => x.text);
		expect(of('keyword')).toEqual(['for', 'in']);
		expect(of('comment')).toEqual(['# anno']);
		expect(of('string')).toEqual(['"2024"']);
		expect(g.map((x) => x.text).join('')).toBe('for f in foto: # anno\n    sposta(f, "2024")');
		expect(highlight('let n = 42; // fine', 'ts').filter((x) => x.kind).map((x) => x.kind)).toEqual(['keyword', 'number', 'comment']);
	});
});

describe('csv preview', () => {
	it('guesses the delimiter and honours quotes', () => {
		expect(csv('Data;Voce;Euro\n02/03;"Luce; gas";84,20\r\n05/03;Spesa;62,10')).toEqual([
			['Data', 'Voce', 'Euro'],
			['02/03', 'Luce; gas', '84,20'],
			['05/03', 'Spesa', '62,10']
		]);
		expect(csv('a,b\n"x ""y""",2\n')).toEqual([['a', 'b'], ['x "y"', '2']]);
		expect(csv('a\n1\n2\n3', 2)).toHaveLength(2);
	});
});
