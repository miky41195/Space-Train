<script lang="ts">
	import type { Progress } from '../ipc';
	import type { ProgressMode } from '../progress-mode';

	let {
		progress,
		mode,
		oncancel,
		paused = false,
		onpause = undefined,
		queued = 0,
		onqueue = undefined
	}: {
		progress: Progress;
		mode: ProgressMode;
		oncancel: () => void;
		paused?: boolean;
		/** Present when the job can pause between one file and the next. */
		onpause?: () => void;
		/** Jobs waiting after this one. */
		queued?: number;
		onqueue?: () => void;
	} = $props();

	let percent = $derived(
		progress.total === 0
			? 0
			: Math.min(100, Math.round((progress.transferred / progress.total) * 100))
	);

	const LABELS = {
		copy: 'Copia',
		move: 'Spostamento',
		compress: 'Compressione',
		extract: 'Estrazione',
		send: 'Invio in rete locale',
		receive: 'Ricezione dalla rete locale',
		trash: 'Spostamento nel Cestino',
		delete: 'Eliminazione',
		duplicates: 'Confronto dei file',
		images: 'Conversione delle immagini',
		backup: 'Backup sul server'
	} as const;

	/** Deletions count items: bytes would say nothing about how long is left. */
	let byItems = $derived(mode === 'trash' || mode === 'delete' || mode === 'images');

	function itemsText(n: number): string {
		return n === 1 ? '1 elemento' : `${n} elementi`;
	}

	function formatBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
		if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
		return `${(n / 1024 ** 3).toFixed(2)} GB`;
	}
</script>

<div class="bar">
	<span class="label">{LABELS[mode]} {paused ? 'in pausa' : 'in corso…'}</span>

	<div
		class="track"
		role="progressbar"
		aria-valuenow={percent}
		aria-valuemin="0"
		aria-valuemax="100"
	>
		<div class="fill" style:width="{percent}%">
			<span class="head"></span>
		</div>
	</div>

	<span class="numbers">
		{#if byItems}
			{progress.transferred} di {itemsText(progress.total)} · {percent}%
		{:else}
			{formatBytes(progress.transferred)} di {formatBytes(progress.total)} · {percent}%
		{/if}
	</span>

	{#if onqueue && queued > 0}
		<button class="queue" onclick={onqueue}>+{queued} in coda</button>
	{/if}
	{#if onpause}
		<button onclick={onpause}>{paused ? 'Riprendi' : 'Pausa'}</button>
	{/if}
	<button onclick={oncancel}>Annulla</button>
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 40px;
		padding: 0 12px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.label {
		white-space: nowrap;
		font-family: var(--font-display);
		font-size: calc(12px * var(--title-scale, var(--text-scale, 1)));
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	/* The stretch of rail the cargo has already covered. */
	.track {
		position: relative;
		flex: 1;
		min-width: 60px;
		height: 6px;
		border-radius: 3px;
		background: var(--rail-metal);
	}
	.fill {
		position: relative;
		height: 100%;
		border-radius: 3px;
		background: linear-gradient(90deg, var(--plasma), var(--current));
		transition: width 120ms linear;
	}
	/* The nose of the train: where the current has got to now. */
	.head {
		position: absolute;
		right: -1px;
		top: 50%;
		width: 3px;
		height: 12px;
		transform: translateY(-50%);
		border-radius: 1px;
		/* The same white core as the current on the rail. */
		background: #fff;
		box-shadow:
			0 0 3px #fff,
			0 0 10px 2px var(--current);
	}
	.numbers {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	button {
		height: 24px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
	}
</style>
