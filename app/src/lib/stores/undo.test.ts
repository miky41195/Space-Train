import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UndoStore, HISTORY_KEY } from './undo.svelte';
import { fakeBackend } from '../test-doubles';
import { FakeDisk } from '../fake-disk';

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

	it('undoing a move that merged two folders leaves the destination files', async () => {
		const disk = new FakeDisk(['C:\\A\\Foto\\nuova.jpg', 'C:\\B\\Foto\\vecchia.jpg']);
		const transfer = (o: { sources: string[]; dest: string; mode: string; policy: string }) =>
			disk.invoke('transfer', o) as Promise<{ copied: number; skipped: number; cancelled: boolean; pairs: Array<[string, string]> }>;
		const navigate = async (path: string) => path.slice(0, path.lastIndexOf('\\'));
		const a = new UndoStore(fakeBackend({ transfer, navigate }));

		const outcome = await transfer({ sources: ['C:\\A\\Foto'], dest: 'C:\\B', mode: 'move', policy: 'overwrite' });
		expect(disk.exists('C:\\B\\Foto\\nuova.jpg')).toBe(true);
		a.record({ kind: 'move', pairs: outcome.pairs });

		await a.undo();
		expect(disk.exists('C:\\A\\Foto\\nuova.jpg')).toBe(true);
		expect(disk.exists('C:\\B\\Foto\\nuova.jpg')).toBe(false);
		expect(disk.exists('C:\\B\\Foto\\vecchia.jpg')).toBe(true);
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

describe('UndoStore history', () => {
	let saved: Map<string, string>;
	beforeEach(() => {
		saved = new Map();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => saved.get(k) ?? null,
			setItem: (k: string, v: string) => void saved.set(k, v)
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it('keeps the operations for the next start, and only the persisted store does', () => {
		new UndoStore(fakeBackend()).record({ kind: 'rename', from: 'C:\\x', to: 'C:\\y' });
		expect(saved.has(HISTORY_KEY)).toBe(false);

		new UndoStore(fakeBackend(), true).record({ kind: 'rename', from: 'C:\\a', to: 'C:\\b' });
		const later = new UndoStore(fakeBackend(), true);
		expect(later.history.map((h) => h.op)).toEqual([{ kind: 'rename', from: 'C:\\a', to: 'C:\\b' }]);
		// Ctrl+Z after a restart does nothing: yesterday's work is undone from the panel.
		expect(later.empty).toBe(true);
	});

	it('undoes an older entry and leaves the later one for Ctrl+Z', async () => {
		const renameEntry = vi.fn(async () => '');
		const a = new UndoStore(fakeBackend({ renameEntry }), true);
		a.record({ kind: 'rename', from: 'C:\\a', to: 'C:\\b' });
		a.record({ kind: 'rename', from: 'C:\\c', to: 'C:\\d' });

		await a.undoEntry(a.history[0].id);
		expect(renameEntry).toHaveBeenCalledWith('C:\\b', 'a');
		expect(a.history[0].undone).toBe(true);
		expect(a.next()).toBe('rinomina di «d»');
		// The undone one is gone from Ctrl+Z.
		await a.undo();
		await a.undo();
		expect(renameEntry).toHaveBeenCalledTimes(2);
	});

	it('an entry that cannot be undone any more stays, switched off, with the reason', async () => {
		const a = new UndoStore(
			fakeBackend({
				renameEntry: async () => {
					throw { kind: 'io', message: 'Esiste già un elemento con nome «a».' };
				}
			}),
			true
		);
		a.record({ kind: 'rename', from: 'C:\\a', to: 'C:\\b' });
		await expect(a.undoEntry(a.history[0].id)).rejects.toBeTruthy();
		expect(a.history[0]).toMatchObject({ undone: false, failed: 'Esiste già un elemento con nome «a».' });
		expect(await a.undoEntry(a.history[0].id)).toBeNull();
	});

	it('forgets what is older than 30 days', () => {
		const old = Date.now() - 31 * 86_400_000;
		saved.set(HISTORY_KEY, JSON.stringify([{ id: 'old', at: old, op: { kind: 'rotate', paths: ['C:\\a.png'], clockwise: true }, undone: false }]));
		const a = new UndoStore(fakeBackend(), true);
		a.record({ kind: 'rename', from: 'C:\\a', to: 'C:\\b' });
		expect(a.history.map((h) => h.id)).not.toContain('old');
	});
});
