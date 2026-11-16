<script lang="ts">
	import { onMount } from 'svelte';
	import { t, tr } from '../i18n';
	import type { Backend, Entry, PhoneEvent } from '../ipc';
	import { formatBytes } from '../locations';

	/**
	 * «Invia al telefono»: a QR the phone scans to open a page in its
	 * browser, with the chosen files to download and a button to upload its
	 * own. The server lives as long as this dialog; what the phone uploads
	 * waits here until it is kept (into the received folder) or thrown away.
	 */
	let {
		files,
		backend,
		receivedFolder,
		onopenfolder,
		onclose
	}: {
		files: Entry[];
		backend: Backend;
		receivedFolder: string;
		onopenfolder: (path: string) => void;
		onclose: () => void;
	} = $props();

	interface Upload {
		id: number;
		name: string;
		size: number;
		state: 'waiting' | 'busy' | 'kept' | 'discarded';
		error?: string;
	}

	let link = $state<{ url: string; qr: string } | null>(null);
	let failure = $state<string | null>(null);
	let connected = $state(false);
	let downloads = $state(0);
	let uploads = $state<Upload[]>([]);
	let waiting = $derived(uploads.filter((u) => u.state === 'waiting').length);
	let totalSize = $derived(files.reduce((s, e) => s + (e.size ?? 0), 0));

	onMount(() => {
	backend
		.phoneStart(
			files.map((e) => e.path),
			{
				download: t('Da scaricare'),
				upload: t('Manda al PC'),
				pick: t('Scegli foto o file'),
				sent: t('arrivato sul PC'),
				failed: t('non riuscito'),
				none: t('Nessun file scelto sul PC.')
			},
			(e: PhoneEvent) => {
				if (e.kind === 'visit') connected = true;
				else if (e.kind === 'downloaded') downloads++;
				else uploads = [...uploads, { id: e.id, name: e.name, size: e.size, state: 'waiting' }];
			}
		)
		.then((l) => (link = l))
		.catch((e) => (failure = tr((e as { message?: string })?.message ?? String(e))));
	return () => void backend.phoneStop().catch(() => {});
	});

	function update(id: number, change: Partial<Upload>) {
		uploads = uploads.map((u) => (u.id === id ? { ...u, ...change } : u));
	}

	async function keep(u: Upload) {
		update(u.id, { state: 'busy' });
		try {
			await backend.phoneKeep(u.id, receivedFolder);
			update(u.id, { state: 'kept' });
		} catch (e) {
			update(u.id, { state: 'discarded', error: tr((e as { message?: string })?.message ?? String(e)) });
		}
	}

	function discard(u: Upload) {
		update(u.id, { state: 'discarded' });
		void backend.phoneDiscard(u.id).catch(() => {});
	}

	async function keepAll() {
		for (const u of uploads.filter((x) => x.state === 'waiting')) await keep(u);
	}
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
	<div class="dialog" role="dialog" aria-modal="true" aria-label={t('Invia al telefono')}>
		<header>
			<h2>{t('Invia al telefono')}</h2>
			<span class="meta">{files.length === 1 ? files[0].name : t('{0} file', [files.length])} · {formatBytes(totalSize)}</span>
		</header>

		{#if failure}
			<p class="error">{failure}</p>
		{:else if link}
			<div class="link">
				<div class="qr" aria-label={t('QR code dell’indirizzo')}>{@html link.qr}</div>
				<div class="how">
					<p>{t('Inquadra il codice con la fotocamera del telefono. Telefono e PC devono essere sulla stessa rete.')}</p>
					<p class="url">{link.url}</p>
					<p class="dim">{t('Dal telefono puoi anche mandare file al PC: li tieni o li scarti qui sotto.')}</p>
				</div>
			</div>
			<p class="status">
				<span class="lamp" class:on={connected}></span>
				{#if connected}{t('Telefono collegato')}{#if downloads > 0} · {t('{0} scaricati', [downloads])}{/if}{:else}{t('In attesa del telefono…')}{/if}
			</p>
		{:else}
			<p class="dim">{t('Avvio…')}</p>
		{/if}

		{#if uploads.length > 0}
			<div class="uploads" aria-label={t('Dal telefono')}>
				{#each uploads as u (u.id)}
					<div class="up">
						<span class="name" title={u.name}>{u.name}</span>
						<span class="meta">{formatBytes(u.size)}</span>
						{#if u.state === 'waiting'}
							<button onclick={() => void keep(u)}>{t('Tieni')}</button>
							<button onclick={() => discard(u)}>{t('Scarta')}</button>
						{:else if u.state === 'busy'}
							<span class="meta">{t('Controllo…')}</span>
						{:else if u.state === 'kept'}
							<span class="meta ok">{t('In Ricevuti')}</span>
						{:else}
							<span class="meta">{u.error ?? t('Scartato')}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<div class="actions">
			{#if uploads.some((u) => u.state === 'kept')}
				<button class="link-button" onclick={() => onopenfolder(receivedFolder)}>{t('Apri Ricevuti')}</button>
			{/if}
			{#if waiting > 1}<button onclick={() => void keepAll()}>{t('Tieni tutti')}</button>{/if}
			<button class="primary" onclick={onclose}>{waiting > 0 ? t('Chiudi e scarta {0}', [waiting]) : t('Chiudi e spegni')}</button>
		</div>
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
		width: min(520px, 92vw);
		max-height: 88vh;
		padding: 20px;
		display: grid;
		gap: 14px;
		overflow: auto;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
		font-size: calc(13px * var(--text-scale, 1));
	}
	header {
		display: grid;
		gap: 2px;
	}
	h2 {
		margin: 0;
		font-size: calc(15px * var(--text-scale, 1));
		font-weight: 600;
	}
	p {
		margin: 0;
	}
	.meta,
	.dim {
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
	}
	.link {
		display: grid;
		grid-template-columns: 168px minmax(0, 1fr);
		gap: 16px;
		align-items: center;
	}
	.qr {
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
	.how {
		display: grid;
		gap: 8px;
	}
	.url {
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
		user-select: text;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-dim);
	}
	.lamp {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--border);
	}
	.lamp.on {
		background: var(--online, #22c55e);
	}
	.uploads {
		display: grid;
		gap: 4px;
	}
	.up {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto auto;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		background: var(--bg);
	}
	.up .name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ok {
		color: var(--online, #22c55e);
	}
	.error {
		color: var(--error-text, #ffb4ab);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 8px;
	}
	button {
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
	.up button {
		height: 24px;
		padding: 0 10px;
	}
	button:hover {
		background: var(--row-hover);
	}
	button:focus-visible {
		outline: 2px solid var(--current);
		outline-offset: 2px;
	}
	.link-button {
		margin-right: auto;
	}
	.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	.primary:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
	@media (max-width: 480px) {
		.link {
			grid-template-columns: 1fr;
		}
	}
</style>
