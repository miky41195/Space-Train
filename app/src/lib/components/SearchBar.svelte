<script lang="ts">
	let {
		query,
		risultati,
		totale,
		posizione,
		onchange,
		onclose,
		sottocartelle = false,
		contenuto = false,
		cercando = false,
		ontogglesottocartelle = undefined,
		ontogglecontenuto = undefined
	}: {
		query: string;
		risultati: number;
		totale: number;
		/** Indice 1-based della voce selezionata fra i risultati. */
		posizione: number;
		onchange: (q: string) => void;
		onclose: () => void;
		/** Cerca in tutte le sottocartelle invece di filtrare quella aperta. */
		sottocartelle?: boolean;
		/** Cerca il testo anche dentro i file (solo con le sottocartelle). */
		contenuto?: boolean;
		/** Una ricerca nelle sottocartelle è ancora in corso. */
		cercando?: boolean;
		ontogglesottocartelle?: () => void;
		ontogglecontenuto?: () => void;
	} = $props();

	let campo = $state<HTMLInputElement | null>(null);

	$effect(() => {
		campo?.focus();
		campo?.select();
	});
</script>

<div class="ricerca">
	<span class="lente" aria-hidden="true">⌕</span>

	<input
		bind:this={campo}
		type="text"
		value={query}
		placeholder={sottocartelle ? 'Cerca in tutte le sottocartelle…' : 'Filtra in questa cartella…'}
		spellcheck="false"
		autocomplete="off"
		aria-label="Filtra i file in questa cartella"
		oninput={(e) => onchange(e.currentTarget.value)}
	/>

	<span class="conteggio" class:vuoto={query !== '' && risultati === 0}>
		{#if sottocartelle && cercando}
			{risultati} trovati, ricerca in corso…
		{:else if sottocartelle && query !== ''}
			{risultati === 0 ? 'nessun risultato' : `${risultati} trovati`}
		{:else if query === ''}
			{totale} elementi
		{:else if risultati === 0}
			nessun risultato
		{:else}
			{posizione} di {risultati}
		{/if}
	</span>

	{#if ontogglesottocartelle}
		<button
			class="opzione"
			class:accesa={sottocartelle}
			aria-pressed={sottocartelle}
			onclick={ontogglesottocartelle}
			title="Cerca anche nelle sottocartelle">Sottocartelle</button
		>
	{/if}
	{#if ontogglecontenuto && sottocartelle}
		<button
			class="opzione"
			class:accesa={contenuto}
			aria-pressed={contenuto}
			onclick={ontogglecontenuto}
			title="Cerca il testo anche dentro i file">Contenuto</button
		>
	{/if}
	<button onclick={onclose} aria-label="Chiudi la ricerca">×</button>
</div>

<style>
	.ricerca {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 36px;
		padding: 0 12px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.lente {
		color: var(--text-dim);
		font-size: 15px;
	}
	input {
		flex: 1;
		min-width: 0;
		height: 24px;
		border: none;
		background: transparent;
		color: var(--text);
		font: inherit;
		outline: none;
	}
	input::placeholder {
		color: var(--text-dim);
	}
	.conteggio {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.conteggio.vuoto {
		color: var(--errore-testo);
	}
	button {
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-dim);
		font-size: 15px;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.opzione {
		width: auto;
		padding: 0 8px;
		font: inherit;
		font-size: 12px;
		border: 1px solid var(--border);
	}
	.opzione.accesa {
		border-color: var(--current);
		color: var(--current);
	}
</style>
