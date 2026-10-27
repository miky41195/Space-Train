<script lang="ts">
	import { untrack } from 'svelte';
	import TrenoSvg from './TrenoSvg.svelte';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { FIGURE, svgFigura } from '../figure';
	import { decodifica, misuraBinario, stile } from '../spritesheet';
	import { fineInScena, giroContinuo, leggiMovimento } from '../movimento';

	/**
	 * Il convoglio che percorre la linea principale.
	 *
	 * A riposo passa di rado, come un evento. Durante un trasferimento
	 * viaggia senza sosta: il carico si muove, e si vede.
	 */
	let {
		attivo = false,
		corteo = undefined,
		pausa = 30_000
	}: {
		attivo?: boolean;
		/**
		 * Millisecondi di attesa a riposo fra l'uscita di scena e il passaggio
		 * dopo; `null`: a riposo non passa, solo durante i trasferimenti.
		 */
		pausa?: number | null;
		/**
		 * Chi sfila al posto del treno: id di figure, `img:<percorso>` per le
		 * immagini dell'utente, `sprite:<json>` per i suoi spritesheet.
		 */
		corteo?: string[];
	} = $props();

	/** Le voci del corteo pronte da disegnare; quelle sconosciute si saltano. */
	let sfilata = $derived(
		(corteo ?? [])
			.map((voce) => {
				const { movimento, voce: v } = leggiMovimento(voce);
				if (v.startsWith('img:')) return { tipo: 'immagine' as const, src: convertFileSrc(v.slice(4)), movimento };
				const foglio = decodifica(v);
				if (foglio)
					return {
						tipo: 'sprite' as const,
						stile: stile(foglio, convertFileSrc(foglio.src)),
						alto: misuraBinario(foglio).altezza,
						movimento
					};
				return FIGURE[v] ? { tipo: 'figura' as const, svg: svgFigura(FIGURE[v]), movimento } : null;
			})
			.filter((x) => x !== null)
	);

	/** Chi sfila col convoglio, e chi ha un movimento suo: fermo o di corsa. */
	let camminatori = $derived(sfilata.filter((f) => f.movimento.tipo === 'cammina'));
	let scena = $derived(sfilata.filter((f) => f.movimento.tipo !== 'cammina' && !f.movimento.continuo));
	/** Chi resta sempre in scena, fuori dai passaggi: fermo o in loop. */
	let continui = $derived(sfilata.filter((f) => f.movimento.tipo !== 'cammina' && f.movimento.continuo));
	/** Le animazioni di chi attraversa in continuo, una per voce. */
	let giri = $derived(
		continui
			.map((f, i) => (f.movimento.tipo === 'attraversa' ? giroContinuo(`giro-${i}`, f.movimento) : ''))
			.join('')
	);
	/** Senza corteo passa il treno; con un corteo tutto fermo, nessun convoglio. */
	let conConvoglio = $derived(sfilata.length === 0 || camminatori.length > 0);
	/** Secondi dall'inizio del passaggio all'uscita dell'ultimo della scena. */
	let durataScena = $derived(Math.max(0, ...scena.map((f) => fineInScena(f.movimento))));

	/**
	 * Altezza della linea: 40 px bastano al treno e alle figure; uno sprite
	 * ingrandito la alza, e sporge verso l'alto restando in piedi sul binario.
	 */
	let altezzaLinea = $derived(
		Math.max(
			40,
			...sfilata.map((f) => ('alto' in f && f.alto ? f.alto : 30) + 10 + f.movimento.altezza)
		)
	);

	/** Cambia a ogni partenza: rimonta l'SVG e fa ripartire l'animazione. */
	let corsa = $state(0);
	let inViaggio = $state(false);

	/**
	 * La pausa si conta da quando il convoglio esce di scena: le traversate
	 * durano da 7 a 16 secondi secondo chi passa, e misurando dalla partenza
	 * un corteo lento non lascerebbe mai il binario vuoto.
	 */
	const PRIMA_CORSA = 1_200;
	/** Sotto carico si riparte subito: il movimento dice che si sta copiando. */
	const PAUSA_CARICO = 600;
	/** Se la fine dell'animazione non arriva (moto ridotto), si va avanti lo stesso. */
	const TRAVERSATA_MASSIMA = 20_000;

	/** Quanto aspettare dopo un arrivo; `null` per restare fermi. */
	function attesa(): number | null {
		return attivo ? PAUSA_CARICO : pausa;
	}

	/**
	 * Il passaggio finisce quando il convoglio è arrivato in fondo e la scena
	 * è finita: si contano le due attese, e chi termina per ultimo chiude.
	 */
	let attese = 0;
	let fineScena: ReturnType<typeof setTimeout> | undefined;

	function parti() {
		corsa += 1;
		inViaggio = true;
		clearTimeout(prossima);
		clearTimeout(fineScena);
		attese = (conConvoglio ? 1 : 0) + (durataScena > 0 ? 1 : 0);
		if (durataScena > 0) fineScena = setTimeout(finitaUnaParte, durataScena * 1000 + 100);
		prossima = setTimeout(arrivato, Math.max(TRAVERSATA_MASSIMA, durataScena * 1000 + 2_000));
	}

	function finitaUnaParte() {
		attese -= 1;
		if (attese <= 0) arrivato();
	}

	function arrivato() {
		if (!inViaggio) return;
		inViaggio = false;
		clearTimeout(fineScena);
		const fra = attesa();
		if (fra === null) clearTimeout(prossima);
		else programma(fra);
	}

	let prossima: ReturnType<typeof setTimeout> | undefined;

	function programma(fra: number) {
		clearTimeout(prossima);
		prossima = setTimeout(parti, fra);
	}

	$effect(() => () => {
		clearTimeout(prossima);
		clearTimeout(fineScena);
	});

	// La prima corsa arriva presto, poi si rispetta la pausa. Sotto carico il
	// convoglio non aspetta: se è fermo riparte quasi subito. Cambiando la
	// pausa, il prossimo passaggio si riprogramma.
	let avviato = false;
	$effect(() => {
		const fra = attesa();
		if (untrack(() => inViaggio)) return;
		if (fra === null) clearTimeout(prossima);
		else programma(avviato ? fra : Math.min(fra, PRIMA_CORSA));
		avviato = true;
	});
