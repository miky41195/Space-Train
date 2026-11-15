<script lang="ts">
	import type { Backend, Drive, KnownFolder, Peer, FriendsStatus, LanStatus } from '../ipc';
	import type { TabsStore } from '../stores/tabs.svelte';
	import Icon from './Icon.svelte';
	import { THIS_PC, NETWORK, TRASH, LAN, FRIENDS, formatBytes, samePath, nameOf, isInside } from '../locations';
	import { ON_LINUX } from '../platform';
	import type { ColorId } from '../stores/colors.svelte';
	import type { ServerConfig } from '../ipc';
	import { SERVER } from '../locations';
	import type { SavedSearch } from '../stores/searches.svelte';

	let {
		store,
		backend,
		dropTarget = null,
		refresh = 0,
		colorOf = undefined,
		lan = null,
		peers = [],
		ontogglevisible = undefined,
		onaddresses = undefined,
		friends = null,
		onopenfriends = undefined,
		quickAccess = [],
		onquickaccessmenu = undefined,
		onitemmenu = undefined,
		labels = [],
		openLabel = null,
		onlabel = undefined,
		onrenamelabel = undefined,
		servers = undefined,
		onaddserver = undefined,
		oneditserver = undefined,
		searches = [],
		onsearch = undefined,
		onremovesearch = undefined
	}: {
		store: TabsStore;
		backend: Backend;
		/** Folder a drag is passing over. */
		dropTarget?: string | null;
		/** Changes when the space on the drives may have changed. */
		refresh?: number;
		/** Colour the user gave a folder. */
		colorOf?: (path: string) => string | undefined;
		/** Local network status of this PC, if the service answers. */
		lan?: LanStatus | null;
		/** The other PCs with Space Train found on the local network. */
		peers?: Peer[];
		ontogglevisible?: () => void;
		/** The new list of PCs added by address. */
		onaddresses?: (addresses: string[]) => void;
		/** Friends on Space Train, if the service answers. */
		friends?: FriendsStatus | null;
		/** Opens the panel with the personal code and the full list. */
		onopenfriends?: () => void;
		/** The folders pinned by the user, in the chosen order. */
		quickAccess?: string[];
		/** Right-click on a Quick access item. */
		onquickaccessmenu?: (path: string, event: MouseEvent) => void;
		/** Right-click on any other stop that opens a location. */
		onitemmenu?: (path: string, kind: 'place' | 'folder' | 'drive', event: MouseEvent) => void;
		/** Colour labels in use: one stop each, listing every item that carries it. */
		labels?: Array<{ id: ColorId; name: string; hex: string; count: number }>;
		/** Name of the label whose items the active tab shows. */
		openLabel?: string | null;
		onlabel?: (id: ColorId) => void;
		/** Blank name restores the colour's own name. */
		onrenamelabel?: (id: ColorId, name: string) => void;
		/** Remote servers the user added; absent = no «Server» group. */
		servers?: ServerConfig[];
		onaddserver?: () => void;
		/** Right-click on a server stop: change or remove it. */
		oneditserver?: (s: ServerConfig) => void;
		/** Smart folders: ready-made ones (no folder) first, then the saved ones. */
		searches?: SavedSearch[];
		onsearch?: (r: SavedSearch) => void;
		onremovesearch?: (name: string) => void;
	} = $props();

	let drives = $state<Drive[]>([]);
	let folders = $state<KnownFolder[]>([]);

	$effect(() => {
		backend.knownFolders().then((f) => (folders = f));
	});

	// Free space is read again every time the page asks: after
	// an operation, on coming back to the foreground and once a minute.
	$effect(() => {
		refresh;
		backend.drives().then((d) => (drives = d));
	});

	/** The field to add a PC by address, open or closed. */
	let adding = $state(false);
	/** Colour label whose name is being edited in place. */
	let renamingLabel = $state<ColorId | null>(null);
	let newAddress = $state('');

	function addAddress() {
		const t = newAddress.trim();
		const already = lan?.addresses ?? [];
		if (t && !already.some((i) => i.toLowerCase() === t.toLowerCase())) onaddresses?.([...already, t]);
		newAddress = '';
		adding = false;
	}

	function removeAddress(i: string) {
		onaddresses?.((lan?.addresses ?? []).filter((x) => x !== i));
	}

	/** A PC added by address answers: it is among those found with that IP. */
	function reached(address: string): boolean {
		return peers.some((p) => p.ip === address.trim().split(':')[0]);
	}

	function menuOn(path: string, kind: 'place' | 'folder' | 'drive') {
		return (e: MouseEvent) => {
			if (!onitemmenu) return;
			e.preventDefault();
			onitemmenu(path, kind, e);
		};
	}

	function go(path: string) {
		if (store.activeId !== null) store.navigate(store.activeId, path);
	}

	/** The folder shared by another PC, seen as a virtual location. */
	function peerPath(p: Peer): string {
		return LAN + '\\' + p.id;
	}

	let confirmed = $derived(friends?.friends.filter((a) => a.status === 'confirmed') ?? []);
	let pending = $derived(friends?.friends.filter((a) => a.status === 'received').length ?? 0);

	function isWithin(path: string): boolean {
		const t = store.activeTab?.path;
		return !!t && isInside(t, path);
	}

	function isCurrent(path: string): boolean {
		return store.activeTab ? samePath(store.activeTab.path, path) : false;
	}

	// «Rete» lists Windows network shares: there is nothing to show elsewhere.
	const locations = [
		{ path: THIS_PC, label: 'Questo PC' },
		...(ON_LINUX ? [] : [{ path: NETWORK, label: 'Rete' }]),
		{ path: TRASH, label: 'Cestino' }
	];
