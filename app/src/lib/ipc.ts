import { invoke, Channel } from '@tauri-apps/api/core';

export type EntryKind = 'dir' | 'file' | 'symlink';

export interface Entry {
	name: string;
	path: string;
	kind: EntryKind;
	size: number;
	modified: number | null;
	hidden: boolean;
	/** Solo nel Cestino: la cartella da cui l'elemento è stato eliminato. */
	origine?: string;
	/** Solo per i volumi in «Questo PC». */
	libero?: number;
	totale?: number;
	/**
	 * Ha un'icona sua, diversa da quella del tipo: un programma, un
	 * collegamento, una cartella personalizzata, un disco.
	 */
	iconaPropria?: boolean;
}

export interface Listing {
	path: string;
	entries: Entry[];
}

export type SortKey = 'name' | 'size' | 'modified' | 'kind';

export interface SortSpec {
	key: SortKey;
	ascending: boolean;
}

export interface Drive {
	label: string;
	path: string;
	libero: number | null;
	totale: number | null;
	tipo: 'fisso' | 'rimovibile' | 'rete' | 'ottico' | 'ram' | 'sconosciuto';
}

export interface KnownFolder {
	label: string;
	path: string;
	icon: string;
}

export type FsError =
	| { kind: 'accessDenied' }
	| { kind: 'notFound' }
	| { kind: 'notADirectory' }
	| { kind: 'deviceNotReady' }
	| { kind: 'io'; message: string };

/** Cosa fare quando a destinazione esiste già un elemento con lo stesso nome. */
export type Politica = 'sovrascrivi' | 'rinomina' | 'salta';

export interface Progresso {
	transferred: number;
	total: number;
}

export interface Esito {
	copiati: number;
	saltati: number;
	annullato: boolean;
	/** Sorgente e arrivo effettivo di ogni elemento trasferito. */
	coppie: Array<[string, string]>;
}

export interface CriteriRicerca {
	testo: string;
	contenuto: boolean;
	nascosti: boolean;
}

export interface ContenutoAppunti {
	paths: string[];
	taglia: boolean;
}

export interface Destinazione {
	cartella: string;
	seleziona: string | null;
}

export interface Modificatori {
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
}

/** Un tipo di file del menu «Nuovo», come lo registra Windows. */
export interface TipoNuovo {
	ext: string;
	nome: string;
}

/** Preferenze della rete locale fra copie di Space Train. */
export interface ConfigLan {
	visibile: boolean;
	condivisa: string | null;
	ricevuti: string | null;
	/** PC da raggiungere per indirizzo: un IP o un nome, anche di una VPN. */
	indirizzi: string[];
}

export interface StatoLan extends ConfigLan {
	id: string;
	nome: string;
	/** Dove finiscono i file ricevuti, anche se è quella predefinita. */
	cartellaRicevuti: string;
}

/** Un altro PC con Space Train trovato in rete locale. */
export interface Pari {
	id: string;
	nome: string;
	ip: string;
	porta: number;
	condivisa: string | null;
}

/** Un altro PC vuole inviarci dei file: serve il nostro consenso. */
export interface RichiestaInvio {
	id: number;
	da: string;
	quanti: number;
	totale: number;
	nomi: string[];
}

/** Cosa ha deciso chi ha ricevuto un trascinamento verso l'esterno. */
export type EffettoTrascina = 'sposta' | 'copia' | 'collegamento' | 'nessuno';

export interface TransferOpts {
	/** Identificativo scelto dal frontend, serve per annullare. */
	opId: number;
	sources: string[];
	dest: string;
	mode: 'copy' | 'move';
	policy: Politica;
	onProgress: (p: Progresso) => void;
}

/** Com'è finito il menu di sistema. */
export interface EsitoMenu {
	/** È stata scelta ed eseguita una voce. */
	eseguito: boolean;
	/** «Apri percorso file»: la cartella da aprire nell'app, con la voce da selezionare. */
	apri: Destinazione | null;
}

/**
 * Confine col backend. I test dello store montano una implementazione finta
 * di questa interfaccia: nessun test del frontend tocca il filesystem.
 */
