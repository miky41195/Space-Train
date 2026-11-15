<script lang="ts">
	import { t } from '../i18n';
	import type { Backend, Entry } from '../ipc';

	/**
	 * Checksum of one file, to check a download against the value its page
	 * publishes. SHA-256 is computed at once; SHA-1 and MD5 on request.
	 */
	let { item, backend, onclose }: { item: Entry; backend: Backend; onclose: () => void } = $props();

	type Algorithm = 'sha256' | 'sha1' | 'md5';
	const ALGORITHMS: Array<{ id: Algorithm; name: string }> = [
		{ id: 'sha256', name: 'SHA-256' },
		{ id: 'sha1', name: 'SHA-1' },
		{ id: 'md5', name: 'MD5' }
	];
	/** Checksums start far from searches and transfers. */
	let nextId = 3_000_000;

	let algorithm = $state<Algorithm>('sha256');
	let value = $state<string | null>(null);
	let error = $state<string | null>(null);
	let compareText = $state('');
	let copied = $state(false);
	let field = $state<HTMLInputElement | null>(null);

	$effect(() => {
		const algo = algorithm;
		const path = item.path;
		const opId = nextId++;
		value = null;
		error = null;
		backend
			.fileChecksum({ opId, path, algorithm: algo })
			.then((v) => {
				if (v !== null) value = v;
			})
			.catch((e) => (error = e?.message ?? String(e)));
		return () => void backend.cancelTransfer(opId);
	});

	$effect(() => {
		field?.focus();
	});

	/** What a download page prints: any case, spaces or a «sha256:» prefix are fine. */
	let cleaned = $derived(compareText.trim().toLowerCase().replace(/^[a-z0-9-]+:/, '').replace(/\s+/g, ''));
	let outcome = $derived(value && cleaned ? (cleaned === value ? 'same' : 'different') : null);

	async function copy() {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
		} catch {
			copied = false;
		}
	}
</script>

<div
	class="backdrop"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onclose()}
	onkeydown={(e) => e.key === 'Escape' && onclose()}
>
	<div class="dialog" role="dialog" aria-modal="true" aria-label={t('Somma di controllo')}>
		<h2>{t('Somma di controllo ·')} <span class="name">{item.name}</span></h2>

		<div class="algorithms" role="radiogroup" aria-label={t('Algoritmo')}>
			{#each ALGORITHMS as a (a.id)}
				<button
					role="radio"
					aria-checked={algorithm === a.id}
					class:on={algorithm === a.id}
					onclick={() => (algorithm = a.id)}>{a.name}</button
				>
			{/each}
		</div>

		<div class="value" aria-live="polite">
			{#if error}
				<span class="error">{error}</span>
			{:else if value}
				<code>{value}</code>
			{:else}
				<span class="computing">{t('Calcolo in corso…')}</span>
			{/if}
		</div>

		<label class="compare">
			<span>{t('Confronta con il valore pubblicato')}</span>
			<input bind:this={field} bind:value={compareText} spellcheck="false" autocomplete="off" placeholder={t('Incolla qui')} />
		</label>

		{#if outcome === 'same'}
			<p class="outcome same" role="status">{t('Coincide: il file è quello pubblicato.')}</p>
		{:else if outcome === 'different'}
			<p class="outcome different" role="status">{t('Non coincide: il file è diverso da quello pubblicato.')}</p>
		{/if}

		<div class="actions">
			<button onclick={copy} disabled={!value}>{copied ? t('Copiato') : t('Copia')}</button>
			<button class="primary" onclick={onclose}>{t('Chiudi')}</button>
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
		width: min(480px, 92vw);
		padding: 20px;
		display: grid;
		gap: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	h2 {
		margin: 0;
		font-size: calc(15px * var(--text-scale, 1));
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name {
		font-weight: 400;
		color: var(--text-dim);
	}
	.algorithms {
		display: flex;
		gap: 4px;
	}
	.value {
		min-height: 40px;
		padding: 8px 10px;
		background: var(--bg);
		border-radius: var(--radius-sm);
	}
	code {
		font-family: Consolas, 'Cascadia Mono', monospace;
		font-size: calc(12px * var(--text-scale, 1));
		word-break: break-all;
		user-select: text;
	}
	.computing {
		color: var(--text-dim);
	}
	.error {
		color: var(--error-text);
	}
	.compare {
		display: grid;
		gap: 4px;
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	input {
		height: 28px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font-family: Consolas, 'Cascadia Mono', monospace;
		font-size: calc(12px * var(--text-scale, 1));
	}
	input:focus {
		border-color: var(--accent);
		outline: none;
	}
	.outcome {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.outcome::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: currentColor;
	}
	.same {
		color: var(--online);
	}
	.different {
		color: var(--error-text);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
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
	.algorithms button {
		height: 24px;
		padding: 0 10px;
		font-size: calc(12px * var(--text-scale, 1));
	}
	button.on {
		background: var(--accent-soft);
		border-color: transparent;
	}
	button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	button:disabled {
		opacity: 0.4;
	}
	button:focus-visible {
		outline: 2px solid var(--current);
		outline-offset: 2px;
	}
	.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	.primary:hover:not(:disabled) {
		background: var(--accent);
		filter: brightness(1.1);
	}
</style>
