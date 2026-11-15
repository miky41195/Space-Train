<script lang="ts">
	import { t } from '../i18n';
	import type { ServerConfig, ServerProtocol } from '../ipc';
	import { nameOf } from '../locations';
	import { backupStatus } from '../server-backup';

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
		onpickfolder = undefined,
		onbackupnow = undefined,
		oncancel
	}: {
		mode: Mode;
		error?: string | null;
		busy?: boolean;
		onsave?: (config: ServerConfig, password: string | null) => void;
		onremove?: (id: string) => void;
		ontrust?: () => void;
		onpassword?: (password: string, remember: boolean) => void;
		/** Chooses the folder of this PC to back up. */
		onpickfolder?: (initial: string | null) => Promise<string | null>;
		/** Saves, then runs the backup now. */
		onbackupnow?: (config: ServerConfig, password: string | null) => void;
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
	let backingUp = $state(!!start.backup);

	async function pickFolder() {
		const chosen = await onpickfolder?.(config.backup?.folder || null);
		if (!chosen) return;
		const target = config.backup?.target || nameOf(chosen);
		config.backup = { ...(config.backup ?? {}), folder: chosen, target };
	}

	/** The config as it is saved: no backup without its folder. */
	function toSave(): ServerConfig {
		const backup = backingUp && config.backup?.folder ? config.backup : null;
		return { ...config, remember, backup };
	}

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
				? t('Modifica «{0}»', [mode.server.name])
				: t('Aggiungi server')
			: mode.kind === 'key'
				? mode.changed
					? t('La chiave del server è cambiata')
					: t('Primo collegamento a {0}', [mode.server.host])
				: t('Password per «{0}»', [mode.server.name])
	);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		if (mode.kind === 'edit' && config.host.trim()) onsave?.(toSave(), password || null);
		else if (mode.kind === 'key' && !mode.changed) ontrust?.();
		else if (mode.kind === 'password' && password) onpassword?.(password, remember);
	}
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && !busy && oncancel()} onkeydown={(e) => e.key === 'Escape' && !busy && oncancel()}>
	<div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
		<form onsubmit={submit}>
			<h2>{title}</h2>

			{#if mode.kind === 'edit'}
				<div class="protocols" role="radiogroup" aria-label={t('Protocollo')}>
					{#each PROTOCOLS as p (p.id)}
						<button type="button" role="radio" aria-checked={config.protocol === p.id} class:on={config.protocol === p.id} onclick={() => setProtocol(p.id)}
							>{p.name}</button
						>
					{/each}
				</div>
				<div class="two">
					<label>
						<span class="label">{t('Indirizzo')}</span>
						<input bind:this={first} bind:value={config.host} placeholder={config.protocol === 'webdav' ? 'https://nas.example.it/dav' : 'server.example.it'} spellcheck="false" />
					</label>
					<label class="port">
						<span class="label">{t('Porta')}</span>
						<input type="number" min="0" max="65535" bind:value={config.port} />
					</label>
				</div>
				<div class="two even">
					<label>
						<span class="label">{t('Utente')}</span>
						<input bind:value={config.user} spellcheck="false" autocomplete="username" />
					</label>
					<label>
						<span class="label">{t('Password')}</span>
						<input type="password" bind:value={password} autocomplete="current-password" placeholder={mode.server ? t('lascia vuota per non cambiarla') : ''} />
					</label>
				</div>
				<div class="two even">
					<label>
						<span class="label">{t('Nome')}</span>
						<input bind:value={config.name} placeholder={config.host || t('Il mio server')} />
					</label>
					<label>
						<span class="label">{t('Cartella iniziale')}</span>
						<input bind:value={config.path} spellcheck="false" />
					</label>
				</div>
				<label class="choice"><input type="checkbox" bind:checked={remember} /> {t('Ricorda la password (Gestore credenziali di Windows)')}</label>
				{#if config.protocol === 'ftp' || config.host.startsWith('http://')}
					<p class="notice">{t('Questo collegamento non è cifrato: password e file viaggiano in chiaro. Usalo solo nella rete di casa.')}</p>
				{/if}
				<section class="backup" aria-label={t('Backup automatico')}>
					<label class="choice head">
						<input type="checkbox" bind:checked={backingUp} />
						<span>{t('Backup automatico')}</span>
					</label>
					{#if backingUp}
						<div class="route">
							<label>
								<span class="label">{t('Dal PC')}</span>
								<button type="button" class="pick" onclick={pickFolder} title={config.backup?.folder ?? ''}>
									{config.backup?.folder ? nameOf(config.backup.folder) : t('Scegli la cartella…')}
								</button>
							</label>
							<span class="arrow" aria-hidden="true">→</span>
							<label>
								<span class="label">{t('Sul server')}</span>
								<input
									value={config.backup?.target ?? ''}
									oninput={(e) => config.backup && (config.backup.target = e.currentTarget.value)}
									disabled={!config.backup?.folder}
									spellcheck="false"
								/>
							</label>
						</div>
						<p class="hint">
							{#if config.backup?.folder}
								{backupStatus(config.backup)}
							{:else} {t('Una volta al giorno, mentre Space Train è aperto: solo i file nuovi o cambiati, sul server non si cancella niente.')} {/if}
						</p>
					{/if}
				</section>
			{:else if mode.kind === 'key'}
				{#if mode.changed}
					<p class="notice"> {t('Il server risponde con una chiave diversa da quella che avevi confermato. Può essere un aggiornamento del server, ma anche qualcuno che si mette in mezzo. Space Train non si collega. Se sei sicuro che il server è stato reinstallato, rimuovilo e aggiungilo di nuovo.')} </p>
				{:else}
					<p>{t('Controlla che l\'impronta sia quella del tuo server. Se un giorno cambia, Space Train si ferma e ti avvisa.')}</p>
				{/if}
				<code class="fingerprint">{mode.fingerprint}</code>
			{:else}
				<label>
					<span class="label">{t('Password{0}', [mode.server.user ? t(' di {0}', [mode.server.user]) : ''])}</span>
					<input bind:this={first} type="password" bind:value={password} autocomplete="current-password" />
				</label>
				<label class="choice"><input type="checkbox" bind:checked={remember} /> {t('Ricorda la password')}</label>
			{/if}

			{#if error}<p class="error" role="alert">{error}</p>{/if}

			<div class="actions">
				{#if mode.kind === 'edit' && mode.server && onremove}
					{@const id = mode.server.id}
					<button type="button" class="route" onclick={() => onremove(id)} disabled={busy}>{t('Rimuovi')}</button>
				{/if}
				<button type="button" onclick={oncancel} disabled={busy}>{mode.kind === 'key' && mode.changed ? t('Chiudi') : t('Annulla')}</button>
				{#if mode.kind === 'edit' && backingUp && config.backup?.folder && onbackupnow}
					<button type="button" onclick={() => onbackupnow(toSave(), password || null)} disabled={busy || !config.host.trim()}>{t('Fai il backup ora')}</button>
				{/if}
				{#if mode.kind === 'edit'}
					<button type="submit" class="primary" disabled={busy || !config.host.trim()}>{busy ? t('Un momento…') : mode.server ? t('Salva') : t('Aggiungi')}</button>
				{:else if mode.kind === 'key' && !mode.changed}
					<button bind:this={first} type="submit" class="primary" disabled={busy}>{t('È il mio server')}</button>
				{:else if mode.kind === 'password'}
					<button type="submit" class="primary" disabled={busy || !password}>{busy ? t('Un momento…') : t('Collegati')}</button>
				{/if}
			</div>
		</form>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		z-index: 10;
	}
	.dialog {
		width: min(460px, 92vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	form {
		display: grid;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: calc(15px * var(--text-scale, 1));
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
		line-height: 1.5;
	}
	.protocols {
		display: flex;
		gap: 2px;
		width: fit-content;
		padding: 2px;
		border-radius: var(--radius-sm);
		background: var(--bg);
	}
	.protocols button {
		height: 26px;
		padding: 0 12px;
		border: none;
		border-radius: calc(var(--radius-sm) - 2px);
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
	}
	.protocols button.on {
		background: var(--accent-soft);
		color: var(--text);
	}
	.two {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 90px;
		gap: 8px;
	}
	.two.even {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	}
	label {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.label {
		font-family: var(--font-display);
		font-size: calc(11px * var(--text-scale, 1));
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
	.choice {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.backup {
		display: grid;
		gap: 10px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}
	.backup .head {
		font-weight: 600;
	}
	.backup .route {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: end;
		gap: 8px;
	}
	.backup .arrow {
		padding-bottom: 6px;
		color: var(--text-dim);
	}
	.pick {
		height: 30px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: default;
	}
	.pick:hover {
		border-color: var(--text-dim);
	}
	.hint {
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.fingerprint {
		display: block;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-family: var(--font-display);
		font-size: calc(12px * var(--text-scale, 1));
		overflow-wrap: anywhere;
		user-select: all;
	}
	.notice,
	.error {
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: rgba(196, 43, 28, 0.12);
		color: var(--error-text, #ffb4ab);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
	}
	.actions button {
		height: 30px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	.actions button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	.actions button:disabled {
		opacity: 0.5;
	}
	.actions .route {
		margin-right: auto;
		color: var(--error-text, #ffb4ab);
	}
	.primary {
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
