<script lang="ts">
	import type { Entry } from '../ipc';
	import {
		impaginaZone,
		finestraZona,
		cimaVoce,
		colonneGriglia,
		ZONA_TESTATA
	} from '../virtual';
	import { misuraCella, type MisuraCella } from '../vista';
	import type { Zona } from '../raggruppa';
	import Cella from './Cella.svelte';
	import TestataZona from './TestataZona.svelte';
	import type { IconeStore } from '../stores/icone.svelte';

	let {
		entries,
		zone = [],
		chiave = undefined,
		misura = misuraCella({ vista: 'icone', lato: 72 }),
		coloreDi = undefined,
		nascondiEstensione = false,
		bersaglio = null,
		selection = undefined,
		activeIndex = null,
		cutPaths = undefined,
		icone = undefined,
		onactivate,
		onselect,
		oncontext = undefined,
		oncontextvuoto = undefined,
		oncolonne = undefined,
		ontrascina = undefined
	}: {
		entries: Entry[];
		/** Zone in cui è divisa la griglia. Vuoto = nessuna divisione. */
		zone?: Zona[];
		/** Identità del contenuto: lo scroll torna in cima solo quando cambia. */
		chiave?: string;
		/** Dimensioni delle celle, decise dalla vista e dal lato delle icone. */
		misura?: MisuraCella;
		/** Colore scelto per una cartella, se ne ha uno. */
		coloreDi?: (e: Entry) => string | undefined;
		nascondiEstensione?: boolean;
		bersaglio?: string | null;
		selection?: ReadonlySet<string>;
		activeIndex?: number | null;
		cutPaths?: string[];
		icone?: IconeStore;
		onactivate: (e: Entry) => void;
		onselect: (e: Entry, modificatori: { ctrl?: boolean; shift?: boolean }) => void;
		oncontext?: (e: Entry, evento: MouseEvent) => void;
		oncontextvuoto?: (evento: MouseEvent) => void;
		/** Quante celle stanno per riga: serve alle frecce su e giù. */
		oncolonne?: (n: number) => void;
		ontrascina?: (e: Entry) => void;
	} = $props();

	let altezzaCella = $derived(misura.altezza);

	let scrollTop = $state(0);
	let viewportHeight = $state(600);
	let viewportWidth = $state(800);
	let viewport = $state<HTMLDivElement | null>(null);

	let tagliati = $derived(new Set(cutPaths ?? []));
	/** Le celle sono più alte delle righe: bastano meno file di margine. */
	const OVERSCAN = 2;

	// La vista «contenuto» ha una cella sola per riga, larga quanto la lista.
	// Il padding della viewport (8 + 8) non è spazio per le celle.
	let colonne = $derived(
		misura.piena ? 1 : colonneGriglia(Math.max(0, viewportWidth - 16), misura.larghezza)
	);
	let diviso = $derived(zone.length > 0);
	// Ogni zona ricomincia a capo: i comuni non devono finire a metà
	// dell'ultima riga di preferiti.
	let impaginato = $derived(
		impaginaZone(
			diviso ? zone.map((z) => z.quante) : [entries.length],
			colonne,
			altezzaCella,
			diviso ? ZONA_TESTATA : 0
		)
	);
	let finestre = $derived(
		impaginato.zone.map((zona) => {
			const f = finestraZona(zona, scrollTop, viewportHeight, colonne, altezzaCella, OVERSCAN);
			return { zona, top: f.top, voci: entries.slice(f.start, f.start + f.count) };
		})
	);
	let visible = $derived(finestre.flatMap((f) => f.voci));


	$effect(() => {
		if (chiave === undefined) entries;
		else chiave;
		if (viewport) viewport.scrollTop = 0;
		scrollTop = 0;
	});

	// Il conteggio delle colonne nasce qui, dove si conosce la larghezza:
	// la pagina ne ha bisogno per far muovere le frecce di una riga intera.
	$effect(() => {
		oncolonne?.(colonne);
	});

	// Come nella vista a righe: si chiede solo a scorrimento fermo, e la
	// coda viene sostituita da ciò che è davvero visibile.
	$effect(() => {
		if (!icone) return;
		const visibili = visible;
		// Il doppio del lato per gli schermi ad alta densità, fino al massimo
		// che la Shell estrae. Dai 48 pixel in su anche cartelle e programmi
		// hanno la loro icona vera invece di quella di tipo ingrandita.
		const lato = Math.min(256, Math.round(misura.icona * (window.devicePixelRatio || 1)));
		const attesa = setTimeout(() => icone.richiedi(visibili, lato, misura.icona >= 48), 120);
		return () => clearTimeout(attesa);
	});

	// La cella scelta da tastiera può stare fuori dalla finestra: si calcola
	// la sua riga, perché non esiste un elemento su cui chiamare scrollIntoView.
	$effect(() => {
		if (activeIndex === null || activeIndex < 0 || !viewport) return;

		const alto = cimaVoce(impaginato.zone, activeIndex, colonne, altezzaCella);
		const basso = alto + altezzaCella;

		if (alto < viewport.scrollTop) {
			viewport.scrollTop = alto;
		} else if (basso > viewport.scrollTop + viewportHeight) {
			viewport.scrollTop = basso - viewportHeight;
		}
	});
</script>

<div
	class="viewport"
	bind:this={viewport}
	bind:clientHeight={viewportHeight}
	bind:clientWidth={viewportWidth}
	onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
	role="presentation"
	oncontextmenu={(e) => {
		e.preventDefault();
		oncontextvuoto?.(e);
	}}
>
	<div class="spaziatore" style:height="{impaginato.altezzaTotale}px">
		{#each finestre as f, z (z)}
		{#if diviso}
			<TestataZona
				etichetta={zone[z].etichetta}
				tono={zone[z].tono}
				quante={f.zona.quante}
				top={f.zona.alto}
			/>
		{/if}
		<div
			class="finestra"
			style:transform="translateY({f.top}px)"
			style:grid-template-columns="repeat({colonne}, 1fr)"
			style:justify-items={misura.orizzontale ? "start" : "center"}
			role="grid"
			aria-label={diviso ? zone[z].etichetta : 'Elementi della cartella'}
		>
			{#each f.voci as entry (entry.path)}
				<Cella
					{entry}
					selected={selection?.has(entry.path) ?? false}
					tagliato={tagliati.has(entry.path)}
					{icone}
					{misura}
					colore={entry.kind === 'dir' ? coloreDi?.(entry) : undefined}
					{nascondiEstensione}
					bersaglio={entry.path === bersaglio}
					{ontrascina}
					{onactivate}
					{onselect}
					{oncontext}
				/>
			{/each}
		</div>
		{/each}
	</div>
</div>

<style>
	.viewport {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		background: var(--surface);
		/* Lo sfondo decorativo dei temi mondo: fiocchi, foglie, zampette. */
		background-image: var(--motivo, none);
		background-size: 96px 96px;
		background-attachment: local;
		padding: 8px;
		scrollbar-gutter: stable;
	}
	.spaziatore {
		position: relative;
	}
	.finestra {
		position: absolute;
		inset-inline: 0;
		top: 0;
		display: grid;
		justify-items: center;
		will-change: transform;
	}
</style>