export interface Backend {
	listDir(path: string, sort: SortSpec, showHidden: boolean): Promise<Listing>;
	openEntry(path: string): Promise<void>;
	navigate(path: string, direction: 'up'): Promise<string>;
	drives(): Promise<Drive[]>;
	knownFolders(): Promise<KnownFolder[]>;
	revealInExplorer(path: string): Promise<void>;
	createFolder(parent: string, name: string): Promise<string>;
	renameEntry(path: string, name: string): Promise<string>;
	moveToTrash(paths: string[]): Promise<void>;
	iconForExtension(ext: string, isDir: boolean, large: boolean): Promise<string | null>;
	thumbnail(path: string, size: number): Promise<string | null>;
	scanConflicts(sources: string[], dest: string): Promise<string[]>;
	transfer(opts: TransferOpts): Promise<Esito>;
	cancelTransfer(opId: number): Promise<boolean>;
	deletePermanently(paths: string[]): Promise<void>;
	trashRestore(paths: string[]): Promise<void>;
	trashPurge(paths: string[]): Promise<void>;
	trashEmpty(): Promise<void>;
	trashRestoreOriginals(paths: string[]): Promise<void>;
	textPreview(path: string): Promise<string | null>;
	resolvePath(input: string): Promise<Destinazione>;
	clipboardWrite(paths: string[], cut: boolean): Promise<void>;
	clipboardRead(): Promise<ContenutoAppunti | null>;
	clipboardClear(): Promise<void>;
	watchDirs(paths: string[]): Promise<void>;
	keyModifiers(): Promise<Modificatori>;
	startDrag(paths: string[]): Promise<EffettoTrascina>;
	showShellMenu(paths: string[], folder: string, x: number, y: number): Promise<EsitoMenu>;
	/** Apre un terminale nella cartella indicata. */
	openTerminal(path: string): Promise<void>;
	/** La versione dell'app installata, es. «0.2.2». */
	appVersion(): Promise<string>;
	showProperties(paths: string[]): Promise<void>;
	openWith(path: string): Promise<void>;
	runAsAdmin(path: string): Promise<void>;
	newFileTypes(): Promise<TipoNuovo[]>;
	createNewFile(parent: string, ext: string): Promise<string>;
	/** La cartella con cui Windows ha avviato l'app, se c'è. */
	initialPath(): Promise<Destinazione | null>;
	/** Apre un'altra finestra dell'app sulla cartella indicata. */
	newWindow(path: string | null): Promise<string>;
	/** Salva un'immagine per i personaggi di un tema. Ritorna il percorso. */
	saveThemeImage(nome: string, base64: string): Promise<string>;
	/** Rilegge in base64 un'immagine salvata con `saveThemeImage`. */
	readThemeImage(path: string): Promise<string>;
	lanStato(): Promise<StatoLan>;
	lanImposta(config: ConfigLan): Promise<StatoLan>;
	lanPari(): Promise<Pari[]>;
	lanRispondi(id: number, accetta: boolean): Promise<void>;
	lanApri(path: string): Promise<void>;
	/** Scarica in una cartella temporanea, per trascinare fuori dall'app. Ritorna i path locali. */
	lanPreparaTrascina(paths: string[]): Promise<string[]>;
	lanInvia(opts: {
		opId: number;
		peer: string;
		paths: string[];
		onProgress: (p: Progresso) => void;
	}): Promise<void>;
	lanScarica(opts: {
		opId: number;
		sources: string[];
		dest: string;
		onProgress: (p: Progresso) => void;
	}): Promise<Esito>;
	search(opts: {
		opId: number;
		root: string;
		criteri: CriteriRicerca;
		onResults: (lotto: Entry[]) => void;
	}): Promise<number>;
	compress(opts: {
		opId: number;
		sources: string[];
		dest: string;
		onProgress: (p: Progresso) => void;
	}): Promise<string>;
	extract(opts: { opId: number; archive: string; onProgress: (p: Progresso) => void }): Promise<string>;
}

function canale<T>(su: (m: T) => void): Channel<T> {
	const c = new Channel<T>();
	c.onmessage = su;
	return c;
}

