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

	/** Friends whose backup is running from «Allinea ora». */
	let allineando = $state<string[]>([]);

	async function scegliBackup(a: Amico) {
		const cartella = await backend.scegliCartella(`Cartella da tenere allineata da ${a.nome}`, null).catch(() => null);
		if (cartella) esegui(backend.amiciBackup(a.id, cartella));
	}

	async function allineaOra(a: Amico) {
		allineando = [...allineando, a.id];
		try {
			await backend.amiciBackupOra(a.id);
		} catch (e) {
			onerrore?.(e);
		} finally {
			allineando = allineando.filter((x) => x !== a.id);
		}
	}

	async function accettaBackupIn(a: Amico) {
		const cartella = await backend.scegliCartella(`Dove tenere il backup di ${a.nome}`, null).catch(() => null);
		if (cartella) esegui(backend.amiciRispondiBackup(a.id, true, cartella));
	}

	function quando(ms: number | null): string {
		if (ms === null) return 'mai';
		const d = new Date(ms);
		const oggi = new Date().toDateString() === d.toDateString();
		const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
		return oggi ? `oggi ${ora}` : `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} ${ora}`;
	}

	function statoBackup(b: NonNullable<Amico['backup']>): string {
		if (b.ultimo === null) return b.esito ?? 'non ancora fatto';
		const ok = b.tentato === b.ultimo;
		return `ultimo: ${quando(b.ultimo)}${ok && b.esito ? `, ${b.esito}` : ''}${!ok && b.esito ? ` · poi: ${b.esito}` : ''}`;
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
				<div class="voce">
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
				{#if a.stato === 'confermato'}
					<!-- Backup: ours kept on their PC, and theirs kept here. -->
					<div class="backup">
						{#if a.backup}
							<span class="dim testo" title={a.backup.cartella}
								>Backup di «{nomeDi(a.backup.cartella)}» ogni giorno · {statoBackup(a.backup)}</span
							>
							<button onclick={() => void allineaOra(a)} disabled={allineando.includes(a.id)}
								>{allineando.includes(a.id) ? 'Backup in corso…' : 'Allinea ora'}</button
							>
							<button onclick={() => esegui(backend.amiciBackup(a.id, null))} aria-label={`Smetti il backup verso ${a.nome}`}>Smetti</button>
						{:else}
							<span class="dim testo">Nessun backup verso {a.nome}</span>
							<button onclick={() => void scegliBackup(a)}>Tieni allineata una cartella…</button>
						{/if}
					</div>
					{#if a.ospite?.consenso === 'chiesto'}
						<div class="backup richiesta" role="group" aria-label={`Backup di ${a.nome}`}>
							<span class="testo">{a.nome} vuole tenere un backup su questo PC</span>
							<button class="primario" onclick={() => esegui(backend.amiciRispondiBackup(a.id, true, null))}>Accetta</button>
							<button onclick={() => void accettaBackupIn(a)}>Accetta in…</button>
							<button onclick={() => esegui(backend.amiciRispondiBackup(a.id, false, null))}>Rifiuta</button>
						</div>
					{:else if a.ospite?.consenso === 'si'}
						<div class="backup">
							<span class="dim testo" title={a.ospite.cartella ?? ''}
								>Tiene qui il suo backup · ricevuto: {quando(a.ospite.ultimo)}</span
							>
							<button onclick={() => esegui(backend.amiciRispondiBackup(a.id, false, null))} aria-label={`Non tenere più il backup di ${a.nome}`}>Smetti</button>
						</div>
					{/if}
				{/if}
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
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
	}
	h2 {
		margin: 0 0 6px;
		font-family: var(--font-display);
		font-size: calc(17px * var(--scala-titoli, var(--scala-testo, 1)));
		font-weight: 600;
	}
	h3 {
		margin: 0 0 6px;
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-titoli, var(--scala-testo, 1)));
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
		/* Il codice va su due righe: a pillola diventerebbe un ovale. */
		border-radius: min(var(--radius-sm), 12px);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
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
		/* Niente ritagli: il QR deve restare leggibile fino agli angoli. */
		border-radius: min(var(--radius-sm), 8px);
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
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--scala-testo, 1));
		outline: none;
	}
	input:not([type]):focus {
		border-color: var(--accent);
	}
	.voce {
		border-top: 1px solid var(--border);
		padding-bottom: 6px;
	}
	.amico {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
	}
	/* Under the name, aligned with it past the presence dot. */
	.backup {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 0 2px 16px;
	}
	.backup .testo {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.backup button {
		height: 26px;
		padding: 0 10px;
	}
	.backup.richiesta {
		margin-top: 4px;
		padding: 6px 8px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
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
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
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
