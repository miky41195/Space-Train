import { describe, it, expect, vi } from 'vitest';
import { AnnullaStore } from './annulla.svelte';
import { backendFinto } from '../test-doppi';

describe('AnnullaStore', () => {
	it('nasce vuota e senza niente da annullare', async () => {
		const a = new AnnullaStore(backendFinto());
		expect(a.vuota).toBe(true);
		expect(a.prossima()).toBeNull();
		expect(await a.annulla()).toBeNull();
	});

	it('annulla una rinomina rimettendo il nome di prima', async () => {
		const renameEntry = vi.fn(async () => '');
		const a = new AnnullaStore(backendFinto({ renameEntry }));
		a.registra({ tipo: 'rinomina', da: 'C:\\vecchio.txt', a: 'C:\\nuovo.txt' });

		expect(a.prossima()).toBe('rinomina di «nuovo.txt»');
		await a.annulla();
		expect(renameEntry).toHaveBeenCalledWith('C:\\nuovo.txt', 'vecchio.txt');
		expect(a.vuota).toBe(true);
	});

	it('annullare una creazione la sposta nel Cestino, non la distrugge', async () => {
		const moveToTrash = vi.fn(async () => {});
		const a = new AnnullaStore(backendFinto({ moveToTrash }));
		a.registra({ tipo: 'crea', paths: ['C:\\copia.txt'], descrizione: 'copia di 1 elemento' });

		expect(await a.annulla()).toBe('copia di 1 elemento');
		expect(moveToTrash).toHaveBeenCalledWith(['C:\\copia.txt']);
	});

	it('annullare un cestino ripristina gli originali', async () => {
		const trashRestoreOriginals = vi.fn(async () => {});
		const a = new AnnullaStore(backendFinto({ trashRestoreOriginals }));
		a.registra({ tipo: 'cestino', originali: ['C:\\a.txt', 'C:\\b.txt'] });

		expect(await a.annulla()).toBe('eliminazione di 2 elementi');
		expect(trashRestoreOriginals).toHaveBeenCalledWith(['C:\\a.txt', 'C:\\b.txt']);
	});

	it('annullare uno spostamento riporta ogni elemento a casa col suo nome', async () => {
		const transfer = vi.fn(async (o: { sources: string[]; dest: string }) => ({
			copiati: 1,
			saltati: 0,
			annullato: false,
			coppie: [[o.sources[0], `${o.dest}\\nota (2).txt`]] as Array<[string, string]>
		}));
		const renameEntry = vi.fn(async () => '');
		const a = new AnnullaStore(
			backendFinto({ transfer, renameEntry, navigate: async () => 'C:\\Origine' })
		);
		a.registra({ tipo: 'sposta', coppie: [['C:\\Origine\\nota.txt', 'C:\\Dest\\nota (2).txt']] });

		await a.annulla();
		expect(transfer).toHaveBeenCalledWith(
			expect.objectContaining({ sources: ['C:\\Dest\\nota (2).txt'], dest: 'C:\\Origine', mode: 'move' })
		);
		// Era arrivato numerato: tornando riprende il nome originale.
		expect(renameEntry).toHaveBeenCalledWith('C:\\Origine\\nota (2).txt', 'nota.txt');
	});

	it('le operazioni vuote non entrano in pila', () => {
		const a = new AnnullaStore(backendFinto());
		a.registra({ tipo: 'sposta', coppie: [] });
		a.registra({ tipo: 'crea', paths: [], descrizione: 'niente' });
		expect(a.vuota).toBe(true);
	});

	it('si annulla dall ultima alla prima', async () => {
		const renameEntry = vi.fn(async () => '');
		const a = new AnnullaStore(backendFinto({ renameEntry }));
		a.registra({ tipo: 'rinomina', da: 'C:\\a', a: 'C:\\b' });
		a.registra({ tipo: 'rinomina', da: 'C:\\b', a: 'C:\\c' });

		await a.annulla();
		expect(renameEntry).toHaveBeenLastCalledWith('C:\\c', 'b');
		await a.annulla();
		expect(renameEntry).toHaveBeenLastCalledWith('C:\\b', 'a');
	});

	it('un annullamento fallito esce comunque dalla pila', async () => {
		const a = new AnnullaStore(
			backendFinto({
				renameEntry: async () => {
					throw { kind: 'notFound' };
				}
			})
		);
		a.registra({ tipo: 'rinomina', da: 'C:\\a', a: 'C:\\b' });
		await expect(a.annulla()).rejects.toEqual({ kind: 'notFound' });
		expect(a.vuota).toBe(true);
	});
});
