<script lang="ts">
	import { t } from '../i18n';
	import type { Backend } from '../ipc';
	import { nameOf, samePath } from '../locations';

	let {
		items,
		dragging = false,
		dropping = false,
		canUnload,
		backend,
		onmove,
		oncopy,
		onremove,
		onclear
	}: {
		/** Paths on the shelf. */
		items: readonly string[];
		/** Files are being dragged over the window. */
		dragging?: boolean;
		/** …and they are over the wagon. */
		dropping?: boolean;
		/** The open folder takes files. */
		canUnload: boolean;
		backend: Backend;
		onmove: (paths: string[]) => void;
		oncopy: (paths: string[]) => void;
		onremove: (path: string) => void;
		onclear: () => void;
	} = $props();

	let open = $state(false);
	/** Paths still on disk; `null` while asking. */
	let found = $state<string[] | null>(null);

	$effect(() => {
		if (items.length === 0) open = false;
		if (!open) return;
		let valid = true;
		backend
			.entriesFor([...items])
			.then((entries) => valid && (found = entries.map((e) => e.path)))
			.catch(() => valid && (found = [...items]));
		return () => (valid = false);
	});

	const gone = (p: string) => found !== null && !found.some((f) => samePath(f, p));
	let present = $derived(items.filter((p) => !gone(p)));

	function unload(go: (paths: string[]) => void) {
		const paths = [...present];
		open = false;
		go(paths);
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="siding" class:open data-shelf>
{#if items.length > 0 || dragging}
	<!-- Parked: the train comes and goes, what is on the shelf stays. -->
	<button
		class="wagon"
		class:dropping
		aria-label={t('Mensola: {0} elementi', [items.length])}
		title={t('Mensola: {0} elementi', [items.length])}
		aria-expanded={open}
		onclick={() => (open = !open && items.length > 0)}>{dragging ? t('Appoggia qui') : items.length}</button
	>
{/if}
{#if open && items.length > 0}
	<div class="cargo" role="dialog" aria-label={t('Nel vagone · {0}', [items.length])}>
		<div class="title">{t('Nel vagone · {0}', [items.length])}</div>
		<ul>
			{#each items as p (p)}
				<li class:gone={gone(p)} title={p}>
					<span>{nameOf(p)}{#if gone(p)}<small>{t('Non c’è più: spostato o eliminato.')}</small>{/if}</span>
					<button onclick={() => onremove(p)} aria-label={t('Togli «{0}» dalla mensola', [nameOf(p)])}>×</button>
				</li>
			{/each}
		</ul>
		{#if !canUnload}<small>{t('Qui non si può scaricare: apri una cartella.')}</small>{/if}
		<div class="buttons">
			<button class="primary" disabled={!canUnload || present.length === 0} onclick={() => unload(onmove)}>{t('Sposta qui')}</button>
			<button disabled={!canUnload || present.length === 0} onclick={() => unload(oncopy)}>{t('Copia qui')}</button>
			<button onclick={onclear}>{t('Svuota')}</button>
		</div>
	</div>
{/if}
</div>

<style>
	.siding {
		position: relative;
		z-index: 4;
		flex: none;
		margin: 0 12px 0 8px;
	}
	/* Above the list, below the dialogs. */
	.siding.open {
		z-index: 9;
	}
	.wagon {
		min-width: 40px;
		height: 22px;
		padding: 0 8px;
		border: 2px solid var(--signal, #ffb454);
		border-radius: 0;
		background: var(--hull);
		color: var(--signal, #ffb454);
		font: 600 calc(11px * var(--text-scale, 1)) var(--font-display);
		cursor: default;
	}
	.wagon.dropping {
		background: var(--signal, #ffb454);
		color: var(--void, #0c0a13);
	}
	.cargo {
		position: absolute;
		right: 0;
		top: calc(100% + 10px);
		display: grid;
		gap: 8px;
		width: min(280px, calc(100vw - 32px));
		padding: 10px;
		border: 1px solid var(--border);
		border-radius: min(var(--radius-sm), 14px);
		background: var(--surface);
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
	}
	.title {
		font-family: var(--font-display);
		font-size: calc(11px * var(--title-scale, var(--text-scale, 1)));
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	ul {
		display: grid;
		gap: 2px;
		max-height: 240px;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
	}
	li span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.gone span {
		color: var(--text-dim);
	}
	small {
		display: block;
		color: var(--text-dim);
		font-size: calc(11px * var(--text-scale, 1));
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.cargo button {
		height: 26px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	li button {
		border-color: transparent !important;
	}
	.cargo button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	.cargo button:disabled {
		opacity: 0.45;
	}
	.cargo .primary,
	.cargo .primary:hover:not(:disabled) {
		border-color: transparent;
		background: var(--accent);
		color: var(--on-accent, #fff);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
