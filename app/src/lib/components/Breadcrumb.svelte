<script lang="ts">
	import type { TabsStore } from '../stores/tabs.svelte';
	import { breadcrumbs, isVirtual, nameOf, locationName } from '../locations';

	const DUPLICATES_STOP = '::duplicates';

	let {
		store,
		editing = $bindable(false),
		onaddress = undefined,
		ongo = undefined,
		onsearch = undefined,
		dropTarget = null,
		branchInfo = null,
		lockIn = null,
		onlock = undefined,
		stop = null,
		onstop = undefined
	}: {
		store: TabsStore;
		/** The bar shows the text field instead of the stations. */
		editing?: boolean;
		/** The user typed an address and pressed Enter. */
		onaddress?: (text: string) => void;
		/** Click on a station: goes straight to that folder. */
		ongo?: (path: string) => void;
		/** The search button next to the address, as in Explorer. */
		onsearch?: () => void;
		/** Folder a drag is passing over. */
		dropTarget?: string | null;
		/** Git branch of the open folder, with commits to push and to pull. */
		branchInfo?: { branch: string; ahead: number; behind: number } | null;
		/** Time left before the open vault locks itself, as shown («4:52»). */
		lockIn?: string | null;
		/** Locks the open vault now. */
		onlock?: () => void;
		/** An extra last stop set by the page (disk cleanup), and how to leave it. */
		stop?: string | null;
		onstop?: () => void;
	} = $props();

	let branchTitle = $derived(
		branchInfo
			? [
					`Ramo git ${branchInfo.branch}`,
					branchInfo.ahead ? `${branchInfo.ahead} commit da inviare` : '',
					branchInfo.behind ? `${branchInfo.behind} da ricevere` : ''
				]
					.filter(Boolean)
					.join(', ')
			: ''
	);

	let currentPath = $derived(store.activeTab?.path ?? '');
	// Duplicates and folder comparison are one more stop after their folder: clicking the folder goes back to it.
	let extraStop = $derived(
		stop ?? (store.activeTab?.duplicates
			? 'Duplicati'
			: store.activeTab?.comparison
				? `Confronto con ${locationName(store.activeTab.comparison.other)}`
				: store.activeTab?.archive
					? [nameOf(store.activeTab.archive.file), ...store.activeTab.archive.inner.split('/').filter(Boolean)].join(' › ')
					: store.activeTab?.label
					? `Etichetta ${store.activeTab.label}`
					: store.activeTab?.space
						? 'Spazio'
						: null)
	);
	let stations = $derived(
		extraStop ? [...breadcrumbs(currentPath), { name: extraStop, path: DUPLICATES_STOP }] : breadcrumbs(currentPath)
	);
	let field = $state<HTMLInputElement | null>(null);
	let line = $state<HTMLDivElement | null>(null);

	// A path longer than the bar shows its end, like Explorer: the
	// station that matters is the one you are at, not the root.
	// Also when the width of the stations changes: a theme with another
	// font or a narrow window push the end out of view.
	$effect(() => {
		stations;
		const l = line;
		if (!l) return;
		const toEnd = () => (l.scrollLeft = l.scrollWidth);
		toEnd();
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(toEnd);
		observer.observe(l);
		for (const child of l.children) observer.observe(child);
		return () => observer.disconnect();
	});

	/** Virtual locations are written with their name, not with `::pc`. */
	let fieldText = $derived(isVirtual(currentPath) ? locationName(currentPath) : currentPath);

	$effect(() => {
		if (!editing || !field) return;
		field.focus();
		field.select();
	});

	function submitAddress() {
		const text = field?.value.trim() ?? '';
		editing = false;
		if (text !== '' && text !== fieldText) onaddress?.(text);
	}

	let id = $derived(store.activeId);

	function goTo(path: string) {
		if (id === null || path === DUPLICATES_STOP) return;
		if (path === currentPath) {
			if (stop) onstop?.();
			else if (store.activeTab?.space) void store.setSpace(id, false);
			else if (extraStop) void store.stopSearch(id);
			return;
		}
		if (ongo) ongo(path);
		else store.navigate(id, path);
	}
</script>

