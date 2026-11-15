<script lang="ts">
	import { t } from '../i18n';
	import type { SendRequest } from '../ipc';
	import { formatBytes } from '../locations';

	let {
		request,
		folder,
		onpick,
		onanswer
	}: {
		request: SendRequest;
		/** Where the files will land if the user accepts without choosing. */
		folder: string;
		/** Opens the folder picker starting from `from`; null if cancelled. */
		onpick: (from: string) => Promise<string | null>;
		/** `where` is the chosen folder, or null for the default one. */
		onanswer: (accept: boolean, where: string | null) => void;
	} = $props();

	/** Where to save: it can be changed before accepting. */
	// svelte-ignore state_referenced_locally
	let where = $state(folder);

	async function change() {
		const choice = await onpick(where).catch(() => null);
		if (choice) where = choice;
	}

	let button = $state<HTMLButtonElement | null>(null);

	// Focus starts on Rifiuta: an instinctive Enter must not let in
	// files the user has not looked at.
	$effect(() => {
		button?.focus();
	});

	let others = $derived(request.count - request.names.length);
</script>

<div class="backdrop" role="presentation">
	<div class="dialog" role="dialog" aria-modal="true" aria-label={t('File in arrivo')}>
		<h2>{t('File in arrivo da {0}', [request.from])}</h2>
		<p> {t('{0} vuole inviarti {1} ({2}).', [request.from, request.count === 1 ? t('1 elemento') : t('{0} elementi', [request.count]), formatBytes(request.total)])} </p>
		<ul>
			{#each request.names as n (n)}
				<li>{n}</li>
			{/each}
			{#if others > 0}<li class="rest">{t('e altri {0}…', [others])}</li>{/if}
		</ul>
		<p class="note"> {t('Se accetti arriveranno in')} <strong>{where}</strong>.
			<button class="change" onclick={change}>{t('Cambia cartella…')}</button>
		</p>
		<div class="actions">
			<button bind:this={button} onclick={() => onanswer(false, null)}>{t('Rifiuta')}</button>
			<button class="primary" onclick={() => onanswer(true, where === folder ? null : where)}>{t('Accetta')}</button>
		</div>
	</div>
</div>

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
		width: 420px;
		max-width: calc(100vw - 32px);
		padding: 20px 22px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
	}
	h2 {
		margin: 0 0 10px;
		font-family: var(--font-display);
		font-size: calc(17px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
	}
	p {
		margin: 0 0 10px;
		line-height: 1.45;
	}
	ul {
		margin: 0 0 10px;
		padding-left: 18px;
		max-height: 160px;
		overflow: auto;
	}
	.rest,
	.note {
		color: var(--text-dim);
	}
	.note strong {
		color: var(--text);
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 16px;
	}
	button {
		height: 32px;
		padding: 0 16px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
	}
	.change {
		height: 26px;
		margin-left: 6px;
		padding: 0 10px;
		font-size: calc(12px * var(--text-scale, 1));
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
</style>
