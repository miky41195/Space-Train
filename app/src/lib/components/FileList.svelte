<script lang="ts" module>
	/**
	 * Where each list was scrolled, by content key: the dual pane remounts a
	 * list when you switch side, and going back to a folder finds it as you left it.
	 */
	const savedScrolls = new Map<string, number>();
	const MAX_SAVED = 200;
</script>

<script lang="ts">
	import type { FolderStyle } from '../icons';
	import type { MediaKey } from '../media';
	import type { Growth } from '../growth';
	import { marqueeSelection, type MarqueeOptions } from '../marquee';
	import type { Entry, GitMark, MediaProps, SortKey, SortSpec } from '../ipc';
	import ColumnHeaders from './ColumnHeaders.svelte';
	import { layoutZones, zoneWindow, itemTop, ROW_HEIGHT, OVERSCAN, ZONE_HEADER } from '../virtual';
	import Row from './Row.svelte';
	import ZoneHeader from './ZoneHeader.svelte';
	import type { IconsStore } from '../stores/icons.svelte';
	import type { Columns } from '../stores/settings.svelte';
	import type { Zone } from '../grouping';

	let {
		entries,
		zones = [],
		contentKey = undefined,
		columns = undefined,
		hideExtension = false,
		folderOf = undefined,
		colorOf = undefined,
		shareOf = undefined,
		growthOf = undefined,
		rowHeight = ROW_HEIGHT,
		dropTarget = null,
		selection = undefined,
		matches = undefined,
		activeIndex = null,
		renamingPath = null,
		cutPaths = undefined,
		icons = undefined,
		sort = undefined,
		onsort = undefined,
		onactivate,
		singleClick = false,
		folderStyle = 'windows',
		sizes = {},
		oncompute = undefined,
		onselect,
		oncontext = undefined,
		oncontextempty = undefined,
		onrename = undefined,
		oncancelrename = undefined,
		ondrag = undefined,
		marquee = undefined,
		oncolumns = undefined,
		mediaOf = undefined,
		gitOf = undefined,
		rulesOf = undefined,
		mediaSort = null,
		onsortmedia = undefined
	}: {
		entries: Entry[];
		/**
		 * Zones the list is divided into, in the order of `entries`.
		 * Empty = undivided list, no headers.
		 */
		zones?: Zone[];
		/**
		 * Identity of the contents: the scroll goes back to the top only when
		 * it changes. Without it, every automatic refresh would bring the list
		 * back to the top.
		 */
		contentKey?: string;
		columns?: Columns;
		hideExtension?: boolean;
		/** Folder to show next to an item's name, when needed. */
		folderOf?: (e: Entry) => string | undefined;
		/** Colour chosen for a folder, if it has one. */
		colorOf?: (e: Entry) => string | undefined;
		/** Space view: share of the largest item, for the bar. */
		shareOf?: (e: Entry) => number | undefined;
		growthOf?: (e: Entry) => Growth | undefined;
		/** Row height: lower in the compact view. */
		rowHeight?: number;
		/** Folder a drag is passing over. */
		dropTarget?: string | null;
		selection?: ReadonlySet<string>;
		/** Positions to highlight by path, when the search is active. */
		matches?: Map<string, number[]>;
		/** Index the scroll must keep visible, for keyboard navigation. */
		activeIndex?: number | null;
		/** Path of the item being renamed, if there is one. */
		renamingPath?: string | null;
		/** Paths in the clipboard in cut mode, to show faded. */
		cutPaths?: string[];
		/** Cache of icons and thumbnails, passed to the visible rows. */
		icons?: IconsStore;
		/** Current sort. Without it, the headers do not show. */
		sort?: SortSpec;
		onsort?: (key: SortKey) => void;
		onactivate: (e: Entry) => void;
		/** Opens with one click, like Explorer's option; the double click is no longer needed. */
		singleClick?: boolean;
		/** How the theme draws folders. */
		folderStyle?: FolderStyle;
		/** Folder sizes already computed (or being computed), by path. */
		sizes?: Record<string, number | 'computing'>;
		oncompute?: (e: Entry) => void;
		onselect: (e: Entry, modifiers: { ctrl?: boolean; shift?: boolean }) => void;
		oncontext?: (e: Entry, event: MouseEvent) => void;
		/** Right click on the list's empty space. */
		oncontextempty?: (event: MouseEvent) => void;
		onrename?: (e: Entry, newName: string) => void;
		oncancelrename?: () => void;
		ondrag?: (e: Entry) => void;
		/** Click on empty space and marquee selection. */
		marquee?: MarqueeOptions;
		/** Right click on the headers: choice of columns. */
		oncolumns?: (event: MouseEvent) => void;
		/** Photo/video/music details of an entry, for the media columns. */
		mediaOf?: (e: Entry) => MediaProps | null | undefined;
		/** Git mark of an entry, inside a repository. */
		gitOf?: (e: Entry) => GitMark | undefined;
		/** The folder has automatic rules. */
		rulesOf?: (e: Entry) => boolean;
		mediaSort?: { key: MediaKey; ascending: boolean } | null;
		onsortmedia?: (key: MediaKey) => void;
	} = $props();

	const NO_MARQUEE: MarqueeOptions = { onchange: () => {}, onempty: () => {} };

	let scrollTop = $state(0);
	let viewportHeight = $state(600);
	let viewport = $state<HTMLDivElement | null>(null);

	let cut = $derived(new Set(cutPaths ?? []));

	/**
	 * Thumbnails are asked for only when scrolling stops.
	 *
	 * Asking at every scroll frame queues extractions for rows already off
	 * screen: the useful work ends at the back of the line and the list
	 * stutters. 120 ms is the typical time between two wheel notches.
	 */
	$effect(() => {
		if (!icons) return;

		const shown = visible;
		const wait = setTimeout(() => icons.request(shown), 120);

		return () => clearTimeout(wait);
	});
	let divided = $derived(zones.length > 0);
	let layout = $derived(layoutZones(divided ? zones.map((z) => z.count) : [entries.length], 1, rowHeight, divided ? ZONE_HEADER : 0));
	let windows = $derived(
		layout.zones.map((zone) => {
			const f = zoneWindow(zone, scrollTop, viewportHeight, 1, rowHeight, OVERSCAN);
			return { zone, top: f.top, items: entries.slice(f.start, f.start + f.count) };
		})
	);
	let visible = $derived(windows.flatMap((f) => f.items));

	// Back to the top when the contents change: without this, entering a
	// shorter folder leaves a scroll that no longer exists. With contents
	// already seen it goes back to where it was.
	$effect(() => {
		if (contentKey === undefined) entries;
		const saved = contentKey !== undefined ? (savedScrolls.get(contentKey) ?? 0) : 0;
		if (viewport) viewport.scrollTop = saved;
		scrollTop = viewport?.scrollTop ?? saved;
	});

	function saveScroll(top: number) {
		scrollTop = top;
		if (contentKey === undefined) return;
		savedScrolls.delete(contentKey);
		savedScrolls.set(contentKey, top);
		if (savedScrolls.size > MAX_SAVED) savedScrolls.delete(savedScrolls.keys().next().value!);
	}

	// The row chosen by keyboard may be outside the visible window: with
	// virtualised rows there is no element to call scrollIntoView on, so the
	// scroll is computed from the index.
	$effect(() => {
		if (activeIndex === null || activeIndex < 0 || !viewport) return;

		const top = itemTop(layout.zones, activeIndex, 1, rowHeight);
		const bottom = top + rowHeight;

		if (top < viewport.scrollTop) {
			viewport.scrollTop = top;
		} else if (bottom > viewport.scrollTop + viewportHeight) {
			viewport.scrollTop = bottom - viewportHeight;
		}
	});
