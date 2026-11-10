<script lang="ts">
	import Icona from './Icona.svelte';
	import { DATE, PESI, TIPI, filtriAttivi, type Filtri } from '../filtri';
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
		ontogglecontenuto = undefined,
		filtri = undefined,
		onfiltri = undefined,
		onsalva = undefined
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
		/** Smart folder filters (subfolder search only). */
		filtri?: Filtri;
		onfiltri?: (f: Filtri) => void;
		/** Keeps this search as a stop in the sidebar. */
		onsalva?: () => void;
	} = $props();

	let filtriAperti = $state(false);
	let conFiltri = $derived(!!filtri && filtriAttivi(filtri));

	/** Picks one value of a filter group; picking it again clears it. */
	function scegli<K extends keyof Filtri>(chiave: K, valore: Filtri[K]) {
		if (!filtri || !onfiltri) return;
		onfiltri({ ...filtri, [chiave]: filtri[chiave] === valore ? null : valore });
	}

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
	{#if onfiltri && sottocartelle}
		<button
			class="opzione"
			class:accesa={filtriAperti || conFiltri}
			aria-pressed={filtriAperti}
			aria-expanded={filtriAperti}
			onclick={() => (filtriAperti = !filtriAperti)}
			title="Filtra per tipo, peso e data">Filtri</button
		>
	{/if}
	{#if onsalva && sottocartelle && (query.trim() !== '' || conFiltri)}
		<button class="opzione" onclick={onsalva} title="Tieni questa ricerca nella barra laterale">Salva ricerca</button>
	{/if}
	<button onclick={onclose} aria-label="Chiudi la ricerca"><Icona nome="chiudi" /></button>
</div>
{#if filtri && onfiltri && sottocartelle && (filtriAperti || conFiltri)}
	<div class="filtri" role="group" aria-label="Filtri">
		<span class="gruppo-filtri">
			<span class="nome-filtro">Tipo</span>
			{#each TIPI as t (t.id)}
				<button class="opzione" class:accesa={filtri.tipo === t.id} aria-pressed={filtri.tipo === t.id} onclick={() => scegli('tipo', t.id)}
					>{t.nome}</button
				>
			{/each}
		</span>
		<span class="gruppo-filtri">
			<span class="nome-filtro">Peso</span>
			{#each PESI as p (p.id)}
				<button class="opzione" class:accesa={filtri.peso === p.id} aria-pressed={filtri.peso === p.id} onclick={() => scegli('peso', p.id)}
					>{p.nome}</button
				>
			{/each}
		</span>
		<span class="gruppo-filtri">
			<span class="nome-filtro">Modificati</span>
			{#each DATE as d (d.id)}
				<button class="opzione" class:accesa={filtri.data === d.id} aria-pressed={filtri.data === d.id} onclick={() => scegli('data', d.id)}
					>{d.nome}</button
				>
			{/each}
		</span>
	</div>
{/if}

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
		font-size: calc(15px * var(--scala-testo, 1));
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
		font-size: calc(15px * var(--scala-testo, 1));
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
		font-size: calc(12px * var(--scala-testo, 1));
		border: 1px solid var(--border);
	}
	.opzione.accesa {
		border-color: var(--current);
		color: var(--current);
	}
	/* Smart folder filters: a second row of chip groups under the search field. */
	.filtri {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
		padding: 6px 12px 8px 36px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.gruppo-filtri {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
	}
	.nome-filtro {
		margin-right: 4px;
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(10px * var(--scala-testo, 1));
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	.filtri .opzione {
		height: 24px;
	}
</style>
