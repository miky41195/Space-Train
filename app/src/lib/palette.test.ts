import { describe, it, expect } from 'vitest';
import { filtraComandi, type Comando } from './palette';

const c = (tipo: Comando['tipo'], nome: string): Comando => ({ tipo, nome, esegui: () => {} });
const comandi = [c('azione', 'Copia'), c('azione', 'Doppio pannello'), c('cartella', 'Download'), c('impostazione', 'Clic doppio per aprire')];

describe('command palette', () => {
	it('with no text lists the first commands in order', () => {
		expect(filtraComandi(comandi, '', 2).map((t) => t.comando.nome)).toEqual(['Copia', 'Doppio pannello']);
	});

	it('finds by fuzzy match, best first, with the letters to highlight', () => {
		const t = filtraComandi(comandi, 'dopp');
		expect(t[0].comando.nome).toBe('Doppio pannello');
		expect(t[0].posizioni).toEqual([0, 1, 2, 3]);
		expect(filtraComandi(comandi, 'zzz')).toEqual([]);
	});
});