</script>

<div class="list">
	{#if sort && onsort}
		<ColumnHeaders {sort} {onsort} {columns} {oncolumns} {mediaSort} {onsortmedia} />
	{/if}

	<div
		class="viewport"
		bind:this={viewport}
		onscroll={(e) => saveScroll(e.currentTarget.scrollTop)}
		bind:clientHeight={viewportHeight}
		role="presentation"
		oncontextmenu={(e) => {
			// Rows stop the event: only the click on empty space arrives here.
			e.preventDefault();
			oncontextempty?.(e);
		}}
		use:marqueeSelection={marquee ?? NO_MARQUEE}
	>
		<div class="spacer" style:height="{layout.totalHeight}px">
			{#each windows as f, z (z)}
				{#if divided}
					<ZoneHeader label={zones[z].label} tone={zones[z].tone} count={f.zone.count} top={f.zone.top} />
				{/if}
				<div class="window" style:transform="translateY({f.top}px)">
					{#each f.items as entry (entry.path)}
						<Row
							{entry}
							selected={selection?.has(entry.path) ?? false}
							positions={matches?.get(entry.path)}
							renaming={entry.path === renamingPath}
							cut={cut.has(entry.path)}
							{icons}
							{columns}
							{hideExtension}
							folder={folderOf?.(entry)}
							color={colorOf?.(entry)}
							share={shareOf?.(entry)}
							growth={growthOf?.(entry)}
							media={mediaOf?.(entry)}
							git={gitOf?.(entry)}
							hasRules={entry.kind === 'dir' && (rulesOf?.(entry) ?? false)}
							height={rowHeight}
							dropTarget={entry.path === dropTarget}
							{ondrag}
							{onactivate}
							{singleClick}
							{folderStyle}
							folderSize={sizes[entry.path]}
							{oncompute}
							{onselect}
							{oncontext}
							{onrename}
							{oncancelrename}
						/>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	/* Headers and list in the same box: it is what keeps the columns aligned
	   with the rows. */
	.list {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	/* Opaque background: no backdrop-filter on a scrolling container. */
	.viewport {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		background: var(--surface);
		/* The decorative background of world themes: flakes, leaves, paws. */
		background-image: var(--pattern, none);
		background-size: 96px 96px;
		background-attachment: local;
		padding: 4px;
		/* The selection marquee rests inside, and scrolls with the contents. */
		position: relative;
		/* The gutter stays reserved even with a short list: without it, the
		   scrollbar appearing would shift the rows out of line with the headers. */
		scrollbar-gutter: stable;
	}
	.spacer {
		position: relative;
	}
	.window {
		position: absolute;
		inset-inline: 0;
		top: 0;
		will-change: transform;
	}
</style>
