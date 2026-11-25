import type { Backend, Listing } from './ipc';

/**
 * Fake backend shared by the tests.
 *
 * It lives in a module of its own because every test file that had a copy
 * of it had to be updated at every new IPC command.
 */
export function fakeBackend(over: Partial<Backend> = {}): Backend {
	return {
		async listDir(path: string): Promise<Listing> {
			return { path, entries: [] };
		},
		async openEntry() {},
		async folderSize() {
			return 0;
		},
		async folderVisit() {
			return null;
		},
		async folderVisitsForget() {},
		async sizeTurn() {},
		async cleanupRound() {},
		async cleanupScan() {
			return [];
		},
		async programsList() {
			return [];
		},
		async programUninstall() {},
		async programRemoveLeftovers() {},
		async cleanupRecycleLeftovers() {},
		async textRead() {
			return { text: '', crlf: false, bom: false, modified: 0 };
		},
		async textWrite() {
			return 0;
		},
		async actionLines() {
			return [];
		},
		async actionRun() {
			return { total: 1, failed: 0, detail: '' };
		},
		async terminalOpen() {
			return 1;
		},
		async terminalWrite() {},
		async terminalResize() {},
		async terminalClose() {},
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
			return { copied: 0, skipped: 0, cancelled: false, pairs: [] };
		},
		async cancelTransfer() {
			return true;
		},
		async deletePermanently() {},
		async trashRestore() {},
		async trashPurge() {},
		async trashEmpty() {},
		async deleteItems({ paths }) {
			return { done: paths, failed: [] };
		},
		async trashRestoreOriginals() {},
		async textPreview() {
			return null;
		},
		async resolvePath(input: string) {
			return { folder: input, select: null };
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
			return 'none' as const;
		},
		async showShellMenu() {
			return { executed: false, open: null };
		},
		async openTerminal() {},
		async appVersion() {
			return '0.0.0';
		},
		async showProperties() {},
		async openWith() {},
		async runAsAdmin() {},
		async pickFolder() {
			return null;
		},
		async newFileTypes() {
			return [{ ext: '.txt', name: 'Documento di testo' }];
		},
		async createNewFile() {
			return '';
		},
		async initialPath() {
			return null;
		},
		async newWindow() {
			return 'window-2';
		},
		async openThemeEditor() {},
		async saveThemeImage(name: string) {
			return `C:\\Temi\\${name}`;
		},
		async readThemeImage() {
			return '';
		},
		async friendsStatus() {
			return { code: 'codice-di-questo-pc', ready: true, friends: [] };
		},
		async friendsAdd() {},
		async friendsAccept() {},
		async friendsRemove() {},
		async friendsShare() {
			return { code: 'codice-di-questo-pc', ready: true, friends: [] };
		},
		async friendsQr() {
			return '';
		},
		async friendsBackup() {
			return { code: 'codice-di-questo-pc', ready: true, friends: [] };
		},
		async friendsBackupNow() {
			return '';
		},
		async friendsAnswerBackup() {
			return { code: 'codice-di-questo-pc', ready: true, friends: [] };
		},
		async lanStatus() {
			return {
				id: 'QUESTO-0000',
				name: 'QUESTO',
				receivedFolder: 'C:\\Ricevuti',
				visible: false,
				shared: null,
				received: null,
				addresses: []
			};
		},
		async lanConfigure(config) {
			return { id: 'QUESTO-0000', name: 'QUESTO', receivedFolder: 'C:\\Ricevuti', ...config };
		},
		async lanPeers() {
			return [];
		},
		async lanRespond() {},
		async lanOpen() {},
		async lanCancelReceive() {
			return true;
		},
		async lanPrepareDrag(paths: string[]) {
			return paths;
		},
		async lanSend() {},
		async lanDownload() {
			return { copied: 0, skipped: 0, cancelled: false, pairs: [] };
		},
		async search() {
			return 0;
		},
		async findDuplicates() {
			return 0;
		},
		async entriesFor() {
			return [];
		},
		async compareFolders() {
			return { onlyHere: [], onlyThere: [], different: [] };
		},
		async compress() {
			return '';
		},
		async fileChecksum() {
			return 'ab'.repeat(32);
		},
		async archiveList() {
			return [];
		},
		async archiveExtract() {},
		async archiveOpenItem() {
			return '';
		},
		async pauseTransfer() {
			return true;
		},
		async shortcutFree() {
			return true;
		},
		async imageRotate() {},
		async serverList() {
			return [];
		},
		async serverPut(c: import('./ipc').ServerConfig) {
			return c;
		},
		async serverRemove() {},
		async serverTrust() {},
		async serverPassword() {},
		async serverTest() {},
		async versionsList() {
			return [];
		},
		async versionExtract(path: string) {
			return path;
		},
		async versionRestore() {},
		async versionsOverview() {
			return { protected: [], days: 30, maxBytes: 5 * 1024 ** 3, used: 0 };
		},
		async versionsProtect() {},
		async versionsLimits() {},
		async serverBackup() {
			return 'già allineata';
		},
		async vaultCreate() {
			return '';
		},
		async vaultUnlock() {},
		async vaultLock() {},
		async vaultIsOpen() {
			return false;
		},
		async vaultList() {
			return [];
		},
		async vaultAdd() {
			return 0;
		},
		async vaultExtract() {
			return [];
		},
		async vaultOpenItem() {
			return '';
		},
		async vaultDelete() {},
		async gitStatus() {
			return null;
		},
		async mediaProps(paths: string[]) {
			return paths.map(() => null);
		},
		async imageConvert() {
			return [];
		},
		async indexSearch() {
			return { total: 0, entries: [] };
		},
		async indexStatus() {
			return { files: 0, building: false, foldersRead: 0 };
		},
		async phoneStart() {
			return { url: 'http://192.168.1.2:7311/token/', qr: '<svg></svg>', remoteUrl: null, remoteQr: null };
		},
		async phoneStop() {},
		async phoneKeep() {
			return '';
		},
		async phoneDiscard() {},
		async extract() {
			return '';
		},
		...over
	};
}
