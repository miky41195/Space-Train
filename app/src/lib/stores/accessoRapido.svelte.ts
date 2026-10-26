import type { Archivio } from './preferiti.svelte';
import { alCambioDi } from './sincronizza';
import { stessoPath } from '../posizioni';

const CHIAVE = 'space-train.accesso-rapido';

/**
 * Le cartelle che l'utente ha fissato nell'Accesso rapido, in cima alla
 * barra laterale. L'ordine è quello in cui le ha aggiunte.
 */
export class AccessoRapidoStore {
	cartelle = $state<string[]>([]);

	constructor(private archivio: Archivio | null = archivioPredefinito()) {
		this.#leggi(archivio?.getItem(CHIAVE) ?? null);
		alCambioDi(CHIAVE, (v) => this.#leggi(v));
	}

	#leggi(grezzo: string | null): void {
		try {
			const v = grezzo ? JSON.parse(grezzo) : [];
			this.cartelle = Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
		} catch {
			// Archivio illeggibile: si riparte con l'Accesso rapido vuoto.
			this.cartelle = [];
		}
	}

	contiene(path: string): boolean {
		return this.cartelle.some((c) => stessoPath(c, path));
	}

	fissa(path: string): void {
		if (this.contiene(path)) return;
		this.#scrivi([...this.cartelle, path]);
	}

	sgancia(path: string): void {
		this.#scrivi(this.cartelle.filter((c) => !stessoPath(c, path)));
	}

	/** Rinominata o spostata: resta fissata col nuovo path. */
	sposta(da: string, a: string): void {
		if (!this.contiene(da)) return;
		this.#scrivi(this.cartelle.map((c) => (stessoPath(c, da) ? a : c)));
	}

	/** Sposta una voce di una posizione, per riordinare dal menu. */
	muovi(path: string, verso: -1 | 1): void {
		const i = this.cartelle.findIndex((c) => stessoPath(c, path));
		const j = i + verso;
		if (i === -1 || j < 0 || j >= this.cartelle.length) return;
		const nuove = [...this.cartelle];
		[nuove[i], nuove[j]] = [nuove[j], nuove[i]];
		this.#scrivi(nuove);
	}

	#scrivi(cartelle: string[]): void {
		this.cartelle = cartelle;
		try {
			this.archivio?.setItem(CHIAVE, JSON.stringify(cartelle));
		} catch {
			// Archivio negato: l'Accesso rapido vale per questa sessione.
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
