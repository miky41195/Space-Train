<script lang="ts">
	import { t } from '../i18n';
	import type { Entry } from '../ipc';
	import { iconFor, categoryFor, folderIcon, drawnFolder, type FolderStyle } from '../icons';
	import type { IconsStore } from '../stores/icons.svelte';
	import type { Columns } from '../stores/settings.svelte';
	import { columnsGrid, describeType } from '../columns';
	import { formatMedia, MEDIA_COLUMNS } from '../media';
	import type { GitMark, MediaProps } from '../ipc';

	const GIT_LETTER: Record<GitMark, { letter: string; label: string }> = {
		modified: { letter: 'M', label: t('Modificato') },
		new: { letter: 'N', label: t('Nuovo') },
		conflict: { letter: '!', label: t('In conflitto') },
		ignored: { letter: '', label: t('Ignorato da git') }
	};
	import { formatBytes, withoutExtension, extension } from '../locations';
	import { growthText, type Growth } from '../growth';
	import type { ChangeMark } from '../folder-changes';
	import { onDrag, hoverSelect, cancelHoverSelect } from '../drag';

	let {
		entry,
		selected = false,
		positions = undefined,
		renaming = false,
		cut = false,
		icons = undefined,
		columns = { size: true, date: true, type: false },
		hideExtension = false,
		folder = undefined,
		color = undefined,
		share = undefined,
		growth = undefined,
		change = undefined,
		height = 32,
		dropTarget = false,
		folderSize = undefined,
		oncompute = undefined,
		onactivate,
		singleClick = false,
		folderStyle = 'windows',
		onselect,
		oncontext = undefined,
		onrename = undefined,
		oncancelrename = undefined,
		ondrag = undefined,
		media = undefined,
		git = undefined,
		hasRules = false
	}: {
		entry: Entry;
		selected?: boolean;
		/** Indices of the characters found by the search, to highlight. */
		positions?: number[];
		/** The row shows a text field in place of the name. */
		renaming?: boolean;
		/** The item is on the clipboard in cut mode: it is shown faded. */
		cut?: boolean;
		/** Cache of icons and thumbnails. Absent = the built-in glyphs are used. */
		icons?: IconsStore;
		columns?: Columns;
		/** Shows the name without extension, like Explorer with the default option. */
		hideExtension?: boolean;
		/** Folder to show next to the name: search results, Recycle Bin. */
		folder?: string;
		/** Colour the user picked for this folder. */
		color?: string;
		/** Space view: this item's share of the largest one (0–1), drawn as a bar. */
		share?: number;
		/** Space view: how much the folder grew since an earlier day. */
		growth?: Growth;
		/** New or modified since the last visit of the folder. */
		change?: ChangeMark;
		/** Row height in pixels: must match the list's. */
		height?: number;
		/** A drag is passing over this folder. */
		dropTarget?: boolean;
		/** Computed size of a folder, or `computing` while it is being read. */
		folderSize?: number | 'computing';
		/** Present when folder sizes are computed on request. */
		oncompute?: (e: Entry) => void;
		onactivate: (e: Entry) => void;
		/** Opens with one click, like the Explorer option; double click is no longer needed. */
		singleClick?: boolean;
		/** How the theme draws folders. */
		folderStyle?: FolderStyle;
		onselect: (e: Entry, modifiers: { ctrl?: boolean; shift?: boolean }) => void;
		oncontext?: (e: Entry, event: MouseEvent) => void;
		onrename?: (e: Entry, newName: string) => void;
		oncancelrename?: () => void;
		/** The pointer started dragging this item. */
		ondrag?: (e: Entry) => void;
		/** Photo/video/music details for the media columns. */
		media?: MediaProps | null;
		/** How git sees this item, inside a repository. */
		git?: GitMark;
		/** The folder has automatic rules. */
		hasRules?: boolean;
	} = $props();

	let hidden = $derived(hideExtension && entry.kind !== 'dir' && extension(entry.name) !== '');
	let shownName = $derived(hidden ? withoutExtension(entry.name) : entry.name);

	// Read-only access to the cache: no request starts from here. FileList
	// takes care of it once scrolling stops. The thumbnail wins over the type icon;
	// until neither is there the built-in glyph stays, so the row
	// never flashes empty while scrolling.
	let drawn = $derived(drawnFolder(entry, color, folderStyle));
	let image = $derived(
		drawn ? null : icons ? icons.thumbnail(entry) || icons.icon(entry) : null
	);

	let field = $state<HTMLInputElement | null>(null);

	/**
	 * Confirmation can arrive twice for the same field: pressing Enter
	 * unmounts the field, and the unmount in turn fires `blur`.
	 * Without this guard the second call repeats the rename and fails
	 * against the file the first one just created.
	 */
	let submitted = false;

	$effect(() => {
		if (!renaming || !field) return;
		submitted = false;
		field.focus();
		// Selects the name but not the extension: renaming usually
		// means changing the name, not the file type.
		const dot = shownName.lastIndexOf('.');
		const end = entry.kind === 'dir' || dot <= 0 || hidden ? shownName.length : dot;
		field.setSelectionRange(0, end);
	});

	function confirmRename() {
		if (submitted) return;
		submitted = true;

		const typed = field?.value ?? '';
		// With the extension hidden only the name is edited: the extension
		// goes back on the end by itself, and the file type never changes by mistake.
		const value = hidden && typed.trim() !== '' ? `${typed}.${extension(entry.name)}` : typed;
		if (value === entry.name || typed.trim() === '') oncancelrename?.();
		else onrename?.(entry, value);
	}

	function cancelRename() {
		if (submitted) return;
		submitted = true;
		oncancelrename?.();
	}

	/** Content search: the found line split around the match (code points, as Rust counts them). */
	let snippet = $derived.by(() => {
		const s = entry.snippet;
		if (!s) return null;
		const c = Array.from(s.text);
		return {
			before: c.slice(0, s.at).join(''),
			found: c.slice(s.at, s.at + s.len).join(''),
			after: c.slice(s.at + s.len).join('')
		};
	});

	/**
	 * Splits the name into highlighted and plain spans. Without positions it returns
	 * a single span: rendering stays identical to before the search.
	 */
	function segments(name: string, pos: number[] | undefined) {
		if (!pos || pos.length === 0) return [{ text: name, strong: false }];

		const set = new Set(pos);
		const out: Array<{ text: string; strong: boolean }> = [];

		for (let i = 0; i < name.length; i++) {
			const strong = set.has(i);
			const last = out[out.length - 1];
			if (last && last.strong === strong) last.text += name[i];
			else out.push({ text: name[i], strong });
		}

		return out;
	}

	let spans = $derived(segments(shownName, positions));

	function sizeText(e: Entry): string {
		if (e.free !== undefined) return t('{0} liberi', [formatBytes(e.free)]);
		if (e.kind === 'dir') return '—';
		return formatBytes(e.size);
	}

	/** Used share of the drive, for the small bar under the name. */
	let used = $derived(
		entry.total && entry.free !== undefined ? 1 - entry.free / entry.total : null
	);

	function formatDate(e: Entry): string {
		if (e.modified === null) return '';
		return new Date(e.modified).toLocaleString('it-IT', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div
	class="row"
	class:selected
	class:cut
	class:drop-target={dropTarget}
	class:ignored={git === 'ignored'}
	role="row"
	tabindex="-1"
	style:grid-template-columns={columnsGrid(columns)}
	style:height="{height}px"
	data-category={entry.kind === 'dir' ? 'dir' : categoryFor(entry.name)}
	data-folder={entry.kind === 'dir' ? entry.path : undefined}
	data-item={entry.path}
	onmousedown={(e) => {
		// The row can be grabbed from any point; the rename field cannot,
		// there you select text.
		if (ondrag && !(e.target as HTMLElement).closest('input')) onDrag(e, () => ondrag(entry));
	}}
	onmouseenter={(e) => {
		// An item already selected stays as is: passing over it must not undo a multiple selection.
		if (singleClick && !selected && !renaming) hoverSelect(e, () => onselect(entry, {}));
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
	<span class="icon">
		{#if git && git !== 'ignored'}<span class="git {git}" title={GIT_LETTER[git].label} aria-label={GIT_LETTER[git].label}
				>{GIT_LETTER[git].letter}</span
			>{/if}
		{#if drawn}
			<span class="drawn-folder" class:colored-folder={color}>{@html folderIcon(drawn, color ?? 'var(--folder, var(--accent))')}</span>
		{:else if image}
			<img src={image} alt="" draggable="false" />
		{:else}
			{@html iconFor(entry)}
		{/if}
	</span>
	{#if renaming}
		<input
			class="rename-field"
			bind:this={field}
			type="text"
			value={shownName}
			spellcheck="false"
			autocomplete="off"
			aria-label={t('Nuovo nome')}
			onclick={(e) => e.stopPropagation()}
			ondblclick={(e) => e.stopPropagation()}
			onblur={confirmRename}
			onkeydown={(e) => {
				e.stopPropagation();
				if (e.key === 'Enter') confirmRename();
				else if (e.key === 'Escape') cancelRename();
			}}
		/>
	{:else}
		<span class="name-block" class:with-snippet={snippet}>
			{#if color && entry.kind !== 'dir'}<span class="color-label" style:background={color} aria-hidden="true"></span>{/if}
			<span class="name" title={entry.name}
				>{#each spans as t, i (i)}{#if t.strong}<mark>{t.text}</mark>{:else}{t.text}{/if}{/each}</span
			>
			{#if growth}<span
					class="growth"
					class:down={growth.delta < 0}
					class:flat={growthText(growth.delta, formatBytes) === '='}
					title={t('Dal {0}', [new Date(growth.since).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })])}
					>{growthText(growth.delta, formatBytes)}</span
				>{/if}
			{#if change}<span class="change {change}">{change === 'new' ? t('nuovo') : t('modificato')}</span>{/if}
			{#if hasRules}<span class="has-rules" title={t('Ha regole automatiche')} aria-label={t('Ha regole automatiche')}
					><svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"
						><path d="M13 6.5A5 5 0 0 0 3.6 5M3 9.5A5 5 0 0 0 12.4 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path
							d="M3.4 2.4 3.6 5l2.6-.3M12.6 13.6l-.2-2.6-2.6.3"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					></span
				>{/if}
			{#if folder}<span class="folder-hint" title={folder}>{folder}</span>{/if}
			{#if snippet && entry.snippet}
				<span class="snippet" title={entry.snippet.text}
					><span class="line-num">{entry.snippet.line}</span>{snippet.before}<mark>{snippet.found}</mark
					>{snippet.after}{#if entry.snippet.more > 0}<span class="more"
							>+{entry.snippet.more} {entry.snippet.more === 1 ? t('altra riga') : t('altre righe')}</span
						>{/if}</span
				>
			{/if}
			{#if share !== undefined}
				<span class="fill share"
					><span style:width="{Math.max(1, Math.round(share * 100))}%"
						>{#if growth && growth.share > 0 && growthText(growth.delta, formatBytes) !== '='}<em style:width="{Math.round(growth.share * 100)}%"></em>{/if}</span
					></span
				>
			{/if}
			{#if used !== null}
				<span class="fill" class:full={used > 0.9}
					><span style:width="{Math.round(used * 100)}%"></span></span
				>
			{/if}
		</span>
	{/if}
	{#if columns.type}<span class="type">{describeType(entry)}</span>{/if}
	{#if columns.size}
		<span class="size">
			{#if entry.kind === 'dir' && entry.free === undefined && folderSize === 'computing'}
				<span class="computing" role="img" aria-label={t('Calcolo della dimensione')}></span>
			{:else if entry.kind === 'dir' && entry.free === undefined && typeof folderSize === 'number'}
				{formatBytes(folderSize)}
			{:else if entry.kind === 'dir' && entry.free === undefined && oncompute}
				<button
					class="compute"
					onclick={(e) => {
						e.stopPropagation();
						oncompute(entry);
					}}
					ondblclick={(e) => e.stopPropagation()}>{t('Calcola')}</button
				>
			{:else}
				{sizeText(entry)}
			{/if}
		</span>
	{/if}
	{#if columns.date}<span class="date">{formatDate(entry)}</span>{/if}
	{#each columns.media ?? [] as k (k)}
		<span class="media" class:right={MEDIA_COLUMNS.find((m) => m.key === k)?.right}>{formatMedia(k, media)}</span>
	{/each}
</div>

<style>
	.row {
		display: grid;
		align-items: center;
		height: 32px;
		padding: 0 12px;
		gap: 8px;
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		cursor: default;
		color: var(--text);
		font-size: calc(13px * var(--text-scale, 1));
		user-select: none;
	}
	.row:hover {
		background: var(--row-hover);
	}
	.row.cut {
		opacity: 0.45;
	}
	.row.selected {
		background: var(--accent-soft);
	}
	/* Folder about to be dropped on: the rail lights up. */
	.row.drop-target {
		background: color-mix(in srgb, var(--current) 14%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	.name-block {
		display: flex;
		align-items: baseline;
		gap: 10px;
		min-width: 0;
		position: relative;
	}
	.has-rules {
		display: inline-flex;
		flex: none;
		align-self: center;
		color: var(--text-dim);
	}
	/* Colour label on a file: a dot before the name, as on the sidebar stops. */
	.color-label {
		flex: none;
		align-self: center;
		width: 8px;
		height: 8px;
		margin-right: -4px;
		border-radius: 50%;
	}
	/* Content search: the found line goes on a second line under the name. */
	.name-block.with-snippet {
		flex-wrap: wrap;
		row-gap: 0;
	}
	.snippet {
		flex-basis: 100%;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
		font-size: calc(11.5px * var(--text-scale, 1));
	}
	.line-num,
	.more {
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.line-num {
		margin-right: 6px;
	}
	.more {
		margin-left: 8px;
	}
	/* The folder hint gives way first: the name is what the row is about. */
	.folder-hint {
		flex-shrink: 100;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
		font-size: calc(11px * var(--text-scale, 1));
	}
	.type {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
	}
	.fill {
		position: absolute;
		left: 0;
		right: 40%;
		bottom: -6px;
		height: 3px;
		border-radius: 2px;
		background: var(--border);
		overflow: hidden;
	}
	.fill span {
		display: block;
		height: 100%;
		background: var(--current);
	}
	/* Space view: the same bar as the drives, in the current's plasma-to-cyan. */
	.fill.share span {
		background: linear-gradient(90deg, var(--plasma, var(--accent)), var(--current));
	}
	/* The part that is new since the baseline, at the bar's end. */
	.fill.share span {
		display: flex;
		justify-content: flex-end;
	}
	.fill.share em {
		display: block;
		height: 100%;
		background: var(--signal, #ffb454);
	}
	.growth {
		order: 9;
		margin-left: auto;
		flex: none;
		font-family: var(--font-ui);
		font-size: calc(12px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		color: var(--signal, #ffb454);
	}
	.change {
		flex: none;
		margin-left: 8px;
		padding: 1px 6px;
		border-radius: 4px;
		font: 600 calc(9.5px * var(--text-scale, 1)) var(--font-display);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.change.new {
		background: color-mix(in srgb, var(--online, #22c55e) 16%, transparent);
		color: var(--online, #22c55e);
	}
	.change.modified {
		background: color-mix(in srgb, var(--signal, #ffb454) 16%, transparent);
		color: var(--signal, #ffb454);
	}
	.growth.down {
		color: var(--online, #22c55e);
	}
	.growth.flat {
		color: var(--text-dim);
	}
	.fill.full span {
		background: #ff5f6e;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rename-field {
		width: 100%;
		height: 24px;
		padding: 0 6px;
		border: 1px solid var(--accent);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		outline: none;
	}

	/* Only colour and weight: no size change, the row stays 32px. */
	.name :global(mark),
	.snippet mark {
		background: transparent;
		color: var(--accent);
		font-weight: 600;
	}
	/* Secondary text: the body font, not the heading one (which the
	   theme can change). Tabular figures so the columns stay in line. */
	/* Git mark: a signal letter hung on the icon's left edge, so the grid stays put. */
	.icon {
		position: relative;
	}
	.git {
		position: absolute;
		left: -11px;
		top: 50%;
		transform: translateY(-50%);
		width: 10px;
		text-align: center;
		font-family: var(--font-display);
		font-size: calc(10.5px * var(--text-scale, 1));
		font-weight: 600;
		line-height: 1;
	}
	.git.modified {
		color: var(--signal, #ffb454);
	}
	.git.new {
		color: var(--online, #22c55e);
	}
	.git.conflict {
		color: var(--lamp-red, #ff5f6e);
	}
	.row.ignored > :not(.media) {
		opacity: 0.45;
	}
	.media {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
	}
	.media.right {
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.size,
	.date {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	/* The folder is being weighed: a stretch of rail with the current running. */
	.computing {
		display: inline-block;
		width: 30px;
		height: 3px;
		border-radius: 2px;
		vertical-align: middle;
		background: linear-gradient(90deg, var(--rail-metal), var(--current), var(--rail-metal)) 0 0 / 200% 100%;
	}
	@media (prefers-reduced-motion: no-preference) {
		.computing {
			animation: weigh 1.4s linear infinite;
		}
	}
	@keyframes weigh {
		to {
			background-position: -200% 0;
		}
	}
	.compute {
		padding: 0;
		border: none;
		background: none;
		color: var(--current);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: default;
	}
	.compute:hover {
		color: var(--text);
	}
	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-dim);
	}
	.drawn-folder {
		display: flex;
		width: 20px;
		height: 18px;
	}
	.icon img {
		width: 20px;
		height: 20px;
		object-fit: contain;
		border-radius: 3px;
	}

	/* The category colours the icon: visual distinction without a second glyph. */
	.row[data-category='dir'] .icon {
		color: var(--folder, var(--accent));
	}
	.row[data-category='code'] .icon,
	.row[data-category='markup'] .icon,
	.row[data-category='style'] .icon {
		color: #6ee7b7;
	}
	.row[data-category='image'] .icon,
	.row[data-category='video'] .icon {
		color: #f0abfc;
	}
	.row[data-category='audio'] .icon {
		color: #fcd34d;
	}
	.row[data-category='archive'] .icon {
		color: #fca5a5;
	}
	.row[data-category='exec'] .icon {
		color: #93c5fd;
	}
	.row[data-category='data'] .icon,
	.row[data-category='config'] .icon {
		color: #a5b4fc;
	}
</style>
