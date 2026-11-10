<script lang="ts">
	import type { Entry } from '../ipc';
	import type { Tab } from '../stores/tabs.svelte';
	import type { IconeStore } from '../stores/icone.svelte';
	import type { Colonne } from '../stores/impostazioni.svelte';
	import type { FolderStyle } from '../icons';
	import { eVirtuale } from '../posizioni';
	import FileList from './FileList.svelte';
	import TestataPannello from './TestataPannello.svelte';

	/**
	 * The other half of the dual pane: the same list, shown passive. Any
	 * click makes it the active pane first, then acts as usual.
	 */
	let {
		tab,
		altezzaRiga,
		colonne = undefined,
		nascondiEstensione = false,
		coloreDi = undefined,
		icone = undefined,
		folderStyle = 'windows',
		unClic = false,
		bersaglio = null,
		onattiva,
		onapri,
		onseleziona
	}: {
		tab: Tab;
		altezzaRiga: number;
		colonne?: Colonne;
		nascondiEstensione?: boolean;
		coloreDi?: (e: Entry) => string | undefined;
		icone?: IconeStore;
		folderStyle?: FolderStyle;
		unClic?: boolean;
		bersaglio?: string | null;
		onattiva: () => void;
		onapri: (e: Entry) => void;
		onseleziona: (e: Entry, modificatori: { ctrl?: boolean; shift?: boolean }) => void;
	} = $props();

	let selezione = $derived(new Set(tab.selection));
</script>

<!-- A drop anywhere on the passive pane lands in its folder. -->
<section
	class="pannello passivo"
	aria-label="Altro pannello"
	data-cartella={eVirtuale(tab.path) ? undefined : tab.path}
	class:bersaglio={bersaglio === tab.path}
	onpointerdowncapture={onattiva}
>
	<TestataPannello path={tab.path} />
	<FileList
		entries={tab.risultati ?? tab.entries}
		chiave={`${tab.id}:${tab.path}:${tab.risultati !== null}`}
		{colonne}
		{nascondiEstensione}
		{coloreDi}
		{altezzaRiga}
		{bersaglio}
		selection={selezione}
		sort={tab.sort}
		{icone}
		{folderStyle}
		{unClic}
		onactivate={onapri}
		onselect={onseleziona}
	/>
</section>

<style>
	.pannello {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}
	.pannello > :global(:last-child) {
		flex: 1;
		min-height: 0;
	}
	.bersaglio {
		background: color-mix(in srgb, var(--current) 14%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}
</style>
