<script lang="ts">
	import type { ServerConfig, ServerProtocol } from '../ipc';

	type Mode =
		| { kind: 'edit'; server: ServerConfig | null }
		| { kind: 'key'; server: ServerConfig; fingerprint: string; changed: boolean }
		| { kind: 'password'; server: ServerConfig };

	let {
		mode,
		error = null,
		busy = false,
		onsave = undefined,
		onremove = undefined,
		ontrust = undefined,
		onpassword = undefined,
		oncancel
	}: {
		mode: Mode;
		error?: string | null;
		busy?: boolean;
		onsave?: (config: ServerConfig, password: string | null) => void;
		onremove?: (id: string) => void;
		ontrust?: () => void;
		onpassword?: (password: string, remember: boolean) => void;
		oncancel: () => void;
	} = $props();

	const PROTOCOLS: Array<{ id: ServerProtocol; name: string; port: number }> = [
		{ id: 'sftp', name: 'SFTP', port: 22 },
		{ id: 'ftp', name: 'FTP', port: 21 },
		{ id: 'ftps', name: 'FTPS', port: 21 },
		{ id: 'webdav', name: 'WebDAV', port: 0 }
	];

	// svelte-ignore state_referenced_locally
	const start: ServerConfig =
		mode.kind === 'edit' && mode.server
			? { ...mode.server }
			: { id: '', name: '', protocol: 'sftp', host: '', port: 22, user: '', path: '/', fingerprint: null, remember: true };
	let config = $state<ServerConfig>(start);
	let password = $state('');
	// svelte-ignore state_referenced_locally
	let remember = $state(mode.kind === 'edit' ? start.remember : (mode.server.remember ?? true));
	let first = $state<HTMLInputElement | HTMLButtonElement | null>(null);

	$effect(() => {
		first?.focus();
	});

	function setProtocol(p: ServerProtocol) {
		const was = PROTOCOLS.find((x) => x.id === config.protocol)!;
		if (config.port === was.port) config.port = PROTOCOLS.find((x) => x.id === p)!.port;
		config.protocol = p;
	}

	let title = $derived(
		mode.kind === 'edit'
			? mode.server
				? `Modifica «${mode.server.name}»`
				: 'Aggiungi server'
			: mode.kind === 'key'
				? mode.changed
					? 'La chiave del server è cambiata'
					: `Primo collegamento a ${mode.server.host}`
				: `Password per «${mode.server.name}»`
	);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		if (mode.kind === 'edit' && config.host.trim()) onsave?.({ ...config, remember }, password || null);
		else if (mode.kind === 'key' && !mode.changed) ontrust?.();
		else if (mode.kind === 'password' && password) onpassword?.(password, remember);
	}
</script>

