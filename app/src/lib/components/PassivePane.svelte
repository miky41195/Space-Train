<script lang="ts">
	import { t } from '../i18n';
	import type { Entry } from '../ipc';
	import type { Tab } from '../stores/tabs.svelte';
	import type { IconsStore } from '../stores/icons.svelte';
	import type { Columns } from '../stores/settings.svelte';
	import type { FolderStyle } from '../icons';
	import { isVirtual } from '../locations';
	import FileList from './FileList.svelte';
	import PaneHeader from './PaneHeader.svelte';

	/**
	 * The other half of the dual pane: the same list, shown passive. Any
	 * click makes it the active pane first, then acts as usual.
	 */
	let {
		tab,
		rowHeight,
		columns = undefined,
		hideExtension = false,
		colorOf = undefined,
		icons = undefined,
		folderStyle = 'windows',
		singleClick = false,
		dropTarget = null,
		onactivatepane,
		onopen,
		onselect
	}: {
		tab: Tab;
		rowHeight: number;
		columns?: Columns;
		hideExtension?: boolean;
		colorOf?: (e: Entry) => string | undefined;
		icons?: IconsStore;
		folderStyle?: FolderStyle;
		singleClick?: boolean;
		dropTarget?: string | null;
		onactivatepane: () => void;
		onopen: (e: Entry) => void;
		onselect: (e: Entry, modifiers: { ctrl?: boolean; shift?: boolean }) => void;
	} = $props();

	let selection = $derived(new Set(tab.selection));
</script>

<!-- A drop anywhere on the passive pane lands in its folder. -->
<section
	class="pane passive"
	aria-label={t('Altro pannello')}
	data-folder={isVirtual(tab.path) ? undefined : tab.path}
	class:drop-target={dropTarget === tab.path}
	onpointerdowncapture={onactivatepane}
>
	<PaneHeader path={tab.path} />
	<FileList
		entries={tab.results ?? tab.entries}
		contentKey={`${tab.id}:${tab.path}:${tab.results !== null}`}
		{columns}
		{hideExtension}
		{colorOf}
		{rowHeight}
		{dropTarget}
		{selection}
		sort={tab.sort}
		{icons}
		{folderStyle}
		{singleClick}
		onactivate={onopen}
		{onselect}
	/>
</section>

<style>
	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}
	.pane > :global(:last-child) {
		flex: 1;
		min-height: 0;
	}
	.drop-target {
		background: color-mix(in srgb, var(--current) 14%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}
</style>
