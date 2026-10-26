import { describe, it, expect } from 'vitest';
import { ImpostazioniStore } from './impostazioni.svelte';

function archivio(iniziale: Record<string, string> = {}) {
	const dati = { ...iniziale };
	return {
		dati,
		getItem: (k: string) => dati[k] ?? null,
		setItem: (k: string, v: string) => {
			dati[k] = v;
		}
	};
}

describe('ImpostazioniStore', () => {
	it('parte dai valori predefiniti', () => {
		const i = new ImpostazioniStore(archivio());
		expect(i.vista).toBe('dettagli');
		expect(i.raggruppa).toBe('nessuno');
		expect(i.tema).toBe('spazio');
		expect(i.estensioni).toBe(true);
		expect(i.anteprima).toBe(false);
		expect(i.colonne).toEqual({ dimensione: true, data: true, tipo: false });
	});

	it('ogni modifica sopravvive al riavvio', () => {
		const a = archivio();
		const i = new ImpostazioniStore(a);
		i.impostaVista('icone', 180);
		i.imposta('tema', 'chiaro');
		i.ricordaOrdinamento('C:\\Foto', { key: 'modified', ascending: false });
		i.imposta('raggruppa', 'data');
		i.imposta('anteprima', true);
		i.alternaColonna('tipo');

		const dopo = new ImpostazioniStore(a);
		expect(dopo.vista).toBe('icone');
		expect(dopo.lato).toBe(180);
		expect(dopo.tema).toBe('chiaro');
		expect(dopo.ordinamentoDi('c:\\foto')).toEqual({ key: 'modified', ascending: false });
		expect(dopo.raggruppa).toBe('data');
		expect(dopo.anteprima).toBe(true);
		expect(dopo.colonne.tipo).toBe(true);
	});

	it('preferenze corrotte non bloccano l avvio', () => {
		const i = new ImpostazioniStore(archivio({ 'space-train.impostazioni': '{rotto' }));
		expect(i.vista).toBe('dettagli');
	});

	it('le viste delle versioni precedenti si traducono nelle nuove', () => {
		const griglia = new ImpostazioniStore(archivio({ 'space-train.impostazioni': '{"vista":"griglia"}' }));
		expect([griglia.vista, griglia.lato]).toEqual(['icone', 96]);
		const piccole = new ImpostazioniStore(archivio({ 'space-train.impostazioni': '{"vista":"piccole"}' }));
		expect([piccole.vista, piccole.lato]).toEqual(['icone', 24]);
	});

	it('il lato delle icone resta fra 16 e 256', () => {
		const i = new ImpostazioniStore(archivio());
		i.impostaVista('icone', 999);
		expect(i.lato).toBe(256);
		i.impostaVista('icone', 2);
		expect(i.lato).toBe(16);
	});
});
