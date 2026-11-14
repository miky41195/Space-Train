<script lang="ts">
	/**
	 * The drawing of the train, knowing nothing about where or when it passes.
	 *
	 * It lives on its own because two different callers need it: the ambient
	 * pass on the main line and the opening sequence. Duplicating
	 * forty rectangles would have meant two liveries to keep in line.
	 */
	let { scale = 2 }: { scale?: number } = $props();
</script>

<svg
	viewBox="0 0 96 20"
	width={96 * scale}
	height={20 * scale}
	shape-rendering="crispEdges"
	aria-hidden="true"
>
	<!-- Trail: three puffs of different colours, like an exhaust burning
	     different mixtures -->
	<rect class="trail cyan" x="93" y="11" width="3" height="2" />
	<rect class="trail magenta" x="88" y="10" width="2" height="1" />
	<rect class="trail amber" x="90" y="14" width="2" height="1" />

	<!-- LOCOMOTIVE — purple livery. Stepped nose: that is how you draw a
	     curve in pixel art. -->
	<rect class="headlight" x="0" y="11" width="2" height="2" />
	<rect class="loco" x="2" y="10" width="3" height="5" />
	<rect class="loco" x="5" y="8" width="3" height="7" />
	<rect class="loco" x="8" y="7" width="30" height="8" />
	<rect class="loco-roof" x="12" y="5" width="22" height="2" />
	<rect class="fin" x="30" y="2" width="3" height="3" />
	<!-- Running stripe and shaded underbody: two more tints and the side
	     stops being a flat blob. -->
	<rect class="stripe" x="8" y="13" width="30" height="1" />
	<rect class="loco-shadow" x="8" y="14" width="30" height="1" />

	<rect class="glass" x="9" y="9" width="5" height="4" />
	<rect class="glass blink" x="17" y="9" width="3" height="3" />
	<rect class="glass" x="22" y="9" width="3" height="3" />
	<rect class="glass blink" x="27" y="9" width="3" height="3" />

	<rect class="coupler" x="38" y="11" width="4" height="2" />

	<!-- COACH — teal livery -->
	<rect class="coach" x="42" y="8" width="22" height="7" />
	<rect class="coach-roof" x="45" y="6" width="16" height="2" />
	<rect class="coach-shadow" x="42" y="14" width="22" height="1" />
	<rect class="glass" x="45" y="10" width="3" height="3" />
	<rect class="glass blink" x="50" y="10" width="3" height="3" />
	<rect class="glass" x="55" y="10" width="3" height="3" />

	<rect class="coupler" x="64" y="11" width="4" height="2" />

	<!-- TANKER — the cargo, warm orange -->
	<rect class="flatbed" x="68" y="8" width="22" height="7" />
	<rect class="tank" x="70" y="9" width="18" height="5" />
	<rect class="tank-light" x="70" y="9" width="18" height="1" />
	<rect class="tank-stripe" x="77" y="9" width="2" height="5" />
	<rect class="flatbed-shadow" x="68" y="14" width="22" height="1" />

	<!-- Levitation skids: no wheels, it is an electric rail -->
	<rect class="skid" x="10" y="16" width="24" height="1" />
	<rect class="skid p2" x="44" y="16" width="18" height="1" />
	<rect class="skid p3" x="70" y="16" width="18" height="1" />
</svg>

<style>
	/* The train's livery. It lives here and not among the app tokens: these are
	   the colours of this train, not of the design system. Every car has its
	   own tint, with a lighter roof and a darker underbody to give
	   volume at eight pixels of height. */
	.loco {
		fill: #7b3fe4;
	}
	.loco-roof {
		fill: #a879ff;
	}
	.loco-shadow {
		fill: #4a1f96;
	}
	.stripe {
		fill: #ffd166;
	}
	.fin {
		fill: #ff5f9e;
	}

	.coach {
		fill: #17998a;
	}
	.coach-roof {
		fill: #3fd6bd;
	}
	.coach-shadow {
		fill: #0d6459;
	}

	.flatbed {
		fill: #3a3350;
	}
	.flatbed-shadow {
		fill: #241f36;
	}
	.tank {
		fill: #ff8a3d;
	}
	.tank-light {
		fill: #ffc07a;
	}
	.tank-stripe {
		fill: #ffd166;
	}

	.coupler {
		fill: var(--rail-metal);
	}
	.glass {
		fill: var(--current);
	}
	.headlight {
		fill: #fff4c2;
	}
	.skid {
		fill: var(--current);
		opacity: 0.5;
		animation: flicker 0.5s steps(2, end) infinite;
	}
	.p2 {
		animation-delay: 0.12s;
	}
	.p3 {
		animation-delay: 0.24s;
	}

	.trail.cyan {
		fill: var(--current);
		opacity: 0.55;
	}
	.trail.magenta {
		fill: #ff5f9e;
		opacity: 0.4;
	}
	.trail.amber {
		fill: #ffd166;
		opacity: 0.35;
	}

	/* Two-frame step: that is how pixel art blinks, not with
	   a continuous fade. */
	.blink {
		animation: flicker 0.9s steps(2, end) infinite;
	}

	@keyframes flicker {
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
		.blink,
		.skid {
			animation: none;
		}
	}
</style>
