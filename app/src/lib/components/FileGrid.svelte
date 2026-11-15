<script lang="ts">
	import { t } from '../i18n';
	import type { FolderStyle } from '../icons';
	import { marqueeSelection, type MarqueeOptions } from '../marquee';
	import type { Entry } from '../ipc';
	import {
		layoutZones,
		zoneWindow,
		itemTop,
		gridColumns,
		ZONE_HEADER
	} from '../virtual';
	import { cellSize, type CellSize } from '../view';
	import type { Zone } from '../grouping';
	import Cell from './Cell.svelte';
	import ZoneHeader from './ZoneHeader.svelte';
	import type { IconsStore } from '../stores/icons.svelte';

	let {
		entries,
		zones = [],
		contentKey = undefined,
		size = cellSize({ view: 'icons', side: 72 }),
		colorOf = undefined,
		hideExtension = false,
		dropTarget = null,
		selection = undefined,
		activeIndex = null,
		cutPaths = undefined,
		icons = undefined,
		onactivate,
		singleClick = false,
		folderStyle = 'windows',
		onselect,
		oncontext = undefined,
		oncontextempty = undefined,
		oncolumncount = undefined,
		ondrag = undefined,
		marquee = undefined
	}: {
		entries: Entry[];
		/** Zones the grid is divided into. Empty = no division. */
		zones?: Zone[];
		/** Identity of the contents: the scroll goes back to the top only when it changes. */
		contentKey?: string;
		/** Cell sizes, decided by the view and the icon side. */
		size?: CellSize;
		/** Colour chosen for a folder, if it has one. */
		colorOf?: (e: Entry) => string | undefined;
		hideExtension?: boolean;
		dropTarget?: string | null;
		selection?: ReadonlySet<string>;
		activeIndex?: number | null;
		cutPaths?: string[];
		icons?: IconsStore;
		onactivate: (e: Entry) => void;
		/** Opens with one click, like the Explorer option; double click is no longer needed. */
		singleClick?: boolean;
		/** How the theme draws folders. */
		folderStyle?: FolderStyle;
		onselect: (e: Entry, modifiers: { ctrl?: boolean; shift?: boolean }) => void;
		oncontext?: (e: Entry, event: MouseEvent) => void;
		oncontextempty?: (event: MouseEvent) => void;
		/** How many cells fit in a row: the up and down arrows need it. */
		oncolumncount?: (n: number) => void;
		ondrag?: (e: Entry) => void;
		/** Click on empty space and marquee selection. */
		marquee?: MarqueeOptions;
	} = $props();

	const NO_MARQUEE: MarqueeOptions = { onchange: () => {}, onempty: () => {} };

	let cellHeight = $derived(size.height);

	let scrollTop = $state(0);
	let viewportHeight = $state(600);
	let viewportWidth = $state(800);
	let viewport = $state<HTMLDivElement | null>(null);

	let cut = $derived(new Set(cutPaths ?? []));
	/** Cells are taller than rows: fewer rows of margin are enough. */
	const OVERSCAN = 2;

	// The «content» view has a single cell per row, as wide as the list.
	// The viewport padding (8 + 8) is not space for the cells.
	let columns = $derived(
		size.full ? 1 : gridColumns(Math.max(0, viewportWidth - 16), size.width)
	);
	let divided = $derived(zones.length > 0);
	// Every zone starts on a new line: the common ones must not end up halfway
	// through the last row of favourites.
	let layout = $derived(
		layoutZones(
			divided ? zones.map((z) => z.count) : [entries.length],
			columns,
			cellHeight,
			divided ? ZONE_HEADER : 0
		)
	);
	let windows = $derived(
		layout.zones.map((zone) => {
			const f = zoneWindow(zone, scrollTop, viewportHeight, columns, cellHeight, OVERSCAN);
			return { zone, top: f.top, items: entries.slice(f.start, f.start + f.count) };
		})
	);
	let visible = $derived(windows.flatMap((f) => f.items));


	$effect(() => {
		if (contentKey === undefined) entries;
		else contentKey;
		if (viewport) viewport.scrollTop = 0;
		scrollTop = 0;
	});

	// The column count is born here, where the width is known: the page
	// needs it to make the arrows move by a whole row.
	$effect(() => {
		oncolumncount?.(columns);
	});

	// As in the row view: requests go out only once scrolling stops, and the
	// queue is replaced by what is really visible.
	$effect(() => {
		if (!icons) return;
		const shown = visible;
		// Double the side for high-density screens, up to the maximum the
		// Shell extracts. From 48 pixels up, folders and programs also get
		// their real icon instead of the enlarged type icon.
		const side = Math.min(256, Math.round(size.icon * (window.devicePixelRatio || 1)));
		const wait = setTimeout(() => icons.request(shown, side, size.icon >= 48), 120);
		return () => clearTimeout(wait);
	});

	// The cell chosen by keyboard may be outside the window: its row is
	// computed, because there is no element to call scrollIntoView on.
	$effect(() => {
		if (activeIndex === null || activeIndex < 0 || !viewport) return;

		const top = itemTop(layout.zones, activeIndex, columns, cellHeight);
		const bottom = top + cellHeight;

		if (top < viewport.scrollTop) {
			viewport.scrollTop = top;
		} else if (bottom > viewport.scrollTop + viewportHeight) {
			viewport.scrollTop = bottom - viewportHeight;
		}
	});
</script>

<div
	class="viewport"
	bind:this={viewport}
	bind:clientHeight={viewportHeight}
	bind:clientWidth={viewportWidth}
	onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
	role="presentation"
	oncontextmenu={(e) => {
		e.preventDefault();
		oncontextempty?.(e);
	}}
	use:marqueeSelection={marquee ?? NO_MARQUEE}
>
	<div class="spacer" style:height="{layout.totalHeight}px">
		{#each windows as f, z (z)}
		{#if divided}
			<ZoneHeader
				label={zones[z].label}
				tone={zones[z].tone}
				count={f.zone.count}
				top={f.zone.top}
			/>
		{/if}
		<div
			class="window"
			style:transform="translateY({f.top}px)"
			style:grid-template-columns="repeat({columns}, 1fr)"
			style:justify-items={size.horizontal ? "start" : "center"}
			role="grid"
			aria-label={divided ? zones[z].label : t('Elementi della cartella')}
		>
			{#each f.items as entry (entry.path)}
				<Cell
					{entry}
					selected={selection?.has(entry.path) ?? false}
					cut={cut.has(entry.path)}
					{icons}
					{size}
					color={colorOf?.(entry)}
					{hideExtension}
					dropTarget={entry.path === dropTarget}
					{ondrag}
					{onactivate}
					{singleClick}
					{folderStyle}
					{onselect}
					{oncontext}
				/>
			{/each}
		</div>
		{/each}
	</div>
</div>

<style>
	.viewport {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		background: var(--surface);
		/* The decorative background of world themes: flakes, leaves, paws. */
		background-image: var(--pattern, none);
		background-size: 96px 96px;
		background-attachment: local;
		padding: 8px;
		/* The selection marquee rests inside, and scrolls with the contents. */
		position: relative;
		scrollbar-gutter: stable;
	}
	.spacer {
		position: relative;
	}
	.window {
		position: absolute;
		inset-inline: 0;
		top: 0;
		display: grid;
		justify-items: center;
		will-change: transform;
	}
</style>
