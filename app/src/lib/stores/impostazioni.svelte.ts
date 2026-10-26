import type { SortSpec } from '../ipc';
import type { ModoGruppi } from '../raggruppa';
import type { IdAccento, TemaPersonale } from '../temi';
import { limita, type Vista } from '../vista';
import type { Archivio } from './preferiti.svelte';
import { alCambioDi } from './sincronizza';

const CHIAVE = 'space-train.impostazioni';

export type { Vista };

export interface Colonne {
	dimensione: boolean;
	data: boolean;
	tipo: boolean;
}

interface Valori {
	vista: Vista;
	/** Lato delle icone nella vista «icone», in pixel. */
	lato: number;
	/** Righe più basse nella vista dettagli, come «Visualizzazione compatta». */
	compatta: boolean;
	colonne: Colonne;
	raggruppa: ModoGruppi;
	estensioni: boolean;
	anteprima: boolean;
	tema: string;
	accento: IdAccento;
	/** Ordinamento scelto per ogni cartella, chiave in minuscolo. */
	ordinamenti: Record<string, SortSpec>;
	/** Zona «Modificati di recente» accesa, e quanti giorni abbraccia. */
	recenti: boolean;
	giorniRecenti: number;
	/** L'animazione col treno all'apertura dell'app. */
	animazioneAvvio: boolean;
	/**
	 * Secondi di pausa fra un passaggio del treno (o dei personaggi) e il
	 * successivo, da quando esce di scena. -1: a riposo non passa mai.
	 */
	pausaTreno: number;
	/** Il colore scelto col selettore quando l'accento è «personalizzato». */
	coloreAccento: string;
	/** I temi creati con l'editor. */
	temiPersonali: TemaPersonale[];
	/**
	 * Cosa aprire all'avvio quando Windows non passa una cartella:
	 * `::pc`, `::ultima` (l'ultima cartella aperta) o il path di una cartella.
	 */
	paginaIniziale: string;
}

const PREDEFINITE: Valori = {
	vista: 'dettagli',
	lato: 96,
	compatta: false,
	colonne: { dimensione: true, data: true, tipo: false },
	raggruppa: 'nessuno',
	estensioni: true,
	anteprima: false,
	tema: 'spazio',
	accento: 'tema',
	ordinamenti: {},
	recenti: false,
	giorniRecenti: 14,
	animazioneAvvio: false,
	pausaTreno: 30,
	coloreAccento: '#8b5cf6',
	temiPersonali: [],
	paginaIniziale: 'C:\\'
};

/** Le viste delle versioni precedenti, tradotte nelle attuali. */
const VISTE_VECCHIE: Record<string, { vista: Vista; lato?: number }> = {
	righe: { vista: 'dettagli' },
	griglia: { vista: 'icone', lato: 96 },
	piccole: { vista: 'icone', lato: 24 }
};

/**
 * Preferenze che valgono per tutta l'app e restano dopo un riavvio.
 * Ogni modifica si salva subito.
 */
export class ImpostazioniStore {
	vista = $state<Vista>(PREDEFINITE.vista);
	lato = $state(PREDEFINITE.lato);
	compatta = $state(PREDEFINITE.compatta);
	colonne = $state<Colonne>({ ...PREDEFINITE.colonne });
	raggruppa = $state<ModoGruppi>(PREDEFINITE.raggruppa);
	/** Mostra le estensioni dei file nei nomi. */
	estensioni = $state(PREDEFINITE.estensioni);
	/** Riquadro d'anteprima aperto a destra. */
	anteprima = $state(PREDEFINITE.anteprima);
	tema = $state(PREDEFINITE.tema);
	accento = $state<IdAccento>(PREDEFINITE.accento);
	ordinamenti = $state<Record<string, SortSpec>>({});
	recenti = $state(PREDEFINITE.recenti);
	giorniRecenti = $state(PREDEFINITE.giorniRecenti);
	animazioneAvvio = $state(PREDEFINITE.animazioneAvvio);
	pausaTreno = $state(PREDEFINITE.pausaTreno);
	coloreAccento = $state(PREDEFINITE.coloreAccento);
	temiPersonali = $state<TemaPersonale[]>([]);
	paginaIniziale = $state(PREDEFINITE.paginaIniziale);

