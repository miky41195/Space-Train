import type {
	FriendView,
	LanSettings,
	ClipboardContent,
	Entry,
	FsError,
	Modifiers,
	Peer,
	ConflictPolicy,
	SortSpec
} from './ipc';

type DiskNode = { kind: 'dir' | 'file'; size: number; hidden: boolean; modified: number };

/** A fake channel: the page assigns its `onmessage`, the disk calls it. */
interface FakeChannel<T> {
	onmessage: ((m: T) => void) | null;
}

/**
 * Fake in-memory disk that answers `invoke` commands with the same names
 * and arguments as the Rust backend.
 *
 * It serves the tests that mount the whole page: going through `invoke`
 * instead of a fake Backend also exercises `tauriBackend`, that is the
 * translation between TypeScript names and Rust commands.
 */
export class FakeDisk {
	/** Full path → node. Folders exist as items of their own. */
	nodes = new Map<string, DiskNode>();
	/** Text of the files, for the preview and the search in the content. */
	contents = new Map<string, string>();
	/** Folders that answer "access denied". */
	denied = new Set<string>();
	/** Original paths of what has been trashed, in order. */
	trash: string[] = [];
	opened: string[] = [];
	/** While set, `delete_items` waits for it: lets a test see the bar. */
	blockDeletion: Promise<void> | null = null;
	/** Paths that refuse deletion, as a file open in another program does. */
	inUse = new Set<string>();
	/** While set, `transfer` waits for it: lets a test fill the queue. */
	blockTransfer: Promise<void> | null = null;
	/** Free bytes on C:, which a test can change as another program would. */
	freeOnC = 40;
	/** The Windows clipboard. */
	clipboard: ClipboardContent | null = null;
	/** Keys held down at the moment of a drop. */
	keys: Modifiers = { ctrl: false, shift: false, alt: false };
	/** Folders the page asked to watch. */
	watched: string[] = [];
	/** Local network: this PC's preferences and the other PCs found. */
	lan: LanSettings = { visible: false, shared: null, received: null, addresses: [] };
	peers: Peer[] = [];
	/** Friends: this PC's code and the list, as the backend keeps it. */
	friendsCode = 'codice-di-questo-pc';
	friends: FriendView[] = [];
	/** Friends a backup was run towards with «Allinea ora». */
	backupsDone: string[] = [];
	/** Sends to other PCs and answers to the received requests. */
	sent: Array<{ peer: string; paths: string[] }> = [];
	answers: Array<{ id: number; accept: boolean; folder: string | null }> = [];
	/** What the folder picker answers: null is «cancelled». */
	pickedFolder: string | null = null;
	/** Saved remote servers, and the passwords typed for them. */
	server: import('./ipc').ServerConfig[] = [];
	submitServerPassword = new Map<string, string>();
	/** Vaults by folder path: password, open or not, inner items. */
	vaults = new Map<string, { password: string; open: boolean; items: Array<{ path: string; size: number; dir: boolean; modified: number | null }> }>();
	/** Git status by folder, for git_status. */
	git = new Map<string, import('./ipc').GitStatus>();
	/** Photo/video/music details by path, for media_props. */
	media = new Map<string, import('./ipc').MediaProps>();
	/** Archive contents by archive path, for archive_list / archive_extract. */
	archives = new Map<string, Array<{ path: string; size: number; dir: boolean; modified: number | null }>>();
	/** Key combinations another program holds (shortcut_free answers false). */
	takenShortcuts = new Set<string>();
	/** Images rotated, with the direction. */
	rotated: Array<{ path: string; clockwise: boolean }> = [];
	/** Transfers paused or resumed: op id → paused. */
	pause = new Map<number, boolean>();
	/** Images saved by the theme editor. */
	themeImages: string[] = [];
	/** Their bytes in base64, by saved path. */
	themeImageData = new Map<string, string>();
	/** Windows opened with «Apri in una nuova finestra», with their path. */
	windows: Array<string | null> = [];
	/**
	 * Whether the theme editor opens in a window of its own. When off, the
	 * command fails and the page opens it inside itself: the tests use it
	 * this way.
	 */
	editorInWindow = false;
	editorOpenings = 0;
	/**
	 * The folder «Windows» starts the app with, like `"%1"` in the
	 * registry.
	 */
	initial: { folder: string; select: string | null } | null = null;
	/** Calls to the Windows Shell, which the fake disk cannot run. */
	shell: Array<{ cmd: string; args: Record<string, unknown> }> = [];

