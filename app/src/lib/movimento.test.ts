import { describe, it, expect } from 'vitest';
import { conMovimento, leggiMovimento, fineInScena, movimentoPredefinito, CAMMINA } from './movimento';

describe('movimento delle voci del corteo', () => {
	it('le voci di sempre camminano e restano scritte com erano', () => {
		expect(leggiMovimento('img:C:\\gatto.gif')).toEqual({ movimento: CAMMINA, voce: 'img:C:\\gatto.gif' });
		expect(conMovimento('img:C:\\gatto.gif', CAMMINA)).toBe('img:C:\\gatto.gif');
	});

	it('fermo e attraversa fanno il giro completo, anche davanti a uno spritesheet', () => {
		const sprite = 'sprite:{"src":"C:\\\\onda.png","larghezza":64}';
		const m = {
			tipo: 'attraversa' as const,
			posizione: 10,
			ritardo: 1.5,
			durata: 3,
			continuo: true,
			pausa: 2,
			verso: 'sinistra' as const,
			specchia: true,
			altezza: 20
		};
		const scritta = conMovimento(sprite, m);
		expect(scritta.startsWith('mov:')).toBe(true);
		expect(leggiMovimento(scritta)).toEqual({ movimento: m, voce: sprite });
	});

	it('i numeri fuori misura tornano nei limiti', () => {
		const scritta = conMovimento('img:x', { tipo: 'fermo', posizione: 180, ritardo: -3, durata: 0, pausa: -1, altezza: 999 });
		expect(leggiMovimento(scritta).movimento).toMatchObject({
			tipo: 'fermo',
			posizione: 100,
			ritardo: 0,
			durata: 0.5,
			pausa: 0,
			altezza: 200
		});
	});

	it('le voci salvate prima restano legate ai passaggi; quelle nuove partono in loop', () => {
		const vecchia = 'mov:{"tipo":"attraversa","posizione":0,"ritardo":0,"durata":4}|img:x';
		expect(leggiMovimento(vecchia).movimento).toMatchObject({ continuo: false, verso: 'destra', specchia: false });
		expect(movimentoPredefinito('attraversa').continuo).toBe(true);
		expect(movimentoPredefinito('fermo').continuo).toBe(true);
	});

	it('chi è continuo non allunga i passaggi', () => {
		expect(fineInScena({ ...movimentoPredefinito('fermo'), continuo: true })).toBe(0);
	});

	it('un prefisso rovinato non perde la voce', () => {
		expect(leggiMovimento('mov:{rotto}|img:x').voce).toBe('img:x');
		expect(leggiMovimento('mov:senza-fine').movimento.tipo).toBe('cammina');
	});

	it('quanto resta in scena', () => {
		expect(fineInScena({ ...movimentoPredefinito('fermo'), continuo: false, ritardo: 2, durata: 8 })).toBe(10);
		expect(fineInScena(CAMMINA)).toBe(0);
		expect(movimentoPredefinito('attraversa').posizione).toBe(0);
	});
});
