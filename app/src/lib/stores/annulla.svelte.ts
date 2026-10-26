import type { Backend } from '../ipc';
import { nomeDi } from '../posizioni';

/**
 * Operazioni che si possono annullare con Ctrl+Z.
 *
 * Ognuna porta con sé ciò che serve a disfarla: i path d'arrivo effettivi,
 * non quelli previsti, perché un conflitto può averli numerati.
 */
export type Operazione =
	| { tipo: 'rinomina'; da: string; a: string }
	| { tipo: 'sposta'; coppie: Array<[string, string]> }
	/** Elementi nati dall'operazione: copie, cartelle nuove, archivi. */
	| { tipo: 'crea'; paths: string[]; descrizione: string }
	| { tipo: 'cestino'; originali: string[] };

const MASSIMO = 50;

export class AnnullaStore {
	pila = $state<Operazione[]>([]);

	constructor(private backend: Backend) {}

	get vuota(): boolean {
		return this.pila.length === 0;
	}

	registra(op: Operazione): void {
		// Un'operazione che non ha toccato niente non va in pila: annullarla
		// sembrerebbe non fare nulla, e l'utente premerebbe di nuovo.
		if (op.tipo === 'sposta' && op.coppie.length === 0) return;
		if (op.tipo === 'crea' && op.paths.length === 0) return;
		if (op.tipo === 'cestino' && op.originali.length === 0) return;

		this.pila = [...this.pila, op].slice(-MASSIMO);
	}

	/** Cosa disferebbe il prossimo Ctrl+Z, per la notifica. */
	prossima(): string | null {
		const op = this.pila[this.pila.length - 1];
		return op ? descrivi(op) : null;
	}

	/**
	 * Disfa l'ultima operazione. Ritorna la descrizione di ciò che è stato
	 * annullato, o `null` se non c'era niente.
	 *
	 * Se fallisce l'operazione resta fuori dalla pila: riprovare darebbe lo
	 * stesso errore, e ripeterlo all'infinito blocca le precedenti.
	 */
	async annulla(): Promise<string | null> {
		const op = this.pila[this.pila.length - 1];
		if (!op) return null;
		this.pila = this.pila.slice(0, -1);

		switch (op.tipo) {
			case 'rinomina':
				await this.backend.renameEntry(op.a, nomeDi(op.da));
				break;
			case 'crea':
				// Nel Cestino, non eliminato: annullare non deve poter
				// distruggere niente, nemmeno ciò che l'app ha appena creato.
				await this.backend.moveToTrash(op.paths);
				break;
			case 'cestino':
				await this.backend.trashRestoreOriginals(op.originali);
				break;
			case 'sposta':
				for (const [sorgente, arrivo] of [...op.coppie].reverse()) {
					const genitore = await this.backend.navigate(sorgente, 'up');
					const esito = await this.backend.transfer({
						opId: 0,
						sources: [arrivo],
						dest: genitore,
						mode: 'move',
						policy: 'salta',
						onProgress: () => {}
					});
					if (esito.saltati > 0) {
						throw { kind: 'io', message: `«${nomeDi(sorgente)}» esiste già nella posizione originale.` };
					}
					// Con un conflitto l'elemento era arrivato numerato:
					// tornando a casa riprende il suo nome.
					const tornato = esito.coppie[0]?.[1];
					if (tornato && nomeDi(tornato) !== nomeDi(sorgente)) {
						await this.backend.renameEntry(tornato, nomeDi(sorgente));
					}
				}
				break;
		}
		return descrivi(op);
	}
}

export function descrivi(op: Operazione): string {
	const quanti = (n: number) => (n === 1 ? '1 elemento' : `${n} elementi`);
	switch (op.tipo) {
		case 'rinomina':
			return `rinomina di «${nomeDi(op.a)}»`;
		case 'sposta':
			return `spostamento di ${quanti(op.coppie.length)}`;
		case 'crea':
			return op.descrizione;
		case 'cestino':
			return `eliminazione di ${quanti(op.originali.length)}`;
	}
}
