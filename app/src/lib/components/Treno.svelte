<script lang="ts">
	import { untrack } from 'svelte';
	import TrenoSvg from './TrenoSvg.svelte';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { FIGURE, svgFigura } from '../figure';
	import { decodifica, misuraBinario, stile } from '../spritesheet';

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
			.map((v) => {
				if (v.startsWith('img:')) return { tipo: 'immagine' as const, src: convertFileSrc(v.slice(4)) };
				const foglio = decodifica(v);
				if (foglio)
					return {
						tipo: 'sprite' as const,
						stile: stile(foglio, convertFileSrc(foglio.src)),
						alto: misuraBinario(foglio).altezza
					};
				return FIGURE[v] ? { tipo: 'figura' as const, svg: svgFigura(FIGURE[v]) } : null;
			})
			.filter((x) => x !== null)
	);

	/**
	 * Altezza della linea: 40 px bastano al treno e alle figure; uno sprite
	 * ingrandito la alza, e sporge verso l'alto restando in piedi sul binario.
	 */
	let altezzaLinea = $derived(
		Math.max(40, ...sfilata.map((f) => ('alto' in f && f.alto ? f.alto + 10 : 0)))
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

	function parti() {
		corsa += 1;
		inViaggio = true;
		clearTimeout(prossima);
		prossima = setTimeout(arrivato, TRAVERSATA_MASSIMA);
	}

	function arrivato() {
		inViaggio = false;
		const fra = attesa();
		if (fra === null) clearTimeout(prossima);
		else programma(fra);
	}

	let prossima: ReturnType<typeof setTimeout> | undefined;

	function programma(fra: number) {
		clearTimeout(prossima);
		prossima = setTimeout(parti, fra);
	}

	$effect(() => () => clearTimeout(prossima));

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
		<div
			class="convoglio"
			class:carico={attivo}
			class:a-piedi={sfilata.length > 0}
			onanimationend={(e) => e.target === e.currentTarget && arrivato()}
		>
			{#if sfilata.length > 0}
				<div class="sfilata">
					{#each sfilata as f, i (i)}
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
	{/key}
</div>

<style>
	.linea {
		position: absolute;
		inset-inline: 0;
		bottom: -6px;
		height: 40px;
		overflow: hidden;
		pointer-events: none;
		z-index: 2;
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
