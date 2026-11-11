<script lang="ts">
	import TrenoSvg from './TrenoSvg.svelte';
	import type { Aspetto } from '../aspetto';
	import type { AnimAvvio, MotoAvvio } from '../animazioni';

	/**
	 * Sequenza d'apertura: il convoglio attraversa lo schermo e si porta
	 * dietro il sipario, scoprendo l'interfaccia già pronta sotto.
	 *
	 * Vincoli che ne hanno deciso la forma:
	 * - dura poco più di un secondo. Un file manager si apre cinquanta volte
	 *   al giorno: tre secondi di sigla diventerebbero un pedaggio;
	 * - si salta con qualsiasi tasto o clic;
	 * - non blocca niente. L'app sotto è già montata e interattiva, il velo
	 *   non intercetta il puntatore;
	 * - con `prefers-reduced-motion` non parte affatto.
	 */
	let {
		onfine,
		tipo = 'treno',
		figura = null,
		moto = 'attraversa',
		durata = 1.25
	}: {
		onfine: () => void;
		/** Which opening the theme asks for; «nessuna» is never mounted. */
		tipo?: Exclude<AnimAvvio, 'nessuna'>;
		/** For «personalizzata»: what crosses the screen. Missing = the train. */
		figura?: Aspetto | null;
		moto?: MotoAvvio;
		/** Seconds, for «personalizzata». */
		durata?: number;
	} = $props();

	// svelte-ignore state_referenced_locally
	const DURATA = tipo === 'personalizzata' ? durata * 1000 : tipo === 'stelle' ? 1300 : tipo === 'corrente' ? 1000 : 1250;

	/** Falling stars: fixed places, so every start looks the same. */
	const STELLE = Array.from({ length: 28 }, (_, i) => ({
		x: (i * 37) % 100,
		ritardo: ((i * 53) % 40) / 100,
		lato: i % 3 === 0 ? 3 : 2
	}));

	let saltato = $state(false);

	function chiudi() {
		if (saltato) return;
		saltato = true;
		onfine();
	}

	$effect(() => {
		const t = setTimeout(chiudi, DURATA);
		return () => clearTimeout(t);
	});
</script>

<svelte:window onkeydown={chiudi} onpointerdown={chiudi} />

