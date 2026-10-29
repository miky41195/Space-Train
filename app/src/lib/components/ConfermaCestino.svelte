<script lang="ts">
	import type { Entry } from '../ipc';

	let {
		voci,
		definitivo = false,
		onconfirm,
		oncancel
	}: {
		voci: Entry[];
		/** Eliminazione senza Cestino: testi più netti, nessun ritorno. */
		definitivo?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	let bottone = $state<HTMLButtonElement | null>(null);

	// Il focus parte su Annulla: Invio d'istinto non deve cancellare niente.
	$effect(() => {
		bottone?.focus();
	});

	let descrizione = $derived(
		voci.length === 1 ? `«${voci[0].name}»` : `${voci.length} elementi`
	);
</script>

<div
	class="sfondo"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && oncancel()}
	onkeydown={(e) => e.key === 'Escape' && oncancel()}
>
	<div class="finestra" role="dialog" aria-modal="true" aria-label="Conferma eliminazione">
		<h2>{definitivo ? 'Eliminare definitivamente?' : 'Spostare nel Cestino?'}</h2>

		<p>
			{descrizione}
			{#if definitivo}
				{voci.length === 1 ? 'verrà eliminato' : 'verranno eliminati'} per sempre.
			{:else}
				{voci.length === 1 ? 'verrà spostato' : 'verranno spostati'} nel Cestino di Windows.
			{/if}
		</p>

		{#if voci.length > 1}
			<ul>
				{#each voci.slice(0, 5) as v (v.path)}
					<li>{v.name}</li>
				{/each}
				{#if voci.length > 5}
					<li class="resto">e altri {voci.length - 5}…</li>
				{/if}
			</ul>
		{/if}

		<p class="nota">
			{definitivo
				? 'L’operazione non si può annullare e non passa dal Cestino.'
				: 'Puoi recuperarli dal Cestino finché non lo svuoti.'}
		</p>

		<div class="azioni">
			<button bind:this={bottone} onclick={oncancel}>Annulla</button>
			<button class="pericolo" onclick={onconfirm}
				>{definitivo ? 'Elimina definitivamente' : 'Sposta nel Cestino'}</button
			>
		</div>
	</div>
</div>

<style>
	.sfondo {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		z-index: 10;
	}
	.finestra {
		width: min(420px, 90vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	h2 {
		margin: 0 0 10px;
		font-size: calc(15px * var(--scala-testo, 1));
		font-weight: 600;
	}
	p {
		margin: 0 0 10px;
		color: var(--text);
		line-height: 1.5;
	}
	.nota {
		color: var(--text-dim);
	}
	ul {
		margin: 0 0 10px;
		padding-left: 18px;
		max-height: 120px;
		overflow-y: auto;
		color: var(--text-dim);
	}
	.resto {
		list-style: none;
		margin-left: -18px;
	}
	.azioni {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 16px;
	}
	button {
		height: 30px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
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
	.pericolo {
		border-color: transparent;
		background: #c42b1c;
		color: #fff;
	}
	.pericolo:hover {
		background: #d13b2c;
	}
</style>
