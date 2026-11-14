<script lang="ts">
	import type { FriendView, Backend, FriendsStatus } from '../ipc';
	import { nameOf } from '../locations';

	let {
		backend,
		status,
		shared = null,
		onclose,
		onerror = undefined
	}: {
		backend: Backend;
		status: FriendsStatus;
		/** This PC's shared folder, the same as on the local network. */
		shared?: string | null;
		onclose: () => void;
		onerror?: (e: unknown) => void;
	} = $props();

	let qr = $state('');
	let showQr = $state(false);
	let copied = $state(false);
	let newCode = $state('');
	let sending = $state(false);
	/** The friend about to be removed: a second click confirms. */
	let toRemove = $state<string | null>(null);

	/** The code in groups of four, easier to read and dictate. */
	let readableCode = $derived(status.code.match(/.{1,4}/g)?.join('-') ?? status.code);

	let received = $derived(status.friends.filter((a) => a.status === 'received'));
	let others = $derived(status.friends.filter((a) => a.status !== 'received'));

	async function toggleQr() {
		showQr = !showQr;
		if (showQr && !qr) qr = await backend.friendsQr().catch(() => '');
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(status.code);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch (e) {
			onerror?.(e);
		}
	}

	async function add() {
		const code = newCode.trim();
		if (!code || sending) return;
		sending = true;
		try {
			await backend.friendsAdd(code);
			newCode = '';
		} catch (e) {
			onerror?.(e);
		} finally {
			sending = false;
		}
	}

	function run(job: Promise<unknown>) {
		job.catch((e) => onerror?.(e));
	}

	function remove(a: FriendView) {
		if (toRemove !== a.id) {
			toRemove = a.id;
			return;
		}
		toRemove = null;
		run(backend.friendsRemove(a.id));
	}

	/** Friends whose backup is running from «Allinea time». */
	let aligning = $state<string[]>([]);

	async function chooseBackup(a: FriendView) {
		const folder = await backend.pickFolder(`Cartella da tenere allineata da ${a.name}`, null).catch(() => null);
		if (folder) run(backend.friendsBackup(a.id, folder));
	}

	async function alignNow(a: FriendView) {
		aligning = [...aligning, a.id];
		try {
			await backend.friendsBackupNow(a.id);
		} catch (e) {
			onerror?.(e);
		} finally {
			aligning = aligning.filter((x) => x !== a.id);
		}
	}

	async function acceptBackupIn(a: FriendView) {
		const folder = await backend.pickFolder(`Dove tenere il backup di ${a.name}`, null).catch(() => null);
		if (folder) run(backend.friendsAnswerBackup(a.id, true, folder));
	}

	function when(ms: number | null): string {
		if (ms === null) return 'mai';
		const d = new Date(ms);
		const today = new Date().toDateString() === d.toDateString();
		const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
		return today ? `oggi ${time}` : `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} ${time}`;
	}

	function backupStatus(b: NonNullable<FriendView['backup']>): string {
		if (b.last === null) return b.outcome ?? 'non ancora fatto';
		const ok = b.attempted === b.last;
		return `ultimo: ${when(b.last)}${ok && b.outcome ? `, ${b.outcome}` : ''}${!ok && b.outcome ? ` · poi: ${b.outcome}` : ''}`;
	}

	function description(a: FriendView): string {
		if (a.status === 'sent') return 'In attesa che accetti';
		return a.online ? 'In linea' : 'Non in linea';
	}
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog" role="dialog" aria-modal="true" aria-label="Amici">
		<h2>Amici</h2>
		<p class="explain">
			Scambiatevi file e cartelle da qualsiasi rete, senza VPN. Il collegamento è cifrato da un capo all’altro
			e vale solo fra amici confermati da entrambi.
		</p>

		<section>
			<h3>Il tuo codice</h3>
			<div class="code" title="Dallo a chi vuoi aggiungere: non serve tenerlo segreto">{readableCode}</div>
			<div class="row">
				<button onclick={copy}>{copied ? 'Copiato' : 'Copia'}</button>
				<button onclick={toggleQr} aria-expanded={showQr}>{showQr ? 'Nascondi QR' : 'Mostra QR'}</button>
				{#if !status.ready}<span class="dim">Connessione in avvio…</span>{/if}
			</div>
			{#if showQr && qr}
				<div class="qr" aria-label="QR code del tuo codice">{@html qr}</div>
			{/if}
		</section>

		<section>
			<h3>Aggiungi un amico</h3>
			<form class="row" onsubmit={(e) => { e.preventDefault(); void add(); }}>
				<input bind:value={newCode} placeholder="Incolla il suo codice" aria-label="Codice dell'amico" spellcheck="false" />
				<button class="primary" type="submit" disabled={!newCode.trim() || sending}>Chiedi amicizia</button>
			</form>
		</section>

		{#if received.length > 0}
			<section>
				<h3>Richieste ricevute</h3>
				{#each received as a (a.id)}
					<div class="friend">
						<div class="who">
							<span class="name">{a.name}</span>
							<span class="dim short-code" title={a.id}>{a.id.slice(0, 12)}…</span>
						</div>
						<button class="primary" onclick={() => run(backend.friendsAccept(a.id))}>Accetta</button>
						<button onclick={() => run(backend.friendsRemove(a.id))}>Rifiuta</button>
					</div>
				{/each}
			</section>
		{/if}

		<section class="list">
			<h3>I tuoi amici</h3>
			{#each others as a (a.id)}
				<div class="item">
				<div class="friend">
					<span class="dot" class:on={a.status === 'confirmed' && a.online}></span>
					<div class="who">
						<span class="name">{a.name}</span>
						<span class="dim">{description(a)}</span>
					</div>
					{#if a.status === 'confirmed'}
						<label class="share" title={shared ? `Può sfogliare e copiare «${nameOf(shared)}»` : 'Prima scegli una cartella da condividere (clic destro → Condividi)'}>
							<input
								type="checkbox"
								checked={a.share}
								onchange={(e) => run(backend.friendsShare(a.id, e.currentTarget.checked))}
							/>
							Vede la cartella condivisa
						</label>
					{/if}
					<button class="remove" onclick={() => remove(a)} onblur={() => toRemove === a.id && (toRemove = null)}>
						{toRemove === a.id ? 'Conferma' : 'Togli'}
					</button>
				</div>
				{#if a.status === 'confirmed'}
					<!-- Backup: ours kept on their PC, and theirs kept here. -->
					<div class="backup">
						{#if a.backup}
							<span class="dim text" title={a.backup.folder}
								>Backup di «{nameOf(a.backup.folder)}» ogni giorno · {backupStatus(a.backup)}</span
							>
							<button onclick={() => void alignNow(a)} disabled={aligning.includes(a.id)}
								>{aligning.includes(a.id) ? 'Backup in corso…' : 'Allinea ora'}</button
							>
							<button onclick={() => run(backend.friendsBackup(a.id, null))} aria-label={`Smetti il backup verso ${a.name}`}>Smetti</button>
						{:else}
							<span class="dim text">Nessun backup verso {a.name}</span>
							<button onclick={() => void chooseBackup(a)}>Tieni allineata una cartella…</button>
						{/if}
					</div>
					{#if a.guest?.consent === 'asked'}
						<div class="backup request" role="group" aria-label={`Backup di ${a.name}`}>
							<span class="text">{a.name} vuole tenere un backup su questo PC</span>
							<button class="primary" onclick={() => run(backend.friendsAnswerBackup(a.id, true, null))}>Accetta</button>
							<button onclick={() => void acceptBackupIn(a)}>Accetta in…</button>
							<button onclick={() => run(backend.friendsAnswerBackup(a.id, false, null))}>Rifiuta</button>
						</div>
					{:else if a.guest?.consent === 'yes'}
						<div class="backup">
							<span class="dim text" title={a.guest.folder ?? ''}
								>Tiene qui il suo backup · ricevuto: {when(a.guest.last)}</span
							>
							<button onclick={() => run(backend.friendsAnswerBackup(a.id, false, null))} aria-label={`Non tenere più il backup di ${a.name}`}>Smetti</button>
						</div>
					{/if}
				{/if}
				</div>
			{:else}
				<div class="dim">Ancora nessuno: scambiatevi i codici e chiedete l’amicizia.</div>
			{/each}
		</section>

		<div class="actions">
			<button class="primary" onclick={onclose}>Chiudi</button>
		</div>
	</div>
</div>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.45);
	}
	.dialog {
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
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
	}
	h2 {
		margin: 0 0 6px;
		font-family: var(--font-display);
		font-size: calc(17px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
	}
	h3 {
		margin: 0 0 6px;
		font-family: var(--font-display);
		font-size: calc(11px * var(--title-scale, var(--text-scale, 1)));
		color: var(--text-dim);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
	section {
		margin-top: 16px;
	}
	.explain,
	.dim {
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
		line-height: 1.4;
	}
	.explain {
		margin: 0;
	}
	.code {
		padding: 8px 10px;
		border: 1px solid var(--border);
		/* The code goes on two lines: as a pill it would become an oval. */
		border-radius: min(var(--radius-sm), 12px);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: var(--bg);
		font-family: ui-monospace, Consolas, monospace;
		font-size: calc(12px * var(--text-scale, 1));
		word-break: break-all;
		user-select: all;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}
	.qr {
		width: 200px;
		margin-top: 10px;
		padding: 8px;
		/* No clipping: the QR must stay readable up to the corners. */
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
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--text-scale, 1));
		outline: none;
	}
	input:not([type]):focus {
		border-color: var(--accent);
	}
	.item {
		border-top: 1px solid var(--border);
		padding-bottom: 6px;
	}
	.friend {
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
	.backup .text {
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
	.backup.request {
		margin-top: 4px;
		padding: 6px 8px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.short-code {
		font-family: ui-monospace, Consolas, monospace;
	}
	.dot {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--text-dim);
		opacity: 0.5;
	}
	.dot.on {
		background: #22c55e;
		opacity: 1;
	}
	.share {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: calc(12px * var(--text-scale, 1));
		color: var(--text-dim);
		white-space: nowrap;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 16px;
	}
	button {
		height: 30px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--text-scale, 1));
		cursor: default;
		white-space: nowrap;
	}
	button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	button:disabled {
		opacity: 0.5;
	}
	button.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	button.primary:hover:not(:disabled) {
		background: var(--accent);
		filter: brightness(1.1);
	}
</style>