<div class="bar">
	<button
		class="nav"
		disabled={!store.activeTab || store.activeTab.historyIndex === 0}
		onclick={() => id !== null && store.goBack(id)}
		aria-label="Indietro"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button
	>
	<button
		class="nav"
		disabled={!store.activeTab || store.activeTab.historyIndex >= store.activeTab.history.length - 1}
		onclick={() => id !== null && store.goForward(id)}
		aria-label="Avanti"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button
	>
	<button class="nav" onclick={() => id !== null && store.goUp(id)} aria-label="Su"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button>

	<!-- Line map: every folder is a station, the last one is where you
	     are. The track joining them is the same route you took
	     to get here. -->
	{#if editing}
		<input
			class="address"
			bind:this={field}
			value={fieldText}
			spellcheck="false"
			autocomplete="off"
			aria-label="Indirizzo"
			onkeydown={(e) => {
				e.stopPropagation();
				if (e.key === 'Enter') submitAddress();
				else if (e.key === 'Escape') editing = false;
			}}
			onblur={() => (editing = false)}
		/>
	{:else}
		<!-- A click on the free space of the line opens the field, as in
		     Explorer: the stations stop the event because they lead elsewhere. -->
		<div
			class="line"
			bind:this={line}
			role="button"
			tabindex="-1"
			aria-label="Modifica l'indirizzo"
			onclick={() => (editing = true)}
			onkeydown={(e) => e.key === 'Enter' && (editing = true)}
		>
			{#each stations as s, i (s.path)}
				<button
					class="station"
					class:terminus={i === stations.length - 1}
					class:drop-target={dropTarget === s.path}
					data-folder={isVirtual(s.path) || s.path === DUPLICATES_STOP ? undefined : s.path}
					onclick={(e) => {
						e.stopPropagation();
						goTo(s.path);
					}}
					aria-current={i === stations.length - 1 ? 'location' : undefined}
				>
					<span class="node"></span>
					<span class="name">{s.name}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if lockIn && !editing}
		<button class="lock-in" onclick={onlock} title="La cassaforte si chiude da sola. Premi per chiuderla adesso."
			>si chiude fra {lockIn}</button
		>
	{/if}

	{#if branchInfo && !editing}
		<span class="branch" title={branchTitle}
			><span class="branch-node" aria-hidden="true"></span><span class="branch-name">{branchInfo.branch}</span
			>{#if branchInfo.ahead}<span class="count">↑{branchInfo.ahead}</span>{/if}{#if branchInfo.behind}<span class="count">↓{branchInfo.behind}</span>{/if}</span
		>
	{/if}

	{#if onsearch}
		<button class="search" onclick={onsearch} title="Cerca (Ctrl+F)">
			<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
				<circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
				<path d="M10 10l4 4" stroke="currentColor" stroke-width="1.4" />
			</svg>
			Cerca in {stations[stations.length - 1]?.name ?? ''}
		</button>
	{/if}
</div>

<style>
	/* Git branch: a route sign after the last stop, outlined in rail metal. */
	.branch {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 220px;
		height: 22px;
		padding: 0 9px;
		border: 1px solid var(--rail-metal, var(--border));
		border-radius: 11px;
		color: var(--text);
		font-family: var(--font-display);
		font-size: calc(11px * var(--text-scale, 1));
		letter-spacing: 0.04em;
		font-variant-numeric: tabular-nums;
	}
	.lock-in {
		flex: none;
		height: 22px;
		padding: 0 9px;
		border: 1px solid color-mix(in srgb, var(--signal, #ffb454) 45%, transparent);
		border-radius: 11px;
		background: transparent;
		color: var(--signal, #ffb454);
		font-family: var(--font-display);
		font-size: calc(11px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		cursor: default;
	}
	.lock-in:hover {
		background: var(--row-hover);
	}
	.branch-name {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.branch-node {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--online, #22c55e);
	}
	.count {
		flex: none;
		color: var(--text-dim);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 40px;
		padding: 0 12px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.nav {
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
		cursor: default;
	}
	.nav:hover:not(:disabled) {
		background: var(--row-hover);
		color: var(--text);
	}
	.nav:disabled {
		opacity: 0.3;
	}
	.line {
		display: flex;
		align-items: center;
		align-self: stretch;
		margin-left: 10px;
		overflow: hidden;
		flex: 1;
		cursor: text;
	}
	.address {
		flex: 1;
		height: 28px;
		margin-left: 10px;
		padding: 0 10px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		outline: none;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 220px;
		height: 28px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: var(--bg);
		color: var(--text-dim);
		font: inherit;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: text;
		flex-shrink: 0;
	}
	.search:hover {
		border-color: var(--text-dim);
	}
	.station.drop-target {
		color: var(--current);
	}

	.station {
		display: flex;
		align-items: center;
		gap: 6px;
		position: relative;
		padding: 4px 10px 4px 0;
		border: none;
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		white-space: nowrap;
		cursor: default;
	}

	/* The stretch of rail joining this station to the previous one. */
	.station + .station {
		padding-left: 18px;
	}
	.station + .station::before {
		content: '';
		position: absolute;
		left: 0;
		top: 50%;
		width: 14px;
		height: 1px;
		background: var(--rail-metal);
	}

	/* Round nodes, like the sidebar stops. */
	.node {
		width: 6px;
		height: 6px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--rail-metal);
	}

	.station:hover {
		color: var(--text);
	}
	.station:hover .node {
		background: var(--plasma);
	}

	/* Where you are now: lit node and name in full. */
	.terminus {
		color: var(--text);
	}
	.terminus .name {
		font-weight: 600;
	}
	.terminus .node {
		width: 8px;
		height: 8px;
		background: var(--current);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--current) 20%, transparent);
	}
	/* The last stretch, the one reaching where you are, carries the current. */
	.terminus.station::before {
		height: 2px;
		margin-top: -0.5px;
		background: linear-gradient(90deg, var(--plasma), var(--current));
	}
</style>