</script>

<div class="linea" aria-hidden="true" style:height="{altezzaLinea}px">
	{#key corsa}
		{#if conConvoglio}
		<div
			class="convoglio"
			class:carico={attivo}
			class:a-piedi={sfilata.length > 0}
			onanimationend={(e) => e.target === e.currentTarget && finitaUnaParte()}
		>
			{#if sfilata.length > 0}
				<div class="sfilata">
					{#each camminatori as f, i (i)}
						<!-- Il ritardo sfasa i passi: non marciano tutti all'unisono. -->
						<span
							class="figura"
							class:con-fotogrammi={f.tipo === 'sprite'}
							style:animation-delay="{-i * 0.17}s"
						>
							{#if f.tipo === 'sprite'}
								<!-- I fotogrammi del foglio danno già il passo: niente saltello. -->
								<span class="sprite" style={f.stile}></span>
							{:else if f.tipo === 'immagine'}
								<img src={f.src} alt="" draggable="false" />
							{:else}
								{@html f.svg}
							{/if}
						</span>
					{/each}
				</div>
			{:else}
				<TrenoSvg />
			{/if}
		</div>
		{/if}
		{#if inViaggio}
			<!-- La scena: chi resta fermo in un punto e chi corre da solo fino
			     in fondo, ognuno coi suoi tempi dall'inizio del passaggio. -->
			{#each scena as f, i (i)}
				<span
					class="in-scena {f.movimento.tipo} {f.movimento.verso}"
					style:--da={f.movimento.posizione}
					style:bottom="{f.movimento.altezza}px"
					style:animation-delay="{f.movimento.ritardo}s"
					style:animation-duration="{f.movimento.durata}s"
				>
					{@render aspetto(f)}
				</span>
			{/each}
		{/if}
	{/key}
	<!-- Chi resta sempre in scena: non aspetta i passaggi e non ha durata.
	     Chi attraversa ricomincia all'infinito, col suo giro e la sua pausa. -->
	{#if giri}{@html `<style>${giri}</style>`}{/if}
	{#each continui as f, i (i)}
		<span
			class="in-scena continuo {f.movimento.tipo}"
			style:--da={f.movimento.posizione}
			style:bottom="{f.movimento.altezza}px"
			style:animation-name={f.movimento.tipo === 'attraversa' ? `giro-${i}` : undefined}
			style:animation-delay="{f.movimento.ritardo}s"
			style:animation-duration="{f.movimento.durata + f.movimento.pausa}s"
		>
			{@render aspetto(f)}
		</span>
	{/each}
</div>

{#snippet aspetto(f: (typeof sfilata)[number])}
	<span class="aspetto" class:specchiato={f.movimento.specchia}>
		{#if f.tipo === 'sprite'}
			<span class="sprite" style={f.stile}></span>
		{:else if f.tipo === 'immagine'}
			<img src={f.src} alt="" draggable="false" />
		{:else}
			<span class="figura-ferma">{@html f.svg}</span>
		{/if}
	</span>
{/snippet}

<style>
	.linea {
		position: absolute;
		inset-inline: 0;
		bottom: -6px;
		height: 40px;
		overflow: hidden;
		pointer-events: none;
		z-index: 2;
		/* Le misure della scena si danno in larghezze del binario (cqw). */
		container-type: inline-size;
	}

	/* Fuori dal suo tempo non si vede: l'animazione la mostra solo fra il
	   ritardo e la fine della durata. */
	.in-scena {
		position: absolute;
		bottom: 0;
		left: 0;
		display: flex;
		align-items: flex-end;
		padding-bottom: 2px;
		visibility: hidden;
		animation-timing-function: linear;
		animation-iteration-count: 1;
		animation-fill-mode: none;
	}
	.in-scena img {
		height: 30px;
		width: auto;
	}
	/* Fermo: nel punto scelto, senza uscire dai bordi. */
	.in-scena.fermo {
		left: calc(var(--da) * 1%);
		transform: translateX(calc(var(--da) * -1%));
		animation-name: in-scena;
	}
	/* Attraversa: dal punto scelto fino oltre il bordo, destro o sinistro. */
	.in-scena.attraversa {
		animation-name: attraversa;
	}
	.in-scena.attraversa.sinistra {
		animation-name: attraversa-sinistra;
	}
	/* Sempre in scena: il fermo si vede e basta, chi attraversa gira
	   all'infinito con le chiavi calcolate per lui. */
	.in-scena.continuo {
		animation-iteration-count: infinite;
	}
	.in-scena.continuo.fermo {
		visibility: visible;
		animation-name: none;
	}
	.aspetto {
		display: flex;
		align-items: flex-end;
	}
	.aspetto.specchiato {
		transform: scaleX(-1);
	}
	@keyframes attraversa-sinistra {
		from {
			visibility: visible;
			transform: translateX(calc(var(--da) * (100cqw - 100%) / 100));
		}
		to {
			visibility: visible;
			transform: translateX(calc(-100% - 20px));
		}
	}
	@keyframes in-scena {
		from,
		to {
			visibility: visible;
		}
	}
	@keyframes attraversa {
		from {
			visibility: visible;
			transform: translateX(calc(var(--da) * (100cqw - 100%) / 100));
		}
		to {
			visibility: visible;
			transform: translateX(calc(100cqw + 20px));
		}
	}
	.figura-ferma :global(.passo-b) {
		animation: passo 0.34s steps(1) infinite;
	}
	.figura-ferma :global(.passo-a) {
		animation: passo 0.34s steps(1) infinite reverse;
	}

	/* Solo transform: il convoglio resta sul compositore e non ridisegna
	   nulla di ciò che gli passa sotto. */
	.convoglio {
		position: absolute;
		bottom: 0;
		left: 0;
		transform: translateX(-110%);
		/* Deve restare più corta del ciclo, altrimenti il convoglio non
		   «passa»: staziona. */
		animation: transita 11s linear;
	}

	.convoglio.carico {
		animation-duration: 7s;
	}

	/* A piedi si va più piano che in treno. */
	.convoglio.a-piedi {
		animation-duration: 16s;
	}
	.convoglio.a-piedi.carico {
		animation-duration: 10s;
	}

	.sfilata {
		display: flex;
		align-items: flex-end;
		gap: 14px;
		padding-bottom: 2px;
	}

	/* Il saltello del passo: su e giù a scatti, come la pixel art. */
	.figura {
		display: flex;
		animation: saltella 0.34s steps(2, jump-none) infinite alternate;
	}
	.figura img {
		height: 30px;
		width: auto;
		image-rendering: auto;
	}
	/* I due fotogrammi delle zampe si alternano. */
	.figura :global(.passo-b) {
		animation: passo 0.34s steps(1) infinite;
	}
	.figura :global(.passo-a) {
		animation: passo 0.34s steps(1) infinite reverse;
	}

	.figura.con-fotogrammi {
		animation: none;
	}
	.sprite {
		display: block;
		background-repeat: no-repeat;
		animation-name: fotogrammi;
		animation-iteration-count: infinite;
	}
	/* Lo sfondo scorre di un'intera riga a scatti: un fotogramma alla volta. */
	@keyframes fotogrammi {
		from {
			background-position: var(--x) var(--y);
		}
		to {
			background-position: var(--fine) var(--y);
		}
	}

	@keyframes saltella {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-2px);
		}
	}
	@keyframes passo {
		0%,
		49% {
			opacity: 0;
		}
		50%,
		100% {
			opacity: 1;
		}
	}

	@keyframes transita {
		from {
			transform: translateX(-110%);
		}
		to {
			transform: translateX(calc(100vw + 20px));
		}
	}

	/* Un treno che attraversa lo schermo è esattamente ciò che questa
	   preferenza chiede di non fare. */
	@media (prefers-reduced-motion: reduce) {
		.linea {
			display: none;
		}
	}
</style>