	/** Items in the Recycle Bin, with everything needed to restore them. */
	#inTrash: Array<{ id: string; original: string; nodes: Array<[string, DiskNode]> }> = [];
	#nextId = 1;

	constructor(structure: string[]) {
		this.nodes.set('C:\\', node('dir'));
		// An item ending with the slash is a folder, the others are files.
		// «path=text» also gives the file a content.
		for (const item of structure) {
			const [raw, text] = item.split('=');
			const dir = raw.endsWith('\\');
			const path = dir ? raw.slice(0, -1) : raw;
			this.#createAncestors(path);
			this.nodes.set(path, node(dir ? 'dir' : 'file'));
			if (text !== undefined) this.contents.set(path, text);
		}
	}

	exists(path: string): boolean {
		return this.nodes.has(path);
	}

	children(dir: string): string[] {
		const prefix = dir.endsWith('\\') ? dir : dir + '\\';
		return [...this.nodes.keys()].filter(
			(p) => p !== dir && p.startsWith(prefix) && !p.slice(prefix.length).includes('\\')
		);
	}

	/** The receives stopped from this side. */
	cancelledReceives: number[] = [];

	/**
	 * How much each folder weighs when it is computed, and which ones have been
	 * sized.
	 */
	folderSizes = 2048;
	sized: string[] = [];

	/** The version the app says it has; empty = unknown. */
	appVersion = '';

