import { describe, it, expect } from 'vitest';
import { zoom, misuraCella, nomeTaglia, limita, LATO_MAX, LATO_MIN } from './vista';

describe('zoom', () => {
	it('dentro le icone cresce e cala a passi, senza uscire dai limiti', () => {
		let s = { vista: 'icone' as const, lato: 64 };
		const su = zoom(s, 1);
		expect(su.vista).toBe('icone');
		expect(su.lato).toBeGreaterThan(64);

		s = { vista: 'icone', lato: LATO_MAX };
		expect(zoom(s, 1).lato).toBe(LATO_MAX);
	});

	it('sotto le icone più piccole si passa a Elenco e poi a Dettagli', () => {
		const elenco = zoom({ vista: 'icone', lato: LATO_MIN }, -1);
		expect(elenco.vista).toBe('elenco');
		expect(zoom(elenco, -1).vista).toBe('dettagli');
		// Dettagli è il fondo: oltre non si va.
		expect(zoom({ vista: 'dettagli', lato: 96 }, -1).vista).toBe('dettagli');
	});

	it('risalendo da Dettagli si torna alle icone', () => {
		const elenco = zoom({ vista: 'dettagli', lato: 96 }, 1);
		expect(elenco.vista).toBe('elenco');
		expect(zoom(elenco, 1)).toEqual({ vista: 'icone', lato: LATO_MIN });
	});

	it('molti colpi di rotella portano da un estremo all altro', () => {
		let s = { vista: 'dettagli' as 'dettagli' | 'icone' | 'elenco' | 'riquadri' | 'contenuto', lato: 96 };
		for (let i = 0; i < 60; i++) s = zoom(s, 1);
		expect(s).toEqual({ vista: 'icone', lato: LATO_MAX });
		for (let i = 0; i < 60; i++) s = zoom(s, -1);
		expect(s.vista).toBe('dettagli');
	});
});

describe('misuraCella', () => {
	it('le icone grandi stanno sopra il nome e la cella cresce con loro', () => {
		const piccola = misuraCella({ vista: 'icone', lato: 64 });
		const grande = misuraCella({ vista: 'icone', lato: 256 });
		expect(piccola.orizzontale).toBe(false);
		expect(grande.larghezza).toBeGreaterThan(piccola.larghezza);
		expect(grande.icona).toBe(256);
	});

	it('le icone piccole stanno accanto al nome', () => {
		expect(misuraCella({ vista: 'icone', lato: 24 }).orizzontale).toBe(true);
	});

	it('riquadri e contenuto mostrano i dettagli; contenuto occupa la riga intera', () => {
		expect(misuraCella({ vista: 'riquadri', lato: 0 }).dettagli).toBe(true);
		const c = misuraCella({ vista: 'contenuto', lato: 0 });
		expect(c.piena).toBe(true);
		expect(c.dettagli).toBe(true);
	});
});

describe('taglie', () => {
	it('le taglie del menu hanno un nome, le altre no', () => {
		expect(nomeTaglia({ vista: 'icone', lato: 128 })).toBe('Icone grandi');
		expect(nomeTaglia({ vista: 'icone', lato: 130 })).toBeNull();
		expect(nomeTaglia({ vista: 'dettagli', lato: 128 })).toBeNull();
	});

	it('il lato si arrotonda e resta nei limiti', () => {
		expect(limita(100.6)).toBe(101);
		expect(limita(0)).toBe(LATO_MIN);
		expect(limita(10_000)).toBe(LATO_MAX);
	});
});
