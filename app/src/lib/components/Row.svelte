<script lang="ts">
	import type { Entry } from '../ipc';
	import { iconFor, categoryFor, iconaCartella } from '../icons';
	import type { IconeStore } from '../stores/icone.svelte';
	import type { Colonne } from '../stores/impostazioni.svelte';
	import { grigliaColonne, descriviTipo } from '../colonne';
	import { byte, senzaEstensione, estensione } from '../posizioni';
	import { seTrascina } from '../trascina';

	let {
		entry,
		selected = false,
		positions = undefined,
		renaming = false,
		tagliato = false,
		icone = undefined,
		colonne = { dimensione: true, data: true, tipo: false },
		nascondiEstensione = false,
		cartella = undefined,
		colore = undefined,
		altezza = 32,
		bersaglio = false,
		onactivate,
		onselect,
		oncontext = undefined,
		onrename = undefined,
		oncancelrename = undefined,
		ontrascina = undefined
	}: {
		entry: Entry;
		selected?: boolean;
		/** Indici dei caratteri trovati dalla ricerca, da evidenziare. */
		positions?: number[];
		/** La riga mostra un campo di testo al posto del nome. */
		renaming?: boolean;
		/** L'elemento è negli appunti in modalità taglia: si mostra sbiadito. */
		tagliato?: boolean;
		/** Cache di icone e miniature. Assente = si usano i glifi interni. */
		icone?: IconeStore;
		colonne?: Colonne;
		/** Mostra il nome senza estensione, come Esplora con l'opzione predefinita. */
		nascondiEstensione?: boolean;
		/** Cartella da mostrare accanto al nome: risultati di ricerca, Cestino. */
		cartella?: string;
		/** Colore scelto dall'utente per questa cartella. */
		colore?: string;
		/** Altezza della riga in pixel: deve coincidere con quella della lista. */
		altezza?: number;
		/** Un trascinamento sta passando sopra questa cartella. */
		bersaglio?: boolean;
		onactivate: (e: Entry) => void;
		onselect: (e: Entry, modificatori: { ctrl?: boolean; shift?: boolean }) => void;
		oncontext?: (e: Entry, evento: MouseEvent) => void;
		onrename?: (e: Entry, nuovoNome: string) => void;
		oncancelrename?: () => void;
		/** Il puntatore è partito trascinando questa voce. */
		ontrascina?: (e: Entry) => void;
	} = $props();

	let nascosta = $derived(nascondiEstensione && entry.kind !== 'dir' && estensione(entry.name) !== '');
	let nomeMostrato = $derived(nascosta ? senzaEstensione(entry.name) : entry.name);

	// Sola lettura della cache: nessuna richiesta parte da qui. Se ne occupa
	// FileList a scorrimento fermo. La miniatura vince sull'icona di tipo;
	// finché non c'è nessuna delle due resta il glifo interno, così la riga
	// non lampeggia mai vuota mentre si scorre.
	let immagine = $derived(
		colore ? null : icone ? icone.miniatura(entry) || icone.icona(entry) : null
	);

	let campo = $state<HTMLInputElement | null>(null);

	/**
	 * La conferma può arrivare due volte per lo stesso campo: premendo Invio
	 * il campo viene smontato, e lo smontaggio scatena a sua volta `blur`.
	 * Senza questa guardia la seconda chiamata ripete la rinomina e fallisce
	 * contro il file appena creato dalla prima.
	 */
	let inviato = false;

	$effect(() => {
		if (!renaming || !campo) return;
		inviato = false;
		campo.focus();
		// Seleziona il nome ma non l'estensione: rinominare di solito
		// significa cambiare il nome, non il tipo di file.
		const punto = nomeMostrato.lastIndexOf('.');
		const fine = entry.kind === 'dir' || punto <= 0 || nascosta ? nomeMostrato.length : punto;
		campo.setSelectionRange(0, fine);
	});

	function conferma() {
		if (inviato) return;
		inviato = true;

		const scritto = campo?.value ?? '';
		// Con l'estensione nascosta si modifica solo il nome: l'estensione
		// torna in coda da sola, e il tipo del file non cambia per sbaglio.
		const valore = nascosta && scritto.trim() !== '' ? `${scritto}.${estensione(entry.name)}` : scritto;
		if (valore === entry.name || scritto.trim() === '') oncancelrename?.();
		else onrename?.(entry, valore);
	}

	function annulla() {
		if (inviato) return;
		inviato = true;
		oncancelrename?.();
	}

	/**
	 * Spezza il nome in tratti evidenziati e non. Senza posizioni restituisce
	 * un tratto unico: il rendering resta identico a prima della ricerca.
	 */
	function segmenti(nome: string, pos: number[] | undefined) {
		if (!pos || pos.length === 0) return [{ testo: nome, forte: false }];

		const set = new Set(pos);
		const out: Array<{ testo: string; forte: boolean }> = [];

		for (let i = 0; i < nome.length; i++) {
			const forte = set.has(i);
			const ultimo = out[out.length - 1];
			if (ultimo && ultimo.forte === forte) ultimo.testo += nome[i];
			else out.push({ testo: nome[i], forte });
		}

		return out;
	}

	let tratti = $derived(segmenti(nomeMostrato, positions));

	function dimensione(e: Entry): string {
		if (e.libero !== undefined) return `${byte(e.libero)} liberi`;
		if (e.kind === 'dir') return '—';
		return byte(e.size);
	}

	/** Quota occupata del disco, per la barretta sotto il nome. */
	let occupato = $derived(
		entry.totale && entry.libero !== undefined ? 1 - entry.libero / entry.totale : null
	);

	function data(e: Entry): string {
		if (e.modified === null) return '';
		return new Date(e.modified).toLocaleString('it-IT', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div
	class="row"
	class:selected
	class:tagliato
	class:bersaglio
	role="row"
	tabindex="-1"
	style:grid-template-columns={grigliaColonne(colonne)}
	style:height="{altezza}px"
	data-category={entry.kind === 'dir' ? 'dir' : categoryFor(entry.name)}
	data-cartella={entry.kind === 'dir' ? entry.path : undefined}
	data-voce={entry.path}
	onmousedown={(e) => {
		// La riga si prende da qualsiasi punto; il campo della rinomina no,
		// lì si seleziona il testo.
		if (ontrascina && !(e.target as HTMLElement).closest('input')) seTrascina(e, () => ontrascina(entry));
	}}
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
	<span class="icon">
		{#if colore && entry.kind === 'dir'}
			<span class="cartella-colorata">{@html iconaCartella(colore)}</span>
		{:else if immagine}
			<img src={immagine} alt="" draggable="false" />
		{:else}
			{@html iconFor(entry)}
		{/if}
	</span>
	{#if renaming}
		<input
			class="rinomina"
			bind:this={campo}
			type="text"
			value={nomeMostrato}
			spellcheck="false"
			autocomplete="off"
			aria-label="Nuovo nome"
			onclick={(e) => e.stopPropagation()}
			ondblclick={(e) => e.stopPropagation()}
			onblur={conferma}
			onkeydown={(e) => {
				e.stopPropagation();
				if (e.key === 'Enter') conferma();
				else if (e.key === 'Escape') annulla();
			}}
		/>
	{:else}
		<span class="nome-blocco">
			<span class="name" title={entry.name}
				>{#each tratti as t, i (i)}{#if t.forte}<mark>{t.testo}</mark>{:else}{t.testo}{/if}{/each}</span
			>
			{#if cartella}<span class="cartella" title={cartella}>{cartella}</span>{/if}
			{#if occupato !== null}
				<span class="riempimento" class:pieno={occupato > 0.9}
					><span style:width="{Math.round(occupato * 100)}%"></span></span
				>
			{/if}
		</span>
	{/if}
	{#if colonne.tipo}<span class="tipo">{descriviTipo(entry)}</span>{/if}
	{#if colonne.dimensione}<span class="size">{dimensione(entry)}</span>{/if}
	{#if colonne.data}<span class="date">{data(entry)}</span>{/if}
</div>

<style>
	.row {
		display: grid;
		align-items: center;
		height: 32px;
		padding: 0 12px;
		gap: 8px;
		border-radius: var(--radius-sm);
		cursor: default;
		color: var(--text);
		font-size: calc(13px * var(--scala-testo, 1));
		user-select: none;
	}
	.row:hover {
		background: var(--row-hover);
	}
	.row.tagliato {
		opacity: 0.45;
	}
	.row.selected {
		background: var(--accent-soft);
	}
	/* Cartella su cui si sta per rilasciare: il binario si accende. */
	.row.bersaglio {
		background: color-mix(in srgb, var(--current) 14%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	.nome-blocco {
		display: flex;
		align-items: baseline;
		gap: 10px;
		min-width: 0;
		position: relative;
	}
	.cartella {
		flex-shrink: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
		font-size: calc(11px * var(--scala-testo, 1));
	}
	.tipo {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
	}
	.riempimento {
		position: absolute;
		left: 0;
		right: 40%;
		bottom: -6px;
		height: 3px;
		border-radius: 2px;
		background: var(--border);
		overflow: hidden;
	}
	.riempimento span {
		display: block;
		height: 100%;
		background: var(--current);
	}
	.riempimento.pieno span {
		background: #ff5f6e;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rinomina {
		width: 100%;
		height: 24px;
		padding: 0 6px;
		border: 1px solid var(--accent);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		outline: none;
	}

	/* Solo colore e peso: nessun cambio di dimensione, la riga resta 32px. */
	.name :global(mark) {
		background: transparent;
		color: var(--accent);
		font-weight: 600;
	}
	/* Numeri in DIN, come le cifre di un orario ferroviario. */
	.size,
	.date {
		color: var(--text-dim);
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-dim);
	}
	.cartella-colorata {
		display: flex;
		width: 20px;
		height: 18px;
	}
	.icon img {
		width: 20px;
		height: 20px;
		object-fit: contain;
		border-radius: 3px;
	}

	/* La categoria colora l'icona: differenziazione visiva senza secondo glifo. */
	.row[data-category='dir'] .icon {
		color: var(--accent);
	}
	.row[data-category='code'] .icon,
	.row[data-category='markup'] .icon,
	.row[data-category='style'] .icon {
		color: #6ee7b7;
	}
	.row[data-category='image'] .icon,
	.row[data-category='video'] .icon {
		color: #f0abfc;
	}
	.row[data-category='audio'] .icon {
		color: #fcd34d;
	}
	.row[data-category='archive'] .icon {
		color: #fca5a5;
	}
	.row[data-category='exec'] .icon {
		color: #93c5fd;
	}
	.row[data-category='data'] .icon,
	.row[data-category='config'] .icon {
		color: #a5b4fc;
	}
</style>
