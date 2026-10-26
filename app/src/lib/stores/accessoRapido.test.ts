import { describe, it, expect } from 'vitest';
import { AccessoRapidoStore } from './accessoRapido.svelte';

function archivio() {
	const dati: Record<string, string> = {};
	return {
		getItem: (k: string) => dati[k] ?? null,
		setItem: (k: string, v: string) => {
			dati[k] = v;
		}
	};
}

describe('AccessoRapidoStore', () => {
	it('fissa una volta sola, ignorando le maiuscole', () => {
		const a = new AccessoRapidoStore(archivio());
		a.fissa('C:\\Lavoro');
		a.fissa('c:\\lavoro\\');
		expect(a.cartelle).toEqual(['C:\\Lavoro']);
		expect(a.contiene('C:\\LAVORO')).toBe(true);
	});

	it('riordina senza uscire dai bordi e sgancia', () => {
		const a = new AccessoRapidoStore(archivio());
		a.fissa('C:\\A');
		a.fissa('C:\\B');
		a.muovi('C:\\A', -1);
		expect(a.cartelle).toEqual(['C:\\A', 'C:\\B']);
		a.muovi('C:\\A', 1);
		expect(a.cartelle).toEqual(['C:\\B', 'C:\\A']);
		a.sgancia('C:\\B');
		expect(a.cartelle).toEqual(['C:\\A']);
	});

	it('resta dopo un riavvio e segue una rinomina', () => {
		const arch = archivio();
		new AccessoRapidoStore(arch).fissa('C:\\Vecchia');
		const dopo = new AccessoRapidoStore(arch);
		dopo.sposta('C:\\Vecchia', 'C:\\Nuova');
		expect(new AccessoRapidoStore(arch).cartelle).toEqual(['C:\\Nuova']);
	});

	it('un archivio corrotto non blocca l avvio', () => {
		const arch = archivio();
		arch.setItem('space-train.accesso-rapido', '{rotto');
		expect(new AccessoRapidoStore(arch).cartelle).toEqual([]);
	});
});
