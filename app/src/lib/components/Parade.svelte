<script lang="ts">
	import { untrack } from 'svelte';
	import TrainSvg from './TrainSvg.svelte';
	import { appearanceOf } from '../appearance';
	import { offStageAt, loopKeyframes, readMotion } from '../motion';

	/**
	 * The train running along the main line.
	 *
	 * At rest it passes rarely, like an event. During a transfer it travels
	 * without stopping: the cargo is moving, and you can see it.
	 */
	let {
		active = false,
		parade = undefined,
		pause = 30_000
	}: {
		active?: boolean;
		/**
		 * Milliseconds to wait at rest between leaving the stage and the next
		 * pass; `null`: at rest it does not pass, only during transfers.
		 */
		pause?: number | null;
		/**
		 * Who parades instead of the train: figure ids, `img:<path>` for the
		 * user's images, `sprite:<json>` for their spritesheets.
		 */
		parade?: string[];
	} = $props();

	/** The parade items ready to draw; unknown ones are skipped. */
	let marchers = $derived(
		(parade ?? [])
			.map((item) => {
				const { motion, item: it } = readMotion(item);
				const a = appearanceOf(it);
				return a ? { ...a, motion } : null;
			})
			.filter((x) => x !== null)
	);

	/** Who parades with the train, and who has a motion of their own: still or running. */
	let walkers = $derived(marchers.filter((f) => f.motion.kind === 'walk'));
	let stage = $derived(marchers.filter((f) => f.motion.kind !== 'walk' && !f.motion.loop));
	/** Who always stays on stage, outside the passes: still or looping. */
	let looping = $derived(marchers.filter((f) => f.motion.kind !== 'walk' && f.motion.loop));
	/** The animations of those crossing in a loop, one per item. */
	let loops = $derived(
		looping
			.map((f, i) => (f.motion.kind === 'cross' ? loopKeyframes(`loop-${i}`, f.motion) : ''))
			.join('')
	);
	/** Without a parade the train passes; with an all-still parade, no train. */
	let withTrain = $derived(marchers.length === 0 || walkers.length > 0);
	/** Seconds from the start of the pass to the exit of the last one on stage. */
	let stageDuration = $derived(Math.max(0, ...stage.map((f) => offStageAt(f.motion))));

	/**
	 * Line height: 40 px are enough for the train and the figures; an enlarged
	 * sprite raises it, and sticks out upwards while standing on the rail.
	 */
	let lineHeight = $derived(
		Math.max(
			40,
			...marchers.map((f) => (f.kind === 'sprite' && f.height ? f.height : 30) + 10 + f.motion.height)
		)
	);

	/** Changes at every departure: remounts the SVG and restarts the animation. */
	let run = $state(0);
	let travelling = $state(false);
	/**
	 * Speed is chosen at departure. A folder that loads mid-run flips `active`,
	 * and a new animation-duration mid-flight makes the train jump back and forth.
	 */
	let fast = $state(false);

	/**
	 * The pause is counted from when the train leaves the stage: crossings
	 * last 7 to 16 seconds depending on who passes, and measuring from the
	 * departure a slow parade would never leave the rail empty.
	 */
	const FIRST_RUN = 1_200;
	/** Under load it leaves again at once: the motion says something is being copied. */
	const LOAD_PAUSE = 600;
	/** If the end of the animation never arrives (reduced motion), it moves on anyway. */
	const MAX_CROSSING = 20_000;

	/** How long to wait after an arrival; `null` to stay still. */
	function wait(): number | null {
		return active ? LOAD_PAUSE : pause;
	}

	/**
	 * The pass ends when the train has reached the end and the stage is
	 * over: both waits are counted, and whichever finishes last closes it.
	 */
	let waits = 0;
	let stageEnd: ReturnType<typeof setTimeout> | undefined;

	function depart() {
		fast = active;
		run += 1;
		travelling = true;
		clearTimeout(next);
		clearTimeout(stageEnd);
		waits = (withTrain ? 1 : 0) + (stageDuration > 0 ? 1 : 0);
		if (stageDuration > 0) stageEnd = setTimeout(onePartDone, stageDuration * 1000 + 100);
		next = setTimeout(arrived, Math.max(MAX_CROSSING, stageDuration * 1000 + 2_000));
	}

	function onePartDone() {
		waits -= 1;
		if (waits <= 0) arrived();
	}

	function arrived() {
		if (!travelling) return;
		travelling = false;
		clearTimeout(stageEnd);
		const after = wait();
		if (after === null) clearTimeout(next);
		else schedule(after);
	}

	let next: ReturnType<typeof setTimeout> | undefined;

	function schedule(after: number) {
		clearTimeout(next);
		next = setTimeout(depart, after);
	}

	$effect(() => () => {
		clearTimeout(next);
		clearTimeout(stageEnd);
	});

	// The first run comes soon, then the pause is respected. Under load the
	// train does not wait: if it is still it leaves again almost at once.
	// When the pause changes, the next pass is rescheduled.
	let started = false;
	$effect(() => {
		const after = wait();
		if (untrack(() => travelling)) return;
		if (after === null) clearTimeout(next);
		else schedule(started ? after : Math.min(after, FIRST_RUN));
		started = true;
	});
