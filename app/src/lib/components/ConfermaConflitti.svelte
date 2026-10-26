<script lang="ts">
	import type { Politica } from '../ipc';

	let {
		nomi,
		modo,
		onscegli,
		oncancel
	}: {
		nomi: string[];
		modo: 'copy' | 'move';
		onscegli: (p: Politica) => void;
		oncancel: () => void;
	} = $props();

	let bottone = $state<HTMLButtonElement | null>(null);

	// Il focus parte su "Mantieni entrambi": è l'unica scelta che non
	// perde dati, qualunque cosa l'utente prema d'istinto.
	$effect(() => {
		bottone?.focus();
	});

	let titolo = $derived(
		nomi.length === 1
			? `«${nomi[0]}» esiste già qui`
			: `${nomi.length} elementi esistono già qui`
	);
</script>

<div
	class="sfondo"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && oncancel()}
	onkeydown={(e) => e.key === 'Escape' && oncancel()}
>
	<div class="finestra" role="dialog" aria-modal="true" aria-label="Conflitto di nomi">
		<h2>{titolo}</h2>

		<p>
			Stai {modo === 'move' ? 'spostando' : 'copiando'} elementi con nomi già presenti nella
			cartella di destinazione. La scelta vale per tutti.
		</p>

		{#if nomi.length > 1}
			<ul>
				{#each nomi.slice(0, 6) as n (n)}
					<li>{n}</li>
				{/each}
				{#if nomi.length > 6}
					<li class="resto">e altri {nomi.length - 6}…</li>
				{/if}
			</ul>
		{/if}

		<div class="scelte">
			<button bind:this={bottone} onclick={() => onscegli('rinomina')}>
				<strong>Mantieni entrambi</strong>
				<span>I nuovi arrivano numerati: «nota (2).txt»</span>
			</button>

			<button onclick={() => onscegli('salta')}>
				<strong>Salta</strong>
				<span>Non tocca gli elementi già presenti</span>
			</button>

			<button class="pericolo" onclick={() => onscegli('sovrascrivi')}>
				<strong>Sostituisci</strong>
				<span>I file esistenti vengono persi, senza passare dal Cestino</span>
			</button>
		</div>

		<div class="azioni">
			<button class="annulla" onclick={oncancel}>Annulla</button>
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
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(3px);
		z-index: 10;
	}
	.finestra {
		width: min(460px, 92vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	h2 {
		margin: 0 0 10px;
		font-size: 15px;
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
	.resto {
		list-style: none;
		margin-left: -18px;
	}
	.scelte {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.scelte button {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: default;
	}
	.scelte button:hover {
		background: var(--row-hover);
	}
	.scelte button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.scelte span {
		color: var(--text-dim);
	}
	.pericolo:hover {
		background: rgba(196, 43, 28, 0.14);
		border-color: rgba(196, 43, 28, 0.5);
	}
	.pericolo span {
		color: var(--errore-testo);
	}
	.azioni {
		display: flex;
		justify-content: flex-end;
		margin-top: 14px;
	}
	.annulla {
		height: 30px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	.annulla:hover {
		background: var(--row-hover);
	}
</style>
