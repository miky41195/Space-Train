<script lang="ts">
	import { RECENT_PERIODS } from '../grouping';
	import Icon from './Icon.svelte';

	let {
		days,
		count,
		onchange,
		onclose
	}: {
		/** Current period, in days. */
		days: number;
		/** How many items fall within the period, for the summary beside it. */
		count: number;
		onchange: (days: number) => void;
		onclose: () => void;
	} = $props();

	/** The slider moves between periods, not days: the steps have a name. */
	let index = $derived(
		Math.max(
			0,
			RECENT_PERIODS.findIndex((p) => p.days >= days)
		)
	);
	let period = $derived(RECENT_PERIODS[index]);
</script>

<div class="recent" role="group" aria-label="Periodo dei recenti">
	<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
		<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3" />
		<path d="M8 4v4.5l3 1.8" fill="none" stroke="currentColor" stroke-width="1.3" />
	</svg>
	<span class="label">Modificati</span>
	<input
		type="range"
		min="0"
		max={RECENT_PERIODS.length - 1}
		step="1"
		value={index}
		aria-label="Periodo"
		aria-valuetext={period.name}
		oninput={(e) => onchange(RECENT_PERIODS[Number(e.currentTarget.value)].days)}
	/>
	<span class="period">{period.name}</span>
	<span class="count">{count === 0 ? 'nessun elemento' : count === 1 ? '1 elemento' : `${count} elementi`}</span>
	<button onclick={onclose} aria-label="Nascondi i recenti" title="Nascondi i recenti"><Icon name="close" /></button>
</div>

<style>
	.recent {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 34px;
		padding: 0 14px;
		background: color-mix(in srgb, var(--current) 6%, var(--surface));
		border-bottom: 1px solid var(--border);
		color: var(--current);
		flex-shrink: 0;
	}
	.label {
		color: var(--text-dim);
	}
	input {
		width: 180px;
		accent-color: var(--current);
	}
	.period {
		min-width: 130px;
		color: var(--text);
		font-weight: 600;
	}
	.count {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	button {
		margin-left: auto;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-dim);
		font-size: calc(15px * var(--text-scale, 1));
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
</style>
