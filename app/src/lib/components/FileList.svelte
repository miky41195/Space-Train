<script lang="ts">
	import { selezioneRettangolo, type OpzioniRettangolo } from '../rettangolo';
	import type { Entry, SortKey, SortSpec } from '../ipc';
	import Intestazioni from './Intestazioni.svelte';
	import {
		impaginaZone,
		finestraZona,
		cimaVoce,
		ROW_HEIGHT,
		OVERSCAN,
		ZONA_TESTATA
	} from '../virtual';
	import Row from './Row.svelte';
	import TestataZona from './TestataZona.svelte';
	import type { IconeStore } from '../stores/icone.svelte';
	import type { Colonne } from '../stores/impostazioni.svelte';
	import type { Zona } from '../raggruppa';

	let {
		entries,
		zone = [],
		chiave = undefined,
		colonne = undefined,
		nascondiEstensione = false,
		cartellaDi = undefined,
		coloreDi = undefined,
		altezzaRiga = ROW_HEIGHT,
		bersaglio = null,
		selection = undefined,
		matches = undefined,
		activeIndex = null,
		renamingPath = null,
		cutPaths = undefined,
		icone = undefined,
		sort = undefined,
		onsort = undefined,
		onactivate,
		unClic = false,
		dimensioni = {},
		oncalcola = undefined,
		onselect,
		oncontext = undefined,
		oncontextvuoto = undefined,
		onrename = undefined,
		oncancelrename = undefined,
		ontrascina = undefined,
		rettangolo = undefined,
		oncolonne = undefined
	}: {
		entries: Entry[];
		/**
		 * Zone in cui è divisa la lista, nell'ordine di `entries`.
		 * Vuoto = lista non divisa, nessuna testata.
		 */
		zone?: Zona[];
		/**
		 * Identità del contenuto: lo scroll torna in cima solo quando cambia.
		 * Senza, ogni aggiornamento automatico riporterebbe la lista in cima.
		 */
		chiave?: string;
		colonne?: Colonne;
		nascondiEstensione?: boolean;
		/** Cartella da mostrare accanto al nome di una voce, se serve. */
		cartellaDi?: (e: Entry) => string | undefined;
		/** Colore scelto per una cartella, se ne ha uno. */
		coloreDi?: (e: Entry) => string | undefined;
		/** Altezza delle righe: più bassa nella visualizzazione compatta. */
		altezzaRiga?: number;
		/** Cartella sopra cui passa un trascinamento. */
		bersaglio?: string | null;
		selection?: ReadonlySet<string>;
		/** Posizioni da evidenziare per path, quando la ricerca è attiva. */
		matches?: Map<string, number[]>;
		/** Indice che lo scroll deve tenere visibile, per la navigazione da tastiera. */
		activeIndex?: number | null;
		/** Path della voce in fase di rinomina, se ce n'è una. */
		renamingPath?: string | null;
		/** Path negli appunti in modalità taglia, da mostrare sbiaditi. */
		cutPaths?: string[];
		/** Cache di icone e miniature, passata alle righe visibili. */
		icone?: IconeStore;
		/** Ordinamento corrente. Senza, le intestazioni non compaiono. */
		sort?: SortSpec;
		onsort?: (chiave: SortKey) => void;
		onactivate: (e: Entry) => void;
		/** Apre con un clic, come l'opzione di Esplora; il doppio clic non serve più. */
		unClic?: boolean;
		/** Dimensioni delle cartelle già calcolate (o in calcolo), per path. */
		dimensioni?: Record<string, number | 'calcolo'>;
		oncalcola?: (e: Entry) => void;
		onselect: (e: Entry, modificatori: { ctrl?: boolean; shift?: boolean }) => void;
		oncontext?: (e: Entry, evento: MouseEvent) => void;
		/** Clic destro sullo spazio vuoto della lista. */
		oncontextvuoto?: (evento: MouseEvent) => void;
		onrename?: (e: Entry, nuovoNome: string) => void;
		oncancelrename?: () => void;
		ontrascina?: (e: Entry) => void;
		/** Clic sul vuoto e selezione col rettangolo. */
		rettangolo?: OpzioniRettangolo;
		/** Clic destro sulle intestazioni: scelta delle colonne. */
		oncolonne?: (evento: MouseEvent) => void;
	} = $props();

	const SENZA_RETTANGOLO: OpzioniRettangolo = { oncambia: () => {}, onvuoto: () => {} };

	let scrollTop = $state(0);
	let viewportHeight = $state(600);
	let viewport = $state<HTMLDivElement | null>(null);

	let tagliati = $derived(new Set(cutPaths ?? []));

	/**
	 * Le miniature si chiedono solo a scorrimento fermo.
	 *
	 * Chiederle a ogni frame di scroll accoda estrazioni per righe già
	 * uscite dallo schermo: il lavoro utile finisce in fondo alla fila e
	 * la lista scatta. 120 ms è il tempo tipico fra due colpi di rotella.
	 */
	$effect(() => {
		if (!icone) return;

		const visibili = visible;
		const attesa = setTimeout(() => icone.richiedi(visibili), 120);

		return () => clearTimeout(attesa);
	});
	let diviso = $derived(zone.length > 0);
	let impaginato = $derived(
		impaginaZone(
			diviso ? zone.map((z) => z.quante) : [entries.length],
			1,
			altezzaRiga,
			diviso ? ZONA_TESTATA : 0
		)
	);
	let finestre = $derived(
		impaginato.zone.map((zona) => {
			const f = finestraZona(zona, scrollTop, viewportHeight, 1, altezzaRiga, OVERSCAN);
			return { zona, top: f.top, voci: entries.slice(f.start, f.start + f.count) };
		})
	);
	let visible = $derived(finestre.flatMap((f) => f.voci));

	// Tornare in cima quando cambia il contenuto: senza questo, entrando in una
	// cartella più corta si resta a uno scroll che non esiste più.
	$effect(() => {
		if (chiave === undefined) entries;
		else chiave;
		if (viewport) viewport.scrollTop = 0;
		scrollTop = 0;
	});

	// La riga scelta da tastiera può stare fuori dalla finestra visibile:
	// con le righe virtualizzate non esiste un elemento su cui chiamare
	// scrollIntoView, quindi lo scroll si calcola dall'indice.
	$effect(() => {
		if (activeIndex === null || activeIndex < 0 || !viewport) return;

		const alto = cimaVoce(impaginato.zone, activeIndex, 1, altezzaRiga);
		const basso = alto + altezzaRiga;

		if (alto < viewport.scrollTop) {
			viewport.scrollTop = alto;
		} else if (basso > viewport.scrollTop + viewportHeight) {
			viewport.scrollTop = basso - viewportHeight;
		}
	});
