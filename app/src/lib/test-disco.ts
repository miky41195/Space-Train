import type {
	Amico,
	ConfigLan,
	ContenutoAppunti,
	Entry,
	FsError,
	Modificatori,
	Pari,
	Politica,
	SortSpec
} from './ipc';

type Nodo = { kind: 'dir' | 'file'; size: number; hidden: boolean; modified: number };

/** Un canale finto: la pagina gli assegna `onmessage`, il disco lo chiama. */
interface Canale<T> {
	onmessage: ((m: T) => void) | null;
}

/**
 * Disco finto in memoria che risponde ai comandi `invoke` con gli stessi
 * nomi e argomenti del backend Rust.
 *
 * Serve ai test che montano la pagina intera: passando da `invoke` invece
 * che da un Backend finto si esercita anche `tauriBackend`, cioè la
 * traduzione fra nomi TypeScript e comandi Rust.
 */
export class DiscoFinto {
	/** Path completo → nodo. Le cartelle esistono come voci proprie. */
	nodi = new Map<string, Nodo>();
	/** Testo dei file, per l'anteprima e la ricerca nel contenuto. */
	contenuti = new Map<string, string>();
	/** Cartelle che rispondono "accesso negato". */
	negati = new Set<string>();
	/** Path originali di ciò che è stato cestinato, in ordine. */
	cestino: string[] = [];
	aperti: string[] = [];
	/** While set, `delete_items` waits for it: lets a test see the bar. */
	bloccaEliminazione: Promise<void> | null = null;
	/** Paths that refuse deletion, as a file open in another program does. */
	inUso = new Set<string>();
	/** While set, `transfer` waits for it: lets a test fill the queue. */
	bloccaTrasferimento: Promise<void> | null = null;
	/** Byte liberi su C:, che un test può cambiare come farebbe un altro programma. */
	liberoC = 40;
	/** Gli appunti di Windows. */
	appunti: ContenutoAppunti | null = null;
	/** Tasti premuti al momento di un rilascio. */
	tasti: Modificatori = { ctrl: false, shift: false, alt: false };
	/** Cartelle che la pagina ha chiesto di osservare. */
	osservate: string[] = [];
	/** Rete locale: preferenze di questo PC e altri PC trovati. */
	lan: ConfigLan = { visibile: false, condivisa: null, ricevuti: null, indirizzi: [] };
	pari: Pari[] = [];
	/** Amici: il codice di questo PC e la lista, come la tiene il backend. */
	codiceAmici = 'codice-di-questo-pc';
	amici: Amico[] = [];
	/** Friends a backup was run towards with «Allinea ora». */
	backupFatti: string[] = [];
	/** Invii verso altri PC e risposte alle richieste ricevute. */
	inviati: Array<{ peer: string; paths: string[] }> = [];
	risposte: Array<{ id: number; accetta: boolean; cartella: string | null }> = [];
	/** Cosa risponde il selettore di cartelle: null è «annullato». */
	cartellaScelta: string | null = null;
	/** Vaults by folder path: password, open or not, inner items. */
	casseforti = new Map<string, { password: string; aperta: boolean; voci: Array<{ path: string; size: number; dir: boolean; modified: number | null }> }>();
	/** Git status by folder, for git_status. */
	git = new Map<string, import('./ipc').GitStatus>();
	/** Photo/video/music details by path, for media_props. */
	media = new Map<string, import('./ipc').MediaProps>();
	/** Archive contents by archive path, for archive_list / archive_extract. */
	archivi = new Map<string, Array<{ path: string; size: number; dir: boolean; modified: number | null }>>();
	/** Key combinations another program holds (shortcut_free answers false). */
	scorciatoieOccupate = new Set<string>();
	/** Images rotated, with the direction. */
	ruotate: Array<{ path: string; clockwise: boolean }> = [];
	/** Transfers paused or resumed: op id → paused. */
	pause = new Map<number, boolean>();
	/** Immagini salvate dall'editor dei temi. */
	immaginiTema: string[] = [];
	/** I loro byte in base64, per percorso salvato. */
	datiImmaginiTema = new Map<string, string>();
	/** Finestre aperte con «Apri in una nuova finestra», col loro percorso. */
	finestre: Array<string | null> = [];
	/**
	 * Se l'editor dei temi si apre in una finestra sua. Spento, il comando
	 * fallisce e la pagina lo apre dentro di sé: i test lo usano così.
	 */
	editorInFinestra = false;
	aperturaEditor = 0;
	/** La cartella con cui «Windows» avvia l'app, come `"%1"` nel registro. */
	iniziale: { cartella: string; seleziona: string | null } | null = null;
	/** Chiamate alla Shell di Windows, che il disco finto non sa eseguire. */
	shell: Array<{ cmd: string; args: Record<string, unknown> }> = [];