</script>

<nav class="sidebar">
	<div class="group">
		<div class="title">Posizioni</div>
		{#each locations as p (p.path)}
			<button
				class="item"
				class:current={isCurrent(p.path)}
				class:drop-target={dropTarget === p.path}
				data-folder={p.path === TRASH ? TRASH : undefined}
				onclick={() => go(p.path)}
				oncontextmenu={menuOn(p.path, 'place')}>{p.label}</button
			>
		{/each}
	</div>

	{#if lan}
		<div class="group">
			<div class="title title-row">
				<span>Rete locale</span>
				<!-- Switch: while it is off this PC does not announce itself and does not
				     answer anyone. -->
				<button
					class="switch"
					class:on={lan.visible}
					role="switch"
					aria-checked={lan.visible}
					aria-label="Rendi visibile questo PC in rete locale"
					title={lan.visible ? 'Visibile agli altri PC con Space Train' : 'Invisibile in rete locale'}
					onclick={ontogglevisible}
				><span></span></button>
			</div>
			<div class="lan-status">
				{lan.visible ? `Visibile come ${lan.name}` : 'Questo PC è invisibile'}
				{#if lan.visible && lan.shared}
					<br />Condivide «{nameOf(lan.shared)}»
				{/if}
			</div>
			{#each peers as p (p.id)}
				<!-- A PC found on the network answers: its stop is online. -->
				<button
					class="item online"
					class:current={store.activeTab?.path.toLowerCase().startsWith(peerPath(p).toLowerCase())}
					onclick={() => go(peerPath(p))}
					oncontextmenu={menuOn(peerPath(p), 'place')}
					title={p.shared ? `${p.name} — condivide «${p.shared}»` : `${p.name} — nessuna cartella condivisa`}
				>
					{p.name}
				</button>
			{:else}
				<div class="lan-empty">
					{lan.visible ? 'Nessun altro PC con Space Train trovato.' : 'Accendi per trovare gli altri PC.'}
				</div>
			{/each}
			<!-- Distant PCs, reached by address: for example through a VPN
			     like Tailscale, which does not carry announcements to the whole network. -->
			{#each lan.addresses ?? [] as i (i)}
				<div class="address" title={reached(i) ? 'Raggiunto' : 'In attesa di risposta: Space Train acceso e visibile anche dall’altra parte?'}>
					<span class="status-dot" class:on={reached(i)}></span>
					<span class="address-text">{i}</span>
					<button class="remove" aria-label="Togli {i}" onclick={() => removeAddress(i)}
						><svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"
							><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg
						></button
					>
				</div>
			{/each}
			{#if adding}
				<form class="new-address" onsubmit={(e) => { e.preventDefault(); addAddress(); }}>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						bind:value={newAddress}
						placeholder="IP o nome, es. 100.64.0.2"
						aria-label="Indirizzo del PC da aggiungere"
						autofocus
						onkeydown={(e) => e.key === 'Escape' && (adding = false)}
						onblur={() => !newAddress.trim() && (adding = false)}
					/>
				</form>
			{:else}
				<button class="item add-pc" onclick={() => (adding = true)}>Aggiungi PC per indirizzo</button>
			{/if}
		</div>
	{/if}

	{#if servers}
		<div class="group">
			<div class="title">Server</div>
			{#each servers as s (s.id)}
				{@const path = `${SERVER}\\${s.id}`}
				<button
					class="item"
					class:current={store.activeTab?.path === path || (store.activeTab?.path.startsWith(path + '\\') ?? false)}
					title={`${s.protocol.toUpperCase()} · ${s.user ? s.user + '@' : ''}${s.host}`}
					onclick={() => go(path)}
					oncontextmenu={(e) => {
						e.preventDefault();
						oneditserver?.(s);
					}}
				>
					{s.name}
				</button>
			{/each}
			{#if onaddserver}
				<button class="item add-pc" onclick={onaddserver}>Aggiungi server</button>
			{/if}
		</div>
	{/if}

	{#if friends}
		<div class="group">
			<div class="title">Amici</div>
			{#each confirmed as a (a.id)}
				<!-- Online or not is told by the colour of the stop's node. -->
				<button
					class="item"
					class:online={a.online}
					class:current={isWithin(FRIENDS + '\\' + a.id)}
					onclick={() => go(FRIENDS + '\\' + a.id)}
					oncontextmenu={menuOn(FRIENDS + '\\' + a.id, 'place')}
					title={a.online ? `${a.name} — in linea` : `${a.name} — non in linea`}
				>
					{a.name}
				</button>
			{/each}
			{#if pending > 0}
				<button class="item requests" onclick={onopenfriends}>
					{pending === 1 ? '1 richiesta d’amicizia' : `${pending} richieste d’amicizia`}
				</button>
			{/if}
			<button class="item add-pc" onclick={onopenfriends}>
				{confirmed.length === 0 ? 'Aggiungi amici' : 'Gestisci amici'}
			</button>
		</div>
	{/if}

	<div class="group">
		<div class="title">Cartelle</div>
		{#each folders as f (f.path)}
			<button
				class="item"
				class:current={isCurrent(f.path)}
				class:drop-target={dropTarget === f.path}
				data-folder={f.path}
				onclick={() => go(f.path)}
				oncontextmenu={menuOn(f.path, 'folder')}
			>
				{#if colorOf?.(f.path)}<span class="dot" style:background={colorOf(f.path)}></span>{/if}
				{f.label}
			</button>
		{/each}
		<!-- The folders pinned by the user sit next to the Windows ones,
		     in the chosen order; right-click reorders or removes them. -->
		{#each quickAccess as p (p)}
			<button
				class="item pinned"
				class:current={isCurrent(p)}
				class:drop-target={dropTarget === p}
				data-folder={p}
				title={p}
				onclick={() => go(p)}
				oncontextmenu={(e) => {
					e.preventDefault();
					onquickaccessmenu?.(p, e);
				}}
			>
				<span class="pin" aria-hidden="true"><Icon name="pin" side={11} /></span>
				{#if colorOf?.(p)}<span class="dot" style:background={colorOf(p)}></span>{/if}
				{nameOf(p)}
			</button>
		{/each}
	</div>

	{#if onsearch && searches.length > 0}
		<div class="group">
			<div class="title">Ricerche</div>
			{#each searches as r (r.name)}
				<div class="saved-search">
					<button class="item" title={r.folder ? `${r.name}` : `${r.name}, nella cartella aperta`} onclick={() => onsearch(r)}>
						{r.name}
					</button>
					{#if r.folder && onremovesearch}
						<button class="remove" aria-label={`Togli la ricerca «${r.name}»`} onclick={() => onremovesearch(r.name)}
							><Icon name="close" side={10} /></button
						>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if labels.length > 0}
		<div class="group">
			<div class="title">Etichette</div>
			{#each labels as e (e.id)}
				{#if renamingLabel === e.id}
					<label class="item rename-label">
						<span class="dot" style:background={e.hex}></span>
						<input
							value={e.name}
							maxlength="40"
							aria-label={`Nome dell'etichetta ${e.name}`}
							{@attach (el: HTMLInputElement) => {
								el.focus();
								el.select();
							}}
							onkeydown={(ev) => {
								if (ev.key === 'Enter') ev.currentTarget.blur();
								else if (ev.key === 'Escape') {
									ev.currentTarget.value = e.name;
									ev.currentTarget.blur();
								}
							}}
							onblur={(ev) => {
								const name = ev.currentTarget.value;
								renamingLabel = null;
								if (name !== e.name) onrenamelabel?.(e.id, name);
							}}
						/>
					</label>
				{:else}
					<button
						class="item"
						class:current={openLabel === e.name}
						title={onrenamelabel ? 'Clic destro per rinominare' : undefined}
						onclick={() => onlabel?.(e.id)}
						oncontextmenu={(ev) => {
							if (!onrenamelabel) return;
							ev.preventDefault();
							renamingLabel = e.id;
						}}
					>
						<span class="dot" style:background={e.hex}></span>
						{e.name}
						<span class="count">{e.count}</span>
					</button>
				{/if}
			{/each}
		</div>
	{/if}

	<div class="group">
		<div class="title">Unità</div>
		{#each drives as d (d.path)}
			{@const used = d.total && d.free !== null ? 1 - d.free / d.total : null}
			<button
				class="item drive"
				class:current={isCurrent(d.path)}
				class:drop-target={dropTarget === d.path}
				data-folder={d.path}
				onclick={() => go(d.path)}
				oncontextmenu={menuOn(d.path, 'drive')}
				title={d.free !== null && d.total ? `${formatBytes(d.free)} liberi di ${formatBytes(d.total)}` : d.label}
			>
				<span class="label">{d.label}</span>
				{#if used !== null && d.free !== null}
					<span class="fill" class:full={used > 0.9}>
						<span style:width="{Math.round(used * 100)}%"></span>
					</span>
					<span class="free">{formatBytes(d.free)} liberi</span>
				{/if}
			</button>
		{/each}
	</div>
</nav>

<style>
	.sidebar {
		width: 212px;
		flex-shrink: 0;
		padding: 12px 8px 12px 30px;
		background: var(--surface-glass);
		overflow-y: auto;
	}
	.address {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 0;
		font-size: calc(12px * var(--text-scale, 1));
		color: var(--text-dim);
	}
	.address-text {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-dim);
		opacity: 0.5;
	}
	/* Actions are not stops: the rail passes beside them with no node. */
	.item.requests,
	.item.add-pc {
		background-image: none;
	}
	.requests {
		color: var(--accent);
		font-size: calc(12px * var(--text-scale, 1));
	}
	/* A PC or a friend reachable right now. */
	.item.online {
		--node: var(--online);
	}
	.status-dot.on {
		background: var(--online);
		opacity: 1;
	}
	.remove {
		border: none;
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
		padding: 0 4px;
	}
	.remove:hover {
		color: var(--text);
	}
	/* Actions stand apart from stops by their tone: smaller and
	   dimmer, and they light up only on hover. */
	.item.add-pc {
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.item.add-pc:hover {
		color: var(--text);
	}
	.rename-label {
		display: flex;
		align-items: center;
	}
	.new-address input,
	.rename-label input {
		width: 100%;
		box-sizing: border-box;
		height: 26px;
		padding: 0 8px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--text-scale, 1));
		outline: none;
	}
	.group + .group {
		margin-top: 16px;
	}
	.title {
		padding: 0 0 6px;
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(11px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
	/* Every location is a stop on the vertical rail, which runs under the
	   bar 13 px from the edge (see `.places` in +page.svelte): the round
	   node, with bezel and centre, sits over the two wires. Drawn as
	   background, so the hover colour does not cover it. */
	.item {
		display: block;
		width: calc(100% + 22px);
		margin-left: -22px;
		min-height: 30px;
		padding: 0 12px 0 22px;
		border: none;
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		--node: var(--rail-metal);
		--node-core: var(--surface);
		background-color: transparent;
		background-image: radial-gradient(
			circle,
			var(--node-core) 0 2.2px,
			var(--node) 2.7px 3.6px,
			transparent 4.1px
		);
		background-size: 9px 9px;
		background-position: 3px 50%;
		background-repeat: no-repeat;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: default;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item:hover {
		background-color: var(--row-hover);
	}
	.title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	/* Slide switch, as in the Windows settings. */
	.switch {
		position: relative;
		width: 30px;
		height: 16px;
		padding: 0;
		border: 1px solid var(--text-dim);
		border-radius: 8px;
		background: transparent;
		cursor: default;
	}
	.switch span {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--text-dim);
		transition: transform 120ms ease;
	}
	.switch.on {
		border-color: var(--accent);
		background: var(--accent);
	}
	.switch.on span {
		background: #fff;
		transform: translateX(14px);
	}
	.lan-status,
	.lan-empty {
		padding: 0 0 6px;
		color: var(--text-dim);
		font-size: calc(11px * var(--text-scale, 1));
		line-height: 1.4;
	}
	.pin {
		display: inline-flex;
		vertical-align: -1px;
		margin-right: 8px;
		color: var(--text-dim);
	}
	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 8px;
		border-radius: 50%;
		vertical-align: middle;
	}
	/* Saved search: the remove button shows on hover, over the stop's right end. */
	.saved-search {
		position: relative;
	}
	.saved-search .item {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding-right: 28px;
	}
	.remove {
		position: absolute;
		top: 50%;
		right: 4px;
		width: 20px;
		height: 20px;
		transform: translateY(-50%);
		display: grid;
		place-items: center;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-dim);
		opacity: 0;
	}
	.saved-search:hover .remove,
	.remove:focus-visible {
		opacity: 1;
	}
	.remove:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	/* How many items carry the label: a timetable figure at the end of the stop. */
	.count {
		float: right;
		padding-left: 8px;
		color: var(--text-dim);
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		font-size: calc(11px * var(--text-scale, 1));
	}
	.item.drop-target {
		--node: var(--current);
		background-color: color-mix(in srgb, var(--current) 14%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	/* The stop you are at: the node lights up. */
	.item.current {
		--node: var(--current);
		--node-core: var(--current);
		background-color: var(--accent-soft);
		color: var(--text);
	}

	/* The drive shows how full it is: the bar turns red past 90%. */
	.drive {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		padding-top: 6px;
		padding-bottom: 6px;
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.fill {
		display: block;
		height: 4px;
		border-radius: 2px;
		background: var(--border);
		overflow: hidden;
	}
	.fill span {
		display: block;
		height: 100%;
		background: var(--current);
	}
	.fill.full span {
		background: #ff5f6e;
	}
	.free {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		font-size: calc(11px * var(--text-scale, 1));
	}
</style>
