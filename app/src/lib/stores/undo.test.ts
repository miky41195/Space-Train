import { describe, it, expect, vi } from 'vitest';
import { UndoStore } from './undo.svelte';
import { fakeBackend } from '../test-doubles';

describe('UndoStore', () => {
	it('starts empty with nothing to undo', async () => {
		const a = new UndoStore(fakeBackend());
		expect(a.empty).toBe(true);
		expect(a.next()).toBeNull();
		expect(await a.undo()).toBeNull();
	});

	it('undoes a rename by putting the old name back', async () => {
		const renameEntry = vi.fn(async () => '');
		const a = new UndoStore(fakeBackend({ renameEntry }));
		a.record({ kind: 'rename', from: 'C:\\vecchio.txt', to: 'C:\\nuovo.txt' });

		expect(a.next()).toBe('rinomina di «nuovo.txt»');
		await a.undo();
		expect(renameEntry).toHaveBeenCalledWith('C:\\nuovo.txt', 'vecchio.txt');
		expect(a.empty).toBe(true);
	});

	it('undoing a creation moves it to the Recycle Bin, never destroys it', async () => {
		const moveToTrash = vi.fn(async () => {});
		const a = new UndoStore(fakeBackend({ moveToTrash }));
		a.record({ kind: 'create', paths: ['C:\\copia.txt'], description: 'copia di 1 elemento' });

		expect(await a.undo()).toBe('copia di 1 elemento');
		expect(moveToTrash).toHaveBeenCalledWith(['C:\\copia.txt']);
	});

	it('undoing a trash restores the originals', async () => {
		const trashRestoreOriginals = vi.fn(async () => {});
		const a = new UndoStore(fakeBackend({ trashRestoreOriginals }));
		a.record({ kind: 'trash', originals: ['C:\\a.txt', 'C:\\b.txt'] });

		expect(await a.undo()).toBe('eliminazione di 2 elementi');
		expect(trashRestoreOriginals).toHaveBeenCalledWith(['C:\\a.txt', 'C:\\b.txt']);
	});

	it('undoing a move brings every item home under its own name', async () => {
		const transfer = vi.fn(async (o: { sources: string[]; dest: string }) => ({
			copied: 1,
			skipped: 0,
			cancelled: false,
			pairs: [[o.sources[0], `${o.dest}\\nota (2).txt`]] as Array<[string, string]>
		}));
		const renameEntry = vi.fn(async () => '');
		const a = new UndoStore(fakeBackend({ transfer, renameEntry, navigate: async () => 'C:\\Origine' }));
		a.record({ kind: 'move', pairs: [['C:\\Origine\\nota.txt', 'C:\\Dest\\nota (2).txt']] });

		await a.undo();
		expect(transfer).toHaveBeenCalledWith(
			expect.objectContaining({ sources: ['C:\\Dest\\nota (2).txt'], dest: 'C:\\Origine', mode: 'move' })
		);
		// It had arrived numbered: going back it takes the original name again.
		expect(renameEntry).toHaveBeenCalledWith('C:\\Origine\\nota (2).txt', 'nota.txt');
	});

	it('empty operations do not go on the stack', () => {
		const a = new UndoStore(fakeBackend());
		a.record({ kind: 'move', pairs: [] });
		a.record({ kind: 'create', paths: [], description: 'niente' });
		expect(a.empty).toBe(true);
	});

	it('undoes from the last to the first', async () => {
		const renameEntry = vi.fn(async () => '');
		const a = new UndoStore(fakeBackend({ renameEntry }));
		a.record({ kind: 'rename', from: 'C:\\a', to: 'C:\\b' });
		a.record({ kind: 'rename', from: 'C:\\b', to: 'C:\\c' });

		await a.undo();
		expect(renameEntry).toHaveBeenLastCalledWith('C:\\c', 'b');
		await a.undo();
		expect(renameEntry).toHaveBeenLastCalledWith('C:\\b', 'a');
	});

	it('a failed undo still leaves the stack', async () => {
		const a = new UndoStore(
			fakeBackend({
				renameEntry: async () => {
					throw { kind: 'notFound' };
				}
			})
		);
		a.record({ kind: 'rename', from: 'C:\\a', to: 'C:\\b' });
		await expect(a.undo()).rejects.toEqual({ kind: 'notFound' });
		expect(a.empty).toBe(true);
	});
});