	/** Elementi nel Cestino, con tutto ciò che serve a ripristinarli. */
	#nelCestino: Array<{ id: string; originale: string; nodi: Array<[string, Nodo]> }> = [];
	#prossimoId = 1;

	constructor(struttura: string[]) {
		this.nodi.set('C:\\', nodo('dir'));
		// Una voce che finisce con la barra è una cartella, le altre sono
		// file. «path=testo» dà anche un contenuto al file.
		for (const voce of struttura) {
			const [grezzo, testo] = voce.split('=');
			const dir = grezzo.endsWith('\\');
			const path = dir ? grezzo.slice(0, -1) : grezzo;
			this.#creaAntenati(path);
			this.nodi.set(path, nodo(dir ? 'dir' : 'file'));
			if (testo !== undefined) this.contenuti.set(path, testo);
		}
	}

	esiste(path: string): boolean {
		return this.nodi.has(path);
	}

	figli(dir: string): string[] {
		const prefisso = dir.endsWith('\\') ? dir : dir + '\\';
		return [...this.nodi.keys()].filter(
			(p) => p !== dir && p.startsWith(prefisso) && !p.slice(prefisso.length).includes('\\')
		);
	}

	/** Le ricezioni fermate da questo lato. */
	ricezioniAnnullate: number[] = [];

	/** Quanto pesa ogni cartella quando la si calcola, e quali sono state pesate. */
	pesoCartelle = 2048;
	pesate: string[] = [];

	/** La versione che l'app dice di avere; vuota = sconosciuta. */
	versioneApp = '';

