<script lang="ts">
	import type { Entry } from '../ipc';
	import { iconFor, categoryFor, iconaCartella } from '../icons';
	import type { IconeStore } from '../stores/icone.svelte';
	import { senzaEstensione, byte } from '../posizioni';
	import { descriviTipo } from '../colonne';
	import { seTrascina } from '../trascina';
	import { misuraCella, type MisuraCella } from '../vista';

	let {
		entry,
		selected = false,
		tagliato = false,
		icone = undefined,
		misura = misuraCella({ vista: 'icone', lato: 72 }),
		colore = undefined,
		nascondiEstensione = false,
		bersaglio = false,
		onactivate,
		onselect,
		oncontext = undefined,
		ontrascina = undefined
	}: {
		entry: Entry;
		selected?: boolean;
		tagliato?: boolean;
		icone?: IconeStore;
		/** Dimensioni e impaginazione della cella, decise dalla vista. */
		misura?: MisuraCella;
		/** Colore scelto dall'utente per questa cartella. */
		colore?: string;
		nascondiEstensione?: boolean;
		bersaglio?: boolean;
		onactivate: (e: Entry) => void;
		onselect: (e: Entry, modificatori: { ctrl?: boolean; shift?: boolean }) => void;
		oncontext?: (e: Entry, evento: MouseEvent) => void;
		ontrascina?: (e: Entry) => void;
	} = $props();

	let nome = $derived(
		nascondiEstensione && entry.kind !== 'dir' ? senzaEstensione(entry.name) : entry.name
	);

	// Sola lettura, come nella vista a righe: la richiesta la fa la griglia
	// quando lo scorrimento si ferma. Una cartella colorata usa sempre il
	// disegno interno, che è l'unico a cui si può dare un colore.
	let immagine = $derived(
		colore ? null : icone ? icone.miniatura(entry) || icone.icona(entry, misura.icona > 24) : null
	);

	function data(ms: number | null): string {
		if (ms === null) return '';
		return new Date(ms).toLocaleString('it-IT', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div
	class="cella"
	class:selected
	class:tagliato
	class:orizzontale={misura.orizzontale}
	class:piena={misura.piena}
	class:bersaglio
	style:width={misura.piena ? '100%' : `${misura.larghezza}px`}
	style:height="{misura.altezza}px"
	style:--lato="{misura.icona}px"
	role="gridcell"
	tabindex="-1"
	data-category={entry.kind === 'dir' ? 'dir' : categoryFor(entry.name)}
	data-cartella={entry.kind === 'dir' ? entry.path : undefined}
	data-voce={entry.path}
	title={entry.name}
	onmousedown={(e) => ontrascina && seTrascina(e, () => ontrascina(entry))}
	ondblclick={() => onactivate(entry)}
	onclick={(e) => onselect(entry, { ctrl: e.ctrlKey, shift: e.shiftKey })}
	oncontextmenu={(e) => {
		e.preventDefault();
		e.stopPropagation();
		oncontext?.(entry, e);
	}}
	onkeydown={(e) => {
		if (e.key === 'Enter') onactivate(entry);
		else if (e.key === ' ') onselect(entry, { ctrl: e.ctrlKey, shift: e.shiftKey });
	}}
>
	<div class="riquadro">
		{#if colore && entry.kind === 'dir'}
			<span class="disegno">{@html iconaCartella(colore)}</span>
		{:else if immagine}
			<img src={immagine} alt="" draggable="false" />
		{:else}
			<span class="glifo">{@html iconFor(entry)}</span>
		{/if}
	</div>
	<div class="testi">
		<span class="nome">{nome}</span>
		{#if misura.dettagli}
			<span class="info">{descriviTipo(entry)}</span>
			{#if entry.kind !== 'dir' || entry.libero !== undefined}
				<span class="info">
					{entry.libero !== undefined ? `${byte(entry.libero)} liberi` : byte(entry.size)}
				</span>
			{/if}
		{/if}
	</div>
	{#if misura.piena}
		<span class="data">{data(entry.modified)}</span>
	{/if}
</div>

<style>
	.cella {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px 6px;
		border-radius: var(--radius-sm);
		cursor: default;
		user-select: none;
	}
	.cella:hover {
		background: var(--row-hover);
	}
	.cella.selected {
		background: var(--accent-soft);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.cella.tagliato {
		opacity: 0.45;
	}
	.cella.bersaglio {
		background: color-mix(in srgb, var(--current) 14%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}

	/* Riquadro a lato fisso: le miniature hanno proporzioni diverse e senza
	   una cornice comune la griglia perde l'allineamento. */
	.riquadro {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: var(--lato);
		height: var(--lato);
		overflow: hidden;
	}
	.riquadro img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.disegno {
		display: flex;
		width: 100%;
		height: 100%;
	}
	/* Il glifo interno è disegnato a 16 pixel: si ingrandisce col lato. */
	.glifo {
		display: flex;
		color: var(--text-dim);
	}
	.glifo :global(svg) {
		width: calc(var(--lato) * 0.85);
		height: calc(var(--lato) * 0.85);
	}

	.testi {
		display: flex;
		flex-direction: column;
		min-width: 0;
		width: 100%;
	}

	/* Due righe al massimo: i nomi lunghi non devono sfondare la cella. */
	.nome {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: calc(12px * var(--scala-testo, 1));
		line-height: 1.35;
		text-align: center;
		overflow-wrap: anywhere;
	}
	.info,
	.data {
		color: var(--text-dim);
		font-size: calc(11px * var(--scala-testo, 1));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Icona accanto al nome: icone piccole, elenco, riquadri, contenuto. */
	.cella.orizzontale {
		flex-direction: row;
		gap: 10px;
		padding: 4px 8px;
	}
	.orizzontale .nome {
		-webkit-line-clamp: 1;
		line-clamp: 1;
		text-align: left;
		font-size: calc(13px * var(--scala-testo, 1));
	}
	.cella.piena {
		border-bottom: 1px solid var(--border);
		border-radius: 0;
	}
	.piena .data {
		margin-left: auto;
		flex-shrink: 0;
	}

	.cella[data-category='dir'] .glifo {
		color: var(--accent);
	}
</style>