export const tauriBackend: Backend = {
	listDir: (path, sort, showHidden) => invoke('list_dir', { path, sort, showHidden }),
	openEntry: (path) => invoke('open_entry', { path }),
	navigate: (path, direction) => invoke('navigate', { path, direction }),
	drives: () => invoke('drives'),
	knownFolders: () => invoke('known_folders'),
	revealInExplorer: (path) => invoke('reveal_in_explorer', { path }),
	openTerminal: (path) => invoke('open_terminal', { path }),
	// Lo stesso comando che usa `getVersion` del pacchetto `@tauri-apps/api/app`.
	appVersion: () => invoke('plugin:app|version'),
	createFolder: (parent, name) => invoke('create_folder', { parent, name }),
	renameEntry: (path, name) => invoke('rename_entry', { path, name }),
	moveToTrash: (paths) => invoke('move_to_trash', { paths }),
	iconForExtension: (ext, isDir, large) => invoke('icon_for_extension', { ext, isDir, large }),
	thumbnail: (path, size) => invoke('thumbnail', { path, size }),
	scanConflicts: (sources, dest) => invoke('scan_conflicts', { sources, dest }),
	// Il Channel è il canale di ritorno del progresso: Rust ci scrive
	// mentre copia, senza che il frontend debba interrogarlo.
	transfer: ({ opId, sources, dest, mode, policy, onProgress }) =>
		invoke('transfer', { opId, sources, dest, mode, policy, onProgress: canale(onProgress) }),
	cancelTransfer: (opId) => invoke('cancel_transfer', { opId }),
	deletePermanently: (paths) => invoke('delete_permanently', { paths }),
	trashRestore: (paths) => invoke('trash_restore', { paths }),
	trashPurge: (paths) => invoke('trash_purge', { paths }),
	trashEmpty: () => invoke('trash_empty'),
	trashRestoreOriginals: (paths) => invoke('trash_restore_originals', { paths }),
	textPreview: (path) => invoke('text_preview', { path }),
	resolvePath: (input) => invoke('resolve_path', { input }),
	clipboardWrite: (paths, cut) => invoke('clipboard_write', { paths, cut }),
	clipboardRead: () => invoke('clipboard_read'),
	clipboardClear: () => invoke('clipboard_clear'),
	watchDirs: (paths) => invoke('watch_dirs', { paths }),
	keyModifiers: () => invoke('key_modifiers'),
	startDrag: (paths) => invoke('start_drag', { paths }),
	showShellMenu: (paths, folder, x, y) => invoke('show_shell_menu', { paths, folder, x, y }),
	showProperties: (paths) => invoke('show_properties', { paths }),
	openWith: (path) => invoke('open_with', { path }),
	runAsAdmin: (path) => invoke('run_as_admin', { path }),
	newFileTypes: () => invoke('new_file_types'),
	createNewFile: (parent, ext) => invoke('create_new_file', { parent, ext }),
	initialPath: () => invoke('initial_path'),
	newWindow: (path) => invoke('new_window', { path }),
	saveThemeImage: (nome, base64) => invoke('save_theme_image', { nome, dati: base64 }),
	readThemeImage: (path) => invoke('read_theme_image', { path }),
	lanStato: () => invoke('lan_stato'),
	lanImposta: (config) => invoke('lan_imposta', { config }),
	lanPari: () => invoke('lan_pari'),
	lanRispondi: (id, accetta) => invoke('lan_rispondi', { id, accetta }),
	lanApri: (path) => invoke('lan_apri', { path }),
	lanPreparaTrascina: (paths) => invoke('lan_prepara_trascina', { paths }),
	lanInvia: ({ opId, peer, paths, onProgress }) =>
		invoke('lan_invia', { opId, peer, paths, onProgress: canale(onProgress) }),
	lanScarica: ({ opId, sources, dest, onProgress }) =>
		invoke('lan_scarica', { opId, sources, dest, onProgress: canale(onProgress) }),
	search: ({ opId, root, criteri, onResults }) =>
		invoke('search', { opId, root, criteri, onResults: canale(onResults) }),
	compress: ({ opId, sources, dest, onProgress }) =>
		invoke('compress', { opId, sources, dest, onProgress: canale(onProgress) }),
	extract: ({ opId, archive, onProgress }) =>
		invoke('extract', { opId, archive, onProgress: canale(onProgress) })
};
