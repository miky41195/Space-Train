<script lang="ts">
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import type { TabsStore } from '../stores/tabs.svelte';
	import { NEW_TAB, isVirtual, locationName } from '../locations';
	import { SYSTEM_ROOT } from '../platform';

	let {
		store,
		dropTarget = null,
		onwhatsnew = undefined,
		onsettings = undefined,
		area = null,
		onareas = undefined
	}: {
		store: TabsStore;
		/** Folder a drag is passing over. */
		dropTarget?: string | null;
		/** Reopens the release notes of the installed version. */
		onwhatsnew?: () => void;
		onsettings?: () => void;
		/** Name of the current workspace, if any. */
		area?: string | null;
		/** Opens the workspace menu under the button. */
		onareas?: (e: MouseEvent) => void;
	} = $props();

	const win = getCurrentWindow();

	/**
	 * With the window in the background the lamps go out, like the signals of
	 * an unpowered line. It is the detail that tells the active window apart
	 * when you have two open side by side.
	 */
	let active = $state(true);

	function tabName(path: string): string {
		return locationName(path);
	}
</script>

<svelte:window onfocus={() => (active = true)} onblur={() => (active = false)} />

<header class="titlebar" data-tauri-drag-region class:inactive={!active}>
	<span class="wordmark" data-tauri-drag-region>Space Train</span>

	<!-- The free space between the tabs, where the train passes, moves the
	     window like the wordmark: Tauri reacts only if the click lands
	     right on a marked element, so the tabs stay clickable. -->
	<!-- A folder dropped in the free space between the tabs opens in
	     a new tab: `data-new-tab` tells it apart from a tab. -->
	{#if onareas}
		<button
			class="area"
			class:empty={area === null}
			onclick={onareas}
			title="Aree di lavoro"
			aria-label={area === null ? 'Aree di lavoro' : `Area di lavoro: ${area}`}
			aria-haspopup="menu"
			><span class="area-name">{area ?? 'Aree'}</span><svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"
				><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" /></svg
			></button
		>
	{/if}

	<div class="tabs" data-tauri-drag-region data-new-tab class:drop-target={dropTarget === NEW_TAB}>
		{#each store.tabs as tab (tab.id)}
			<button
				class="tab"
				class:active={tab.id === store.activeId}
				class:drop-target={dropTarget === tab.path}
				data-folder={isVirtual(tab.path) ? undefined : tab.path}
				title={tab.path}
				onclick={() => store.setActive(tab.id)}
				onauxclick={(e) => {
					// Middle click: closes, as in browsers.
					if (e.button === 1) store.closeTab(tab.id);
				}}
			>
				<span class="label">{tabName(tab.path)}</span>
				<span
					class="close"
					role="button"
					tabindex="0"
					onclick={(e) => {
						e.stopPropagation();
						store.closeTab(tab.id);
					}}
					onkeydown={(e) => e.key === 'Enter' && store.closeTab(tab.id)}
					><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></span
				>
			</button>
		{/each}
		<button
			class="new"
			onclick={() => store.openTab(store.activeTab?.path ?? SYSTEM_ROOT)}
			title="Nuova scheda (Ctrl+T)"
			aria-label="Nuova scheda"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button
		>
	</div>

	{#if onwhatsnew || onsettings}
		<!-- Window tools, before the lamps and set apart by a wire:
		     they are buttons, not signals. -->
		<div class="tools">
			{#if onwhatsnew}
				<button class="tool" onclick={onwhatsnew} title="Novità di questa versione" aria-label="Novità di questa versione">
					<svg viewBox="0 0 16 16" aria-hidden="true"
						><path d="M2 6.5v3h2.2L10 13V3L4.2 6.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /><path
							d="M12.3 5.6a3.3 3.3 0 0 1 0 4.8M4.6 9.6l.9 4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
							stroke-linecap="round"
						/></svg
					>
				</button>
			{/if}
			{#if onsettings}
				<button class="tool" onclick={onsettings} title="Impostazioni" aria-label="Impostazioni">
					<svg viewBox="0 0 16 16" aria-hidden="true"
						><circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4" /><path
							d="M6.8 1.5h2.4l.4 1.8 1.2.7 1.8-.6 1.2 2.1-1.4 1.2v1.4l1.4 1.2-1.2 2.1-1.8-.6-1.2.7-.4 1.8H6.8l-.4-1.8-1.2-.7-1.8.6-1.2-2.1 1.4-1.2V7.3L2.2 6.1l1.2-2.1 1.8.6 1.2-.7z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
							stroke-linejoin="round"
						/></svg
					>
				</button>
			{/if}
		</div>
	{/if}

	<!-- On the right, as on Windows: close stays last, in the corner the
	     hand looks for. The position changes, not the treatment. -->
	<div class="lamps">
		<button class="lamp minimize" onclick={() => win.minimize()} aria-label="Riduci a icona">
			<svg viewBox="0 0 8 8" aria-hidden="true"
				><path d="M2 4 L6 4" stroke="currentColor" stroke-width="1.4" /></svg
			>
		</button>
		<button class="lamp maximize" onclick={() => win.toggleMaximize()} aria-label="Ingrandisci">
			<svg viewBox="0 0 8 8" aria-hidden="true"
				><path
					d="M2.5 5.5 L2.5 2.5 L5.5 2.5 M5.5 2.5 L2.5 5.5"
					stroke="currentColor"
					stroke-width="1.3"
					fill="none"
				/></svg
			>
		</button>
		<button class="lamp close" onclick={() => win.close()} aria-label="Chiudi">
			<svg viewBox="0 0 8 8" aria-hidden="true"
				><path d="M2 2 L6 6 M6 2 L2 6" stroke="currentColor" stroke-width="1.4" /></svg
			>
		</button>
	</div>
</header>

<style>
	/* Workspace switcher: a route sign before the tabs, outlined in rail metal. */
	.area {
		position: relative;
		z-index: 4;
		flex: none;
		align-self: center;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 160px;
		height: 24px;
		margin-right: 6px;
		padding: 0 8px;
		border: 1px solid var(--rail-metal, var(--border));
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font-family: var(--font-display);
		font-size: calc(11px * var(--text-scale, 1));
		font-weight: 600;
		letter-spacing: 0.06em;
		cursor: default;
	}
	.area.empty {
		color: var(--text-dim);
	}
	.area:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.area:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.area svg {
		flex: none;
		color: var(--text-dim);
	}
	.area-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Three layers, so the train passes between the background and the content:
	   the sky sits in a ::before under the train (z 3, in the main
	   line), wordmark, tabs and lamps above (z 4). */
	.titlebar {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 40px;
		padding-left: 8px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	/* The piece of sky the train crosses: space background and
	   the theme's drawing (stars, grid, bubbles…: `skyVariables`). */
	.titlebar::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--stars, none) 0 0 / var(--sky-size, 480px 40px) repeat, var(--bg);
		pointer-events: none;
	}
	.wordmark,
	.tabs,
	.lamps {
		position: relative;
		z-index: 4;
	}
	/* The wordmark in DIN, spaced like a station sign. Small:
	   it must give identity, not steal room from the tabs. */
	.wordmark {
		flex-shrink: 0;
		padding: 0 12px 0 4px;
		font-family: var(--font-display);
		font-size: calc(12px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--text-dim);
		user-select: none;
	}

	.tabs {
		display: flex;
		align-items: flex-end;
		align-self: stretch;
		gap: 4px;
		overflow-x: auto;
		scrollbar-width: none;
		flex: 1;
	}
	.tabs.drop-target {
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	/* The tabs rest on the header's bottom edge; the profile
	   (roof, trapezoid, arch, pill) comes from the theme: `shapeVariables`. */
	.tab {
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 180px;
		height: var(--tab-height, 32px);
		margin-bottom: var(--tab-gap, 0px);
		padding: var(--tab-margins, 0 8px 0 12px);
		border: none;
		border-radius: var(--tab-radius, var(--radius-sm) var(--radius-sm) 0 0);
		clip-path: var(--tab-shape, none);
		mask: var(--tab-mask, none);
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
		white-space: nowrap;
	}
	.tab:hover {
		background: var(--row-hover);
	}
	.tab.drop-target {
		box-shadow: inset 0 0 0 1px var(--current);
	}
	/* The open tab is a piece of the car's side: same surface as the
	   content, no frame. */
	.tab.active {
		background: var(--surface);
		color: var(--text);
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tab .close {
		display: inline-flex;
		opacity: 0.5;
		padding: 0 2px;
	}
	.tab .close:hover {
		opacity: 1;
	}
	.new {
		align-self: center;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text-dim);
		font-size: calc(16px * var(--text-scale, 1));
		cursor: default;
	}
	.new:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	/* Three signal lamps. The shape is the Mac traffic light's —
	   round pills — but the treatment is railway: dark bezel,
	   lit core, reflection at the top left. They give off no halo: the only
	   light spreading in the window is the current. */
	.lamps {
		display: flex;
		gap: 8px;
		padding: 0 14px 0 12px;
		flex-shrink: 0;
	}

	.tools {
		position: relative;
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 2px;
		padding-right: 10px;
		border-right: 1px solid var(--border);
		height: 16px;
		flex-shrink: 0;
	}
	.tool {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text-dim);
		cursor: default;
	}
	.tool svg {
		width: 16px;
		height: 16px;
	}
	.tool:hover {
		background: var(--row-hover);
		color: var(--text);
	}

	.lamp {
		position: relative;
		width: 13px;
		height: 13px;
		padding: 0;
		border: 1px solid rgba(0, 0, 0, 0.55);
		border-radius: 50%;
		background: var(--lamp-core);
		color: transparent;
		cursor: default;
		transition:
			box-shadow 160ms ease,
			color 160ms ease;
	}

	/* The reflection: it is what makes the circle read as a glass lamp
	   instead of a coloured dot. */
	.lamp::after {
		content: '';
		position: absolute;
		top: 1.5px;
		left: 2.5px;
		width: 4px;
		height: 3px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.45);
		pointer-events: none;
	}

	.lamp svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.close {
		--lamp-core: #ff5f6e;
		--lamp-halo: #ff5f6e;
	}
	.minimize {
		--lamp-core: var(--signal);
		--lamp-halo: var(--signal);
	}
	.maximize {
		--lamp-core: var(--current);
		--lamp-halo: var(--current);
	}

	/* The symbols appear when hovering the group, not the single lamp:
	   so it reads as a single button panel. */
	.lamps:hover .lamp {
		color: rgba(0, 0, 0, 0.62);
	}

	/* On hover the bezel lights up in the lamp's colour. */
	.lamp:hover,
	.lamp:focus-visible {
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--lamp-halo) 45%, transparent);
	}

	.lamp:active {
		filter: brightness(0.8);
	}

	/* Off, but not invisible: they stay clickable and recognisable. */
	.inactive .lamp {
		background: #4a4360;
	}
	.inactive .lamp::after {
		background: rgba(255, 255, 255, 0.18);
	}
	.inactive .wordmark {
		opacity: 0.55;
	}

	@media (prefers-reduced-motion: reduce) {
		.lamp {
			transition: none;
		}
	}
</style>
