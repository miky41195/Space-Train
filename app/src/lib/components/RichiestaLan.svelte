<script lang="ts">
	import type { RichiestaInvio } from '../ipc';
	import { byte } from '../posizioni';

	let {
		richiesta,
		cartella,
		onrisposta
	}: {
		richiesta: RichiestaInvio;
		/** Dove arriveranno i file se l'utente accetta. */
		cartella: string;
		onrisposta: (accetta: boolean) => void;
	} = $props();

	let bottone = $state<HTMLButtonElement | null>(null);

	// Il fuoco parte su Rifiuta: un Invio d'istinto non deve far entrare
	// file che l'utente non ha guardato.
	$effect(() => {
		bottone?.focus();
	});

	let altri = $derived(richiesta.quanti - richiesta.nomi.length);
</script>

<div class="sfondo" role="presentation">
	<div class="finestra" role="dialog" aria-modal="true" aria-label="File in arrivo">
		<h2>File in arrivo da {richiesta.da}</h2>
		<p>
			{richiesta.da} vuole inviarti
			{richiesta.quanti === 1 ? '1 elemento' : `${richiesta.quanti} elementi`}
			({byte(richiesta.totale)}).
		</p>
		<ul>
			{#each richiesta.nomi as n (n)}
				<li>{n}</li>
			{/each}
			{#if altri > 0}<li class="resto">e altri {altri}…</li>{/if}
		</ul>
		<p class="nota">Se accetti arriveranno in <strong>{cartella}</strong>.</p>
		<div class="azioni">
			<button bind:this={bottone} onclick={() => onrisposta(false)}>Rifiuta</button>
			<button class="primario" onclick={() => onrisposta(true)}>Accetta</button>
		</div>
	</div>
</div>

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
		width: 420px;
		max-width: calc(100vw - 32px);
		padding: 20px 22px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
	}
	h2 {
		margin: 0 0 10px;
		font-family: var(--font-display);
		font-size: 17px;
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
	.resto,
	.nota {
		color: var(--text-dim);
	}
	.nota strong {
		color: var(--text);
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.azioni {
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
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
	}
	.primario {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	.primario:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
</style>
