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
	/** Invii verso altri PC e risposte alle richieste ricevute. */
	inviati: Array<{ peer: string; paths: string[] }> = [];
	risposte: Array<{ id: number; accetta: boolean; cartella: string | null }> = [];
	/** Cosa risponde il selettore di cartelle: null è «annullato». */
	cartellaScelta: string | null = null;
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
			case 'scan_conflicts':
				return (args.sources as string[])
					.map(nome)
					.filter((n) => this.esiste(unisci(args.dest as string, n)));
			case 'transfer':
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
					args.criteri as { testo: string; contenuto: boolean },
					args.onResults as Canale<Entry[]>
				);
			case 'compress': {
				const sources = args.sources as string[];
				const base = sources.length === 1 ? nome(sources[0]).replace(/\.[^.]+$/, '') : 'Archivio';
				const zip = this.#libero(args.dest as string, `${base}.zip`);
				this.nodi.set(zip, nodo('file'));
				return zip;
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

	async #cerca(root: string, criteri: { testo: string; contenuto: boolean }, canale: Canale<Entry[]>) {
		const testo = criteri.testo.toLowerCase();
		const prefisso = root.endsWith('\\') ? root : root + '\\';
		const trovati = [...this.nodi.keys()]
			.filter((p) => p.startsWith(prefisso))
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