	async invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
		switch (cmd) {
			case 'list_dir': {
				const path = args.path as string;
				const server = this.server.find((x) => path === `::server\\${x.id}` || path.startsWith(`::server\\${x.id}\\`));
				if (server && !this.submitServerPassword.has(server.id)) throw error({ kind: 'serverPassword' });
				if (server && !this.nodes.has(path)) return { path, entries: [] };
				return this.#listDir(path, args.sort as SortSpec);
			}
			case 'navigate': {
				const path = args.path as string;
				if (path.startsWith('::lan\\') || path.startsWith('::amici\\') || path.startsWith('::server\\')) return parent(path);
				if (path.startsWith('::')) throw error({ kind: 'notFound' });
				// Above the drive root there is This PC, as in the backend.
				if (path === 'C:\\') return '::pc';
				return parent(path);
			}
			case 'drives':
				return [{ label: 'Disco locale (C:)', path: 'C:\\', free: this.freeOnC, total: 100, kind: 'fixed' }];
			case 'known_folders':
				return [];
			case 'open_entry':
				this.opened.push(args.path as string);
				return null;
			case 'reveal_in_explorer':
			case 'icon_for_extension':
			case 'thumbnail':
				return null;
			case 'is_default':
				return false;
			case 'create_folder': {
				const path = join(args.parent as string, args.name as string);
				if (this.exists(path)) throw error({ kind: 'io', message: `Esiste già: ${path}` });
				this.nodes.set(path, node('dir'));
				return path;
			}
			case 'rename_entry': {
				const old = args.path as string;
				const newItem = join(parent(old), args.name as string);
				if (this.exists(newItem)) throw error({ kind: 'io', message: `Esiste già: ${newItem}` });
				this.#move(old, newItem);
				return newItem;
			}
			case 'move_to_trash':
				for (const p of args.paths as string[]) {
					this.#inTrash.push({
						id: String(this.#nextId++),
						original: p,
						nodes: this.#descendants(p).map((d) => [d, this.nodes.get(d)!])
					});
					this.#remove(p);
					this.trash.push(p);
				}
				return null;
			case 'delete_permanently':
				for (const p of args.paths as string[]) this.#remove(p);
				return null;
			case 'trash_restore':
				this.#restore((v) => (args.paths as string[]).includes(`::cestino\\${v.id}`));
				return null;
			case 'trash_restore_originals': {
				const originals = args.paths as string[];
				if (!this.#inTrash.some((v) => originals.includes(v.original))) {
					throw error({ kind: 'io', message: 'Gli elementi non sono più nel Cestino.' });
				}
				this.#restore((v) => originals.includes(v.original));
				return null;
			}
			case 'trash_purge': {
				const paths = args.paths as string[];
				this.#inTrash = this.#inTrash.filter((v) => !paths.includes(`::cestino\\${v.id}`));
				return null;
			}
			case 'trash_empty':
				this.#inTrash = [];
				return null;
			case 'delete_items': {
				const mode = args.mode as 'trash' | 'permanent' | 'fromTrash' | 'emptyTrash';
				const paths = args.paths as string[];
				const channel = args.onProgress as FakeChannel<{ transferred: number; total: number }>;
				const total = mode === 'emptyTrash' ? this.#inTrash.length : paths.length;
				channel.onmessage?.({ transferred: 0, total: total });
				if (this.blockDeletion) await this.blockDeletion;
				const command = { trash: 'move_to_trash', permanent: 'delete_permanently', fromTrash: 'trash_purge', emptyTrash: 'trash_empty' }[mode];
				const done = paths.filter((p) => !this.inUse.has(p));
				await this.invoke(command, { paths: done });
				channel.onmessage?.({ transferred: total, total: total });
				const failed = paths
					.filter((p) => this.inUse.has(p))
					.map((path) => ({ path, error: { kind: 'io', message: 'File in uso da un altro programma.' } }));
				return { done, failed };
			}
			case 'scan_conflicts':
				return (args.sources as string[])
					.map(name)
					.filter((n) => this.exists(join(args.dest as string, n)));
			case 'transfer':
				if (this.blockTransfer) await this.blockTransfer;
				return this.#runTransfer(
					args.sources as string[],
					args.dest as string,
					args.mode as 'copy' | 'move',
					args.policy as ConflictPolicy
				);
			case 'cancel_transfer':
				return true;
			case 'clipboard_write':
				this.clipboard = { paths: [...(args.paths as string[])], cut: args.cut as boolean };
				return null;
			case 'clipboard_read':
				return this.clipboard;
			case 'clipboard_clear':
				this.clipboard = null;
				return null;
			case 'watch_dirs':
				this.watched = [...(args.paths as string[])];
				return null;
			case 'key_modifiers':
				return this.keys;
			case 'text_preview':
				return this.contents.get(args.path as string) ?? null;
			case 'resolve_path':
				return this.#resolve(args.input as string);
			case 'search':
				return this.#search(
					args.root as string,
					args.criteria as { text: string; content: boolean; extensions?: string[] },
					args.onResults as FakeChannel<Entry[]>
				);
			case 'entries_for': {
				const keys = [...this.nodes.keys()];
				return (args.paths as string[])
					.map((p) => keys.find((k) => k.toLowerCase() === p.toLowerCase()))
					.filter((k): k is string => k !== undefined)
					.map((k) => this.#item(k));
			}
			case 'compare_folders':
				return this.#compare(args.here as string, args.there as string);
			case 'find_duplicates':
				return this.#duplicates(args.root as string, args.onEvent as FakeChannel<unknown>);
			case 'compress': {
				const sources = args.sources as string[];
				const base = sources.length === 1 ? name(sources[0]).replace(/\.[^.]+$/, '') : 'Archivio';
				const zip = this.#free(args.dest as string, `${base}.zip`);
				this.nodes.set(zip, node('file'));
				return zip;
			}
			case 'file_checksum':
				// Like a real digest: lowercase, no prefix.
				return `${args.algorithm}ff${this.contents.get(args.path as string) ?? ''}`.toLowerCase();
			case 'archive_list':
				return this.archives.get(args.archive as string) ?? [];
			case 'archive_extract': {
				const items = this.archives.get(args.archive as string) ?? [];
				const chosen = args.items as string[];
				const dest = args.dest as string;
				for (const v of items) {
					const c = chosen.find((s) => v.path === s || v.path.startsWith(s + '/'));
					if (c === undefined) continue;
					const cut = c.lastIndexOf('/') + 1;
					const rel = v.path.slice(cut).split('/').join('\\');
					this.nodes.set(join(dest, rel), node(v.dir ? 'dir' : 'file'));
				}
				return;
			}
			case 'pause_transfer':
				this.pause.set(args.opId as number, args.paused as boolean);
				return true;
			case 'shortcut_free':
				return !this.takenShortcuts.has(args.accelerator as string);
			case 'server_list':
				return this.server;
			case 'server_put': {
				const c = { ...(args.config as import('./ipc').ServerConfig) };
				if (!c.id) c.id = `s${this.server.length + 1}`;
				if (!c.name) c.name = c.host;
				this.server = [...this.server.filter((s) => s.id !== c.id), c];
				if (args.password) this.submitServerPassword.set(c.id, args.password as string);
				return c;
			}
			case 'server_remove':
				this.server = this.server.filter((s) => s.id !== args.id);
				return;
			case 'server_trust':
				this.server = this.server.map((s) => (s.id === args.id ? { ...s, fingerprint: args.fingerprint as string } : s));
				return;
			case 'server_password':
				this.submitServerPassword.set(args.id as string, args.password as string);
				return;
			case 'server_test':
				return;
			case 'vault_create': {
				const dir = join(args.parent as string, `${args.name as string}.cassaforte`);
				if ((args.password as string).length < 8) throw { kind: 'io', message: 'La password deve avere almeno 8 caratteri.' };
				this.nodes.set(dir, node('dir'));
				this.vaults.set(dir, { password: args.password as string, open: true, items: [] });
				return dir;
			}
			case 'vault_unlock': {
				const v = this.vaults.get(args.path as string);
				if (!v) throw { kind: 'io', message: 'Questa cartella non è una cassaforte.' };
				if (v.password !== args.password) throw { kind: 'io', message: 'Password sbagliata.' };
				v.open = true;
				return;
			}
			case 'vault_lock': {
				const v = this.vaults.get(args.path as string);
				if (v) v.open = false;
				return;
			}
			case 'vault_is_open':
				return this.vaults.get(args.path as string)?.open ?? false;
			case 'vault_list':
			case 'vault_add':
			case 'vault_extract':
			case 'vault_open_item':
			case 'vault_delete': {
				const v = this.vaults.get(args.path as string);
				if (!v?.open) throw { kind: 'io', message: 'La cassaforte è chiusa: aprila di nuovo con la password.' };
				if (cmd === 'vault_list') return v.items;
				if (cmd === 'vault_add') {
					for (const s of args.sources as string[]) {
						const inner = [args.inner as string, name(s)].filter(Boolean).join('/');
						v.items.push({ path: inner, size: this.nodes.get(s)?.size ?? 0, dir: this.nodes.get(s)?.kind === 'dir', modified: 0 });
					}
					return (args.sources as string[]).length;
				}
				if (cmd === 'vault_extract') {
					return (args.items as string[]).map((i) => {
						const p = join(args.dest as string, i.split('/').pop()!);
						this.nodes.set(p, node('file'));
						return p;
					});
				}
				if (cmd === 'vault_open_item') return `C:\\Temp\\${(args.item as string).split('/').pop()}`;
				const route = args.items as string[];
				v.items = v.items.filter((x) => !route.some((w) => x.path === w || x.path.startsWith(`${w}/`)));
				return;
			}
			case 'git_status':
				return this.git.get(args.folder as string) ?? null;
			case 'media_props':
				return (args.paths as string[]).map((p) => this.media.get(p) ?? null);
			case 'image_rotate':
				for (const p of args.paths as string[]) this.rotated.push({ path: p, clockwise: args.clockwise as boolean });
				return;
			case 'image_convert': {
				const done: string[] = [];
				for (const p of args.paths as string[]) {
					const base = name(p).replace(/\.[^.]+$/, '');
					const side = args.maxSide ? ` (${args.maxSide})` : '';
					const newItem = this.#free(parent(p), `${base}${side}.${args.target}`);
					this.nodes.set(newItem, node('file'));
					done.push(newItem);
				}
				return done;
			}
			case 'extract': {
				const archive = args.archive as string;
				const folder = this.#free(parent(archive), name(archive).replace(/\.zip$/i, ''));
				this.nodes.set(folder, node('dir'));
				this.nodes.set(join(folder, 'estratto.txt'), node('file'));
				return folder;
			}
			case 'new_file_types':
				return [
					{ ext: '.txt', name: 'Documento di testo' },
					{ ext: '.zip', name: 'Cartella compressa' }
				];
			case 'create_new_file': {
				const ext = args.ext as string;
				const names: Record<string, string> = { '.txt': 'Documento di testo', '.zip': 'Cartella compressa' };
				const path = this.#free(args.parent as string, `Nuovo ${names[ext] ?? 'file'}${ext}`);
				this.nodes.set(path, node('file'));
				return path;
			}
			case 'initial_path':
				return this.initial;
			case 'save_theme_image':
				this.themeImages.push(args.name as string);
				this.themeImageData.set(`C:\\DatiApp\\temi-immagini\\${args.name as string}`, args.data as string);
				return `C:\\DatiApp\\temi-immagini\\${args.name as string}`;
			case 'read_theme_image':
				return this.themeImageData.get(args.path as string) ?? '';
			case 'open_theme_editor':
				if (!this.editorInWindow) throw new Error('finestre non disponibili');
				this.editorOpenings++;
				return null;
			case 'new_window':
				this.windows.push((args.path as string | null) ?? null);
				return `window-${this.windows.length + 1}`;
			case 'lan_status':
			case 'lan_configure':
				if (cmd === 'lan_configure') this.lan = { ...(args.config as LanSettings) };
				return {
					id: 'QUESTO-0000',
					name: 'QUESTO',
					receivedFolder: this.lan.received ?? 'C:\\Ricevuti',
					...this.lan
				};
			case 'friends_status':
				return { code: this.friendsCode, ready: true, friends: this.friends };
			case 'friends_add':
				this.friends.push({
					id: args.code as string,
					name: `Amico ${(args.code as string).slice(0, 6)}`,
					status: 'sent',
					share: false,
					online: false
				});
				return null;
			case 'friends_accept':
				this.friends = this.friends.map((a) => (a.id === args.id ? { ...a, status: 'confirmed' } : a));
				return null;
			case 'friends_remove':
				this.friends = this.friends.filter((a) => a.id !== args.id);
				return null;
			case 'friends_share':
				this.friends = this.friends.map((a) => (a.id === args.id ? { ...a, share: args.yes as boolean } : a));
				return { code: this.friendsCode, ready: true, friends: this.friends };
			case 'friends_backup':
				this.friends = this.friends.map((a) =>
					a.id === args.id
						? { ...a, backup: args.folder ? { folder: args.folder as string, last: null, attempted: null, outcome: null } : undefined }
						: a
				);
				return { code: this.friendsCode, ready: true, friends: this.friends };
			case 'friends_backup_now':
				this.backupsDone.push(args.id as string);
				return '1 file';
			case 'friends_answer_backup':
				this.friends = this.friends.map((a) =>
					a.id === args.id
						? { ...a, guest: { consent: args.yes ? 'yes' : 'no', folder: (args.folder as string | null) ?? null, last: null } }
						: a
				);
				return { code: this.friendsCode, ready: true, friends: this.friends };
			case 'friends_qr':
				return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
			case 'lan_peers':
				return this.peers;
			case 'lan_respond':
				this.answers.push({ id: args.id as number, accept: args.accept as boolean, folder: (args.folder as string | null) ?? null });
				return null;
			case 'lan_prepare_drag': {
				const dest = 'C:\\Temp';
				if (!this.exists(dest)) this.nodes.set(dest, node('dir'));
				return (args.paths as string[]).map((src) => {
					const arrival = this.#free(dest, name(src));
					this.#copy(src, arrival);
					return arrival;
				});
			}
			case 'lan_cancel_receive':
				this.cancelledReceives.push(args.id as number);
				return true;
			case 'lan_open':
				this.opened.push(args.path as string);
				return null;
			case 'lan_send':
				this.sent.push({ peer: args.peer as string, paths: [...(args.paths as string[])] });
				return null;
			case 'lan_download': {
				// The other PC's shared folder lives under `::lan\<id>` in
				// the same tree: downloading is copying it here.
				const dest = args.dest as string;
				if (!this.exists(dest)) this.nodes.set(dest, node('dir'));
				const pairs: Array<[string, string]> = (args.sources as string[]).map((src) => {
					const arrival = this.#free(dest, name(src));
					this.#copy(src, arrival);
					return [src, arrival];
				});
				return { copied: pairs.length, skipped: 0, cancelled: false, pairs };
			}
			case 'start_drag':
			case 'show_shell_menu':
			case 'show_properties':
			case 'open_with':
			case 'run_as_admin':
				this.shell.push({ cmd, args });
				return cmd === 'start_drag' ? 'none' : cmd === 'show_shell_menu' ? false : null;
			case 'pick_folder':
				return this.pickedFolder;
			case 'folder_size':
				this.sized.push(args.path as string);
				return this.folderSizes;
			case 'size_turn':
				return;
			case 'plugin:app|version':
				// With no version set the app does not know which one it is: no
				// what's new.
				if (this.appVersion) return this.appVersion;
				throw new Error('versione non disponibile');
			default:
				throw new Error(`Comando non gestito dal disco finto: ${cmd}`);
		}
	}

	#listDir(path: string, sort: SortSpec): { path: string; entries: Entry[] } {
		if (path === '::cestino') {
			return {
				path,
				entries: this.#inTrash.map((v) => ({
					name: name(v.original),
					path: `::cestino\\${v.id}`,
					kind: v.nodes[0]?.[1].kind ?? 'file',
					size: 100,
					modified: 0,
					hidden: false,
					origin: parent(v.original)
				}))
			};
		}
		if (path === '::amici') {
			return {
				path,
				entries: this.friends
					.filter((a) => a.status === 'confirmed')
					.map((a) => ({
						name: a.name,
						path: `::amici\\${a.id}`,
						kind: 'dir' as const,
						size: 0,
						modified: null,
						hidden: false
					}))
			};
		}
		if (path === '::lan') {
			return {
				path,
				entries: this.peers.map((p) => ({
					name: p.name,
					path: `::lan\\${p.id}`,
					kind: 'dir' as const,
					size: 0,
					modified: null,
					hidden: false
				}))
			};
		}
		if (path === '::pc') {
			return {
				path,
				entries: [
					{ name: 'Disco locale (C:)', path: 'C:\\', kind: 'dir', size: 0, modified: null, hidden: false, free: 40, total: 100 }
				]
			};
		}

		if (this.denied.has(path)) throw error({ kind: 'accessDenied' });
		const n = this.nodes.get(path);
		if (!n) throw error({ kind: 'notFound' });
		if (n.kind !== 'dir') throw error({ kind: 'notADirectory' });

		const entries: Entry[] = this.children(path).map((p) => this.#item(p));

		// Folders first, then by name: like the backend with the default
		// sort. The direction is honoured to check the headers.
		entries.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
			const c = a.name.localeCompare(b.name);
			return sort?.ascending === false ? -c : c;
		});

		return { path, entries };
	}

	#item(p: string): Entry {
		const n = this.nodes.get(p)!;
		return { name: name(p), path: p, kind: n.kind, size: n.size, modified: n.modified, hidden: n.hidden };
	}

	#resolve(input: string): { folder: string; select: string | null } {
		const cleaned = input.trim().replace(/^"|"$/g, '');
		const special: Record<string, string> = { 'questo pc': '::pc', cestino: '::cestino', rete: '::rete' };
		if (special[cleaned.toLowerCase()]) return { folder: special[cleaned.toLowerCase()], select: null };
		const n = this.nodes.get(cleaned);
		if (!n) throw error({ kind: 'notFound' });
		if (n.kind === 'dir') return { folder: cleaned, select: null };
		return { folder: parent(cleaned), select: cleaned };
	}

	async #search(
		root: string,
		criteria: { text: string; content: boolean; extensions?: string[] },
		channel: FakeChannel<Entry[]>
	) {
		const text = criteria.text.toLowerCase();
		const prefix = root.endsWith('\\') ? root : root + '\\';
		const ext = criteria.extensions;
		const found = [...this.nodes.keys()]
			.filter((p) => p.startsWith(prefix))
			// Like Rust: a type filter keeps only files with one of those extensions.
			.filter((p) => !ext || (this.nodes.get(p)!.kind === 'file' && ext.includes(p.split('.').pop()!.toLowerCase())))
			.filter(
				(p) =>
					name(p).toLowerCase().includes(text) ||
					(criteria.content && (this.contents.get(p) ?? '').toLowerCase().includes(text))
			)
			.sort()
			.map((p) => this.#item(p));
		// Like Rust: the results arrive in batches, not all at the end.
		await Promise.resolve();
		if (found.length > 0) channel.onmessage?.(found.slice(0, 1));
		if (found.length > 1) channel.onmessage?.(found.slice(1));
		return found.length;
	}

	/** Same rules as Rust: names match ignoring case, files differ by their text. */
	#compare(here: string, there: string) {
		const out = { onlyHere: [] as Entry[], onlyThere: [] as Entry[], different: [] as unknown[] };
		const walk = (a: string, b: string) => {
			const fa = new Map(this.children(a).map((p) => [name(p).toLowerCase(), p]));
			const fb = new Map(this.children(b).map((p) => [name(p).toLowerCase(), p]));
			for (const [k, pa] of fa) {
				const pb = fb.get(k);
				if (!pb) {
					out.onlyHere.push(this.#item(pa));
					continue;
				}
				fb.delete(k);
				const na = this.nodes.get(pa)!;
				const nb = this.nodes.get(pb)!;
				if (na.kind === 'dir' && nb.kind === 'dir') walk(pa, pb);
				else if (na.kind !== nb.kind || (this.contents.get(pa) ?? '') !== (this.contents.get(pb) ?? ''))
					out.different.push({ here: this.#item(pa), there: this.#item(pb), newerHere: na.modified > nb.modified });
			}
			for (const pb of fb.values()) out.onlyThere.push(this.#item(pb));
		};
		walk(here, there);
		return out;
	}

	/** Like Rust: files with the same text are identical; groups, then the final progress. */
	async #duplicates(root: string, channel: FakeChannel<unknown>) {
		const prefix = root.endsWith('\\') ? root : root + '\\';
		const byText = new Map<string, string[]>();
		for (const [p, n] of this.nodes) {
			const text = this.contents.get(p);
			if (n.kind !== 'file' || !p.startsWith(prefix) || !text) continue;
			byText.set(text, [...(byText.get(text) ?? []), p]);
		}
		await Promise.resolve();
		let groups = 0;
		for (const paths of byText.values()) {
			if (paths.length < 2) continue;
			groups++;
			channel.onmessage?.({ kind: 'group', size: 100, entries: paths.sort().map((p) => this.#item(p)) });
		}
		channel.onmessage?.({ kind: 'progress', done: 1, total: 1 });
		return groups;
	}

	#restore(pick: (v: { id: string; original: string }) => boolean) {
		const restored = this.#inTrash.filter(pick);
		for (const v of restored) for (const [p, n] of v.nodes) this.nodes.set(p, n);
		this.#inTrash = this.#inTrash.filter((v) => !restored.includes(v));
	}

	#runTransfer(sources: string[], dest: string, mode: 'copy' | 'move', policy: ConflictPolicy) {
		let copied = 0;
		let skipped = 0;
		const pairs: Array<[string, string]> = [];

		for (const src of sources) {
			let destination = join(dest, name(src));

			if (this.exists(destination)) {
				if (policy === 'skip') {
					skipped++;
					continue;
				}
				if (policy === 'rename') destination = this.#free(dest, name(src));
				else this.#remove(destination);
			}

			if (mode === 'move') this.#move(src, destination);
			else this.#copy(src, destination);
			copied++;
			pairs.push([src, destination]);
		}

		return { copied, skipped, cancelled: false, pairs };
	}

	#free(dest: string, n: string): string {
		if (!this.exists(join(dest, n))) return join(dest, n);
		const point = n.lastIndexOf('.');
		const base = point > 0 ? n.slice(0, point) : n;
		const ext = point > 0 ? n.slice(point) : '';
		for (let i = 2; ; i++) {
			const candidate = join(dest, `${base} (${i})${ext}`);
			if (!this.exists(candidate)) return candidate;
		}
	}

	#descendants(path: string): string[] {
		return [...this.nodes.keys()].filter((p) => p === path || p.startsWith(path + '\\'));
	}

	#copy(from: string, a: string): void {
		for (const p of this.#descendants(from)) {
			this.nodes.set(a + p.slice(from.length), { ...this.nodes.get(p)! });
		}
	}

	#move(from: string, a: string): void {
		this.#copy(from, a);
		this.#remove(from);
	}

	#remove(path: string): void {
		for (const p of this.#descendants(path)) this.nodes.delete(p);
	}

	#createAncestors(path: string): void {
		let p = parent(path);
		while (p !== 'C:\\' && !this.nodes.has(p)) {
			this.nodes.set(p, node('dir'));
			p = parent(p);
		}
	}
}

function node(kind: 'dir' | 'file'): DiskNode {
	return { kind, size: kind === 'dir' ? 0 : 100, hidden: false, modified: 0 };
}

/** The backend rejects with a serialized FsError, not with an Error. */
function error(e: FsError): FsError {
	return e;
}

export function join(dir: string, n: string): string {
	return dir.endsWith('\\') ? dir + n : `${dir}\\${n}`;
}

function parent(path: string): string {
	const i = path.lastIndexOf('\\');
	const g = path.slice(0, i);
	return g.endsWith(':') ? g + '\\' : g;
}

function name(path: string): string {
	return path.slice(path.lastIndexOf('\\') + 1);
}
