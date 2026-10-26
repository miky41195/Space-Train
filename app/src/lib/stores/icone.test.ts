import { describe, it, expect, vi } from 'vitest';
import { IconeStore } from './icone.svelte';
import type { Backend, Entry } from '../ipc';
import { backendFinto as backendComune } from '../test-doppi';

function voce(name: string, kind: Entry['kind'] = 'file'): Entry {
	return { name, path: `C:\\${name}`, kind, size: 1, modified: 1, hidden: false };
}

function backendFinto(over: Partial<Backend> = {}): Backend {
	return {
		...backendComune(),
		async iconForExtension(ext: string, isDir: boolean) {
			return `icona:${isDir ? 'dir' : ext}`;
		},
		async thumbnail(path: string) {
			return `mini:${path}`;
		},
		async listDir() {
			return { path: '', entries: [] };
		},
		async openEntry() {},
		async navigate() {
			return '';
		},
		async drives() {
			return [];
		},
		async knownFolders() {
			return [];
		},
		async revealInExplorer() {},
		async createFolder() {
			return '';
		},
		async renameEntry() {
			return '';
		},
		async moveToTrash() {},
		async scanConflicts() {
			return [];
		},
		async transfer() {
			return { copiati: 0, saltati: 0, annullato: false, coppie: [] };
		},
		async cancelTransfer() {
			return true;
		},
		...over
	};
}

/** Lascia girare le promise in coda. */
const respira = () => new Promise((r) => setTimeout(r, 0));

/** Aspetta che la coda si svuoti, senza dipendere da tempi fissi. */
async function svuota(s: IconeStore, giri = 400): Promise<void> {
	for (let i = 0; i < giri && s.inVolo > 0; i++) await respira();
	await respira();
}

describe('IconeStore — lettura pura', () => {
	it('leggere non avvia alcun caricamento', async () => {
		const iconForExtension = vi.fn(async () => 'icona');
		const thumbnail = vi.fn(async () => 'mini');
		const s = new IconeStore(backendFinto({ iconForExtension, thumbnail }));

		s.icona(voce('a.txt'));
		s.miniatura(voce('foto.png'));
		await respira();

		// È il requisito che tiene il rendering privo di effetti collaterali.
		expect(iconForExtension).not.toHaveBeenCalled();
		expect(thumbnail).not.toHaveBeenCalled();
	});

	it('prima di richiedere la cache è vuota', () => {
		const s = new IconeStore(backendFinto());
		expect(s.icona(voce('a.txt'))).toBeNull();
	});
});

describe('IconeStore — icone di tipo', () => {
	it('dopo la richiesta l icona è leggibile', async () => {
		const s = new IconeStore(backendFinto());
		s.richiedi([voce('a.txt')]);
		await respira();

		expect(s.icona(voce('a.txt'))).toBe('icona:txt');
	});

	it('più file dello stesso tipo costano una sola chiamata', async () => {
		const iconForExtension = vi.fn(async () => 'icona');
		const s = new IconeStore(backendFinto({ iconForExtension }));

		s.richiedi([voce('a.txt'), voce('b.txt'), voce('c.txt')]);
		await respira();
		s.richiedi([voce('d.txt')]);
		await respira();

		expect(iconForExtension).toHaveBeenCalledTimes(1);
	});

	it('un tipo senza icona non viene richiesto in eterno', async () => {
		const iconForExtension = vi.fn(async () => null);
		const s = new IconeStore(backendFinto({ iconForExtension }));

		s.richiedi([voce('a.qwerty')]);
		await respira();
		s.richiedi([voce('b.qwerty')]);
		await respira();

		expect(iconForExtension).toHaveBeenCalledTimes(1);
	});

	it('un errore del backend non lascia la voce in sospeso', async () => {
		const iconForExtension = vi.fn(async () => {
			throw new Error('boom');
		});
		const s = new IconeStore(backendFinto({ iconForExtension }));

		s.richiedi([voce('a.txt')]);
		await respira();

		expect(s.icona(voce('a.txt'))).toBe('');
	});
});

describe('IconeStore — coda delle miniature', () => {
	it('chiede la miniatura solo per immagini e video', async () => {
		const thumbnail = vi.fn(async () => 'mini');
		const s = new IconeStore(backendFinto({ thumbnail }));

		s.richiedi([voce('main.rs'), voce('cartella', 'dir'), voce('roba.zip')]);
		await svuota(s);

		expect(thumbnail).not.toHaveBeenCalled();

		s.richiedi([voce('foto.png')]);
		await svuota(s);

		expect(thumbnail).toHaveBeenCalledTimes(1);
		expect(s.miniatura(voce('foto.png'))).toBe('mini');
	});

	it('non supera il tetto di estrazioni contemporanee', async () => {
		const thumbnail = vi.fn(async (path: string) => {
			await new Promise((r) => setTimeout(r, 5));
			return `mini:${path}`;
		});
		const s = new IconeStore(backendFinto({ thumbnail }));

		s.richiedi(Array.from({ length: 20 }, (_, i) => voce(`f${i}.png`)));

		// Il picco si misura subito dopo la richiesta, prima che qualcuna
		// abbia avuto il tempo di completare.
		expect(s.inVolo).toBeLessThanOrEqual(3);

		await svuota(s);
		expect(thumbnail).toHaveBeenCalledTimes(20);
	});

	it('una nuova richiesta sostituisce la coda invece di allungarla', async () => {
		const chiamate: string[] = [];
		const thumbnail = vi.fn(async (path: string) => {
			chiamate.push(path);
			await new Promise((r) => setTimeout(r, 5));
			return 'mini';
		});
		const s = new IconeStore(backendFinto({ thumbnail }));

		// Prima schermata: partono le prime 3, le altre restano in coda.
		s.richiedi(Array.from({ length: 30 }, (_, i) => voce(`vecchia${i}.png`)));
		// L'utente scorre via prima che la coda si svuoti.
		s.richiedi([voce('nuova.png')]);

		await svuota(s);

		// Le voci uscite dallo schermo non vengono estratte: solo quelle
		// già partite più la nuova.
		expect(chiamate).toContain('C:\\nuova.png');
		expect(chiamate.filter((c) => c.includes('vecchia')).length).toBeLessThanOrEqual(3);
	});

	it('la cache delle miniature non supera il tetto', async () => {
		const s = new IconeStore(backendFinto());

		for (let blocco = 0; blocco < 45; blocco++) {
			s.richiedi(Array.from({ length: 10 }, (_, i) => voce(`foto${blocco}_${i}.png`)));
			await svuota(s);
		}

		expect(s.miniatureInMemoria).toBeGreaterThan(0);
		expect(s.miniatureInMemoria).toBeLessThanOrEqual(400);
	});
});
