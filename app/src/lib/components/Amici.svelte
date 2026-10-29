<script lang="ts">
	import type { Amico, Backend, StatoAmici } from '../ipc';
	import { nomeDi } from '../posizioni';

	let {
		backend,
		stato,
		condivisa = null,
		onchiudi,
		onerrore = undefined
	}: {
		backend: Backend;
		stato: StatoAmici;
		/** La cartella condivisa di questo PC, la stessa della rete locale. */
		condivisa?: string | null;
		onchiudi: () => void;
		onerrore?: (e: unknown) => void;
	} = $props();

	let qr = $state('');
	let mostraQr = $state(false);
	let copiato = $state(false);
	let nuovo = $state('');
	let invio = $state(false);
	/** L'amico che si sta per togliere: chiede conferma con un secondo clic. */
	let daTogliere = $state<string | null>(null);

	/** Il codice a gruppi di quattro, per leggerlo e dettarlo più facilmente. */
	let codiceLeggibile = $derived(stato.codice.match(/.{1,4}/g)?.join('-') ?? stato.codice);

	let ricevute = $derived(stato.amici.filter((a) => a.stato === 'ricevuta'));
	let altri = $derived(stato.amici.filter((a) => a.stato !== 'ricevuta'));

	async function apriQr() {
		mostraQr = !mostraQr;
		if (mostraQr && !qr) qr = await backend.amiciQr().catch(() => '');
	}

	async function copia() {
		try {
			await navigator.clipboard.writeText(stato.codice);
			copiato = true;
			setTimeout(() => (copiato = false), 1500);
		} catch (e) {
			onerrore?.(e);
		}
	}

	async function aggiungi() {
		const codice = nuovo.trim();
		if (!codice || invio) return;
		invio = true;
		try {
			await backend.amiciAggiungi(codice);
			nuovo = '';
		} catch (e) {
			onerrore?.(e);
		} finally {
			invio = false;
		}
	}

	function esegui(lavoro: Promise<unknown>) {
		lavoro.catch((e) => onerrore?.(e));
	}

	function togli(a: Amico) {
		if (daTogliere !== a.id) {
			daTogliere = a.id;
			return;
		}
		daTogliere = null;
		esegui(backend.amiciRimuovi(a.id));
	}

	function descrizione(a: Amico): string {
		if (a.stato === 'inviata') return 'In attesa che accetti';
		return a.inLinea ? 'In linea' : 'Non in linea';
	}
</script>

