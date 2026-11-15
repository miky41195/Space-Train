<script lang="ts">
	import { t } from '../i18n';
	import type { Entry } from '../ipc';
	import { iconFor, categoryFor, folderIcon, drawnFolder, type FolderStyle } from '../icons';
	import type { IconsStore } from '../stores/icons.svelte';
	import { withoutExtension, formatBytes } from '../locations';
	import { describeType } from '../columns';
	import { onDrag, hoverSelect, cancelHoverSelect } from '../drag';
	import { cellSize, type CellSize } from '../view';

	let {
		entry,
		selected = false,
		cut = false,
		icons = undefined,
		size = cellSize({ view: 'icons', side: 72 }),
		color = undefined,
		hideExtension = false,
		dropTarget = false,
		onactivate,
		singleClick = false,
		folderStyle = 'windows',
		onselect,
		oncontext = undefined,
		ondrag = undefined
	}: {
		entry: Entry;
		selected?: boolean;
		cut?: boolean;
		icons?: IconsStore;
		/** Size and layout of the cell, decided by the view. */
		size?: CellSize;
		/** Colour the user picked for this folder. */
		color?: string;
		hideExtension?: boolean;
		dropTarget?: boolean;
		onactivate: (e: Entry) => void;
		/** Opens with one click, like the Explorer option; double click is no longer needed. */
		singleClick?: boolean;
		/** How the theme draws folders. */
		folderStyle?: FolderStyle;
		onselect: (e: Entry, modifiers: { ctrl?: boolean; shift?: boolean }) => void;
		oncontext?: (e: Entry, event: MouseEvent) => void;
		ondrag?: (e: Entry) => void;
	} = $props();

	let name = $derived(
		hideExtension && entry.kind !== 'dir' ? withoutExtension(entry.name) : entry.name
	);

	// Read-only, as in the row view: the grid makes the request
	// when scrolling stops. A coloured folder always uses the
	// built-in drawing, the only one that can be given a colour.
	let drawn = $derived(drawnFolder(entry, color, folderStyle));
	let image = $derived(
		drawn ? null : icons ? icons.thumbnail(entry) || icons.icon(entry, size.icon > 24) : null
	);

	function formatDate(ms: number | null): string {
		if (ms === null) return '';
		return new Date(ms).toLocaleString('it-IT', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div
	class="cell"
	class:selected
	class:cut
	class:horizontal={size.horizontal}
	class:full={size.full}
	class:drop-target={dropTarget}
	style:width={size.full ? '100%' : `${size.width}px`}
	style:height="{size.height}px"
	style:--side="{size.icon}px"
	role="gridcell"
	tabindex="-1"
	data-category={entry.kind === 'dir' ? 'dir' : categoryFor(entry.name)}
	data-folder={entry.kind === 'dir' ? entry.path : undefined}
	data-item={entry.path}
	title={entry.name}
	onmousedown={(e) => ondrag && onDrag(e, () => ondrag(entry))}
	onmouseenter={(e) => {
		// An item already selected stays as is: passing over it must not undo a multiple selection.
		if (singleClick && !selected) hoverSelect(e, () => onselect(entry, {}));
	}}
	onmouseleave={cancelHoverSelect}
	ondblclick={() => !singleClick && onactivate(entry)}
	onclick={(e) => {
		cancelHoverSelect();
		onselect(entry, { ctrl: e.ctrlKey, shift: e.shiftKey });
		// With Ctrl or Shift you are selecting, not opening.
		if (singleClick && !e.ctrlKey && !e.shiftKey) onactivate(entry);
	}}
	oncontextmenu={(e) => {
		e.preventDefault();
		e.stopPropagation();
		oncontext?.(entry, e);
	}}
	onkeydown={(e) => {
		if (e.key === 'Enter') onactivate(entry);
		else if (e.key === ' ') onselect(entry, { ctrl: e.ctrlKey, shift: e.shiftKey });
	}}
>
	<div class="frame">
		{#if drawn}
			<span class="drawing">{@html folderIcon(drawn, color ?? 'var(--folder, var(--accent))')}</span>
		{:else if image}
			<img src={image} alt="" draggable="false" />
		{:else}
			<span class="glyph">{@html iconFor(entry)}</span>
		{/if}
	</div>
	<div class="texts">
		<span class="name"
			>{#if color && entry.kind !== 'dir'}<span class="color-label" style:background={color} aria-hidden="true"
				></span>{/if}{name}</span
		>
		{#if size.details}
			<span class="info">{describeType(entry)}</span>
			{#if entry.kind !== 'dir' || entry.free !== undefined}
				<span class="info">
					{entry.free !== undefined ? t('{0} liberi', [formatBytes(entry.free)]) : formatBytes(entry.size)}
				</span>
			{/if}
		{/if}
	</div>
	{#if size.full}
		<span class="date">{formatDate(entry.modified)}</span>
	{/if}
</div>

<style>
	.cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px 6px;
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		cursor: default;
		user-select: none;
	}
	.cell:hover {
		background: var(--row-hover);
	}
	.cell.selected {
		background: var(--accent-soft);
	}
	.cell.cut {
		opacity: 0.45;
	}
	.cell.drop-target {
		background: color-mix(in srgb, var(--current) 14%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}

	/* Fixed-side frame: thumbnails have different proportions and without
	   a common frame the grid loses its alignment. */
	.frame {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: var(--side);
		height: var(--side);
		overflow: hidden;
	}
	.frame img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.drawing {
		display: flex;
		width: 100%;
		height: 100%;
	}
	/* The built-in glyph is drawn at 16 pixels: it grows with the side. */
	.glyph {
		display: flex;
		color: var(--text-dim);
	}
	.glyph :global(svg) {
		width: calc(var(--side) * 0.85);
		height: calc(var(--side) * 0.85);
	}

	.texts {
		display: flex;
		flex-direction: column;
		min-width: 0;
		width: 100%;
	}

	/* Two lines at most: long names must not break out of the cell. */
	.name {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: calc(12px * var(--text-scale, 1));
		line-height: 1.35;
		text-align: center;
		overflow-wrap: anywhere;
	}
	.info,
	.date {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		font-size: calc(11px * var(--text-scale, 1));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Icon next to the name: small icons, list, tiles, content. */
	.cell.horizontal {
		flex-direction: row;
		gap: 10px;
		padding: 4px 8px;
	}
	.horizontal .name {
		-webkit-line-clamp: 1;
		line-clamp: 1;
		text-align: left;
		font-size: calc(13px * var(--text-scale, 1));
	}
	.cell.full {
		border-bottom: 1px solid var(--border);
		border-radius: 0;
	}
	.full .date {
		margin-left: auto;
		flex-shrink: 0;
	}

	.cell[data-category='dir'] .glyph {
		color: var(--folder, var(--accent));
	}
	/* Colour label on a file: a dot before the name. */
	.color-label {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 6px;
		border-radius: 50%;
		vertical-align: middle;
	}
</style>