	async invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
		switch (cmd) {
			case 'list_dir':
				return this.#listDir(args.path as string, args.sort as SortSpec);
			case 'navigate': {
				const path = args.path as string;
				if (path.startsWith('::lan\\') || path.startsWith('::amici\\')) return genitore(path);
				if (path.startsWith('::')) throw errore({ kind: 'notFound' });
				// Sopra la radice del disco c'è Questo PC, come nel backend.
				if (path === 'C:\\') return '::pc';
				return genitore(path);
			}
			case 'drives':
				return [{ label: 'Disco locale (C:)', path: 'C:\\', libero: this.liberoC, totale: 100, tipo: 'fisso' }];
			case 'known_folders':
				return [];
			case 'open_entry':
				this.aperti.push(args.path as string);
				return null;
			case 'reveal_in_explorer':
			case 'icon_for_extension':
			case 'thumbnail':
				return null;
			case 'is_default':
				return false;
			case 'create_folder': {
				const path = unisci(args.parent as string, args.name as string);
				if (this.esiste(path)) throw errore({ kind: 'io', message: `Esiste già: ${path}` });
				this.nodi.set(path, nodo('dir'));
				return path;
			}
			case 'rename_entry': {
				const vecchio = args.path as string;
				const nuovo = unisci(genitore(vecchio), args.name as string);
				if (this.esiste(nuovo)) throw errore({ kind: 'io', message: `Esiste già: ${nuovo}` });
				this.#sposta(vecchio, nuovo);
				return nuovo;
			}
			case 'move_to_trash':
				for (const p of args.paths as string[]) {
					this.#nelCestino.push({
						id: String(this.#prossimoId++),
						originale: p,
						nodi: this.#discendenti(p).map((d) => [d, this.nodi.get(d)!])
					});
					this.#rimuovi(p);
					this.cestino.push(p);
				}
				return null;
			case 'delete_permanently':
				for (const p of args.paths as string[]) this.#rimuovi(p);
				return null;
			case 'trash_restore':
				this.#ripristina((v) => (args.paths as string[]).includes(`::cestino\\${v.id}`));
				return null;
			case 'trash_restore_originals': {
				const originali = args.paths as string[];
				if (!this.#nelCestino.some((v) => originali.includes(v.originale))) {
					throw errore({ kind: 'io', message: 'Gli elementi non sono più nel Cestino.' });
				}
				this.#ripristina((v) => originali.includes(v.originale));
				return null;
			}
			case 'trash_purge': {
				const paths = args.paths as string[];
				this.#nelCestino = this.#nelCestino.filter((v) => !paths.includes(`::cestino\\${v.id}`));
				return null;
			}
			case 'trash_empty':
				this.#nelCestino = [];
				return null;
			case 'delete_items': {
				const mode = args.mode as 'cestino' | 'disco' | 'dalCestino' | 'svuota';
				const paths = args.paths as string[];
				const canale = args.onProgress as Canale<{ transferred: number; total: number }>;
				const totale = mode === 'svuota' ? this.#nelCestino.length : paths.length;
				canale.onmessage?.({ transferred: 0, total: totale });
				if (this.bloccaEliminazione) await this.bloccaEliminazione;
				const comando = { cestino: 'move_to_trash', disco: 'delete_permanently', dalCestino: 'trash_purge', svuota: 'trash_empty' }[mode];
				const done = paths.filter((p) => !this.inUso.has(p));
				await this.invoke(comando, { paths: done });
				canale.onmessage?.({ transferred: totale, total: totale });
				const failed = paths
					.filter((p) => this.inUso.has(p))
					.map((path) => ({ path, error: { kind: 'io', message: 'File in uso da un altro programma.' } }));
				return { done, failed };
			}
			case 'scan_conflicts':
				return (args.sources as string[])
					.map(nome)
					.filter((n) => this.esiste(unisci(args.dest as string, n)));
			case 'transfer':
				if (this.bloccaTrasferimento) await this.bloccaTrasferimento;
				return this.#trasferisci(
					args.sources as string[],
					args.dest as string,
					args.mode as 'copy' | 'move',
					args.policy as Politica
				);
			case 'cancel_transfer':
				return true;
			case 'clipboard_write':
				this.appunti = { paths: [...(args.paths as string[])], taglia: args.cut as boolean };
				return null;
			case 'clipboard_read':
				return this.appunti;
			case 'clipboard_clear':
				this.appunti = null;
				return null;
			case 'watch_dirs':
				this.osservate = [...(args.paths as string[])];
				return null;
			case 'key_modifiers':
				return this.tasti;
			case 'text_preview':
				return this.contenuti.get(args.path as string) ?? null;
			case 'resolve_path':
				return this.#risolvi(args.input as string);
			case 'search':
				return this.#cerca(
					args.root as string,
					args.criteri as { testo: string; contenuto: boolean; extensions?: string[] },
					args.onResults as Canale<Entry[]>
				);
			case 'entries_for': {
				const chiavi = [...this.nodi.keys()];
				return (args.paths as string[])
					.map((p) => chiavi.find((k) => k.toLowerCase() === p.toLowerCase()))
					.filter((k): k is string => k !== undefined)
					.map((k) => this.#voce(k));
			}
			case 'compare_folders':
				return this.#compare(args.here as string, args.there as string);
			case 'find_duplicates':
				return this.#duplicates(args.root as string, args.onEvent as Canale<unknown>);
			case 'compress': {
				const sources = args.sources as string[];
				const base = sources.length === 1 ? nome(sources[0]).replace(/\.[^.]+$/, '') : 'Archivio';
				const zip = this.#libero(args.dest as string, `${base}.zip`);
				this.nodi.set(zip, nodo('file'));
				return zip;
			}
			case 'file_checksum':
				// Like a real digest: lowercase, no prefix.
				return `${args.algorithm}ff${this.contenuti.get(args.path as string) ?? ''}`.toLowerCase();
			case 'archive_list':
				return this.archivi.get(args.archive as string) ?? [];
			case 'archive_extract': {
				const voci = this.archivi.get(args.archive as string) ?? [];
				const scelti = args.items as string[];
				const dest = args.dest as string;
				for (const v of voci) {
					const c = scelti.find((s) => v.path === s || v.path.startsWith(s + '/'));
					if (c === undefined) continue;
					const taglio = c.lastIndexOf('/') + 1;
					const rel = v.path.slice(taglio).split('/').join('\\');
					this.nodi.set(unisci(dest, rel), nodo(v.dir ? 'dir' : 'file'));
				}
				return;
			}
			case 'pause_transfer':
				this.pause.set(args.opId as number, args.paused as boolean);
				return true;
			case 'shortcut_free':
				return !this.scorciatoieOccupate.has(args.accelerator as string);
			case 'vault_create': {
				const dir = unisci(args.parent as string, `${args.name as string}.cassaforte`);
				if ((args.password as string).length < 8) throw { kind: 'io', message: 'La password deve avere almeno 8 caratteri.' };
				this.nodi.set(dir, nodo('dir'));
				this.casseforti.set(dir, { password: args.password as string, aperta: true, voci: [] });
				return dir;
			}
			case 'vault_unlock': {
				const v = this.casseforti.get(args.path as string);
				if (!v) throw { kind: 'io', message: 'Questa cartella non è una cassaforte.' };
				if (v.password !== args.password) throw { kind: 'io', message: 'Password sbagliata.' };
				v.aperta = true;
				return;
			}
			case 'vault_lock': {
				const v = this.casseforti.get(args.path as string);
				if (v) v.aperta = false;
				return;
			}
			case 'vault_is_open':
				return this.casseforti.get(args.path as string)?.aperta ?? false;
			case 'vault_list':
			case 'vault_add':
			case 'vault_extract':
			case 'vault_open_item':
			case 'vault_delete': {
				const v = this.casseforti.get(args.path as string);
				if (!v?.aperta) throw { kind: 'io', message: 'La cassaforte è chiusa: aprila di nuovo con la password.' };
				if (cmd === 'vault_list') return v.voci;
				if (cmd === 'vault_add') {
					for (const s of args.sources as string[]) {
						const interno = [args.inner as string, nome(s)].filter(Boolean).join('/');
						v.voci.push({ path: interno, size: this.nodi.get(s)?.size ?? 0, dir: this.nodi.get(s)?.kind === 'dir', modified: 0 });
					}
					return (args.sources as string[]).length;
				}
				if (cmd === 'vault_extract') {
					return (args.items as string[]).map((i) => {
						const p = unisci(args.dest as string, i.split('/').pop()!);
						this.nodi.set(p, nodo('file'));
						return p;
					});
				}
				if (cmd === 'vault_open_item') return `C:\\Temp\\${(args.item as string).split('/').pop()}`;
				const via = args.items as string[];
				v.voci = v.voci.filter((x) => !via.some((w) => x.path === w || x.path.startsWith(`${w}/`)));
				return;
			}
			case 'git_status':
				return this.git.get(args.folder as string) ?? null;
			case 'media_props':
				return (args.paths as string[]).map((p) => this.media.get(p) ?? null);
			case 'image_rotate':
				for (const p of args.paths as string[]) this.ruotate.push({ path: p, clockwise: args.clockwise as boolean });
				return;
			case 'image_convert': {
				const fatti: string[] = [];
				for (const p of args.paths as string[]) {
					const base = nome(p).replace(/\.[^.]+$/, '');
					const lato = args.maxSide ? ` (${args.maxSide})` : '';
					const nuovo = this.#libero(genitore(p), `${base}${lato}.${args.target}`);
					this.nodi.set(nuovo, nodo('file'));
					fatti.push(nuovo);
				}
				return fatti;
			}
			case 'extract': {
				const archivio = args.archive as string;
				const cartella = this.#libero(genitore(archivio), nome(archivio).replace(/\.zip$/i, ''));
				this.nodi.set(cartella, nodo('dir'));
				this.nodi.set(unisci(cartella, 'estratto.txt'), nodo('file'));
				return cartella;
			}
			case 'new_file_types':
				return [
					{ ext: '.txt', nome: 'Documento di testo' },
					{ ext: '.zip', nome: 'Cartella compressa' }
				];
			case 'create_new_file': {
				const ext = args.ext as string;
				const nomi: Record<string, string> = { '.txt': 'Documento di testo', '.zip': 'Cartella compressa' };
				const path = this.#libero(args.parent as string, `Nuovo ${nomi[ext] ?? 'file'}${ext}`);
				this.nodi.set(path, nodo('file'));
				return path;
			}
			case 'initial_path':
				return this.iniziale;
			case 'save_theme_image':
				this.immaginiTema.push(args.nome as string);
				this.datiImmaginiTema.set(`C:\\DatiApp\\temi-immagini\\${args.nome as string}`, args.dati as string);
				return `C:\\DatiApp\\temi-immagini\\${args.nome as string}`;
			case 'read_theme_image':
				return this.datiImmaginiTema.get(args.path as string) ?? '';
			case 'apri_editor_temi':
				if (!this.editorInFinestra) throw new Error('finestre non disponibili');
				this.aperturaEditor++;
				return null;
			case 'new_window':
				this.finestre.push((args.path as string | null) ?? null);
				return `finestra-${this.finestre.length + 1}`;
			case 'lan_stato':
			case 'lan_imposta':
				if (cmd === 'lan_imposta') this.lan = { ...(args.config as ConfigLan) };
				return {
					id: 'QUESTO-0000',
					nome: 'QUESTO',
					cartellaRicevuti: this.lan.ricevuti ?? 'C:\\Ricevuti',
					...this.lan
				};
			case 'amici_stato':
				return { codice: this.codiceAmici, pronto: true, amici: this.amici };
			case 'amici_aggiungi':
				this.amici.push({
					id: args.codice as string,
					nome: `Amico ${(args.codice as string).slice(0, 6)}`,
					stato: 'inviata',
					condividi: false,
					inLinea: false
				});
				return null;
			case 'amici_accetta':
				this.amici = this.amici.map((a) => (a.id === args.id ? { ...a, stato: 'confermato' } : a));
				return null;
			case 'amici_rimuovi':
				this.amici = this.amici.filter((a) => a.id !== args.id);
				return null;
			case 'amici_condividi':
				this.amici = this.amici.map((a) => (a.id === args.id ? { ...a, condividi: args.si as boolean } : a));
				return { codice: this.codiceAmici, pronto: true, amici: this.amici };
			case 'amici_backup':
				this.amici = this.amici.map((a) =>
					a.id === args.id
						? { ...a, backup: args.cartella ? { cartella: args.cartella as string, ultimo: null, tentato: null, esito: null } : undefined }
						: a
				);
				return { codice: this.codiceAmici, pronto: true, amici: this.amici };
			case 'amici_backup_ora':
				this.backupFatti.push(args.id as string);
				return '1 file';
			case 'amici_rispondi_backup':
				this.amici = this.amici.map((a) =>
					a.id === args.id
						? { ...a, ospite: { consenso: args.si ? 'si' : 'no', cartella: (args.cartella as string | null) ?? null, ultimo: null } }
						: a
				);
				return { codice: this.codiceAmici, pronto: true, amici: this.amici };
			case 'amici_qr':
				return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
			case 'lan_pari':
				return this.pari;
			case 'lan_rispondi':
				this.risposte.push({ id: args.id as number, accetta: args.accetta as boolean, cartella: (args.cartella as string | null) ?? null });
				return null;
			case 'lan_prepara_trascina': {
				const dest = 'C:\\Temp';
				if (!this.esiste(dest)) this.nodi.set(dest, nodo('dir'));
				return (args.paths as string[]).map((src) => {
					const arrivo = this.#libero(dest, nome(src));
					this.#copia(src, arrivo);
					return arrivo;
				});
			}
			case 'lan_annulla_ricezione':
				this.ricezioniAnnullate.push(args.id as number);
				return true;
			case 'lan_apri':
				this.aperti.push(args.path as string);
				return null;
			case 'lan_invia':
				this.inviati.push({ peer: args.peer as string, paths: [...(args.paths as string[])] });
				return null;
			case 'lan_scarica': {
				// La cartella condivisa dell'altro PC vive sotto `::lan\<id>`
				// nello stesso albero: scaricare è copiarla qui.
				const dest = args.dest as string;
				if (!this.esiste(dest)) this.nodi.set(dest, nodo('dir'));
				const coppie: Array<[string, string]> = (args.sources as string[]).map((src) => {
					const arrivo = this.#libero(dest, nome(src));
					this.#copia(src, arrivo);
					return [src, arrivo];
				});
				return { copiati: coppie.length, saltati: 0, annullato: false, coppie };
			}
			case 'start_drag':
			case 'show_shell_menu':
			case 'show_properties':
			case 'open_with':
			case 'run_as_admin':
				this.shell.push({ cmd, args });
				return cmd === 'start_drag' ? 'nessuno' : cmd === 'show_shell_menu' ? false : null;
			case 'scegli_cartella':
				return this.cartellaScelta;
			case 'dimensione_cartella':
				this.pesate.push(args.path as string);
				return this.pesoCartelle;
			case 'turno_dimensioni':
				return;
			case 'plugin:app|version':
				// Senza versione impostata l'app non sa quale è: niente novità.
				if (this.versioneApp) return this.versioneApp;
				throw new Error('versione non disponibile');
			default:
				throw new Error(`Comando non gestito dal disco finto: ${cmd}`);
		}
	}

	#listDir(path: string, sort: SortSpec): { path: string; entries: Entry[] } {
		if (path === '::cestino') {
			return {
				path,
				entries: this.#nelCestino.map((v) => ({
					name: nome(v.originale),
					path: `::cestino\\${v.id}`,
					kind: v.nodi[0]?.[1].kind ?? 'file',
					size: 100,
					modified: 0,
					hidden: false,
					origine: genitore(v.originale)
				}))
			};
		}
		if (path === '::amici') {
			return {
				path,
				entries: this.amici
					.filter((a) => a.stato === 'confermato')
					.map((a) => ({
						name: a.nome,
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
				entries: this.pari.map((p) => ({
					name: p.nome,
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
					{ name: 'Disco locale (C:)', path: 'C:\\', kind: 'dir', size: 0, modified: null, hidden: false, libero: 40, totale: 100 }
				]
			};
		}

		if (this.negati.has(path)) throw errore({ kind: 'accessDenied' });
		const n = this.nodi.get(path);
		if (!n) throw errore({ kind: 'notFound' });
		if (n.kind !== 'dir') throw errore({ kind: 'notADirectory' });

		const entries: Entry[] = this.figli(path).map((p) => this.#voce(p));

		// Cartelle prima, poi per nome: come il backend con l'ordinamento
		// predefinito. Il verso si rispetta per controllare le intestazioni.
		entries.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
			const c = a.name.localeCompare(b.name);
			return sort?.ascending === false ? -c : c;
		});

		return { path, entries };
	}

	#voce(p: string): Entry {
		const n = this.nodi.get(p)!;
		return { name: nome(p), path: p, kind: n.kind, size: n.size, modified: n.modified, hidden: n.hidden };
	}

	#risolvi(input: string): { cartella: string; seleziona: string | null } {
		const pulito = input.trim().replace(/^"|"$/g, '');
		const speciali: Record<string, string> = { 'questo pc': '::pc', cestino: '::cestino', rete: '::rete' };
		if (speciali[pulito.toLowerCase()]) return { cartella: speciali[pulito.toLowerCase()], seleziona: null };
		const n = this.nodi.get(pulito);
		if (!n) throw errore({ kind: 'notFound' });
		if (n.kind === 'dir') return { cartella: pulito, seleziona: null };
		return { cartella: genitore(pulito), seleziona: pulito };
	}

	async #cerca(
		root: string,
		criteri: { testo: string; contenuto: boolean; extensions?: string[] },
		canale: Canale<Entry[]>
	) {
		const testo = criteri.testo.toLowerCase();
		const prefisso = root.endsWith('\\') ? root : root + '\\';
		const ext = criteri.extensions;
		const trovati = [...this.nodi.keys()]
			.filter((p) => p.startsWith(prefisso))
			// Like Rust: a type filter keeps only files with one of those extensions.
			.filter((p) => !ext || (this.nodi.get(p)!.kind === 'file' && ext.includes(p.split('.').pop()!.toLowerCase())))
			.filter(
				(p) =>
					nome(p).toLowerCase().includes(testo) ||
					(criteri.contenuto && (this.contenuti.get(p) ?? '').toLowerCase().includes(testo))
			)
			.sort()
			.map((p) => this.#voce(p));
		// Come Rust: i risultati arrivano a lotti, non tutti alla fine.
		await Promise.resolve();
		if (trovati.length > 0) canale.onmessage?.(trovati.slice(0, 1));
		if (trovati.length > 1) canale.onmessage?.(trovati.slice(1));
		return trovati.length;
	}

	/** Same rules as Rust: names match ignoring case, files differ by their text. */
	#compare(here: string, there: string) {
		const out = { onlyHere: [] as Entry[], onlyThere: [] as Entry[], different: [] as unknown[] };
		const walk = (a: string, b: string) => {
			const fa = new Map(this.figli(a).map((p) => [nome(p).toLowerCase(), p]));
			const fb = new Map(this.figli(b).map((p) => [nome(p).toLowerCase(), p]));
			for (const [k, pa] of fa) {
				const pb = fb.get(k);
				if (!pb) {
					out.onlyHere.push(this.#voce(pa));
					continue;
				}
				fb.delete(k);
				const na = this.nodi.get(pa)!;
				const nb = this.nodi.get(pb)!;
				if (na.kind === 'dir' && nb.kind === 'dir') walk(pa, pb);
				else if (na.kind !== nb.kind || (this.contenuti.get(pa) ?? '') !== (this.contenuti.get(pb) ?? ''))
					out.different.push({ here: this.#voce(pa), there: this.#voce(pb), newerHere: na.modified > nb.modified });
			}
			for (const pb of fb.values()) out.onlyThere.push(this.#voce(pb));
		};
		walk(here, there);
		return out;
	}

	/** Like Rust: files with the same text are identical; groups, then the final progress. */
	async #duplicates(root: string, canale: Canale<unknown>) {
		const prefix = root.endsWith('\\') ? root : root + '\\';
		const byText = new Map<string, string[]>();
		for (const [p, n] of this.nodi) {
			const text = this.contenuti.get(p);
			if (n.kind !== 'file' || !p.startsWith(prefix) || !text) continue;
			byText.set(text, [...(byText.get(text) ?? []), p]);
		}
		await Promise.resolve();
		let groups = 0;
		for (const paths of byText.values()) {
			if (paths.length < 2) continue;
			groups++;
			canale.onmessage?.({ kind: 'group', size: 100, entries: paths.sort().map((p) => this.#voce(p)) });
		}
		canale.onmessage?.({ kind: 'progress', done: 1, total: 1 });
		return groups;
	}

	#ripristina(scegli: (v: { id: string; originale: string }) => boolean) {
		const tornano = this.#nelCestino.filter(scegli);
		for (const v of tornano) for (const [p, n] of v.nodi) this.nodi.set(p, n);
		this.#nelCestino = this.#nelCestino.filter((v) => !tornano.includes(v));
	}

	#trasferisci(sources: string[], dest: string, mode: 'copy' | 'move', policy: Politica) {
		let copiati = 0;
		let saltati = 0;
		const coppie: Array<[string, string]> = [];

		for (const src of sources) {
			let destinazione = unisci(dest, nome(src));

			if (this.esiste(destinazione)) {
				if (policy === 'salta') {
					saltati++;
					continue;
				}
				if (policy === 'rinomina') destinazione = this.#libero(dest, nome(src));
				else this.#rimuovi(destinazione);
			}

			if (mode === 'move') this.#sposta(src, destinazione);
			else this.#copia(src, destinazione);
			copiati++;
			coppie.push([src, destinazione]);
		}

		return { copiati, saltati, annullato: false, coppie };
	}

	#libero(dest: string, n: string): string {
		if (!this.esiste(unisci(dest, n))) return unisci(dest, n);
		const punto = n.lastIndexOf('.');
		const base = punto > 0 ? n.slice(0, punto) : n;
		const ext = punto > 0 ? n.slice(punto) : '';
		for (let i = 2; ; i++) {
			const candidato = unisci(dest, `${base} (${i})${ext}`);
			if (!this.esiste(candidato)) return candidato;
		}
	}

	#discendenti(path: string): string[] {
		return [...this.nodi.keys()].filter((p) => p === path || p.startsWith(path + '\\'));
	}

	#copia(da: string, a: string): void {
		for (const p of this.#discendenti(da)) {
			this.nodi.set(a + p.slice(da.length), { ...this.nodi.get(p)! });
		}
	}

	#sposta(da: string, a: string): void {
		this.#copia(da, a);
		this.#rimuovi(da);
	}

	#rimuovi(path: string): void {
		for (const p of this.#discendenti(path)) this.nodi.delete(p);
	}

	#creaAntenati(path: string): void {
		let p = genitore(path);
		while (p !== 'C:\\' && !this.nodi.has(p)) {
			this.nodi.set(p, nodo('dir'));
			p = genitore(p);
		}
	}
}

function nodo(kind: 'dir' | 'file'): Nodo {
	return { kind, size: kind === 'dir' ? 0 : 100, hidden: false, modified: 0 };
}

/** Il backend rifiuta con un FsError serializzato, non con un Error. */
function errore(e: FsError): FsError {
	return e;
}

export function unisci(dir: string, n: string): string {
	return dir.endsWith('\\') ? dir + n : `${dir}\\${n}`;
}

function genitore(path: string): string {
	const i = path.lastIndexOf('\\');
	const g = path.slice(0, i);
	return g.endsWith(':') ? g + '\\' : g;
}

function nome(path: string): string {
	return path.slice(path.lastIndexOf('\\') + 1);
}
