import { invoke, Channel } from '@tauri-apps/api/core';
import type { Seen, Visit } from './folder-changes';

export type EntryKind = 'dir' | 'file' | 'symlink';

export interface Entry {
	name: string;
	path: string;
	kind: EntryKind;
	size: number;
	modified: number | null;
	hidden: boolean;
	/** Only in the Recycle Bin: the folder the item was deleted from. */
	origin?: string;
	/** Only for the volumes in «Questo PC». */
	free?: number;
	total?: number;
	/**
	 * It has an icon of its own, different from its type's: a program, a
	 * shortcut, a customized folder, a drive.
	 */
	ownIcon?: boolean;
	/** Only in content search results: the first line that contains the text. */
	snippet?: Snippet;
}

/** How git sees an item of the open folder. */
export type GitMark = 'ignored' | 'new' | 'modified' | 'conflict';

export interface GitStatus {
	branch: string;
	ahead: number;
	behind: number;
	/** Children of the folder, by name, that have a mark. */
	items: Record<string, GitMark>;
}

/** Photo, video and music details Windows knows about a file. */
export interface MediaProps {
	/** Date taken, ms since the epoch. */
	taken?: number;
	/** Seconds. */
	duration?: number;
	width?: number;
	height?: number;
	artist?: string;
	album?: string;
	camera?: string;
	year?: number;
	/** Bits per second. */
	bitrate?: number;
	/** Hz. */
	sampleRate?: number;
	title?: string;
	/** Track number on the album. */
	track?: number;
}

