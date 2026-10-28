<script lang="ts">
	import type { SortKey, SortSpec } from '../ipc';
	import type { Colonne } from '../stores/impostazioni.svelte';
	import { grigliaColonne } from '../colonne';

	let {
		sort,
		onsort,
		colonne: visibili = { dimensione: true, data: true, tipo: false },
		oncolonne = undefined
	}: {
		sort: SortSpec;
		onsort: (chiave: SortKey) => void;
		colonne?: Colonne;
		oncolonne?: (evento: MouseEvent) => void;
	} = $props();

	let colonne = $derived(
		[
			{ chiave: 'kind' as SortKey, etichetta: 'Tipo', classe: 'tipo' },
			{ chiave: 'name' as SortKey, etichetta: 'Nome', classe: 'nome' },
			visibili.tipo && { chiave: 'kind' as SortKey, etichetta: 'Tipo', classe: 'descrizione' },
			visibili.dimensione && { chiave: 'size' as SortKey, etichetta: 'Carico', classe: 'carico' },
			visibili.data && { chiave: 'modified' as SortKey, etichetta: 'Orario', classe: 'orario' }
		].filter((c): c is { chiave: SortKey; etichetta: string; classe: string } => Boolean(c))
	);

	/**
	 * Il nome accessibile dice sia lo stato attuale sia cosa succede
	 * premendo: senza, uno screen reader annuncia solo «Nome, pulsante».
	 */
	function descrizione(chiave: SortKey, etichetta: string): string {
		if (sort.key !== chiave) return `Ordina per ${etichetta.toLowerCase()}`;
		return sort.ascending
			? `${etichetta}, ordine crescente. Premi per invertire`
			: `${etichetta}, ordine decrescente. Premi per invertire`;
	}
</script>

<div
	class="tabellone"
	style:grid-template-columns={grigliaColonne(visibili)}
	role="presentation"
	oncontextmenu={(e) => {
		if (!oncolonne) return;
		e.preventDefault();
		oncolonne(e);
	}}
>
	{#each colonne as c (c.classe)}
		<button
			class="colonna {c.classe}"
			class:attiva={sort.key === c.chiave}
			onclick={() => onsort(c.chiave)}
			aria-label={descrizione(c.chiave, c.etichetta)}
		>
			<span class="testo">{c.etichetta}</span>
			{#if sort.key === c.chiave}
				<svg class="verso" class:giu={!sort.ascending} viewBox="0 0 6 4" aria-hidden="true">
					<path d="M0 3 L3 0 L6 3 Z" fill="currentColor" />
				</svg>
			{/if}
		</button>
	{/each}
</div>

<style>
	/* Stessa griglia delle righe. Il padding destro tiene conto del solco
	   della barra di scorrimento, che nella lista è sempre riservato:
	   senza, le colonne di destra scivolerebbero di dieci pixel. */
	.tabellone {
		display: grid;
		gap: 8px;
		align-items: center;
		height: 26px;
		padding: 0 26px 0 16px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		flex-shrink: 0;
	}

	/* Il carattere della segnaletica, spaziato come su un tabellone. */
	.colonna {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 100%;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(10px * var(--scala-testo, 1));
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		cursor: default;
		transition: color 120ms ease;
	}

	.colonna:hover {
		color: var(--text);
	}

	/* La colonna che comanda l'ordine è l'unica accesa. */
	.colonna.attiva {
		color: var(--current);
	}

	.carico,
	.orario {
		justify-content: flex-end;
	}

	/* La prima colonna è larga quanto un'icona: l'etichetta non ci sta,
	   resta solo il segno di direzione. Il nome vive nell'aria-label. */
	.tipo .testo {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.tipo {
		justify-content: center;
	}

	.verso {
		width: 6px;
		height: 4px;
		flex-shrink: 0;
	}
	.verso.giu {
		transform: rotate(180deg);
	}
</style>