<div class="sfondo" role="presentation" onclick={(e) => e.target === e.currentTarget && onchiudi()}>
	<div class="finestra" role="dialog" aria-modal="true" aria-label="Amici">
		<h2>Amici</h2>
		<p class="spiega">
			Scambiatevi file e cartelle da qualsiasi rete, senza VPN. Il collegamento è cifrato da un capo all’altro
			e vale solo fra amici confermati da entrambi.
		</p>

		<section>
			<h3>Il tuo codice</h3>
			<div class="codice" title="Dallo a chi vuoi aggiungere: non serve tenerlo segreto">{codiceLeggibile}</div>
			<div class="riga">
				<button onclick={copia}>{copiato ? 'Copiato' : 'Copia'}</button>
				<button onclick={apriQr} aria-expanded={mostraQr}>{mostraQr ? 'Nascondi QR' : 'Mostra QR'}</button>
				{#if !stato.pronto}<span class="dim">Connessione in avvio…</span>{/if}
			</div>
			{#if mostraQr && qr}
				<div class="qr" aria-label="QR code del tuo codice">{@html qr}</div>
			{/if}
		</section>

		<section>
			<h3>Aggiungi un amico</h3>
			<form class="riga" onsubmit={(e) => { e.preventDefault(); void aggiungi(); }}>
				<input bind:value={nuovo} placeholder="Incolla il suo codice" aria-label="Codice dell'amico" spellcheck="false" />
				<button class="primario" type="submit" disabled={!nuovo.trim() || invio}>Chiedi amicizia</button>
			</form>
		</section>

		{#if ricevute.length > 0}
			<section>
				<h3>Richieste ricevute</h3>
				{#each ricevute as a (a.id)}
					<div class="amico">
						<div class="chi">
							<span class="nome">{a.nome}</span>
							<span class="dim codice-breve" title={a.id}>{a.id.slice(0, 12)}…</span>
						</div>
						<button class="primario" onclick={() => esegui(backend.amiciAccetta(a.id))}>Accetta</button>
						<button onclick={() => esegui(backend.amiciRimuovi(a.id))}>Rifiuta</button>
					</div>
				{/each}
			</section>
		{/if}

		<section class="lista">
			<h3>I tuoi amici</h3>
			{#each altri as a (a.id)}
				<div class="amico">
					<span class="pallino" class:acceso={a.stato === 'confermato' && a.inLinea}></span>
					<div class="chi">
						<span class="nome">{a.nome}</span>
						<span class="dim">{descrizione(a)}</span>
					</div>
					{#if a.stato === 'confermato'}
						<label class="condividi" title={condivisa ? `Può sfogliare e copiare «${nomeDi(condivisa)}»` : 'Prima scegli una cartella da condividere (clic destro → Condividi)'}>
							<input
								type="checkbox"
								checked={a.condividi}
								onchange={(e) => esegui(backend.amiciCondividi(a.id, e.currentTarget.checked))}
							/>
							Vede la cartella condivisa
						</label>
					{/if}
					<button class="togli" onclick={() => togli(a)} onblur={() => daTogliere === a.id && (daTogliere = null)}>
						{daTogliere === a.id ? 'Conferma' : 'Togli'}
					</button>
				</div>
			{:else}
				<div class="dim">Ancora nessuno: scambiatevi i codici e chiedete l’amicizia.</div>
			{/each}
		</section>

		<div class="azioni">
			<button class="primario" onclick={onchiudi}>Chiudi</button>
		</div>
	</div>
</div>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onchiudi()} />

<style>
	.sfondo {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.45);
	}
	.finestra {
		width: 520px;
		max-width: calc(100vw - 32px);
		max-height: calc(100vh - 64px);
		display: flex;
		flex-direction: column;
		padding: 20px 22px;
		overflow: auto;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
	}
	h2 {
		margin: 0 0 6px;
		font-family: var(--font-display);
		font-size: calc(17px * var(--scala-testo, 1));
		font-weight: 600;
	}
	h3 {
		margin: 0 0 6px;
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-testo, 1));
		color: var(--text-dim);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
	section {
		margin-top: 16px;
	}
	.spiega,
	.dim {
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
		line-height: 1.4;
	}
	.spiega {
		margin: 0;
	}
	.codice {
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-family: ui-monospace, Consolas, monospace;
		font-size: calc(12px * var(--scala-testo, 1));
		word-break: break-all;
		user-select: all;
	}
	.riga {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}
	.qr {
		width: 200px;
		margin-top: 10px;
		padding: 8px;
		border-radius: var(--radius-sm);
		background: #fff;
	}
	.qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	input:not([type]) {
		flex: 1;
		height: 30px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--scala-testo, 1));
		outline: none;
	}
	input:not([type]):focus {
		border-color: var(--accent);
	}
	.amico {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
		border-top: 1px solid var(--border);
	}
	.chi {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.nome {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.codice-breve {
		font-family: ui-monospace, Consolas, monospace;
	}
	.pallino {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--text-dim);
		opacity: 0.5;
	}
	.pallino.acceso {
		background: #22c55e;
		opacity: 1;
	}
	.condividi {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: calc(12px * var(--scala-testo, 1));
		color: var(--text-dim);
		white-space: nowrap;
	}
	.azioni {
		display: flex;
		justify-content: flex-end;
		margin-top: 16px;
	}
	button {
		height: 30px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--scala-testo, 1));
		cursor: default;
		white-space: nowrap;
	}
	button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	button:disabled {
		opacity: 0.5;
	}
	button.primario {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	button.primario:hover:not(:disabled) {
		background: var(--accent);
		filter: brightness(1.1);
	}
</style>
