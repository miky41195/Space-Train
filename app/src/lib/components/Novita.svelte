<script lang="ts">
	import type { Novita } from '../novita';

	let {
		novita,
		onchiudi
	}: {
		/** Le versioni da raccontare, dalla più recente. */
		novita: Novita[];
		onchiudi: () => void;
	} = $props();

	let bottone = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		bottone?.focus();
	});
</script>

<div class="sfondo" role="presentation" onclick={(e) => e.target === e.currentTarget && onchiudi()}>
	<div class="finestra" role="dialog" aria-modal="true" aria-label="Novità di Space Train">
		<h2>Novità di Space Train {novita[0]?.versione}</h2>
		<div class="elenco">
			{#each novita as n (n.versione)}
				{#if novita.length > 1}<h3>Versione {n.versione}</h3>{/if}
				<ul>
					{#each n.voci as v, i (i)}
						<li>{v}</li>
					{/each}
				</ul>
			{/each}
		</div>
		<div class="azioni">
			<button class="primario" bind:this={bottone} onclick={onchiudi}>Ho capito</button>
		</div>
	</div>
</div>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onchiudi()} />

<style>
	.sfondo {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.45);
	}
	.finestra {
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
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
	}
	h2 {
		margin: 0 0 12px;
		font-family: var(--font-display);
		font-size: calc(17px * var(--scala-testo, 1));
		font-weight: 600;
	}
	h3 {
		margin: 10px 0 4px;
		font-size: calc(13px * var(--scala-testo, 1));
		color: var(--text-dim);
		font-weight: 600;
	}
	.elenco {
		overflow: auto;
	}
	ul {
		margin: 0;
		padding-left: 18px;
		line-height: 1.5;
	}
	li + li {
		margin-top: 4px;
	}
	.azioni {
		display: flex;
		justify-content: flex-end;
		margin-top: 16px;
	}
	button {
		height: 32px;
		padding: 0 16px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: #fff;
		font: inherit;
		cursor: default;
	}
	button:hover {
		filter: brightness(1.1);
	}
</style>
