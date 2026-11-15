<script lang="ts">
	import { t, tr } from '../i18n';
	import type { Backend, Version } from '../ipc';
	import { formatBytes, nameOf } from '../locations';
	import { REASON_TEXT, versionWhen } from '../versions';

	let {
		backend,
		path,
		size,
		protectedFolder = null,
		onopen,
		oncompare,
		onrestored,
		onprotect,
		onclose
	}: {
		backend: Backend;
		path: string;
		/** Size of the file as it is now. */
		size: number;
		/** The protected folder the file sits in, if any. */
		protectedFolder?: string | null;
		onopen: (v: Version) => void;
		oncompare: (v: Version) => void;
		onrestored: () => void;
		/** Protects the file's folder. */
		onprotect: () => void;
		onclose: () => void;
	} = $props();

	let versions = $state<Version[] | null>(null);
	let chosen = $state<string | null>(null);
	let error = $state<string | null>(null);
	let busy = $state(false);
	let asking = $state(false);

	$effect(() => {
		backend
			.versionsList(path)
			.then((v) => {
				versions = v;
				chosen = v[0]?.id ?? null;
			})
			.catch(() => (versions = []));
	});

	let selected = $derived(versions?.find((v) => v.id === chosen) ?? null);

	async function restore() {
		if (!selected) return;
		busy = true;
		error = null;
		try {
			await backend.versionRestore(path, selected.id);
			onrestored();
		} catch (e) {
			error = tr((e as { message?: string })?.message ?? t('Ripristino non riuscito.'));
			busy = false;
			asking = false;
		}
	}

	function keys(e: KeyboardEvent) {
		if (e.key === 'Escape' && !busy) {
			e.stopPropagation();
			if (asking) asking = false;
			else onclose();
		}
		if (!versions?.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
		e.preventDefault();
		const i = versions.findIndex((v) => v.id === chosen);
		const next = Math.max(0, Math.min(versions.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
		chosen = versions[next].id;
	}
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && !busy && onclose()} onkeydown={keys}>
	<div class="dialog" role="dialog" aria-modal="true" aria-label={t('Versioni precedenti di {0}', [nameOf(path)])}>
		<header>
			<h2>{t('Versioni precedenti · {0}', [nameOf(path)])}</h2>
			{#if protectedFolder}
				<span class="protected" title={protectedFolder}><span class="shield" aria-hidden="true"></span>{t('Cartella protetta')}</span>
			{/if}
		</header>

		{#if versions === null}
			<p class="dim">{t('Cerco le versioni…')}</p>
		{:else if versions.length === 0}
			<div class="empty">
				<p>{t('Nessuna versione precedente di questo file.')}</p>
				<p class="dim">
					{#if protectedFolder} {t('La cartella è protetta: dalla prossima modifica Space Train tiene la versione di prima.')} {:else} {t('Space Train tiene la copia di prima quando sovrascrive un file o lo salvi nell\'editor. Per tenere ogni modifica, anche fatta da altri programmi, proteggi la cartella.')} {/if}
				</p>
			</div>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<ol class="versions" aria-label={t('Versioni')} tabindex="0">
				<li class="v now">
					<span class="when">{t('Adesso')}</span><span class="size">{formatBytes(size)}</span>
					<span class="meta">{t('Versione attuale')}</span>
				</li>
				{#each versions as v (v.id)}
					<li>
						<button type="button" class="v" class:sel={v.id === chosen} aria-pressed={v.id === chosen} onclick={() => (chosen = v.id)} ondblclick={() => onopen(v)}>
							<span class="when">{versionWhen(v.at)}</span><span class="size">{formatBytes(v.size)}</span>
							<span class="meta">{REASON_TEXT[v.reason]}</span>
						</button>
					</li>
				{/each}
			</ol>
		{/if}

		{#if asking && selected}
			<p class="notice" role="alert"> {t('Il file torna com\'era {0}. Quello di adesso resta fra le versioni, puoi riprenderlo.', [versionWhen(selected.at).toLowerCase()])} </p>
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}

		<div class="actions">
			{#if !protectedFolder}
				<button type="button" class="aside" onclick={onprotect} disabled={busy}>{t('Proteggi la cartella')}</button>
			{/if}
			<button type="button" onclick={onclose} disabled={busy}>{t('Chiudi')}</button>
			{#if selected}
				<button type="button" onclick={() => onopen(selected)} disabled={busy}>{t('Apri')}</button>
				<button type="button" onclick={() => oncompare(selected)} disabled={busy}>{t('Confronta con l\'attuale')}</button>
				{#if asking}
					<button type="button" class="primary" onclick={restore} disabled={busy}>{busy ? t('Un momento…') : t('Ripristina')}</button>
				{:else}
					<button type="button" class="primary" onclick={() => (asking = true)} disabled={busy}>{t('Ripristina…')}</button>
				{/if}
			{/if}
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
		width: min(540px, 92vw);
		max-height: 84vh;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto auto auto;
		gap: 14px;
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	h2 {
		flex: 1;
		min-width: 0;
		margin: 0;
		font-size: calc(15px * var(--text-scale, 1));
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
		line-height: 1.5;
	}
	.dim {
		color: var(--text-dim);
	}
	.empty {
		display: grid;
		gap: 6px;
	}
	.protected {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		color: var(--current, var(--accent));
		font-size: calc(12px * var(--text-scale, 1));
	}
	.shield {
		width: 10px;
		height: 12px;
		border: 1.5px solid currentColor;
		border-radius: 2px 2px 6px 6px;
	}
	/* The versions are stops on a line: the current one is lit. */
	.versions {
		position: relative;
		margin: 0;
		padding: 0 0 0 22px;
		list-style: none;
		overflow-y: auto;
	}
	.versions::before {
		content: '';
		position: absolute;
		left: 5px;
		top: 12px;
		bottom: 12px;
		width: 1px;
		background: var(--rail-metal, var(--border));
	}
	.v {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 2px 10px;
		width: 100%;
		padding: 7px 10px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: default;
	}
	button.v:hover {
		background: var(--row-hover);
	}
	.v.sel {
		background: var(--accent-soft);
	}
	.v::before {
		content: '';
		position: absolute;
		left: -21px;
		top: 13px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: radial-gradient(circle, var(--text-dim) 0 2.2px, var(--surface) 2.7px 3px, var(--rail-metal, var(--border)) 3.5px);
	}
	.v.now::before {
		background: radial-gradient(circle, #fff 0 2.2px, var(--current, var(--accent)) 2.7px 4.5px);
	}
	.when {
		font-weight: 500;
	}
	.size {
		color: var(--text-dim);
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		font-size: calc(12px * var(--text-scale, 1));
	}
	.meta {
		grid-column: 1 / -1;
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.notice {
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
		font-size: calc(12px * var(--text-scale, 1));
	}
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
		flex-wrap: wrap;
		gap: 8px;
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
	.actions .aside {
		margin-right: auto;
	}
	.primary {
		border-color: transparent !important;
		background: var(--accent) !important;
		color: #fff !important;
	}
	button:focus-visible,
	.versions:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
