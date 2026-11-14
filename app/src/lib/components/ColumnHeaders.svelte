<script lang="ts">
	import type { SortKey, SortSpec } from '../ipc';
	import type { Columns } from '../stores/settings.svelte';
	import { columnsGrid } from '../columns';
	import { MEDIA_COLUMNS, type MediaKey } from '../media';

	let {
		sort,
		onsort,
		columns: shown = { size: true, date: true, type: false },
		oncolumns = undefined,
		mediaSort = null,
		onsortmedia = undefined
	}: {
		sort: SortSpec;
		onsort: (key: SortKey) => void;
		columns?: Columns;
		oncolumns?: (event: MouseEvent) => void;
		/** The list is sorted by a media column instead of `sort`. */
		mediaSort?: { key: MediaKey; ascending: boolean } | null;
		onsortmedia?: (key: MediaKey) => void;
	} = $props();

	let mediaColumns = $derived((shown.media ?? []).map((k) => MEDIA_COLUMNS.find((m) => m.key === k)!).filter(Boolean));

	let columns = $derived(
		[
			{ key: 'kind' as SortKey, label: 'Tipo', cls: 'kind' },
			{ key: 'name' as SortKey, label: 'Nome', cls: 'name' },
			shown.type && { key: 'kind' as SortKey, label: 'Tipo', cls: 'description' },
			shown.size && { key: 'size' as SortKey, label: 'Carico', cls: 'load' },
			shown.date && { key: 'modified' as SortKey, label: 'Orario', cls: 'time' }
		].filter((c): c is { key: SortKey; label: string; cls: string } => Boolean(c))
	);

	/**
	 * The accessible name says both the current state and what happens on
	 * pressing: without it, a screen reader only announces «Nome, pulsante».
	 */
	function description(key: SortKey, label: string): string {
		if (sort.key !== key) return `Ordina per ${label.toLowerCase()}`;
		return sort.ascending
			? `${label}, ordine crescente. Premi per invertire`
			: `${label}, ordine decrescente. Premi per invertire`;
	}
</script>

<div
	class="board"
	style:grid-template-columns={columnsGrid(shown)}
	role="presentation"
	oncontextmenu={(e) => {
		if (!oncolumns) return;
		e.preventDefault();
		oncolumns(e);
	}}
>
	{#each columns as c (c.cls)}
		<button
			class="column {c.cls}"
			class:active={!mediaSort && sort.key === c.key}
			onclick={() => onsort(c.key)}
			aria-label={description(c.key, c.label)}
		>
			<span class="text">{c.label}</span>
			{#if !mediaSort && sort.key === c.key}
				<svg class="direction" class:down={!sort.ascending} viewBox="0 0 6 4" aria-hidden="true">
					<path d="M0 3 L3 0 L6 3 Z" fill="currentColor" />
				</svg>
			{/if}
		</button>
	{/each}
	{#each mediaColumns as c (c.key)}
		{@const active = mediaSort?.key === c.key}
		<button
			class="column media"
			class:right={c.right}
			class:active
			onclick={() => onsortmedia?.(c.key)}
			aria-label={!active
				? `Ordina per ${c.label.toLowerCase()}`
				: `${c.label}, ordine ${mediaSort?.ascending ? 'crescente' : 'decrescente'}. Premi per invertire`}
		>
			<span class="text">{c.label}</span>
			{#if active}
				<svg class="direction" class:down={!mediaSort?.ascending} viewBox="0 0 6 4" aria-hidden="true">
					<path d="M0 3 L3 0 L6 3 Z" fill="currentColor" />
				</svg>
			{/if}
		</button>
	{/each}
</div>

<style>
	/* Same grid as the rows. The right padding accounts for the scrollbar
	   gutter, which the list always reserves: without it, the right-hand
	   columns would slide by ten pixels. */
	.board {
		display: grid;
		gap: 8px;
		align-items: center;
		height: 26px;
		padding: 0 26px 0 16px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		flex-shrink: 0;
	}

	/* The signage font, spaced as on a departure board. */
	.column {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 100%;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(10px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		cursor: default;
		transition: color 120ms ease;
	}

	.column:hover {
		color: var(--text);
	}

	/* The column that drives the order is the only one lit. */
	.column.active {
		color: var(--current);
	}

	.load,
	.time,
	.media.right {
		justify-content: flex-end;
	}
	.media .text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* The first column is as wide as an icon: the label does not fit,
	   only the direction mark stays. The name lives in the aria-label. */
	.kind .text {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.kind {
		justify-content: center;
	}

	.direction {
		width: 6px;
		height: 4px;
		flex-shrink: 0;
	}
	.direction.down {
		transform: rotate(180deg);
	}
</style>
