<script lang="ts">
	import { placeMenu, type MenuAction, type MenuItem } from '../menu';
	import Icon from './Icon.svelte';

	let {
		items,
		x,
		y,
		onpick,
		onclose
	}: {
		items: MenuItem[];
		x: number;
		y: number;
		onpick: (action: MenuAction) => void;
		onclose: () => void;
	} = $props();

	let panel = $state<HTMLDivElement | null>(null);
	let size = $state({ width: 0, height: 0 });

	// The real sizes are known only after mounting: estimating them
	// beforehand goes wrong as soon as the number of items changes.
	$effect(() => {
		if (!panel) return;
		items;
		size = { width: panel.offsetWidth, height: panel.offsetHeight };
	});

	/**
	 * Derived from x and y, not copied: opening a menu while another is
	 * still open does not remount the component, and a copy
	 * would leave the panel at the position of the previous click.
	 */
	let position = $derived(
		placeMenu(x, y, size, {
			width: window.innerWidth,
			height: window.innerHeight
		})
	);

	// Focus goes to the first item at every opening, not only the first one.
	$effect(() => {
		x;
		y;
		panel?.querySelector('button')?.focus();
	});

	function onKeys(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
			return;
		}

		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

		e.preventDefault();
		const buttons = Array.from(panel?.querySelectorAll('button') ?? []);
		const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
		const step = e.key === 'ArrowDown' ? 1 : -1;
		// Cyclic: from the bottom it wraps to the top, as in every menu.
		const next = (current + step + buttons.length) % buttons.length;
		buttons[next]?.focus();
	}
</script>

<svelte:window onkeydown={onKeys} />

<!-- The veil catches the click outside and the wheel: a menu left
     hanging while the list scrolls underneath is worse than no menu. -->
<div
	class="veil"
	role="presentation"
	onclick={onclose}
	oncontextmenu={(e) => {
		e.preventDefault();
		onclose();
	}}
	onwheel={onclose}
></div>

<div
	class="menu"
	bind:this={panel}
	role="menu"
	tabindex="-1"
	style:left="{position.x}px"
	style:top="{position.y}px"
>
	{#each items as v (v.action)}
		{#if v.separator}<div class="separator"></div>{/if}
		{#if v.section}<div class="section">{v.section}</div>{/if}
		{#if v.palette}
			<div class="palette-item">
				<span class="palette-title">{v.label}</span>
				<div class="palette" role="group" aria-label={v.label}>
					{#each v.palette as c (c.action)}
						<button
							class="swatch"
							class:active={c.active}
							class:empty={c.color === null && !c.custom}
							class:rainbow={c.custom}
							style:--sample={c.color ?? 'transparent'}
							role="menuitemradio"
							aria-checked={c.active}
							aria-label={c.name}
							title={c.name}
							onclick={() => onpick(c.action)}
						></button>
					{/each}
				</div>
			</div>
		{:else}
		<button
			role={v.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
			aria-checked={v.checked}
			aria-label={v.accessibleName}
			class:danger={v.danger}
			onclick={() => onpick(v.action)}
		>
			<span
				>{#if v.checked !== undefined}<span class="check" aria-hidden="true"
						>{#if v.checked}<Icon name="check" />{/if}</span
					>{/if}{#if v.glyph}<i class="glyph" class:terminal={v.glyph === 'terminal'} aria-hidden="true"></i>{/if}{v.label}</span
			>
			{#if v.shortcut}<kbd>{v.shortcut}</kbd>{/if}
		</button>
		{/if}
	{/each}
</div>

<style>
	.veil {
		position: fixed;
		inset: 0;
		z-index: 20;
	}

	/* A menu taller than the window scrolls instead of leaving the screen. */
	.menu {
		max-height: calc(100vh - 16px);
		overflow-y: auto;
		position: fixed;
		z-index: 21;
		/* As wide as the longest item even near the right edge: without it,
		   the menu shrinks to the space left and the items wrap inside
		   28px-high rows. `placeMenu` then moves it left. */
		width: max-content;
		min-width: 200px;
		max-width: calc(100vw - 16px);
		padding: 4px;
		background: var(--hull);
		border: 1px solid var(--border);
		/* A menu is tall: as a pill it would become a capsule. */
		border-radius: min(var(--radius-sm), 14px);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
	}

	button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		width: 100%;
		height: 28px;
		padding: 0 10px;
		border: none;
		border-radius: min(var(--radius-sm), 6px);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		white-space: nowrap;
		cursor: default;
	}

	button:hover,
	button:focus-visible {
		background: var(--accent-soft);
		outline: none;
	}

	.danger:hover,
	.danger:focus-visible {
		background: rgba(196, 43, 28, 0.22);
		color: var(--error-text);
	}

	kbd {
		color: var(--text-dim);
		font: inherit;
		font-size: calc(11px * var(--text-scale, 1));
	}

	.check {
		display: inline-flex;
		vertical-align: -1px;
		width: 18px;
		color: var(--current);
	}

	/* Amber: opens the terminal; cyan: runs in the background. */
	.glyph {
		display: inline-block;
		width: 10px;
		height: 10px;
		margin-right: 8px;
		border: 1.5px solid var(--current);
		border-radius: 3px;
	}
	.glyph.terminal {
		border-color: var(--signal, #ffb454);
	}

	.section {
		padding: 6px 10px 2px;
		color: var(--text-dim);
		font-size: calc(11px * var(--text-scale, 1));
		letter-spacing: 0.04em;
	}

	.palette-item {
		padding: 4px 10px 6px;
	}
	.palette-title {
		display: block;
		margin-bottom: 6px;
		color: var(--text-dim);
		font-size: calc(11px * var(--text-scale, 1));
	}
	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	/* The colour swatches: round, the lit border marks the current one. */
	.swatch {
		width: 20px;
		height: 20px;
		padding: 0;
		border-radius: 50%;
		background: var(--sample);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
	}
	.swatch:hover,
	.swatch:focus-visible {
		background: var(--sample);
		transform: scale(1.12);
	}
	.swatch.active {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--text);
	}
	/* «Personalizzato»: the chosen colour, ringed by the rainbow. */
	.swatch.rainbow {
		box-shadow:
			inset 0 0 0 3px var(--surface),
			0 0 0 2px transparent;
		background:
			linear-gradient(var(--sample), var(--sample)) padding-box,
			conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #8b5cf6, #ec4899, #ef4444) border-box;
		border: 3px solid transparent;
	}
	/* «Nessuno»: an empty, struck-through circle. */
	.swatch.empty {
		background: linear-gradient(
			135deg,
			transparent 45%,
			var(--text-dim) 45%,
			var(--text-dim) 55%,
			transparent 55%
		);
		box-shadow: inset 0 0 0 1px var(--text-dim);
	}

	.separator {
		height: 1px;
		margin: 4px 6px;
		background: var(--border);
	}
</style>
