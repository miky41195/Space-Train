import type { Backend, Listing } from './ipc';

/**
 * Backend finto condiviso dai test.
 *
 * Sta in un modulo suo perché ogni file di test che ne aveva una copia
 * doveva essere aggiornato a ogni nuovo comando IPC.
 */
export function backendFinto(over: Partial<Backend> = {}): Backend {
	return {
		async listDir(path: string): Promise<Listing> {
			return { path, entries: [] };
		},
		async openEntry() {},
		async navigate(path: string) {
			return path;
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
		async iconForExtension() {
			return null;
		},
		async thumbnail() {
			return null;
		},
		async scanConflicts() {
			return [];
		},
		async transfer() {
			return { copiati: 0, saltati: 0, annullato: false, coppie: [] };
		},
		async cancelTransfer() {
			return true;
		},
		async deletePermanently() {},
		async trashRestore() {},
		async trashPurge() {},
		async trashEmpty() {},
		async trashRestoreOriginals() {},
		async textPreview() {
			return null;
		},
		async resolvePath(input: string) {
			return { cartella: input, seleziona: null };
		},
		async clipboardWrite() {},
		async clipboardRead() {
			return null;
		},
		async clipboardClear() {},
		async watchDirs() {},
		async keyModifiers() {
			return { ctrl: false, shift: false, alt: false };
		},
		async startDrag() {
			return 'nessuno' as const;
		},
		async showShellMenu() {
			return { eseguito: false, apri: null };
		},
		async openTerminal() {},
		async appVersion() {
			return '0.0.0';
		},
		async showProperties() {},
		async openWith() {},
		async runAsAdmin() {},
		async scegliCartella() {
			return null;
		},
		async newFileTypes() {
			return [{ ext: '.txt', nome: 'Documento di testo' }];
		},
		async createNewFile() {
			return '';
		},
		async initialPath() {
			return null;
		},
		async newWindow() {
			return 'finestra-2';
		},
		async apriEditorTemi() {},
		async saveThemeImage(nome: string) {
			return `C:\\Temi\\${nome}`;
		},
		async readThemeImage() {
			return '';
		},
		async amiciStato() {
			return { codice: 'codice-di-questo-pc', pronto: true, amici: [] };
		},
		async amiciAggiungi() {},
		async amiciAccetta() {},
		async amiciRimuovi() {},
		async amiciCondividi() {
			return { codice: 'codice-di-questo-pc', pronto: true, amici: [] };
		},
		async amiciQr() {
			return '';
		},
		async lanStato() {
			return {
				id: 'QUESTO-0000',
				nome: 'QUESTO',
				cartellaRicevuti: 'C:\\Ricevuti',
				visibile: false,
				condivisa: null,
				ricevuti: null,
				indirizzi: []
			};
		},
		async lanImposta(config) {
			return { id: 'QUESTO-0000', nome: 'QUESTO', cartellaRicevuti: 'C:\\Ricevuti', ...config };
		},
		async lanPari() {
			return [];
		},
		async lanRispondi() {},
		async lanApri() {},
		async lanAnnullaRicezione() {
			return true;
		},
		async lanPreparaTrascina(paths: string[]) {
			return paths;
		},
		async lanInvia() {},
		async lanScarica() {
			return { copiati: 0, saltati: 0, annullato: false, coppie: [] };
		},
		async search() {
			return 0;
		},
		async compress() {
			return '';
		},
		async extract() {
			return '';
		},
		...over
	};
}
