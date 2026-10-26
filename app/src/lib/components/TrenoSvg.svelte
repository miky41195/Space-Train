<script lang="ts">
	/**
	 * Il disegno del convoglio, senza sapere nulla di dove o quando passa.
	 *
	 * Vive per conto suo perché serve a due chiamanti diversi: il passaggio
	 * ambientale sulla linea principale e la sequenza di apertura. Duplicare
	 * quaranta rettangoli avrebbe significato due livree da tenere allineate.
	 */
	let { scala = 2 }: { scala?: number } = $props();
</script>

<svg
	viewBox="0 0 96 20"
	width={96 * scala}
	height={20 * scala}
	shape-rendering="crispEdges"
	aria-hidden="true"
>
	<!-- Scia: tre soffi di colori diversi, come uno scarico che brucia
	     miscele diverse -->
	<rect class="scia ciano" x="93" y="11" width="3" height="2" />
	<rect class="scia magenta" x="88" y="10" width="2" height="1" />
	<rect class="scia ambra" x="90" y="14" width="2" height="1" />

	<!-- MOTRICE — livrea viola. Muso a gradini: è così che si disegna una
	     curva in pixel art. -->
	<rect class="faro" x="0" y="11" width="2" height="2" />
	<rect class="loco" x="2" y="10" width="3" height="5" />
	<rect class="loco" x="5" y="8" width="3" height="7" />
	<rect class="loco" x="8" y="7" width="30" height="8" />
	<rect class="loco-tetto" x="12" y="5" width="22" height="2" />
	<rect class="pinna" x="30" y="2" width="3" height="3" />
	<!-- Fascia di corsa e sottoscocca in ombra: due tinte in più e il fianco
	     smette di essere una macchia piatta. -->
	<rect class="fascia" x="8" y="13" width="30" height="1" />
	<rect class="loco-ombra" x="8" y="14" width="30" height="1" />

	<rect class="vetro" x="9" y="9" width="5" height="4" />
	<rect class="vetro lampeggia" x="17" y="9" width="3" height="3" />
	<rect class="vetro" x="22" y="9" width="3" height="3" />
	<rect class="vetro lampeggia" x="27" y="9" width="3" height="3" />

	<rect class="gancio" x="38" y="11" width="4" height="2" />

	<!-- CARROZZA — livrea verde acqua -->
	<rect class="vagone" x="42" y="8" width="22" height="7" />
	<rect class="vagone-tetto" x="45" y="6" width="16" height="2" />
	<rect class="vagone-ombra" x="42" y="14" width="22" height="1" />
	<rect class="vetro" x="45" y="10" width="3" height="3" />
	<rect class="vetro lampeggia" x="50" y="10" width="3" height="3" />
	<rect class="vetro" x="55" y="10" width="3" height="3" />

	<rect class="gancio" x="64" y="11" width="4" height="2" />

	<!-- CISTERNA — il carico, arancio caldo -->
	<rect class="pianale" x="68" y="8" width="22" height="7" />
	<rect class="cisterna" x="70" y="9" width="18" height="5" />
	<rect class="cisterna-luce" x="70" y="9" width="18" height="1" />
	<rect class="cisterna-fascia" x="77" y="9" width="2" height="5" />
	<rect class="pianale-ombra" x="68" y="14" width="22" height="1" />

	<!-- Pattini di levitazione: niente ruote, è un binario elettrico -->
	<rect class="pattino" x="10" y="16" width="24" height="1" />
	<rect class="pattino p2" x="44" y="16" width="18" height="1" />
	<rect class="pattino p3" x="70" y="16" width="18" height="1" />
</svg>

<style>
	/* Livrea del convoglio. Sta qui e non fra i token dell'app: sono i
	   colori di questo treno, non del sistema di design. Ogni vettura ha la
	   sua tinta, con tetto più chiaro e sottoscocca più scuro per dare
	   volume a otto pixel di altezza. */
	.loco {
		fill: #7b3fe4;
	}
	.loco-tetto {
		fill: #a879ff;
	}
	.loco-ombra {
		fill: #4a1f96;
	}
	.fascia {
		fill: #ffd166;
	}
	.pinna {
		fill: #ff5f9e;
	}

	.vagone {
		fill: #17998a;
	}
	.vagone-tetto {
		fill: #3fd6bd;
	}
	.vagone-ombra {
		fill: #0d6459;
	}

	.pianale {
		fill: #3a3350;
	}
	.pianale-ombra {
		fill: #241f36;
	}
	.cisterna {
		fill: #ff8a3d;
	}
	.cisterna-luce {
		fill: #ffc07a;
	}
	.cisterna-fascia {
		fill: #ffd166;
	}

	.gancio {
		fill: var(--rail-metal);
	}
	.vetro {
		fill: var(--current);
	}
	.faro {
		fill: #fff4c2;
	}
	.pattino {
		fill: var(--current);
		opacity: 0.5;
		animation: sfarfalla 0.5s steps(2, end) infinite;
	}
	.p2 {
		animation-delay: 0.12s;
	}
	.p3 {
		animation-delay: 0.24s;
	}

	.scia.ciano {
		fill: var(--current);
		opacity: 0.55;
	}
	.scia.magenta {
		fill: #ff5f9e;
		opacity: 0.4;
	}
	.scia.ambra {
		fill: #ffd166;
		opacity: 0.35;
	}

	/* Passo a due fotogrammi: è così che lampeggia la pixel art, non con
	   una dissolvenza continua. */
	.lampeggia {
		animation: sfarfalla 0.9s steps(2, end) infinite;
	}

	@keyframes sfarfalla {
		0%,
		60% {
			opacity: 1;
		}
		61%,
		100% {
			opacity: 0.45;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lampeggia,
		.pattino {
			animation: none;
		}
	}
</style>