</script>

<div class="line" aria-hidden="true" style:height="{lineHeight}px">
	{#key run}
		{#if withTrain}
		<div
			class="train"
			class:loaded={fast}
			class:on-foot={marchers.length > 0}
			onanimationend={(e) => e.target === e.currentTarget && onePartDone()}
		>
			{#if marchers.length > 0}
				<div class="marchers">
					{#each walkers as f, i (i)}
						<!-- The delay staggers the steps: they do not all march in unison. -->
						<span
							class="figure"
							class:with-frames={f.kind === 'sprite'}
							style:animation-delay="{-i * 0.17}s"
						>
							{#if f.kind === 'sprite'}
								<!-- The sheet's frames already give the step: no hop. -->
								<span class="sprite" style={f.style}></span>
							{:else if f.kind === 'image'}
								<img src={f.src} alt="" draggable="false" />
							{:else}
								{@html f.svg}
							{/if}
						</span>
					{/each}
				</div>
			{:else}
				<TrainSvg />
			{/if}
		</div>
		{/if}
		{#if travelling}
			<!-- The stage: who stays still at one point and who runs alone to
			     the end, each with their own timing from the start of the pass. -->
			{#each stage as f, i (i)}
				<span
					class="on-stage {f.motion.kind} {f.motion.direction}"
					style:--from={f.motion.position}
					style:bottom="{f.motion.height}px"
					style:animation-delay="{f.motion.delay}s"
					style:animation-duration="{f.motion.duration}s"
				>
					{@render look(f)}
				</span>
			{/each}
		{/if}
	{/key}
	<!-- Who always stays on stage: does not wait for passes and has no duration.
	     Whoever crosses starts again forever, with their own round and pause. -->
	{#if loops}{@html `<style>${loops}</style>`}{/if}
	{#each looping as f, i (i)}
		<span
			class="on-stage loop {f.motion.kind}"
			style:--from={f.motion.position}
			style:bottom="{f.motion.height}px"
			style:animation-name={f.motion.kind === 'cross' ? `loop-${i}` : undefined}
			style:animation-delay="{f.motion.delay}s"
			style:animation-duration="{f.motion.duration + f.motion.pause}s"
		>
			{@render look(f)}
		</span>
	{/each}
</div>

{#snippet look(f: (typeof marchers)[number])}
	<span class="look" class:mirrored={f.motion.mirror}>
		{#if f.kind === 'sprite'}
			<span class="sprite" style={f.style}></span>
		{:else if f.kind === 'image'}
			<img src={f.src} alt="" draggable="false" />
		{:else}
			<span class="still-figure">{@html f.svg}</span>
		{/if}
	</span>
{/snippet}

<style>
	.line {
		position: absolute;
		inset-inline: 0;
		bottom: -6px;
		height: 40px;
		overflow: hidden;
		pointer-events: none;
		z-index: 2;
		/* Stage measures are given in rail widths (cqw). */
		container-type: inline-size;
	}

	/* Outside its time it is not seen: the animation shows it only between
	   the delay and the end of the duration. */
	.on-stage {
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
	.on-stage img {
		height: 30px;
		width: auto;
	}
	/* Still: at the chosen point, without going past the edges. */
	.on-stage.still {
		left: calc(var(--from) * 1%);
		transform: translateX(calc(var(--from) * -1%));
		animation-name: on-stage;
	}
	/* Cross: from the chosen point to beyond the edge, right or left. */
	.on-stage.cross {
		animation-name: cross;
	}
	.on-stage.cross.left {
		animation-name: cross-left;
	}
	/* Always on stage: the still one is simply seen, whoever crosses loops
	   forever with the keyframes computed for them. */
	.on-stage.loop {
		animation-iteration-count: infinite;
	}
	.on-stage.loop.still {
		visibility: visible;
		animation-name: none;
	}
	.look {
		display: flex;
		align-items: flex-end;
	}
	.look.mirrored {
		transform: scaleX(-1);
	}
	@keyframes cross-left {
		from {
			visibility: visible;
			transform: translateX(calc(var(--from) * (100cqw - 100%) / 100));
		}
		to {
			visibility: visible;
			transform: translateX(calc(-100% - 20px));
		}
	}
	@keyframes on-stage {
		from,
		to {
			visibility: visible;
		}
	}
	@keyframes cross {
		from {
			visibility: visible;
			transform: translateX(calc(var(--from) * (100cqw - 100%) / 100));
		}
		to {
			visibility: visible;
			transform: translateX(calc(100cqw + 20px));
		}
	}
	.still-figure :global(.step-b) {
		animation: step 0.34s steps(1) infinite;
	}
	.still-figure :global(.step-a) {
		animation: step 0.34s steps(1) infinite reverse;
	}

	/* Only transform: the train stays on the compositor and repaints nothing
	   of what passes beneath it. */
	.train {
		position: absolute;
		bottom: 0;
		left: 0;
		transform: translateX(-110%);
		/* It must stay shorter than the cycle, otherwise the train does not
		   «pass»: it parks. */
		animation: transit 11s linear;
	}

	.train.loaded {
		animation-duration: 7s;
	}

	/* On foot you go slower than by train. */
	.train.on-foot {
		animation-duration: 16s;
	}
	.train.on-foot.loaded {
		animation-duration: 10s;
	}

	.marchers {
		display: flex;
		align-items: flex-end;
		gap: 14px;
		padding-bottom: 2px;
	}

	/* The hop of the step: up and down in jerks, like pixel art. */
	.figure {
		display: flex;
		animation: hop 0.34s steps(2, jump-none) infinite alternate;
	}
	.figure img {
		height: 30px;
		width: auto;
		image-rendering: auto;
	}
	/* The two leg frames alternate. */
	.figure :global(.step-b) {
		animation: step 0.34s steps(1) infinite;
	}
	.figure :global(.step-a) {
		animation: step 0.34s steps(1) infinite reverse;
	}

	.figure.with-frames {
		animation: none;
	}
	.sprite {
		display: block;
		background-repeat: no-repeat;
		animation-name: frames;
		animation-iteration-count: infinite;
	}
	/* The background slides a whole row in jerks: one frame at a time. */
	@keyframes frames {
		from {
			background-position: var(--x) var(--y);
		}
		to {
			background-position: var(--end) var(--y);
		}
	}

	@keyframes hop {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-2px);
		}
	}
	@keyframes step {
		0%,
		49% {
			opacity: 0;
		}
		50%,
		100% {
			opacity: 1;
		}
	}

	@keyframes transit {
		from {
			transform: translateX(-110%);
		}
		to {
			transform: translateX(calc(100vw + 20px));
		}
	}

	/* A train crossing the screen is exactly what this preference asks
	   not to do. */
	@media (prefers-reduced-motion: reduce) {
		.line {
			display: none;
		}
	}
</style>
