export type ModoAppunti = 'copy' | 'cut';

/**
 * Appunti interni all'applicazione.
 *
 * Non tocca la clipboard di Windows: incollare in Esplora risorse o in
 * un'altra app non funzionerà. Servirebbe registrare il formato CF_HDROP
 * via OLE, che è un progetto a sé.
 */
export class ClipboardStore {
	paths = $state<string[]>([]);
	mode = $state<ModoAppunti | null>(null);

	get vuoto(): boolean {
		return this.paths.length === 0 || this.mode === null;
	}

	copy(paths: string[]): void {
		this.#imposta(paths, 'copy');
	}

	cut(paths: string[]): void {
		this.#imposta(paths, 'cut');
	}

	clear(): void {
		this.paths = [];
		this.mode = null;
	}

	/** Vero se il path è stato tagliato: l'interfaccia lo mostra sbiadito. */
	tagliato(path: string): boolean {
		return this.mode === 'cut' && this.paths.includes(path);
	}

	#imposta(paths: string[], mode: ModoAppunti): void {
		if (paths.length === 0) {
			this.clear();
			return;
		}
		this.paths = [...paths];
		this.mode = mode;
	}
}
