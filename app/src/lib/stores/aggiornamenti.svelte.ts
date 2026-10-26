/**
 * Aggiornamenti automatici dalle release di GitHub.
 *
 * Si controlla all'avvio e poi a intervalli; un aggiornamento trovato si
 * scarica in silenzio e solo quando è pronto si chiede di riavviare. Chi
 * usa l'app non deve fare niente oltre a quel clic; se rimanda, alla
 * prossima apertura gli viene riproposto.
 */

/** Ciò che serve di un aggiornamento: è un sottoinsieme di `Update` del plugin. */
export interface Aggiornamento {
	version: string;
	body?: string;
	download(): Promise<void>;
	install(): Promise<void>;
}

export interface FonteAggiornamenti {
	/** L'aggiornamento disponibile, o `null` se l'app è già all'ultima versione. */
	cerca(): Promise<Aggiornamento | null>;
	riavvia(): Promise<void>;
}

export type StatoAggiornamento = 'fermo' | 'scarica' | 'pronto' | 'installa';

/** Ogni quanto ricontrollare, per chi tiene l'app aperta per giorni. */
export const INTERVALLO_CONTROLLO = 6 * 60 * 60 * 1000;

export class AggiornamentiStore {
	stato = $state<StatoAggiornamento>('fermo');
	/** La versione pronta da installare. */
	versione = $state<string | null>(null);
	/** L'utente ha detto «Più tardi»: la barra sparisce fino al riavvio. */
	rimandato = $state(false);

	#pronto: Aggiornamento | null = null;

	constructor(private fonte: FonteAggiornamenti) {}

	/**
	 * Cerca e scarica. Un errore (niente rete, GitHub che non risponde) non
	 * si mostra: riproverà al prossimo controllo, e l'app intanto funziona.
	 */
	async controlla(): Promise<void> {
		if (this.stato !== 'fermo') return;
		try {
			const trovato = await this.fonte.cerca();
			if (!trovato) return;
			this.stato = 'scarica';
			await trovato.download();
			this.#pronto = trovato;
			this.versione = trovato.version;
			this.stato = 'pronto';
		} catch {
			this.stato = 'fermo';
		}
	}

	/** Installa e riavvia. Su Windows l'installatore chiude l'app da sé. */
	async installa(): Promise<void> {
		if (!this.#pronto || this.stato !== 'pronto') return;
		this.stato = 'installa';
		try {
			await this.#pronto.install();
			await this.fonte.riavvia();
		} catch {
			this.stato = 'pronto';
			throw new Error('Aggiornamento non installato: riprova più tardi.');
		}
	}

	rimanda(): void {
		this.rimandato = true;
	}

	/** La barra da mostrare: c'è qualcosa di pronto e l'utente non l'ha rimandato. */
	get daMostrare(): boolean {
		return (this.stato === 'pronto' || this.stato === 'installa') && !this.rimandato;
	}
}

/** La fonte vera: il plugin updater di Tauri e il riavvio del processo. */
export const fonteTauri: FonteAggiornamenti = {
	async cerca() {
		const { check } = await import('@tauri-apps/plugin-updater');
		const update = await check();
		if (!update) return null;
		return {
			version: update.version,
			body: update.body,
			download: () => update.download(),
			install: () => update.install()
		};
	},
	async riavvia() {
		const { relaunch } = await import('@tauri-apps/plugin-process');
		await relaunch();
	}
};
