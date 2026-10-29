import { describe, it, expect } from 'vitest';
import { TEMI, variabiliPer, trasparente, temaDa, coloreAccento, variabiliDa, CARATTERI, FORME_BASE, scalaTesto } from './temi';
import { FIGURE, CORTEI, svgFigura, motivoFigura, misuraFigura } from './figure';

describe('temi', () => {
	it('ogni tema definisce le stesse variabili di colore, così nessuna resta del tema precedente', () => {
		const chiavi = Object.keys(TEMI[0].variabili).sort();
		for (const t of TEMI) expect(Object.keys(t.variabili).sort(), t.id).toEqual(chiavi);
	});

	it('gli id sono unici', () => {
		const ids = TEMI.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('l accento del tema vale se non se ne sceglie un altro', () => {
		const oceano = temaDa('oceano');
		expect(coloreAccento(oceano, 'tema', '#000000')).toBe(oceano.variabili['--plasma']);
	});

	it('un accento scelto sostituisce quello del tema, anche nella tinta di selezione', () => {
		const v = variabiliPer(temaDa('spazio'), coloreAccento(temaDa('spazio'), 'verde', '#000000'));
		expect(v['--accent']).toBe('#22c55e');
		expect(v['--accent-soft']).toBe('rgba(34, 197, 94, 0.26)');
	});

	it('l accento personalizzato usa il colore scelto dall utente', () => {
		expect(coloreAccento(temaDa('spazio'), 'personalizzato', '#123456')).toBe('#123456');
	});

	it('un tema sconosciuto ripiega sul predefinito; quelli personali si trovano', () => {
		expect(temaDa('inesistente').id).toBe('spazio');
		const mio = { ...temaDa('notte'), id: 'personale-1', gruppo: 'personale' as const };
		expect(temaDa('personale-1', [mio])).toBe(mio);
	});

	it('converte un colore esadecimale in trasparenza', () => {
		expect(trasparente('#ff0080', 0.5)).toBe('rgba(255, 0, 128, 0.5)');
	});

	it('i colori derivati seguono fondo chiaro o scuro', () => {
		const t = { void: '#fff', hull: '#ffffff', rail: '#ccc', current: '#00f', plasma: '#f00', signal: '#ff0', text: '#000', dim: '#666' };
		expect(variabiliDa(t, true)['--border']).toContain('rgba(0, 0, 0');
		expect(variabiliDa(t, false)['--border']).toContain('rgba(255, 255, 255');
	});
});

describe('temi mondo', () => {
	const mondi = TEMI.filter((t) => t.gruppo === 'mondo');

	it('ci sono i mondi chiesti: anime, pokémon, gatti, kawaii, stagioni e feste', () => {
		expect(mondi.map((t) => t.id)).toEqual(
			expect.arrayContaining([
				'anime', 'pokemon', 'gatti', 'kawaii',
				'primavera', 'estate', 'autunno', 'inverno',
				'natale', 'capodanno', 'sanvalentino', 'carnevale', 'pasqua', 'halloween'
			])
		);
	});

	it('ogni mondo ha i suoi personaggi, il suo sfondo e le sue forme', () => {
		for (const t of mondi) {
			expect(t.corteo?.length, t.id).toBeGreaterThan(0);
			for (const f of t.corteo!) expect(FIGURE[f], `${t.id}: ${f}`).toBeDefined();
			expect(FIGURE[t.motivo!], t.id).toBeDefined();
			expect(t.forme, t.id).toBeDefined();
		}
	});

	it('il kawaii è più tondo dello spazio', () => {
		const kawaii = variabiliPer(temaDa('kawaii'), '#ff7ab8');
		const spazio = variabiliPer(temaDa('spazio'), '#8b5cf6');
		expect(parseInt(kawaii['--radius'])).toBeGreaterThan(parseInt(spazio['--radius']));
		expect(kawaii['--font-display']).toContain('Comic Sans');
	});

	it('lo sfondo decorativo è un SVG incorporato, assente nei temi solo colore', () => {
		expect(variabiliPer(temaDa('inverno'), '#3b82f6')['--motivo']).toMatch(/^url\("data:image\/svg\+xml,/);
		expect(variabiliPer(temaDa('spazio'), '#8b5cf6')['--motivo']).toBe('none');
	});
});

describe('figure', () => {
	it('ogni lettera usata nei disegni ha un colore nella sua tavolozza', () => {
		for (const [id, f] of Object.entries(FIGURE)) {
			const lettere = new Set(f.griglia.join('').replace(/\./g, ''));
			for (const l of lettere) expect(f.colori[l], `${id}: lettera «${l}» senza colore`).toBeDefined();
		}
	});

	it('i cortei citano solo figure esistenti', () => {
		for (const [mondo, figure] of Object.entries(CORTEI)) {
			for (const f of figure) expect(FIGURE[f], `${mondo}: ${f}`).toBeDefined();
		}
	});

	it('nessuna figura è più alta del binario', () => {
		// La linea è alta 40px e le figure si disegnano a scala 2.
		for (const [id, f] of Object.entries(FIGURE)) expect(misuraFigura(f).altezza * 2, id).toBeLessThanOrEqual(30);
	});

	it('l SVG ha i due fotogrammi del passo', () => {
		const svg = svgFigura(FIGURE.gattoNero);
		expect(svg).toContain('class="passo-a"');
		expect(svg).toContain('class="passo-b"');
		expect(svg).toContain('#2b2b35');
	});

	it('il motivo dello sfondo è quasi trasparente', () => {
		expect(decodeURIComponent(motivoFigura(FIGURE.zucca, 0.07))).toContain('opacity="0.07"');
	});
});

describe('caratteri', () => {
	it('ogni tema usa caratteri presenti nell elenco dell editor', () => {
		const valori = CARATTERI.map((c) => c.valore as string);
		for (const t of TEMI) {
			const f = { ...FORME_BASE, ...t.forme };
			expect(valori, `${t.id}: testo`).toContain(f.carattere);
			expect(valori, `${t.id}: titoli`).toContain(f.carattereTitoli);
		}
	});

	it('la dimensione del testo in pixel diventa una scala per tutti i testi', () => {
		const t = TEMI[0];
		expect(variabiliPer(t, '#8b5cf6')['--scala-testo']).toBe('1');
		const grande = { ...t, forme: { dimensione: 26 } };
		expect(scalaTesto(grande)).toBe(24 / 13);
		expect(scalaTesto({ ...t, forme: { dimensione: 2 } })).toBe(9 / 13);
		expect(scalaTesto({ ...t, forme: { dimensione: Number.NaN } })).toBe(1);
	});
});
