<script lang="ts">
	/**
	 * Electrified rail.
	 *
	 * It is not decoration: the speed and brightness of the current tell
	 * whether the system is moving data. At rest one pulse passes every nine
	 * seconds, barely noticeable; under load two pass, fast and bright.
	 * Looking at the rail must be enough to know whether it is working.
	 */
	let {
		orientation = 'horizontal',
		active = false
	}: {
		orientation?: 'horizontal' | 'vertical';
		active?: boolean;
	} = $props();
</script>

<div
	class="rail"
	class:vertical={orientation === 'vertical'}
	class:active
	aria-hidden="true"
>
	<span class="current"></span>
	{#if active}
		<span class="current second"></span>
	{/if}
</div>

<style>
	/* Two parallel wires: the idle rail is metal, not a single line. */
	.rail {
		position: relative;
		flex-shrink: 0;
		height: 5px;
		overflow: hidden;
		background:
			linear-gradient(var(--rail-metal), var(--rail-metal)) 0 1px / 100% 1px no-repeat,
			linear-gradient(var(--rail-metal), var(--rail-metal)) 0 3px / 100% 1px no-repeat;
	}

	.rail.vertical {
		width: 5px;
		height: auto;
		align-self: stretch;
		background:
			linear-gradient(var(--rail-metal), var(--rail-metal)) 1px 0 / 1px 100% no-repeat,
			linear-gradient(var(--rail-metal), var(--rail-metal)) 3px 0 / 1px 100% no-repeat;
	}

	/* The core's halo must spill out of the rail's five pixels: the clip
	   stays, but with a margin. */
	.rail {
		overflow: clip;
		overflow-clip-margin: 8px;
	}

	/* Only transform and opacity: they stay on the compositor, no repaint.
	   The current has a direction: a plasma tail fading out behind and a
	   white core in front, the only thing in the app that gives off light. */
	.current {
		position: absolute;
		top: 0;
		left: 0;
		width: 24%;
		height: 100%;
		opacity: 0.3;
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in srgb, var(--plasma) 70%, transparent) 45%,
			var(--current) 88%,
			transparent
		);
		animation: flow 9s linear infinite;
	}
	.current::after {
		content: '';
		position: absolute;
		top: 0;
		right: 6%;
		width: 6px;
		height: 100%;
		background: #fff;
		box-shadow:
			0 0 3px #fff,
			0 0 10px 2px var(--current);
	}

	.vertical .current {
		width: 100%;
		height: 24%;
		background: linear-gradient(
			180deg,
			transparent,
			color-mix(in srgb, var(--plasma) 70%, transparent) 45%,
			var(--current) 88%,
			transparent
		);
		animation-name: flow-vertical;
	}
	.vertical .current::after {
		top: auto;
		right: 0;
		bottom: 6%;
		width: 100%;
		height: 6px;
	}

	.active .current {
		opacity: 1;
		animation-duration: 1.6s;
	}

	.second {
		animation-delay: 0.8s;
	}

	@keyframes flow {
		from {
			transform: translateX(-110%);
		}
		to {
			transform: translateX(520%);
		}
	}

	@keyframes flow-vertical {
		from {
			transform: translateY(-110%);
		}
		to {
			transform: translateY(520%);
		}
	}

	/* Without motion the rail stays lit but still: the "it is working"
	   information comes through brightness instead of movement. */
	@media (prefers-reduced-motion: reduce) {
		.current {
			animation: none;
			transform: none;
			width: 100%;
			opacity: 0.18;
		}
		.current::after {
			display: none;
		}
		.vertical .current {
			height: 100%;
		}
		.active .current {
			opacity: 0.6;
		}
		.second {
			display: none;
		}
	}
</style>