	constructor(private archivio: Archivio | null = archivioPredefinito()) {
		this.#leggi(archivio?.getItem(CHIAVE) ?? null);
		// Un'altra finestra ha cambiato tema o vista: qui si segue.
		alCambioDi(CHIAVE, (v) => this.#leggi(v));
	}

	#leggi(grezzo: string | null): void {
		try {
			if (!grezzo) return;
			const v = JSON.parse(grezzo) as Partial<Valori> & { vista?: string };
			const vecchia = v.vista ? VISTE_VECCHIE[v.vista] : undefined;
			if (vecchia) {
				this.vista = vecchia.vista;
				if (vecchia.lato) this.lato = vecchia.lato;
			} else if (v.vista) {
				this.vista = v.vista as Vista;
			}
			if (typeof v.lato === 'number') this.lato = limita(v.lato);
			if (typeof v.compatta === 'boolean') this.compatta = v.compatta;
			if (v.colonne) this.colonne = { ...PREDEFINITE.colonne, ...v.colonne };
			if (v.raggruppa) this.raggruppa = v.raggruppa;
			if (typeof v.estensioni === 'boolean') this.estensioni = v.estensioni;
			if (typeof v.anteprima === 'boolean') this.anteprima = v.anteprima;
			if (typeof v.tema === 'string') this.tema = v.tema;
			if (typeof v.accento === 'string') this.accento = v.accento;
			if (v.ordinamenti) this.ordinamenti = v.ordinamenti;
			if (typeof v.recenti === 'boolean') this.recenti = v.recenti;
			if (typeof v.giorniRecenti === 'number') this.giorniRecenti = v.giorniRecenti;
			if (typeof v.animazioneAvvio === 'boolean') this.animazioneAvvio = v.animazioneAvvio;
			if (typeof v.pausaTreno === 'number' && v.pausaTreno >= -1) this.pausaTreno = v.pausaTreno;
			if (typeof v.coloreAccento === 'string') this.coloreAccento = v.coloreAccento;
			if (Array.isArray(v.temiPersonali)) this.temiPersonali = v.temiPersonali;
			if (typeof v.paginaIniziale === 'string' && v.paginaIniziale) this.paginaIniziale = v.paginaIniziale;
		} catch {
			// Preferenze illeggibili: si parte da quelle predefinite.
		}
	}

	imposta<K extends keyof Valori>(chiave: K, valore: Valori[K]): void {
		(this as unknown as Valori)[chiave] = valore;
		this.#salva();
	}

	/** Cambia vista e lato insieme: è ciò che fa Ctrl+rotella. */
	impostaVista(vista: Vista, lato = this.lato): void {
		this.vista = vista;
		this.lato = limita(lato);
		this.#salva();
	}

	/** Salva un tema dell'editor: nuovo o al posto di quello con lo stesso id. */
	salvaTema(tema: TemaPersonale): void {
		const altri = this.temiPersonali.filter((t) => t.id !== tema.id);
		this.temiPersonali = [...altri, tema];
		this.#salva();
	}

	eliminaTema(id: string): void {
		this.temiPersonali = this.temiPersonali.filter((t) => t.id !== id);
		if (this.tema === id) this.tema = 'spazio';
		this.#salva();
	}

	alternaColonna(c: keyof Colonne): void {
		this.colonne = { ...this.colonne, [c]: !this.colonne[c] };
		this.#salva();
	}

	/** L'ordinamento che l'utente ha scelto per questa cartella, se c'è. */
	ordinamentoDi(cartella: string): SortSpec | undefined {
		return this.ordinamenti[cartella.toLowerCase()];
	}

	ricordaOrdinamento(cartella: string, spec: SortSpec): void {
		this.ordinamenti = { ...this.ordinamenti, [cartella.toLowerCase()]: { ...spec } };
		this.#salva();
	}

	#salva(): void {
		const v: Valori = {
			vista: this.vista,
			lato: this.lato,
			compatta: this.compatta,
			colonne: this.colonne,
			raggruppa: this.raggruppa,
			estensioni: this.estensioni,
			anteprima: this.anteprima,
			tema: this.tema,
			accento: this.accento,
			ordinamenti: this.ordinamenti,
			recenti: this.recenti,
			giorniRecenti: this.giorniRecenti,
			animazioneAvvio: this.animazioneAvvio,
			pausaTreno: this.pausaTreno,
			coloreAccento: this.coloreAccento,
			temiPersonali: this.temiPersonali,
			paginaIniziale: this.paginaIniziale
		};
		try {
			this.archivio?.setItem(CHIAVE, JSON.stringify(v));
		} catch {
			// Archivio negato: le preferenze valgono per questa sessione.
		}
	}
}

function archivioPredefinito(): Archivio | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
