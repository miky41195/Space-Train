import { describe, it, expect } from 'vitest';
import { csv, evidenzia, markdown, tratti } from './anteprima-testi';

describe('markdown preview', () => {
	it('reads headings, lists, code blocks, quotes and inline marks', () => {
		const b = markdown('# Trasloco\n\nPrima **scatoloni**, poi `libri`.\n\n- bollette\n- residenza\n\n```\nx = 1\n```\n> nota');
		expect(b.map((x) => x.tipo)).toEqual(['titolo', 'paragrafo', 'elenco', 'codice', 'citazione']);
		expect(b[2]).toEqual({ tipo: 'elenco', ordinato: false, voci: [[{ testo: 'bollette' }], [{ testo: 'residenza' }]] });
		expect(b[3]).toEqual({ tipo: 'codice', testo: 'x = 1' });
	});

	it('keeps HTML as plain text and links as their text', () => {
		expect(tratti('<img src=x onerror=alert(1)> [sito](https://a.b) *ok*')).toEqual([
			{ testo: '<img src=x onerror=alert(1)> ' },
			{ testo: 'sito' },
			{ testo: ' ' },
			{ testo: 'ok', corsivo: true }
		]);
	});
});

describe('code preview', () => {
	it('colours comments, strings, numbers and keywords; # comments in Python', () => {
		const g = evidenzia('for f in foto: # anno\n    sposta(f, "2024")', 'py');
		const di = (c: string) => g.filter((x) => x.classe === c).map((x) => x.testo);
		expect(di('parola')).toEqual(['for', 'in']);
		expect(di('commento')).toEqual(['# anno']);
		expect(di('stringa')).toEqual(['"2024"']);
		expect(g.map((x) => x.testo).join('')).toBe('for f in foto: # anno\n    sposta(f, "2024")');
		expect(evidenzia('let n = 42; // fine', 'ts').filter((x) => x.classe).map((x) => x.classe)).toEqual(['parola', 'numero', 'commento']);
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
