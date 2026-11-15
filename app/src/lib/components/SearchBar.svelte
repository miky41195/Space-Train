<script lang="ts">
	import { t } from '../i18n';
	import Icon from './Icon.svelte';
	import { DATES, SIZES, TYPES, filtersActive, type Filters } from '../filters';
	let {
		query,
		results,
		total,
		position,
		onchange,
		onclose,
		subfolders = false,
		content = false,
		searching = false,
		ontogglesubfolders = undefined,
		ontogglecontent = undefined,
		filters = undefined,
		onfilters = undefined,
		onsave = undefined
	}: {
		query: string;
		results: number;
		total: number;
		/** 1-based index of the selected item among the results. */
		position: number;
		onchange: (q: string) => void;
		onclose: () => void;
		/** Searches all subfolders instead of filtering the open one. */
		subfolders?: boolean;
		/** Also searches the text inside files (only with subfolders). */
		content?: boolean;
		/** A subfolder search is still running. */
		searching?: boolean;
		ontogglesubfolders?: () => void;
		ontogglecontent?: () => void;
		/** Smart folder filters (subfolder search only). */
		filters?: Filters;
		onfilters?: (f: Filters) => void;
		/** Keeps this search as a stop in the sidebar. */
		onsave?: () => void;
	} = $props();

	let filtersOpen = $state(false);
	let hasFilters = $derived(!!filters && filtersActive(filters));

	/** Picks one value of a filter group; picking it again clears it. */
	function pick<K extends keyof Filters>(key: K, value: Filters[K]) {
		if (!filters || !onfilters) return;
		onfilters({ ...filters, [key]: filters[key] === value ? null : value });
	}

	let field = $state<HTMLInputElement | null>(null);

	$effect(() => {
		field?.focus();
		field?.select();
	});
</script>

<div class="search">
	<span class="magnifier" aria-hidden="true">⌕</span>

	<input
		bind:this={field}
		type="text"
		value={query}
		placeholder={subfolders ? t('Cerca in tutte le sottocartelle…') : t('Filtra in questa cartella…')}
		spellcheck="false"
		autocomplete="off"
		aria-label={t('Filtra i file in questa cartella')}
		oninput={(e) => onchange(e.currentTarget.value)}
	/>

	<span class="counter" class:empty={query !== '' && results === 0}>
		{#if subfolders && searching} {t('{0} trovati, ricerca in corso…', [results])} {:else if subfolders && query !== ''}
			{results === 0 ? t('nessun risultato') : t('{0} trovati', [results])}
		{:else if query === ''} {t('{0} elementi', [total])} {:else if results === 0} {t('nessun risultato')} {:else} {t('{0} di {1}', [position, results])} {/if}
	</span>

	{#if ontogglesubfolders}
		<button
			class="option"
			class:on={subfolders}
			aria-pressed={subfolders}
			onclick={ontogglesubfolders}
			title={t('Cerca anche nelle sottocartelle')}>{t('Sottocartelle')}</button
		>
	{/if}
	{#if ontogglecontent && subfolders}
		<button
			class="option"
			class:on={content}
			aria-pressed={content}
			onclick={ontogglecontent}
			title={t('Cerca il testo anche dentro i file')}>{t('Contenuto')}</button
		>
	{/if}
	{#if onfilters && subfolders}
		<button
			class="option"
			class:on={filtersOpen || hasFilters}
			aria-pressed={filtersOpen}
			aria-expanded={filtersOpen}
			onclick={() => (filtersOpen = !filtersOpen)}
			title={t('Filtra per tipo, peso e data')}>{t('Filtri')}</button
		>
	{/if}
	{#if onsave && subfolders && (query.trim() !== '' || hasFilters)}
		<button class="option" onclick={onsave} title={t('Tieni questa ricerca nella barra laterale')}>{t('Salva ricerca')}</button>
	{/if}
	<button onclick={onclose} aria-label={t('Chiudi la ricerca')}><Icon name="close" /></button>
</div>
{#if filters && onfilters && subfolders && (filtersOpen || hasFilters)}
	<div class="filters" role="group" aria-label={t('Filtri')}>
		<span class="filter-group">
			<span class="filter-name">{t('Tipo')}</span>
			{#each TYPES as t (t.id)}
				<button class="option" class:on={filters.type === t.id} aria-pressed={filters.type === t.id} onclick={() => pick('type', t.id)}
					>{t.name}</button
				>
			{/each}
		</span>
		<span class="filter-group">
			<span class="filter-name">{t('Peso')}</span>
			{#each SIZES as p (p.id)}
				<button class="option" class:on={filters.size === p.id} aria-pressed={filters.size === p.id} onclick={() => pick('size', p.id)}
					>{p.name}</button
				>
			{/each}
		</span>
		<span class="filter-group">
			<span class="filter-name">{t('Modificati')}</span>
			{#each DATES as d (d.id)}
				<button class="option" class:on={filters.date === d.id} aria-pressed={filters.date === d.id} onclick={() => pick('date', d.id)}
					>{d.name}</button
				>
			{/each}
		</span>
	</div>
{/if}

<style>
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 36px;
		padding: 0 12px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.magnifier {
		color: var(--text-dim);
		font-size: calc(15px * var(--text-scale, 1));
	}
	input {
		flex: 1;
		min-width: 0;
		height: 24px;
		border: none;
		background: transparent;
		color: var(--text);
		font: inherit;
		outline: none;
	}
	input::placeholder {
		color: var(--text-dim);
	}
	.counter {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.counter.empty {
		color: var(--error-text);
	}
	button {
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
	.option {
		width: auto;
		padding: 0 8px;
		font: inherit;
		font-size: calc(12px * var(--text-scale, 1));
		border: 1px solid var(--border);
	}
	.option.on {
		border-color: var(--current);
		color: var(--current);
	}
	/* Smart folder filters: a second row of chip groups under the search field. */
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
		padding: 6px 12px 8px 36px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.filter-group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
	}
	.filter-name {
		margin-right: 4px;
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(10px * var(--text-scale, 1));
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	.filters .option {
		height: 24px;
	}
</style>
