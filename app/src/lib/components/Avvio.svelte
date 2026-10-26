<script lang="ts">
	import TrenoSvg from './TrenoSvg.svelte';

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
	let { onfine }: { onfine: () => void } = $props();

	const DURATA = 1250;

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

<div class="sipario" aria-hidden="true">
	<!-- Il binario si alimenta prima che arrivi il convoglio: la corrente
	     precede sempre il treno. -->
	<div class="binario">
		<span class="corrente"></span>
	</div>

	<div class="convoglio">
		<TrenoSvg scala={3} />
	</div>

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
		animation: ritira 1.25s cubic-bezier(0.65, 0, 0.35, 1) forwards;
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
		background: linear-gradient(
			90deg,
			transparent,
			var(--plasma) 40%,
			var(--current) 50%,
			var(--plasma) 60%,
			transparent
		);
		box-shadow: 0 0 10px var(--current);
		transform: translateX(-100%);
		animation: scarica 0.65s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
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

	/* Il nome resta dietro, come una targa di stazione già superata. */
	.targa {
		position: absolute;
		inset-inline: 0;
		top: 50%;
		margin-top: -46px;
		text-align: center;
		font-family: var(--font-display);
		font-size: 22px;
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
