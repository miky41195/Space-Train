import { describe, it, expect, vi } from 'vitest';
import { AggiornamentiStore, type Aggiornamento, type FonteAggiornamenti } from './aggiornamenti.svelte';

function aggiornamento(over: Partial<Aggiornamento> = {}): Aggiornamento {
	return { version: '0.2.0', download: vi.fn(async () => {}), install: vi.fn(async () => {}), ...over };
}

function fonte(trovato: Aggiornamento | null | Error): FonteAggiornamenti & { riavvia: ReturnType<typeof vi.fn> } {
	return {
		cerca: vi.fn(async () => {
			if (trovato instanceof Error) throw trovato;
			return trovato;
		}),
		riavvia: vi.fn(async () => {})
	};
}

describe('AggiornamentiStore', () => {
	it('senza aggiornamenti resta fermo e non mostra niente', async () => {
		const s = new AggiornamentiStore(fonte(null));
		await s.controlla();
		expect(s.stato).toBe('fermo');
		expect(s.daMostrare).toBe(false);
	});

	it('un aggiornamento si scarica prima di chiedere il riavvio', async () => {
		const a = aggiornamento();
		const s = new AggiornamentiStore(fonte(a));
		await s.controlla();
		expect(a.download).toHaveBeenCalledTimes(1);
		expect(a.install).not.toHaveBeenCalled();
		expect(s.stato).toBe('pronto');
		expect(s.versione).toBe('0.2.0');
		expect(s.daMostrare).toBe(true);
	});

	it('installa e poi riavvia', async () => {
		const a = aggiornamento();
		const f = fonte(a);
		const s = new AggiornamentiStore(f);
		await s.controlla();
		await s.installa();
		expect(a.install).toHaveBeenCalledTimes(1);
		expect(f.riavvia).toHaveBeenCalledTimes(1);
	});

	it('senza rete non disturba e riprova al controllo dopo', async () => {
		const s = new AggiornamentiStore(fonte(new Error('offline')));
		await s.controlla();
		expect(s.stato).toBe('fermo');
		expect(s.daMostrare).toBe(false);
	});

	it('un download fallito non lascia la barra a metà', async () => {
		const a = aggiornamento({ download: vi.fn(async () => Promise.reject(new Error('rete'))) });
		const s = new AggiornamentiStore(fonte(a));
		await s.controlla();
		expect(s.stato).toBe('fermo');
	});

	it('«Più tardi» nasconde la barra ma l aggiornamento resta pronto', async () => {
		const s = new AggiornamentiStore(fonte(aggiornamento()));
		await s.controlla();
		s.rimanda();
		expect(s.daMostrare).toBe(false);
		expect(s.stato).toBe('pronto');
	});

	it('un installazione fallita lascia riprovare', async () => {
		const a = aggiornamento({ install: vi.fn(async () => Promise.reject(new Error('negato'))) });
		const s = new AggiornamentiStore(fonte(a));
		await s.controlla();
		await expect(s.installa()).rejects.toThrow();
		expect(s.stato).toBe('pronto');
	});
});
