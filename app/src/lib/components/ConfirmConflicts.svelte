<script lang="ts">
	import { t } from '../i18n';
	import type { ConflictPolicy } from '../ipc';

	let {
		names,
		mode,
		onpick,
		oncancel
	}: {
		names: string[];
		mode: 'copy' | 'move';
		onpick: (p: ConflictPolicy) => void;
		oncancel: () => void;
	} = $props();

	let button = $state<HTMLButtonElement | null>(null);

	// Focus starts on "Mantieni entrambi": it is the only choice that loses
	// no date, whatever the user presses on instinct.
	$effect(() => {
		button?.focus();
	});

	let title = $derived(
		names.length === 1
			? t('«{0}» esiste già qui', [names[0]])
			: t('{0} elementi esistono già qui', [names.length])
	);
</script>

<div
	class="backdrop"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && oncancel()}
	onkeydown={(e) => e.key === 'Escape' && oncancel()}
>
	<div class="dialog" role="dialog" aria-modal="true" aria-label={t('Conflitto di nomi')}>
		<h2>{title}</h2>

		<p> {t('Stai {0} elementi con nomi già presenti nella cartella di destinazione. La scelta vale per tutti.', [mode === 'move' ? 'spostando' : 'copiando'])} </p>

		{#if names.length > 1}
			<ul>
				{#each names.slice(0, 6) as n (n)}
					<li>{n}</li>
				{/each}
				{#if names.length > 6}
					<li class="rest">{t('e altri {0}…', [names.length - 6])}</li>
				{/if}
			</ul>
		{/if}

		<div class="choices">
			<button bind:this={button} onclick={() => onpick('rename')}>
				<strong>{t('Mantieni entrambi')}</strong>
				<span>{t('I nuovi arrivano numerati: «nota (2).txt»')}</span>
			</button>

			<button onclick={() => onpick('skip')}>
				<strong>{t('Salta')}</strong>
				<span>{t('Non tocca gli elementi già presenti')}</span>
			</button>

			<button class="danger" onclick={() => onpick('overwrite')}>
				<strong>{t('Sostituisci')}</strong>
				<span>{t('I file esistenti vengono persi, senza passare dal Cestino')}</span>
			</button>
		</div>

		<div class="actions">
			<button class="cancel" onclick={oncancel}>{t('Annulla')}</button>
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
		width: min(460px, 92vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	h2 {
		margin: 0 0 10px;
		font-size: calc(15px * var(--text-scale, 1));
		font-weight: 600;
	}
	p {
		margin: 0 0 12px;
		color: var(--text-dim);
		line-height: 1.5;
	}
	ul {
		margin: 0 0 12px;
		padding-left: 18px;
		max-height: 110px;
		overflow-y: auto;
		color: var(--text-dim);
	}
	.rest {
		list-style: none;
		margin-left: -18px;
	}
	.choices {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.choices button {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: default;
	}
	.choices button:hover {
		background: var(--row-hover);
	}
	.choices button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.choices span {
		color: var(--text-dim);
	}
	.danger:hover {
		background: rgba(196, 43, 28, 0.14);
		border-color: rgba(196, 43, 28, 0.5);
	}
	.danger span {
		color: var(--error-text);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 14px;
	}
	.cancel {
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
	.cancel:hover {
		background: var(--row-hover);
	}
</style>