export interface Snippet {
	/** 1-based line number. */
	line: number;
	text: string;
	/** Match start and length in `text`, counted in characters (code points). */
	at: number;
	len: number;
	/** How many other lines contain the text. */
	more: number;
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
	free: number | null;
	total: number | null;
	kind: 'fixed' | 'removable' | 'network' | 'optical' | 'ram' | 'unknown';
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
	| { kind: 'io'; message: string }
	/** A remote server's key to confirm (first time) or that changed (danger). */
	| { kind: 'serverKey'; fingerprint: string; changed: boolean }
	/** The remote server wants a password. */
	| { kind: 'serverPassword' }
	/** The file changed on disk after it was read. */
	| { kind: 'changed' };

export type ServerProtocol = 'sftp' | 'ftp' | 'ftps' | 'webdav';

/** A saved remote server. The password is never here. */
export interface ServerConfig {
	id: string;
	name: string;
	protocol: ServerProtocol;
	host: string;
	port: number;
	user: string;
	/** Start folder on the server. */
	path: string;
	fingerprint?: string | null;
	/** The password is kept in the Windows Credential Manager. */
	remember: boolean;
	/** A folder of this PC copied to the server once a day. */
	backup?: ServerBackup | null;
}

export type VersionReason = 'overwritten' | 'edited' | 'restored' | 'changed' | 'protected';

/** A previous content of a file kept by Space Train. */
export interface Version {
	id: string;
	/** When it was kept, ms. */
	at: number;
	size: number;
	modified: number | null;
	reason: VersionReason;
}

export interface VersionsOverview {
	protected: string[];
	days: number;
	maxBytes: number;
	/** Bytes the kept contents take. */
	used: number;
}

/** Only new or changed files are sent; nothing is deleted on the server. */
export interface ServerBackup {
	/** Folder on this PC. */
	folder: string;
	/** Folder on the server, under the start folder. */
	target: string;
	last?: number | null;
	attempted?: number | null;
	outcome?: string | null;
}

/** What to do when an item with the same name already exists at the destination. */
export type ConflictPolicy = 'overwrite' | 'rename' | 'skip';

export interface Progress {
	transferred: number;
	total: number;
}

export interface CopyOutcome {
	copied: number;
	skipped: number;
	cancelled: boolean;
	/** Source and actual arrival path of every transferred item. */
	pairs: Array<[string, string]>;
}

export type DuplicateEvent =
	| { kind: 'progress'; done: number; total: number }
	| { kind: 'group'; size: number; entries: Entry[] };

/** Two folder trees compared: what is only on one side, what differs. */
export interface Comparison {
	onlyHere: Entry[];
	onlyThere: Entry[];
	different: Array<{ here: Entry; there: Entry; newerHere: boolean }>;
}

/** One item inside an archive; `path` uses `/` with no leading separator. */
export interface ArchiveItem {
	path: string;
	size: number;
	dir: boolean;
	modified: number | null;
}

/** `same` keeps each image's own format (JPG for those Space Train cannot write). */
/** The whole-disk index of «Ovunque». */
export interface IndexStatus {
	files: number;
	/** A drive is being read. */
	building: boolean;
	foldersRead: number;
}

export type PhoneEvent =
	| { kind: 'visit' }
	| { kind: 'downloaded'; name: string }
	| { kind: 'upload'; id: number; name: string; size: number };

export type ImageTarget = 'jpg' | 'png' | 'webp' | 'same';

export interface SearchCriteria {
	text: string;
	content: boolean;
	hidden: boolean;
	/** Smart folder filters: any of them limits the results to files. */
	extensions?: string[];
	minSize?: number;
	modifiedAfter?: number;
	modifiedBefore?: number;
}

export interface ClipboardContent {
	paths: string[];
	cut: boolean;
}

export interface Destination {
	folder: string;
	select: string | null;
}

export interface Modifiers {
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
}

/** A file type of the «Nuovo» menu, as Windows registers it. */
export interface NewFileType {
	ext: string;
	name: string;
}

/** Lan preferences between copies of Space Train. */
export interface LanSettings {
	visible: boolean;
	shared: string | null;
	received: string | null;
	/** PCs to reach by address: an IP or a name, also of a VPN. */
	addresses: string[];
}

export interface LanStatus extends LanSettings {
	id: string;
	name: string;
	/** Where received files end up, even when it is the default one. */
	receivedFolder: string;
}

/** Another PC with Space Train found on the lan. */
export interface Peer {
	id: string;
	name: string;
	ip: string;
	port: number;
	shared: string | null;
}

/**
 * A friend on Space Train, reachable even away from home.
 * `sent`: we asked; `received`: it is up to us to answer.
 */
export interface FriendView {
	/** Their personal code. */
	id: string;
	name: string;
	status: 'confirmed' | 'sent' | 'received';
	/** Can browse and download our shared folder. */
	share: boolean;
	/** The other already knows about our last step (request or confirmation). */
	delivered?: boolean;
	online: boolean;
	/** Our folder kept aligned on their PC, once a day. */
	backup?: { folder: string; last: number | null; attempted: number | null; outcome: string | null };
	/** Their backup kept here: they asked, we said yes or no. */
	guest?: { consent: 'asked' | 'yes' | 'no'; folder: string | null; last: number | null };
}

export interface FriendsStatus {
	/** Our personal code, to give to friends. */
	code: string;
	/** The connection is ready: without it, friends cannot be reached. */
	ready: boolean;
	friends: FriendView[];
}

/** Another PC wants to send us files: our consent is needed. */
export interface SendRequest {
	id: number;
	from: string;
	count: number;
	total: number;
	names: string[];
}

/** What the receiver of a drag out of the app decided. */
export type DragEffect = 'move' | 'copy' | 'link' | 'none';

export interface TransferOpts {
	/** Identifier chosen by the frontend, used to cancel. */
	opId: number;
	sources: string[];
	dest: string;
	mode: 'copy' | 'move';
	policy: ConflictPolicy;
	onProgress: (p: Progress) => void;
}

/** How the system menu ended. */
export interface MenuOutcome {
	/** An item was chosen and run. */
	executed: boolean;
	/** «Apri percorso file»: the folder to open in the app, with the item to select. */
	open: Destination | null;
}

/**
 * Boundary with the backend. The store tests mount a fake implementation
 * of this interface: no frontend test touches the filesystem.
 */
export interface Backend {
	listDir(path: string, sort: SortSpec, showHidden: boolean): Promise<Listing>;
	openEntry(path: string): Promise<void>;
	/** Bytes of a folder's whole tree; null if a newer turn stopped it. */
	folderSize(path: string, turn: number): Promise<number | null>;
	/** Saves what the folder holds now; gives back the previous visit, if any. */
	folderVisit(path: string, entries: Seen[]): Promise<Visit | null>;
	/** Forgets every remembered visit. */
	folderVisitsForget(): Promise<void>;
	/** Starts a turn of size computations and stops the previous one. */
	sizeTurn(turn: number): Promise<void>;
	/** Starts a new cleanup scan; the previous one stops. */
	cleanupRound(round: number): Promise<void>;
	/** What one cleanup category holds on a drive, biggest first; null if a newer scan started. */
	cleanupScan(category: CleanupCategory, drive: string, roots: string[], round: number): Promise<CleanupCandidate[] | null>;
	/** The biggest programs installed on a drive (Windows only). */
	programsList(drive: string): Promise<Program[]>;
	/** Starts a program's official uninstaller. */
	programUninstall(id: string): Promise<void>;
	/** A program whose uninstaller is gone: install folder to the Trash, entry out of the list. */
	programRemoveLeftovers(id: string): Promise<void>;
	/** Leftover folders of uninstalled programs to the Trash, as administrator. */
	cleanupRecycleLeftovers(paths: string[]): Promise<void>;
	/** A text file whole, for quick editing (UTF-8 only, at most 5 MB). */
	textRead(path: string): Promise<TextFile>;
	/** Saves an edited text file with its own line endings; refused with `changed` if it changed on disk, unless `force`. Returns the new modified time. */
	textWrite(path: string, file: Omit<TextFile, 'modified'>, expected: number, force: boolean): Promise<number>;
	/** Starts a shell in `cwd` for the integrated terminal; returns its id. */
	terminalOpen(cwd: string, cols: number, rows: number, onEvent: (e: TerminalEvent) => void): Promise<number>;
	terminalWrite(id: number, data: string): Promise<void>;
	terminalResize(id: number, cols: number, rows: number): Promise<void>;
	terminalClose(id: number): Promise<void>;
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
	transfer(opts: TransferOpts): Promise<CopyOutcome>;
	cancelTransfer(opId: number): Promise<boolean>;
	deletePermanently(paths: string[]): Promise<void>;
	trashRestore(paths: string[]): Promise<void>;
	trashPurge(paths: string[]): Promise<void>;
	trashEmpty(): Promise<void>;
	trashRestoreOriginals(paths: string[]): Promise<void>;
	textPreview(path: string): Promise<string | null>;
	resolvePath(input: string): Promise<Destination>;
	clipboardWrite(paths: string[], cut: boolean): Promise<void>;
	clipboardRead(): Promise<ClipboardContent | null>;
	clipboardClear(): Promise<void>;
	watchDirs(paths: string[]): Promise<void>;
	keyModifiers(): Promise<Modifiers>;
	startDrag(paths: string[]): Promise<DragEffect>;
	showShellMenu(paths: string[], folder: string, x: number, y: number): Promise<MenuOutcome>;
	/** Opens a terminal in the given folder. */
	openTerminal(path: string): Promise<void>;
	/** The installed app's version, e.g. «0.2.2». */
	appVersion(): Promise<string>;
	showProperties(paths: string[]): Promise<void>;
	openWith(path: string): Promise<void>;
	runAsAdmin(path: string): Promise<void>;
	/** The Windows folder picker; null if the user cancels. */
	pickFolder(title: string, initial: string | null): Promise<string | null>;
	newFileTypes(): Promise<NewFileType[]>;
	createNewFile(parent: string, ext: string): Promise<string>;
	/** The folder Windows started the app with, if any. */
	initialPath(): Promise<Destination | null>;
	/** Opens another window of the app on the given folder. */
	newWindow(path: string | null): Promise<string>;
	/** Opens the theme editor in a window of its own, above this one. */
	openThemeEditor(): Promise<void>;
	/** Saves an image for a theme's characters. Returns the path. */
	saveThemeImage(name: string, base64: string): Promise<string>;
	/** Reads back in base64 an image saved with `saveThemeImage`. */
	readThemeImage(path: string): Promise<string>;
	friendsStatus(): Promise<FriendsStatus>;
	/** Asks for the friendship of whoever has this code. */
	friendsAdd(code: string): Promise<void>;
	friendsAccept(id: string): Promise<void>;
	/** Removes a friend or refuses their request. */
	friendsRemove(id: string): Promise<void>;
	friendsShare(id: string, enabled: boolean): Promise<FriendsStatus>;
	/** The QR code of our code, in SVG. */
	friendsQr(): Promise<string>;
	/** Starts (with a folder) or stops the daily backup towards a friend. */
	friendsBackup(id: string, folder: string | null): Promise<FriendsStatus>;
	/** Runs the backup now; resolves with what was sent. */
	friendsBackupNow(id: string): Promise<string>;
	/** Yes or no to a friend's backup on this PC; `folder` null = the default one. */
	friendsAnswerBackup(id: string, yes: boolean, folder: string | null): Promise<FriendsStatus>;
	lanStatus(): Promise<LanStatus>;
	lanConfigure(config: LanSettings): Promise<LanStatus>;
	lanPeers(): Promise<Peer[]>;
	/** Accepts or refuses incoming files; when accepting, `folder` is where to save them (null: the received folder). */
	lanRespond(id: number, accept: boolean, folder?: string | null): Promise<void>;
	lanOpen(path: string): Promise<void>;
	/** Stops from this side a reception in progress. */
	lanCancelReceive(id: number): Promise<boolean>;
	/** Downloads into a temporary folder, to drag out of the app. Returns the local paths. */
	lanPrepareDrag(paths: string[]): Promise<string[]>;
	lanSend(opts: {
		opId: number;
		peer: string;
		paths: string[];
		onProgress: (p: Progress) => void;
	}): Promise<void>;
	lanDownload(opts: {
		opId: number;
		sources: string[];
		dest: string;
		onProgress: (p: Progress) => void;
	}): Promise<CopyOutcome>;
	search(opts: {
		opId: number;
		root: string;
		criteria: SearchCriteria;
		onResults: (batch: Entry[]) => void;
	}): Promise<number>;
	findDuplicates(opts: {
		opId: number;
		root: string;
		hidden: boolean;
		onEvent: (e: DuplicateEvent) => void;
	}): Promise<number>;
	/** Entries for paths from anywhere (colour labels); missing ones are left out. */
	entriesFor(paths: string[]): Promise<Entry[]>;
	compareFolders(opts: { opId: number; here: string; there: string; content: boolean; hidden: boolean }): Promise<Comparison>;
	compress(opts: {
		opId: number;
		sources: string[];
		dest: string;
		onProgress: (p: Progress) => void;
	}): Promise<string>;
	extract(opts: { opId: number; archive: string; onProgress: (p: Progress) => void }): Promise<string>;
	/** Hex checksum of a file; `null` when cancelled. */
	fileChecksum(opts: { opId: number; path: string; algorithm: 'sha256' | 'sha1' | 'md5' }): Promise<string | null>;
	archiveList(archive: string): Promise<ArchiveItem[]>;
	/** Extracts one inner file to a temporary folder and returns its path, to open it. */
	archiveOpenItem(archive: string, item: string): Promise<string>;
	/** Extracts chosen inner items (folders with their contents) into `dest`. */
	archiveExtract(opts: {
		opId: number;
		archive: string;
		items: string[];
		dest: string;
		onProgress: (p: Progress) => void;
	}): Promise<void>;
	/** Pauses or resumes a running job between items. */
	pauseTransfer(opId: number, paused: boolean): Promise<boolean>;
	/** Free system-wide (no other program holds it)? `null` = not a valid combination. */
	shortcutFree(accelerator: string): Promise<boolean | null>;
	imageRotate(paths: string[], clockwise: boolean): Promise<void>;
	/** Details of each path, null where none could be read (at most 500 per call). */
	mediaProps(paths: string[]): Promise<Array<MediaProps | null>>;
	/** Git status of a folder's items; null outside a repository or without git. */
	gitStatus(folder: string): Promise<GitStatus | null>;
	serverList(): Promise<ServerConfig[]>;
	/** Adds (empty id) or changes a server; the password, when given, is kept as `remember` says. */
	serverPut(config: ServerConfig, password: string | null): Promise<ServerConfig>;
	serverRemove(id: string): Promise<void>;
	/** The user confirmed this server key. */
	serverTrust(id: string, fingerprint: string): Promise<void>;
	serverPassword(id: string, password: string, remember: boolean): Promise<void>;
	/** Tries to connect, nothing else. */
	serverTest(id: string): Promise<void>;
	/** Previous versions of a file, newest first, without its current content. */
	versionsList(path: string): Promise<Version[]>;
	/** A copy of the version in a temporary folder; answers with its path. */
	versionExtract(path: string, id: string): Promise<string>;
	versionRestore(path: string, id: string): Promise<void>;
	versionsOverview(): Promise<VersionsOverview>;
	versionsProtect(folder: string, on: boolean): Promise<void>;
	versionsLimits(days: number, maxBytes: number): Promise<void>;
	/** Runs the server's backup now; answers with what was sent. */
	serverBackup(opId: number, id: string, onProgress: (p: Progress) => void): Promise<string>;
	/** Vault: a folder `<name>.cassaforte` encrypted with a password. Create leaves it open. */
	vaultCreate(parent: string, name: string, password: string): Promise<string>;
	vaultUnlock(path: string, password: string): Promise<void>;
	vaultLock(path: string): Promise<void>;
	vaultIsOpen(path: string): Promise<boolean>;
	vaultList(path: string): Promise<ArchiveItem[]>;
	/** Encrypts files and folders into the vault under `inner` ('' = root); returns how many files. */
	vaultAdd(path: string, sources: string[], inner: string): Promise<number>;
	vaultExtract(path: string, items: string[], dest: string): Promise<string[]>;
	vaultOpenItem(path: string, item: string): Promise<string>;
	vaultDelete(path: string, items: string[]): Promise<void>;
	/** Searches the whole-disk index: the best 300 matches, and how many there are in all. */
	indexSearch(query: string): Promise<{ total: number; entries: Entry[] }>;
	/** Starts the index on first call. */
	indexStatus(): Promise<IndexStatus>;
	/** Starts the phone page for these files; `onEvent` tells visits, downloads and uploads. */
	phoneStart(
		files: string[],
		texts: Record<string, string>,
		onEvent: (e: PhoneEvent) => void
	): Promise<{ url: string; qr: string; remoteUrl: string | null; remoteQr: string | null }>;
	phoneStop(): Promise<void>;
	/** Moves a file uploaded by the phone into `dest`, through the antivirus. */
	phoneKeep(id: number, dest: string): Promise<string>;
	phoneDiscard(id: number): Promise<void>;
	imageConvert(opts: {
		opId: number;
		paths: string[];
		target: ImageTarget;
		maxSide: number | null;
		quality: number;
		/** Names a same-format copy at full size: «stem (tag).ext». */
		tag: string;
		onProgress: (p: Progress) => void;
	}): Promise<string[]>;
	/**
	 * Deletes with progress counted in items. Cancellable between items;
	 * an item that refuses is skipped and reported, the others go on.
	 */
	deleteItems(opts: {
		opId: number;
		mode: DeleteMode;
		paths: string[];
		onProgress: (p: Progress) => void;
	}): Promise<Deleted>;
}

/** What a deletion removed, and what it had to leave with the reason. */
export interface Deleted {
	done: string[];
	failed: Array<{ path: string; error: FsError }>;
}

/** To the Trash, from disk, selected items out of the Trash, or all of it. */
export type DeleteMode = 'trash' | 'permanent' | 'fromTrash' | 'emptyTrash';

function channel<T>(onMessage: (m: T) => void): Channel<T> {
	const c = new Channel<T>();
	c.onmessage = onMessage;
	return c;
}

export const tauriBackend: Backend = {
	listDir: (path, sort, showHidden) => invoke('list_dir', { path, sort, showHidden }),
	openEntry: (path) => invoke('open_entry', { path }),
	folderSize: (path, turn) => invoke('folder_size', { path, turn }),
	folderVisit: (path, entries) => invoke('folder_visit', { path, entries }),
	folderVisitsForget: () => invoke('folder_visits_forget'),
	indexSearch: (query) => invoke('index_search', { query }),
	indexStatus: () => invoke('index_status'),
	phoneStart: (files, texts, onEvent) => invoke('phone_start', { files, texts, onEvent: channel(onEvent) }),
	phoneStop: () => invoke('phone_stop'),
	phoneKeep: (id, dest) => invoke('phone_keep', { id, dest }),
	phoneDiscard: (id) => invoke('phone_discard', { id }),
	sizeTurn: (turn) => invoke('size_turn', { turn }),
	cleanupRound: (round) => invoke('cleanup_round', { round }),
	cleanupScan: (category, drive, roots, round) => invoke('cleanup_scan', { category, drive, roots, round }),
	programsList: (drive) => invoke('programs_list', { drive }),
	programUninstall: (id) => invoke('program_uninstall', { id }),
	programRemoveLeftovers: (id) => invoke('program_remove_leftovers', { id }),
	cleanupRecycleLeftovers: (paths) => invoke('cleanup_recycle_leftovers', { paths }),
	textRead: (path) => invoke('text_read', { path }),
	textWrite: (path, f, expected, force) => invoke('text_write', { path, text: f.text, crlf: f.crlf, bom: f.bom, expected, force }),
	terminalOpen: (cwd, cols, rows, onEvent) => invoke('terminal_open', { cwd, cols, rows, events: channel(onEvent) }),
	terminalWrite: (id, data) => invoke('terminal_write', { id, data }),
	terminalResize: (id, cols, rows) => invoke('terminal_resize', { id, cols, rows }),
	terminalClose: (id) => invoke('terminal_close', { id }),
	navigate: (path, direction) => invoke('navigate', { path, direction }),
	drives: () => invoke('drives'),
	knownFolders: () => invoke('known_folders'),
	revealInExplorer: (path) => invoke('reveal_in_explorer', { path }),
	openTerminal: (path) => invoke('open_terminal', { path }),
	// The same command used by `getVersion` of the `@tauri-apps/api/app` package.
	appVersion: () => invoke('plugin:app|version'),
	createFolder: (parent, name) => invoke('create_folder', { parent, name }),
	renameEntry: (path, name) => invoke('rename_entry', { path, name }),
	moveToTrash: (paths) => invoke('move_to_trash', { paths }),
	iconForExtension: (ext, isDir, large) => invoke('icon_for_extension', { ext, isDir, large }),
	thumbnail: (path, size) => invoke('thumbnail', { path, size }),
	scanConflicts: (sources, dest) => invoke('scan_conflicts', { sources, dest }),
	// The Channel is the return path for progress: Rust writes to it
	// while copying, without the frontend having to poll it.
	transfer: ({ opId, sources, dest, mode, policy, onProgress }) =>
		invoke('transfer', { opId, sources, dest, mode, policy, onProgress: channel(onProgress) }),
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
	pickFolder: (title, initial) => invoke('pick_folder', { title, initial }),
	newFileTypes: () => invoke('new_file_types'),
	createNewFile: (parent, ext) => invoke('create_new_file', { parent, ext }),
	initialPath: () => invoke('initial_path'),
	newWindow: (path) => invoke('new_window', { path }),
	openThemeEditor: () => invoke('open_theme_editor'),
	saveThemeImage: (name, base64) => invoke('save_theme_image', { name, data: base64 }),
	readThemeImage: (path) => invoke('read_theme_image', { path }),
	friendsStatus: () => invoke('friends_status'),
	friendsAdd: (code) => invoke('friends_add', { code }),
	friendsAccept: (id) => invoke('friends_accept', { id }),
	friendsRemove: (id) => invoke('friends_remove', { id }),
	friendsShare: (id, enabled) => invoke('friends_share', { id, enabled }),
	friendsQr: () => invoke('friends_qr'),
	friendsBackup: (id, folder) => invoke('friends_backup', { id, folder }),
	friendsBackupNow: (id) => invoke('friends_backup_now', { id }),
	friendsAnswerBackup: (id, yes, folder) => invoke('friends_answer_backup', { id, yes, folder }),
	lanStatus: () => invoke('lan_status'),
	lanConfigure: (config) => invoke('lan_configure', { config }),
	lanPeers: () => invoke('lan_peers'),
	lanRespond: (id, accept, folder = null) => invoke('lan_respond', { id, accept, folder }),
	lanOpen: (path) => invoke('lan_open', { path }),
	lanCancelReceive: (id) => invoke('lan_cancel_receive', { id }),
	lanPrepareDrag: (paths) => invoke('lan_prepare_drag', { paths }),
	lanSend: ({ opId, peer, paths, onProgress }) =>
		invoke('lan_send', { opId, peer, paths, onProgress: channel(onProgress) }),
	lanDownload: ({ opId, sources, dest, onProgress }) =>
		invoke('lan_download', { opId, sources, dest, onProgress: channel(onProgress) }),
	search: ({ opId, root, criteria, onResults }) =>
		invoke('search', { opId, root, criteria, onResults: channel(onResults) }),
	findDuplicates: ({ opId, root, hidden, onEvent }) =>
		invoke('find_duplicates', { opId, root, hidden, onEvent: channel(onEvent) }),
	entriesFor: (paths) => invoke('entries_for', { paths }),
	compareFolders: ({ opId, here, there, content, hidden }) =>
		invoke('compare_folders', { opId, here, there, content, hidden }),
	compress: ({ opId, sources, dest, onProgress }) =>
		invoke('compress', { opId, sources, dest, onProgress: channel(onProgress) }),
	extract: ({ opId, archive, onProgress }) =>
		invoke('extract', { opId, archive, onProgress: channel(onProgress) }),
	fileChecksum: ({ opId, path, algorithm }) => invoke('file_checksum', { opId, path, algorithm }),
	archiveList: (archive) => invoke('archive_list', { archive }),
	archiveOpenItem: (archive, item) => invoke('archive_open_item', { archive, item }),
	archiveExtract: ({ opId, archive, items, dest, onProgress }) =>
		invoke('archive_extract', { opId, archive, items, dest, onProgress: channel(onProgress) }),
	pauseTransfer: (opId, paused) => invoke('pause_transfer', { opId, paused }),
	shortcutFree: (accelerator) => invoke('shortcut_free', { accelerator }),
	imageRotate: (paths, clockwise) => invoke('image_rotate', { paths, clockwise }),
	mediaProps: (paths) => invoke('media_props', { paths }),
	gitStatus: (folder) => invoke('git_status', { folder }),
	serverList: () => invoke('server_list'),
	serverPut: (config, password) => invoke('server_put', { config, password }),
	serverRemove: (id) => invoke('server_remove', { id }),
	serverTrust: (id, fingerprint) => invoke('server_trust', { id, fingerprint }),
	serverPassword: (id, password, remember) => invoke('server_password', { id, password, remember }),
	serverTest: (id) => invoke('server_test', { id }),
	versionsList: (path) => invoke('versions_list', { path }),
	versionExtract: (path, id) => invoke('version_extract', { path, id }),
	versionRestore: (path, id) => invoke('version_restore', { path, id }),
	versionsOverview: () => invoke('versions_overview'),
	versionsProtect: (folder, on) => invoke('versions_protect', { folder, on }),
	versionsLimits: (days, maxBytes) => invoke('versions_limits', { days, maxBytes }),
	serverBackup: (opId, id, onProgress) => invoke('server_backup', { opId, id, onProgress: channel(onProgress) }),
	vaultCreate: (parent, name, password) => invoke('vault_create', { parent, name, password }),
	vaultUnlock: (path, password) => invoke('vault_unlock', { path, password }),
	vaultLock: (path) => invoke('vault_lock', { path }),
	vaultIsOpen: (path) => invoke('vault_is_open', { path }),
	vaultList: (path) => invoke('vault_list', { path }),
	vaultAdd: (path, sources, inner) => invoke('vault_add', { path, sources, inner }),
	vaultExtract: (path, items, dest) => invoke('vault_extract', { path, items, dest }),
	vaultOpenItem: (path, item) => invoke('vault_open_item', { path, item }),
	vaultDelete: (path, items) => invoke('vault_delete', { path, items }),
	imageConvert: ({ opId, paths, target, maxSide, quality, tag, onProgress }) =>
		invoke('image_convert', { opId, paths, target, maxSide, quality, tag, onProgress: channel(onProgress) }),
	deleteItems: ({ opId, mode, paths, onProgress }) =>
		invoke('delete_items', { opId, mode, paths, onProgress: channel(onProgress) })
};

export type CleanupCategory = 'temp' | 'cache' | 'projects' | 'models' | 'download' | 'trash' | 'leftovers';
/** Something disk cleanup found: size, last change and last access (ms, 0 = unknown). */
export interface CleanupCandidate {
	path: string;
	size: number;
	used: number;
	opened: number;
}
/** A text file opened for quick editing: `
` line endings in `text`, the file's own kept apart. */
export interface TextFile {
	text: string;
	crlf: boolean;
	bom: boolean;
	modified: number;
}
export type TerminalEvent = { kind: 'data'; text: string } | { kind: 'exit' };
export interface Program {
	id: string;
	name: string;
	publisher: string | null;
	size: number;
	/** Its uninstaller is no longer on disk: only its leftovers can go. */
	gone: boolean;
}
