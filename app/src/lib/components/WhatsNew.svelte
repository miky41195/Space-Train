<script lang="ts">
	import { t } from '../i18n';
	import type { WhatsNew } from '../whats-new';

	let {
		entries,
		onclose,
		installed = undefined,
		previous = []
	}: {
		/** The versions to tell about, newest first. */
		entries: WhatsNew[];
		onclose: () => void;
		/** The version in use, when the window is reopened from the megaphone. */
		installed?: string;
		/** The older versions, shown only on request. */
		previous?: WhatsNew[];
	} = $props();

	let button = $state<HTMLButtonElement | null>(null);
	let all = $state(false);
	let shown = $derived(all ? [...entries, ...previous] : entries);

	$effect(() => {
		button?.focus();
	});
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog" role="dialog" aria-modal="true" aria-label={t('Novità di Space Train')}>
		{#if installed}<span class="installed">{t('Versione installata {0}', [installed])}</span>{/if}
		<h2>{installed ? t('Novità') : t('Novità di Space Train {0}', [entries[0]?.version ?? ''])}</h2>
		<div class="list">
			{#each shown as n (n.version)}
				{#if shown.length > 1}<h3>{t('Versione {0}', [n.version])}</h3>{/if}
				<ul>
					{#each n.items as v, i (i)}
						<li>{v}</li>
					{/each}
				</ul>
			{/each}
		</div>
		<div class="actions">
			{#if previous.length > 0 && !all}
				<button class="link" onclick={() => (all = true)}>{t('Versioni precedenti')}</button>
			{/if}
			<button class="primary" bind:this={button} onclick={onclose}>{t('Ho capito')}</button>
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
		width: 460px;
		max-width: calc(100vw - 32px);
		max-height: calc(100vh - 64px);
		display: flex;
		flex-direction: column;
		padding: 20px 22px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
	}
	h2 {
		margin: 0 0 12px;
		font-family: var(--font-display);
		font-size: calc(17px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
	}
	h3 {
		margin: 10px 0 4px;
		font-size: calc(13px * var(--text-scale, 1));
		color: var(--text-dim);
		font-weight: 600;
	}
	.list {
		overflow: auto;
	}
	/* The news items are stops on a line: two wires and a round node per
	   item, like the sidebar locations. */
	ul {
		position: relative;
		margin: 0;
		padding-left: 22px;
		list-style: none;
		line-height: 1.5;
	}
	ul::before {
		content: '';
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 6px;
		width: 5px;
		background:
			linear-gradient(var(--rail-metal), var(--rail-metal)) 1px 0 / 1px 100% no-repeat,
			linear-gradient(var(--rail-metal), var(--rail-metal)) 3px 0 / 1px 100% no-repeat;
	}
	li {
		position: relative;
	}
	li::before {
		content: '';
		position: absolute;
		left: -18px;
		top: calc(0.75em - 4px);
		width: 7px;
		height: 7px;
		border-radius: 50%;
		box-sizing: border-box;
		border: 1.5px solid var(--rail-metal);
		background: var(--surface);
	}
	li + li {
		margin-top: 6px;
	}
	.installed {
		margin-bottom: 2px;
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(11px * var(--title-scale, var(--text-scale, 1)));
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		margin-top: 16px;
	}
	.actions .link {
		margin-right: auto;
		height: auto;
		padding: 0;
		border: none;
		background: none;
		color: var(--text-dim);
		text-decoration: underline;
		text-underline-offset: 2px;
		clip-path: none;
		mask: none;
	}
	.actions .link:hover {
		color: var(--text);
		filter: none;
	}
	.primary {
		height: 32px;
		padding: 0 16px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: var(--accent);
		color: #fff;
		font: inherit;
		cursor: default;
	}
	.primary:hover {
		filter: brightness(1.1);
	}
</style>