</script>

<div class="lista">
	{#if sort && onsort}
		<Intestazioni {sort} {onsort} {colonne} {oncolonne} />
	{/if}

	<div
		class="viewport"
		bind:this={viewport}
		onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
		bind:clientHeight={viewportHeight}
		role="presentation"
		oncontextmenu={(e) => {
			// Le righe fermano l'evento: qui arriva solo il clic sul vuoto.
			e.preventDefault();
			oncontextvuoto?.(e);
		}}
		use:selezioneRettangolo={rettangolo ?? SENZA_RETTANGOLO}
	>
	<div class="spacer" style:height="{impaginato.altezzaTotale}px">
		{#each finestre as f, z (z)}
		{#if diviso}
			<TestataZona
				etichetta={zone[z].etichetta}
				tono={zone[z].tono}
				quante={f.zona.quante}
				top={f.zona.alto}
			/>
		{/if}
		<div class="window" style:transform="translateY({f.top}px)">
			{#each f.voci as entry (entry.path)}
				<Row
					{entry}
					selected={selection?.has(entry.path) ?? false}
					positions={matches?.get(entry.path)}
					renaming={entry.path === renamingPath}
					tagliato={tagliati.has(entry.path)}
					{icone}
					{colonne}
					{nascondiEstensione}
					cartella={cartellaDi?.(entry)}
					colore={entry.kind === 'dir' ? coloreDi?.(entry) : undefined}
					altezza={altezzaRiga}
					bersaglio={entry.path === bersaglio}
					{ontrascina}
					{onactivate}
					{unClic}
					peso={dimensioni[entry.path]}
					{oncalcola}
					{onselect}
					{oncontext}
					{onrename}
					{oncancelrename}
				/>
			{/each}
		</div>
		{/each}
		</div>
	</div>
</div>

<style>
	/* Intestazioni e lista nella stessa scatola: è ciò che tiene le colonne
	   allineate alle righe. */
	.lista {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	/* Fondo opaco: nessun backdrop-filter su un contenitore che scorre. */
	.viewport {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		background: var(--surface);
		/* Lo sfondo decorativo dei temi mondo: fiocchi, foglie, zampette. */
		background-image: var(--motivo, none);
		background-size: 96px 96px;
		background-attachment: local;
		padding: 4px;
		/* Il rettangolo di selezione si posa dentro, e scorre col contenuto. */
		position: relative;
		/* Il solco resta riservato anche con lista corta: senza, la comparsa
		   della barra sposterebbe le righe scollegandole dalle intestazioni. */
		scrollbar-gutter: stable;
	}
	.spacer {
		position: relative;
	}
	.window {
		position: absolute;
		inset-inline: 0;
		top: 0;
		will-change: transform;
	}
</style>
