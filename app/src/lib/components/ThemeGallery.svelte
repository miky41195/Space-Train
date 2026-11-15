<script lang="ts">
	import { t } from '../i18n';
	import { ACCENTS, CATEGORIES, THEMES, THEME_ACCENT, CUSTOM_ACCENT, categoryOf, type AccentId, type CategoryId, type Theme } from '../themes';
	import type { MenuAction } from '../menu';
	import Icon from './Icon.svelte';

	let {
		theme,
		personal = [],
		accent,
		accentColor,
		x,
		y,
		onpick,
		onclose
	}: {
		/** Id of the theme in use. */
		theme: string;
		personal?: readonly Theme[];
		accent: AccentId;
		/** The colour chosen for the custom accent. */
		accentColor: string;
		/** Right edge and top edge, in pixels: the gallery opens under the button. */
		x: number;
		y: number;
		onpick: (action: MenuAction) => void;
		onclose: () => void;
	} = $props();

	const all = $derived([...THEMES, ...personal]);
	const counts = $derived(
		Object.fromEntries(CATEGORIES.map((c) => [c.id, all.filter((t) => categoryOf(t) === c.id).length]))
	);
	// It opens on the category of the theme in use.
	let category = $state<CategoryId>('dark');
	$effect.pre(() => {
		const current = all.find((t) => t.id === theme);
		if (current) category = categoryOf(current);
	});
	const shown = $derived(all.filter((t) => categoryOf(t) === category));

	let panel = $state<HTMLDivElement | null>(null);
	$effect(() => {
		panel?.querySelector<HTMLButtonElement>('.card.active, .card')?.focus();
	});

	/** The four colours that recognise a theme at a glance. */
	function preview(t: Theme): string {
		const v = t.variables;
		return `--a: ${v['--void']}; --b: ${v['--hull']}; --c: ${v['--plasma']}; --d: ${v['--current']}; --e: ${v['--text-dim']}`;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="veil" role="presentation" onclick={onclose} oncontextmenu={(e) => (e.preventDefault(), onclose())}></div>

<div
	class="gallery"
	role="dialog"
	aria-label={t('Temi')}
	bind:this={panel}
	style:right="{x}px"
	style:top="{y}px"
>
	<div class="categories" role="tablist" aria-label={t('Categorie di temi')} aria-orientation="vertical">
		{#each CATEGORIES as c (c.id)}
			<button
				role="tab"
				aria-selected={category === c.id}
				class:on={category === c.id}
				onclick={() => (category = c.id)}
			>
				<span>{c.name}</span><span class="count">{counts[c.id]}</span>
			</button>
		{/each}
	</div>

	<div class="themes" role="tabpanel">
		{#if shown.length === 0}
			<p class="empty">{t('Non hai ancora temi tuoi. Creane uno con «Crea o modifica un tema…».')}</p>
		{/if}
		{#each shown as t (t.id)}
			<button
				class="card"
				class:active={t.id === theme}
				aria-pressed={t.id === theme}
				style={preview(t)}
				onclick={() => onpick(`theme:${t.id}` as MenuAction)}
			>
				<span class="mini" aria-hidden="true">
					<span class="sky"></span>
					<span class="body"><i class="fake-name"></i><i class="sel"></i><i class="row"></i></span>
				</span>
				<span class="name">
					<span>{t.name}</span>
					{#if t.id === theme}<span class="check-mark"><Icon name="check" /></span>{/if}
				</span>
			</button>
		{/each}
	</div>

	<div class="footer">
		<span class="label">{t('Colore d’evidenziazione')}</span>
		<div class="swatches" role="group" aria-label={t('Colore d’evidenziazione')}>
			{#each ACCENTS as a (a.id)}
				<button
					class="swatch"
					class:active={accent === a.id}
					class:empty={a.id === THEME_ACCENT}
					class:rainbow={a.id === CUSTOM_ACCENT}
					style:--sample={a.id === CUSTOM_ACCENT ? accentColor : (a.color ?? 'transparent')}
					aria-pressed={accent === a.id}
					aria-label={a.name}
					title={a.name}
					onclick={() => onpick(`accent:${a.id}` as MenuAction)}
				></button>
			{/each}
		</div>
		<button class="create" onclick={() => onpick('themeEditor')}>{t('Crea o modifica un tema…')}</button>
	</div>
</div>

<style>
	.veil {
		position: fixed;
		inset: 0;
		z-index: 20;
	}

	.gallery {
		position: fixed;
		z-index: 21;
		width: min(560px, calc(100vw - 24px));
		max-height: min(440px, calc(100vh - 80px));
		display: grid;
		grid-template-columns: 136px minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) auto;
		background: var(--hull);
		border: 1px solid var(--border);
		border-radius: min(var(--radius), 14px);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
		overflow: hidden;
	}

	.categories {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		border-right: 1px solid var(--border);
	}
	.categories button {
		display: flex;
		align-items: center;
		height: 30px;
		padding: 0 10px;
		border: none;
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		text-align: left;
		cursor: default;
	}
	.categories button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.categories button.on {
		background: var(--accent-soft);
		color: var(--text);
	}
	.count {
		margin-left: auto;
		font-family: var(--font-display);
		font-size: calc(11px * var(--title-scale, var(--text-scale, 1)));
		font-variant-numeric: tabular-nums;
	}

	.themes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
		gap: 8px;
		align-content: start;
		padding: 10px;
		overflow-y: auto;
	}
	.empty {
		grid-column: 1 / -1;
		margin: 8px 4px;
		color: var(--text-dim);
	}

	/* Every theme is a miniature window in its colours: sky, panel,
	   a name, a selected row and the current. */
	.card {
		display: flex;
		flex-direction: column;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		text-align: left;
		overflow: hidden;
		cursor: default;
	}
	.card:hover {
		border-color: var(--text-dim);
	}
	.card.active {
		border-color: var(--current);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	.mini {
		display: grid;
		grid-template-rows: 14px 1fr;
		height: 52px;
	}
	.sky {
		background: var(--a);
		border-bottom: 2px solid var(--d);
	}
	.body {
		display: grid;
		align-content: center;
		gap: 4px;
		padding: 0 8px;
		background: var(--b);
	}
	.body i {
		display: block;
		height: 4px;
		border-radius: 2px;
	}
	.fake-name {
		width: 55%;
		background: var(--e);
		opacity: 0.6;
	}
	.sel {
		width: 80%;
		background: var(--c);
	}
	.row {
		width: 40%;
		background: var(--e);
		opacity: 0.35;
	}
	.name {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 6px 8px;
		font-size: calc(12px * var(--text-scale, 1));
		white-space: nowrap;
	}
	.name > span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.check-mark {
		display: inline-flex;
		color: var(--current);
	}

	.footer {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		padding: 10px 12px;
		border-top: 1px solid var(--border);
	}
	.label {
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.swatch {
		width: 18px;
		height: 18px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: var(--sample);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
		cursor: default;
	}
	.swatch:hover {
		transform: scale(1.12);
	}
	.swatch.active {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--text);
	}
	.swatch.empty {
		background: linear-gradient(135deg, transparent 45%, var(--text-dim) 45% 55%, transparent 55%);
		box-shadow: inset 0 0 0 1px var(--text-dim);
	}
	.swatch.rainbow {
		background:
			radial-gradient(circle, var(--sample) 0 4px, transparent 4.5px),
			conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #8b5cf6, #ec4899, #ef4444);
	}
	.create {
		margin-left: auto;
		height: 28px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	.create:hover {
		background: var(--row-hover);
	}
</style>