<div class="sfondo" role="presentation" onclick={(e) => e.target === e.currentTarget && !busy && oncancel()} onkeydown={(e) => e.key === 'Escape' && !busy && oncancel()}>
	<div class="finestra" role="dialog" aria-modal="true" aria-label={title}>
		<form onsubmit={submit}>
			<h2>{title}</h2>

			{#if mode.kind === 'edit'}
				<div class="protocolli" role="radiogroup" aria-label="Protocollo">
					{#each PROTOCOLS as p (p.id)}
						<button type="button" role="radio" aria-checked={config.protocol === p.id} class:on={config.protocol === p.id} onclick={() => setProtocol(p.id)}
							>{p.name}</button
						>
					{/each}
				</div>
				<div class="due">
					<label>
						<span class="etichetta">Indirizzo</span>
						<input bind:this={first} bind:value={config.host} placeholder={config.protocol === 'webdav' ? 'https://nas.example.it/dav' : 'server.example.it'} spellcheck="false" />
					</label>
					<label class="porta">
						<span class="etichetta">Porta</span>
						<input type="number" min="0" max="65535" bind:value={config.port} />
					</label>
				</div>
				<div class="due pari">
					<label>
						<span class="etichetta">Utente</span>
						<input bind:value={config.user} spellcheck="false" autocomplete="username" />
					</label>
					<label>
						<span class="etichetta">Password</span>
						<input type="password" bind:value={password} autocomplete="current-password" placeholder={mode.server ? 'lascia vuota per non cambiarla' : ''} />
					</label>
				</div>
				<div class="due pari">
					<label>
						<span class="etichetta">Nome</span>
						<input bind:value={config.name} placeholder={config.host || 'Il mio server'} />
					</label>
					<label>
						<span class="etichetta">Cartella iniziale</span>
						<input bind:value={config.path} spellcheck="false" />
					</label>
				</div>
				<label class="scelta"><input type="checkbox" bind:checked={remember} /> Ricorda la password (Gestore credenziali di Windows)</label>
				{#if config.protocol === 'ftp' || config.host.startsWith('http://')}
					<p class="avviso">Questo collegamento non è cifrato: password e file viaggiano in chiaro. Usalo solo nella rete di casa.</p>
				{/if}
			{:else if mode.kind === 'key'}
				{#if mode.changed}
					<p class="avviso">
						Il server risponde con una chiave diversa da quella che avevi confermato. Può essere un aggiornamento del server, ma
						anche qualcuno che si mette in mezzo. Space Train non si collega. Se sei sicuro che il server è stato reinstallato,
						rimuovilo e aggiungilo di nuovo.
					</p>
				{:else}
					<p>Controlla che l'impronta sia quella del tuo server. Se un giorno cambia, Space Train si ferma e ti avvisa.</p>
				{/if}
				<code class="impronta">{mode.fingerprint}</code>
			{:else}
				<label>
					<span class="etichetta">Password{mode.server.user ? ` di ${mode.server.user}` : ''}</span>
					<input bind:this={first} type="password" bind:value={password} autocomplete="current-password" />
				</label>
				<label class="scelta"><input type="checkbox" bind:checked={remember} /> Ricorda la password</label>
			{/if}

			{#if error}<p class="errore" role="alert">{error}</p>{/if}

			<div class="azioni">
				{#if mode.kind === 'edit' && mode.server && onremove}
					{@const id = mode.server.id}
					<button type="button" class="via" onclick={() => onremove(id)} disabled={busy}>Rimuovi</button>
				{/if}
				<button type="button" onclick={oncancel} disabled={busy}>{mode.kind === 'key' && mode.changed ? 'Chiudi' : 'Annulla'}</button>
				{#if mode.kind === 'edit'}
					<button type="submit" class="primario" disabled={busy || !config.host.trim()}>{busy ? 'Un momento…' : mode.server ? 'Salva' : 'Aggiungi'}</button>
				{:else if mode.kind === 'key' && !mode.changed}
					<button bind:this={first} type="submit" class="primario" disabled={busy}>È il mio server</button>
				{:else if mode.kind === 'password'}
					<button type="submit" class="primario" disabled={busy || !password}>{busy ? 'Un momento…' : 'Collegati'}</button>
				{/if}
			</div>
		</form>
	</div>
</div>

<style>
	.sfondo {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		z-index: 10;
	}
	.finestra {
		width: min(460px, 92vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	form {
		display: grid;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: calc(15px * var(--scala-testo, 1));
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
		line-height: 1.5;
	}
	.protocolli {
		display: flex;
		gap: 2px;
		width: fit-content;
		padding: 2px;
		border-radius: var(--radius-sm);
		background: var(--bg);
	}
	.protocolli button {
		height: 26px;
		padding: 0 12px;
		border: none;
		border-radius: calc(var(--radius-sm) - 2px);
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
	}
	.protocolli button.on {
		background: var(--accent-soft);
		color: var(--text);
	}
	.due {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 90px;
		gap: 8px;
	}
	.due.pari {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	}
	label {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.etichetta {
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-testo, 1));
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	input:not([type='checkbox']) {
		min-width: 0;
		height: 30px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	input[type='number'] {
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	input:not([type='checkbox']):focus {
		border-color: var(--accent);
		outline: none;
	}
	.scelta {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.impronta {
		display: block;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-family: var(--font-display);
		font-size: calc(12px * var(--scala-testo, 1));
		overflow-wrap: anywhere;
		user-select: all;
	}
	.avviso,
	.errore {
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: rgba(196, 43, 28, 0.12);
		color: var(--errore-testo, #ffb4ab);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.azioni {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
	}
	.azioni button {
		height: 30px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	.azioni button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	.azioni button:disabled {
		opacity: 0.5;
	}
	.azioni .via {
		margin-right: auto;
		color: var(--errore-testo, #ffb4ab);
	}
	.primario {
		border-color: transparent !important;
		background: var(--accent) !important;
		color: #fff !important;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
