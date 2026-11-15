<script lang="ts">
	import { t } from '../i18n';
	import TrainSvg from './TrainSvg.svelte';
	import type { Appearance } from '../appearance';
	import type { IntroAnimation, IntroMotion } from '../animations';

	/**
	 * Opening sequence: the train crosses the screen and drags the curtain
	 * along behind it, uncovering the interface already ready underneath.
	 *
	 * Constraints that decided its shape:
	 * - it lasts little more than a second. A file manager is opened fifty
	 *   times a day: three seconds of opening titles would become a toll;
	 * - any key or click skips it;
	 * - it blocks nothing. The app underneath is already mounted and
	 *   interactive, the veil does not intercept the pointer;
	 * - with `prefers-reduced-motion` it does not start at all.
	 */
	let {
		onend,
		kind = 'train',
		figure = null,
		motion = 'cross',
		duration = 1.25
	}: {
		onend: () => void;
		/** Which opening the theme asks for; «nessuna» is never mounted. */
		kind?: Exclude<IntroAnimation, 'none'>;
		/** For «personalizzata»: what crosses the screen. Missing = the train. */
		figure?: Appearance | null;
		motion?: IntroMotion;
		/** Seconds, for «personalizzata». */
		duration?: number;
	} = $props();

	// svelte-ignore state_referenced_locally
	const DURATION = kind === 'custom' ? duration * 1000 : kind === 'stars' ? 1300 : kind === 'current' ? 1000 : 1250;

	/** Falling stars: fixed places, so every start looks the same. */
	const STARS = Array.from({ length: 28 }, (_, i) => ({
		x: (i * 37) % 100,
		delay: ((i * 53) % 40) / 100,
		side: i % 3 === 0 ? 3 : 2
	}));

	let skipped = $state(false);

	function close() {
		if (skipped) return;
		skipped = true;
		onend();
	}

	$effect(() => {
		const t = setTimeout(close, DURATION);
		return () => clearTimeout(t);
	});
</script>

<svelte:window onkeydown={close} onpointerdown={close} />

<div class="curtain {kind}" aria-hidden="true" style:--duration="{DURATION}ms">
	{#if kind === 'stars'}
		{#each STARS as st, i (i)}
			<span class="star" style:left="{st.x}%" style:animation-delay="{st.delay}s" style:width="{st.side}px" style:height="{st.side}px"
			></span>
		{/each}
	{:else}
		<!-- The rail powers up before the train arrives: the current always
		     comes before the train. -->
		<div class="rail">
			<span class="current"></span>
		</div>
	{/if}

	{#if kind === 'train' || (kind === 'custom' && !figure)}
		<div class="vehicle {kind === 'custom' ? motion : ''}">
			<TrainSvg scale={3} />
		</div>
	{:else if kind === 'custom' && figure}
		<div class="vehicle {motion}">
			{#if figure.kind === 'image'}
				<img src={figure.src} alt="" draggable="false" />
			{:else if figure.kind === 'sprite'}
				<span class="sprite" style={figure.style}></span>
			{:else}
				<span class="figure">{@html figure.svg}</span>
			{/if}
		</div>
	{/if}

	<div class="sign">{t('Space Train')}</div>
</div>

<style>
	.curtain {
		position: fixed;
		inset: 0;
		z-index: 50;
		overflow: hidden;
		background: var(--void);
		/* The app underneath is already alive: the veil must not steal its clicks. */
		pointer-events: none;
		animation: withdraw var(--duration, 1.25s) cubic-bezier(0.65, 0, 0.35, 1) forwards;
	}

	/* The curtain withdraws to the right behind the train, instead of
	   fading out: it is the train that uncovers the interface, not a blind. */
	@keyframes withdraw {
		0%,
		28% {
			clip-path: inset(0 0 0 0);
		}
		100% {
			clip-path: inset(0 0 0 100%);
		}
	}

	.rail {
		position: absolute;
		inset-inline: 0;
		top: 50%;
		height: 5px;
		margin-top: 26px;
		background:
			linear-gradient(var(--rail-metal), var(--rail-metal)) 0 1px / 100% 1px no-repeat,
			linear-gradient(var(--rail-metal), var(--rail-metal)) 0 3px / 100% 1px no-repeat;
		opacity: 0;
		animation: power-up 0.25s ease-out forwards;
	}

	@keyframes power-up {
		to {
			opacity: 1;
		}
	}

	.current {
		position: absolute;
		inset-block: 0;
		left: 0;
		width: 30%;
		/* The same current as the rail: plasma tail and white core. */
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in srgb, var(--plasma) 70%, transparent) 45%,
			var(--current) 88%,
			transparent
		);
		transform: translateX(-100%);
		animation: discharge 0.65s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
	}
	.current::after {
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

	@keyframes discharge {
		to {
			transform: translateX(400%);
		}
	}

	.vehicle {
		position: absolute;
		top: 50%;
		left: 0;
		transform: translateX(-120%);
		animation: cross 1.15s cubic-bezier(0.5, 0, 0.4, 1) 0.22s forwards;
	}

	@keyframes cross {
		to {
			transform: translateX(calc(100vw + 60px));
		}
	}

	/* Corrente: only the current, longer and brighter, then the curtain. */
	.curtain.current .current {
		width: 45%;
		animation-duration: 0.8s;
	}

	/* Stars: pixel squares falling through the curtain. */
	.star {
		position: absolute;
		top: 0;
		background: var(--current);
		box-shadow: 0 0 4px var(--current);
		transform: translateY(-10px);
		animation: fall 0.9s cubic-bezier(0.5, 0, 0.9, 0.6) forwards;
	}
	.star:nth-child(even) {
		background: var(--text);
	}
	@keyframes fall {
		to {
			transform: translateY(105vh);
		}
	}

	/* Personalizzata: the chosen figure, big, with its movement. */
	.vehicle img {
		height: 90px;
		width: auto;
	}
	.vehicle .figure :global(svg) {
		height: 90px;
		width: auto;
	}
	.vehicle .sprite {
		display: block;
		background-repeat: no-repeat;
		transform: scale(3);
		transform-origin: bottom left;
		animation-name: frames;
		animation-iteration-count: infinite;
	}
	@keyframes frames {
		from {
			background-position: var(--x) var(--y);
		}
		to {
			background-position: var(--end) var(--y);
		}
	}
	.vehicle.cross,
	.vehicle.enter,
	.vehicle.center {
		margin-top: -64px;
		animation-duration: calc(var(--duration) * 0.85);
		animation-delay: 0s;
	}
	.vehicle.enter {
		animation-name: enter;
	}
	.vehicle.center {
		left: 50%;
		animation-name: appear;
	}
	@keyframes enter {
		from {
			transform: translateX(-120%);
		}
		60%,
		to {
			transform: translateX(calc(50vw - 50%));
		}
	}
	@keyframes appear {
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

	/* The name stays behind, like the sign of a station already passed. */
	.sign {
		position: absolute;
		inset-inline: 0;
		top: 50%;
		margin-top: -46px;
		text-align: center;
		font-family: var(--font-display);
		font-size: calc(22px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
		letter-spacing: 0.42em;
		text-indent: 0.42em;
		text-transform: uppercase;
		color: var(--text-dim);
		opacity: 0;
		animation: signboard 0.9s ease-out 0.15s;
	}

	@keyframes signboard {
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
		.curtain {
			display: none;
		}
	}
</style>
