<script lang="ts">
	import { t } from '../i18n';
	import { WELCOME_STEPS } from '../welcome';

	let { onclose }: { onclose: () => void } = $props();

	let step = $state(0);
	let next = $state<HTMLButtonElement | null>(null);
	let last = $derived(step === WELCOME_STEPS.length - 1);
	let current = $derived(WELCOME_STEPS[step]);

	$effect(() => {
		void step;
		next?.focus();
	});

	function keys(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		} else if (e.key === 'ArrowRight' && !last) step++;
		else if (e.key === 'ArrowLeft' && step > 0) step--;
	}
</script>

<svelte:window onkeydown={keys} />

<div class="backdrop" role="presentation">
	<div class="dialog" role="dialog" aria-modal="true" aria-label={t('Benvenuto in Space Train')}>
		<span class="count">{t('{0} di {1}', [step + 1, WELCOME_STEPS.length])}</span>
		<h2>{current.title}</h2>
		<p>{current.text}</p>
		{#if current.keys.length > 0}
			<ul class="keys">
				{#each current.keys as k (k.label)}
					<li><kbd>{k.keys}</kbd><span>{k.label}</span></li>
				{/each}
			</ul>
		{/if}
		<!-- The steps are stops on the rail: the current one lights up. -->
		<div class="stops" aria-hidden="true">
			{#each WELCOME_STEPS as s, i (s.title)}<span class:on={i === step} class:passed={i < step}></span>{/each}
		</div>
		<div class="actions">
			{#if !last}<button class="link" onclick={onclose}>{t('Salta')}</button>{/if}
			{#if step > 0}<button onclick={() => step--}>{t('Indietro')}</button>{/if}
			<button class="primary" bind:this={next} onclick={() => (last ? onclose() : step++)}>{last ? t('Inizia') : t('Avanti')}</button>
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
	}
	.dialog {
		width: 480px;
		max-width: calc(100vw - 32px);
		padding: 22px 24px 18px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
	}
	.count {
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(11px * var(--title-scale, var(--text-scale, 1)));
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	h2 {
		margin: 4px 0 10px;
		font-family: var(--font-display);
		font-size: calc(19px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
	}
	p {
		margin: 0;
		line-height: 1.55;
	}
	.keys {
		margin: 14px 0 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 6px;
	}
	.keys li {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	kbd {
		flex-shrink: 0;
		min-width: 128px;
		padding: 1px 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-family: inherit;
		font-size: calc(12px * var(--text-scale, 1));
		color: var(--text-dim);
	}
	.stops {
		position: relative;
		display: flex;
		justify-content: space-between;
		margin: 20px 4px 0;
		background:
			linear-gradient(var(--rail-metal), var(--rail-metal)) 0 3px / 100% 1px no-repeat,
			linear-gradient(var(--rail-metal), var(--rail-metal)) 0 5px / 100% 1px no-repeat;
	}
	.stops span {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		box-sizing: border-box;
		border: 1.5px solid var(--rail-metal);
		background: var(--surface);
	}
	.stops span.passed {
		background: var(--rail-metal);
	}
	.stops span.on {
		border-color: var(--current);
		background: var(--current);
		box-shadow: 0 0 6px var(--current);
	}
	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 18px;
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
	button:hover {
		background: var(--row-hover);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.link {
		margin-right: auto;
		border-color: transparent;
		color: var(--text-dim);
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent, #fff);
	}
	.primary:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
	@media (prefers-reduced-motion: no-preference) {
		.stops span {
			transition:
				background 0.2s,
				border-color 0.2s,
				box-shadow 0.2s;
		}
	}
</style>