<div class="sipario {tipo}" aria-hidden="true" style:--durata="{DURATA}ms">
	{#if tipo === 'stelle'}
		{#each STELLE as st, i (i)}
			<span class="stella" style:left="{st.x}%" style:animation-delay="{st.ritardo}s" style:width="{st.lato}px" style:height="{st.lato}px"
			></span>
		{/each}
	{:else}
		<!-- Il binario si alimenta prima che arrivi il convoglio: la corrente
		     precede sempre il treno. -->
		<div class="binario">
			<span class="corrente"></span>
		</div>
	{/if}

	{#if tipo === 'treno' || (tipo === 'personalizzata' && !figura)}
		<div class="convoglio {tipo === 'personalizzata' ? moto : ''}">
			<TrenoSvg scala={3} />
		</div>
	{:else if tipo === 'personalizzata' && figura}
		<div class="convoglio {moto}">
			{#if figura.tipo === 'immagine'}
				<img src={figura.src} alt="" draggable="false" />
			{:else if figura.tipo === 'sprite'}
				<span class="sprite" style={figura.stile}></span>
			{:else}
				<span class="figura">{@html figura.svg}</span>
			{/if}
		</div>
	{/if}

	<div class="targa">Space Train</div>
</div>

<style>
	.sipario {
		position: fixed;
		inset: 0;
		z-index: 50;
		overflow: hidden;
		background: var(--void);
		/* L'app sotto è già viva: il velo non deve rubarle i clic. */
		pointer-events: none;
		animation: ritira var(--durata, 1.25s) cubic-bezier(0.65, 0, 0.35, 1) forwards;
	}

	/* Il sipario si ritira verso destra dietro al convoglio, invece di
	   dissolversi: è il treno che scopre l'interfaccia, non una tendina. */
	@keyframes ritira {
		0%,
		28% {
			clip-path: inset(0 0 0 0);
		}
		100% {
			clip-path: inset(0 0 0 100%);
		}
	}

	.binario {
		position: absolute;
		inset-inline: 0;
		top: 50%;
		height: 5px;
		margin-top: 26px;
		background:
			linear-gradient(var(--rail-metal), var(--rail-metal)) 0 1px / 100% 1px no-repeat,
			linear-gradient(var(--rail-metal), var(--rail-metal)) 0 3px / 100% 1px no-repeat;
		opacity: 0;
		animation: accendi 0.25s ease-out forwards;
	}

	@keyframes accendi {
		to {
			opacity: 1;
		}
	}

	.corrente {
		position: absolute;
		inset-block: 0;
		left: 0;
		width: 30%;
		/* La stessa corrente del binario: coda di plasma e nucleo bianco. */
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in srgb, var(--plasma) 70%, transparent) 45%,
			var(--current) 88%,
			transparent
		);
		transform: translateX(-100%);
		animation: scarica 0.65s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
	}
	.corrente::after {
		content: '';
		position: absolute;
		inset-block: 0;
		right: 6%;
		width: 6px;
		background: #fff;
		box-shadow:
			0 0 3px #fff,
			0 0 10px 2px var(--current);
	}

	@keyframes scarica {
		to {
			transform: translateX(400%);
		}
	}

	.convoglio {
		position: absolute;
		top: 50%;
		left: 0;
		transform: translateX(-120%);
		animation: attraversa 1.15s cubic-bezier(0.5, 0, 0.4, 1) 0.22s forwards;
	}

	@keyframes attraversa {
		to {
			transform: translateX(calc(100vw + 60px));
		}
	}

	/* Corrente: only the current, longer and brighter, then the curtain. */
	.sipario.corrente .corrente {
		width: 45%;
		animation-duration: 0.8s;
	}

	/* Stars: pixel squares falling through the curtain. */
	.stella {
		position: absolute;
		top: 0;
		background: var(--current);
		box-shadow: 0 0 4px var(--current);
		transform: translateY(-10px);
		animation: cade 0.9s cubic-bezier(0.5, 0, 0.9, 0.6) forwards;
	}
	.stella:nth-child(even) {
		background: var(--text);
	}
	@keyframes cade {
		to {
			transform: translateY(105vh);
		}
	}

	/* Personalizzata: the chosen figure, big, with its movement. */
	.convoglio img {
		height: 90px;
		width: auto;
	}
	.convoglio .figura :global(svg) {
		height: 90px;
		width: auto;
	}
	.convoglio .sprite {
		display: block;
		background-repeat: no-repeat;
		transform: scale(3);
		transform-origin: bottom left;
		animation-name: fotogrammi;
		animation-iteration-count: infinite;
	}
	@keyframes fotogrammi {
		from {
			background-position: var(--x) var(--y);
		}
		to {
			background-position: var(--fine) var(--y);
		}
	}
	.convoglio.attraversa,
	.convoglio.entra,
	.convoglio.centro {
		margin-top: -64px;
		animation-duration: calc(var(--durata) * 0.85);
		animation-delay: 0s;
	}
	.convoglio.entra {
		animation-name: entra;
	}
	.convoglio.centro {
		left: 50%;
		animation-name: compare;
	}
	@keyframes entra {
		from {
			transform: translateX(-120%);
		}
		60%,
		to {
			transform: translateX(calc(50vw - 50%));
		}
	}
	@keyframes compare {
		from {
			opacity: 0;
			transform: translateX(-50%) scale(0.6);
		}
		40%,
		to {
			opacity: 1;
			transform: translateX(-50%) scale(1);
		}
	}

	/* Il nome resta dietro, come una targa di stazione già superata. */
	.targa {
		position: absolute;
		inset-inline: 0;
		top: 50%;
		margin-top: -46px;
		text-align: center;
		font-family: var(--font-display);
		font-size: calc(22px * var(--scala-titoli, var(--scala-testo, 1)));
		font-weight: 600;
		letter-spacing: 0.42em;
		text-indent: 0.42em;
		text-transform: uppercase;
		color: var(--text-dim);
		opacity: 0;
		animation: insegna 0.9s ease-out 0.15s;
	}

	@keyframes insegna {
		25% {
			opacity: 1;
			letter-spacing: 0.42em;
		}
		100% {
			opacity: 0;
			letter-spacing: 0.6em;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sipario {
			display: none;
		}
	}
</style>
