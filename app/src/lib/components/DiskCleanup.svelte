<script lang="ts">
	import { t } from '../i18n';
	import { onDestroy, untrack } from 'svelte';
	import { tauriBackend, type CleanupCategory, type Program, type CleanupCandidate } from '../ipc';
	import { formatBytes } from '../locations';
	import { CATEGORIES, KIND_LABELS, shortPath, lastUse, plan, preselection, type Plan } from '../cleanup';

	let {
		drive,
		roots,
		onroots,
		onfree,
		onclose,
		describeError,
		onfound = undefined
	}: {
		/** Drive root, like `C:\`. */
		drive: string;
		/** Folders where projects are looked for. */
		roots: string[];
		onroots: (r: string[]) => void;
		/** Runs the deletions with the progress bar. */
		onfree: (p: Plan) => Promise<void>;
		onclose: () => void;
		/** Backend errors in words. */
		describeError: (e: unknown) => string;
		/** Total found once every category is weighed. */
		onfound?: (bytes: number) => void;
	} = $props();

	/** `undefined` while being weighed. */
	let found = $state<Partial<Record<CleanupCategory, CleanupCandidate[]>>>({});
	let chosen = $state<Partial<Record<CleanupCategory, string[]>>>({});
	let expanded = $state<Set<CleanupCategory>>(new Set());
	let programs = $state<Program[] | null>(null);
	let confirming = $state(false);
	let freeing = $state(false);
	let error = $state<string | null>(null);
	let round = 0;

	async function search(ids: CleanupCategory[]) {
		const mine = ++round;
		await tauriBackend.cleanupRound(mine).catch(() => {});
		for (const id of ids) {
			delete found[id];
			const c = CATEGORIES.find((c) => c.id === id)!;
			void tauriBackend
				.cleanupScan(id, drive, roots, mine)
				.then((items) => {
					if (!items || mine !== round) return;
					found[id] = items;
					chosen[id] = preselection(c.kind, items);
				})
				.catch(() => {
					if (mine === round) found[id] = [];
				});
		}
	}

	function searchPrograms() {
		programs = null;
		void tauriBackend
			.programsList(drive)
			.then((p) => (programs = p))
			.catch(() => (programs = []));
	}

	// Everything again when the drive changes; only projects when their folders do.
	let lastRoots = '';
	$effect(() => {
		void drive;
		lastRoots = JSON.stringify(roots);
		void search(CATEGORIES.map((c) => c.id));
		searchPrograms();
	});
	$effect(() => {
		const r = JSON.stringify(roots);
		if (r !== lastRoots) {
			lastRoots = r;
			void search(['projects']);
		}
	});
	onDestroy(() => void tauriBackend.cleanupRound(++round).catch(() => {}));

	const weight = (items: CleanupCandidate[] | undefined) => (items ?? []).reduce((n, v) => n + v.size, 0);
	let max = $derived(Math.max(1, ...CATEGORIES.map((c) => weight(found[c.id]))));
	let total = $derived(CATEGORIES.reduce((n, c) => n + weight(found[c.id]), 0));
	let toDo = $derived(plan(found, chosen));
	let listed = $derived([...toDo.permanent, ...toDo.trash, ...toDo.asAdmin]);
	let running = $derived(CATEGORIES.filter((c) => !found[c.id]).length);
	$effect(() => {
		if (running === 0) untrack(() => onfound?.(total));
	});

	function toggleCategory(id: CleanupCategory) {
		const items = found[id] ?? [];
		chosen[id] = (chosen[id]?.length ?? 0) === items.length ? [] : items.map((v) => v.path);
	}
	function toggleItem(id: CleanupCategory, path: string) {
		const s = chosen[id] ?? [];
		chosen[id] = s.includes(path) ? s.filter((p) => p !== path) : [...s, path];
	}
	function toggleOpen(id: CleanupCategory) {
		const n = new Set(expanded);
		if (!n.delete(id)) n.add(id);
		expanded = n;
	}

	async function addRoot() {
		const c = await tauriBackend.pickFolder(t('Cerca progetti in…'), roots[0] ?? null).catch(() => null);
		if (c && !roots.some((r) => r.toLowerCase() === c.toLowerCase())) onroots([...roots, c]);
	}

	async function free() {
		confirming = false;
		freeing = true;
		error = null;
		try {
			await onfree(toDo);
		} catch (e) {
			error = describeError(e);
		} finally {
			freeing = false;
			void search(CATEGORIES.map((c) => c.id));
		}
	}

	async function uninstall(p: Program) {
		error = null;
		try {
			await tauriBackend.programUninstall(p.id);
		} catch (e) {
			error = t('«{0}»: {1}', [p.name, describeError(e)]);
		}
	}

	let removing = $state<string | null>(null);
	async function removeLeftovers(p: Program) {
		error = null;
		removing = p.id;
		try {
			await tauriBackend.programRemoveLeftovers(p.id);
			searchPrograms();
			void search(['leftovers']);
		} catch (e) {
			error = t('«{0}»: {1}', [p.name, describeError(e)]);
		} finally {
			removing = null;
		}
	}

	let cancelButton = $state<HTMLButtonElement | null>(null);
	$effect(() => {
		if (confirming) cancelButton?.focus();
	});
</script>

<div class="cleanup">
	<div class="band" role="status">
		<span><b>{formatBytes(toDo.bytes)}</b> {t('scelti su')} <b>{formatBytes(total)}</b> {t('trovati')}</span>
		{#if running > 0}<span class="weighing">{t('pesando {0} {1}…', [running, running === 1 ? t('categoria') : t('categorie')])}</span>{/if}
		<span class="spacer"></span>
		<button onclick={onclose}>{t('Chiudi')}</button>
		<button class="primary" disabled={toDo.bytes === 0 || freeing} onclick={() => (confirming = true)}> {t('Libera {0}', [formatBytes(toDo.bytes)])} </button>
	</div>
	{#if error}<div class="error">{error}</div>{/if}

	<div class="list">
		{#each CATEGORIES as c (c.id)}
			{@const items = found[c.id]}
			{@const picked = chosen[c.id]?.length ?? 0}
			{@const isOpen = expanded.has(c.id)}
			<div class="cat" class:empty={items?.length === 0}>
				<input
					type="checkbox"
					aria-label={c.name}
					disabled={!items?.length}
					checked={!!items?.length && picked === items.length}
					indeterminate={picked > 0 && picked < (items?.length ?? 0)}
					onchange={() => toggleCategory(c.id)}
				/>
				<div class="text">
					<div class="name">
						{#if items?.length && c.kind !== 'trash'}
							<button class="open" aria-expanded={isOpen} onclick={() => toggleOpen(c.id)}>
								{c.name}<span class="arrow" class:down={isOpen}>▸</span>
							</button>
						{:else}
							<span>{c.name}</span>
						{/if}
						<span class="pill {c.kind}">{KIND_LABELS[c.kind]}</span>
					</div>
					<div class="detail">
						{#if !items}{t('pesando…')}{:else if c.kind === 'trash'}{items.length} {items.length === 1 ? 'elemento' : 'elementi'}{:else if items.length === 0}{t('niente da togliere')}{:else}{c.detail}{/if}
					</div>
					<div class="track"><span style:width="{(weight(items) / max) * 100}%"></span></div>
				</div>
				<span class="weight">{items ? formatBytes(weight(items)) : '—'}</span>
			</div>
			{#if c.id === 'projects'}
				<div class="roots">
					<span class="sig">{t('Cerca progetti in')}</span>
					{#each roots as r (r)}
						<span class="chip"
							>{r}<button aria-label={t('Togli {0}', [r])} onclick={() => onroots(roots.filter((x) => x !== r))}>×</button></span
						>
					{/each}
					<button class="chip add" onclick={addRoot}>{t('+ Aggiungi cartella')}</button>
				</div>
			{/if}
			{#if isOpen && items}
				{#each items as v (v.path)}
					<label class="cat sub">
						<input type="checkbox" checked={chosen[c.id]?.includes(v.path)} onchange={() => toggleItem(c.id, v.path)} />
						<div class="text">
							<div class="name ellipsis" title={v.path}>{c.id === 'projects' ? shortPath(v.path, roots) : v.path}</div>
							{#if v.used > 0 || v.opened > 0}<div class="detail">{lastUse(v.used, v.opened, Date.now())}</div>{/if}
						</div>
						<span class="weight">{formatBytes(v.size)}</span>
					</label>
				{/each}
			{/if}
		{/each}

		{#if programs === null || programs.length > 0}
			<div class="section sig">{t('Programmi più grandi')}</div>
			<p class="note"> {t('Space Train non li tocca: «Disinstalla» avvia il programma di disinstallazione ufficiale. Se un programma è già stato rimosso a metà, «Togli i resti» manda la sua cartella nel Cestino e lo toglie dall’elenco.')} </p>
			{#if programs === null}
				<div class="prog"><span class="detail">{t('pesando…')}</span></div>
			{:else}
				{#each programs as p (p.id)}
					<div class="prog">
						<span class="ellipsis"
							>{p.name}{#if p.gone}<span class="detail"> {t('· già rimosso')}</span>{:else if p.publisher}<span class="detail"
									>{t(' · {0}', [p.publisher])}</span
								>{/if}</span
						>
						<span class="weight">{p.size > 0 ? formatBytes(p.size) : '—'}</span>
						{#if p.gone}
							<button disabled={removing !== null} onclick={() => void removeLeftovers(p)}>{t('Togli i resti')}</button>
						{:else}
							<button onclick={() => void uninstall(p)}>{t('Disinstalla')}</button>
						{/if}
					</div>
				{/each}
			{/if}
		{/if}
	</div>
</div>

{#if confirming}
	<div
		class="backdrop"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && (confirming = false)}
		onkeydown={(e) => e.key === 'Escape' && (confirming = false)}
	>
		<div class="dialog" role="dialog" aria-modal="true" aria-label={t('Conferma pulizia')}>
			<h2>{t('Liberare {0}?', [formatBytes(toDo.bytes)])}</h2>
			{#if toDo.permanent.length > 0}
				<p><b>{toDo.permanent.length}</b> {t('{0} da soli: eliminati per sempre.', [toDo.permanent.length === 1 ? t('elemento si ricrea') : t('elementi si ricreano')])}</p>
			{/if}
			{#if (chosen.projects?.length ?? 0) > 0}
				<p>{t('I progetti scelti andranno installati e compilati di nuovo prima di usarli (npm install, cargo build…): serve internet.')}</p>
			{/if}
			{#if toDo.trash.length + toDo.asAdmin.length > 0}
				{@const n = toDo.trash.length + toDo.asAdmin.length}
				<p><b>{n}</b> {t('da guardare: {0} nel Cestino.', [n === 1 ? t('va') : t('vanno')])}</p>
			{/if}
			{#if toDo.asAdmin.length > 0}<p>{t('Per i resti di programmi Windows chiederà il permesso di amministratore.')}</p>{/if}
			{#if toDo.emptyTrash}<p>{t('Il Cestino si svuota.')}</p>{/if}
			<ul>
				{#each listed.slice(0, 6) as p (p)}<li>{p}</li>{/each}
				{#if listed.length > 6}<li class="rest">{t('e altri {0}…', [listed.length - 6])}</li>{/if}
			</ul>
			<p class="note">{t('I file in uso si saltano e te lo dico.')}</p>
			<div class="actions">
				<button bind:this={cancelButton} onclick={() => (confirming = false)}>{t('Annulla')}</button>
				<button class="danger" onclick={() => void free()}>{t('Libera')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.cleanup {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.band {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		min-height: 40px;
		padding: 4px 12px 4px 16px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		color: var(--text-dim);
	}
	.band b {
		color: var(--text);
		font-family: var(--font-display);
		font-weight: 400;
		font-size: calc(15px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
	}
	.spacer {
		flex: 1;
	}
	.error {
		padding: 8px 16px;
		color: var(--error-text, #ffb4ab);
		border-bottom: 1px solid var(--border);
	}
	.list {
		flex: 1;
		overflow-y: auto;
		padding-bottom: 24px;
	}
	.cat {
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr) 90px;
		gap: 10px;
		align-items: center;
		padding: 8px 16px;
		border-bottom: 1px solid var(--border);
	}
	.cat:hover {
		background: var(--row-hover);
	}
	.cat.sub {
		padding-left: 44px;
		background: color-mix(in srgb, var(--bg) 40%, transparent);
	}
	.cat.empty {
		color: var(--text-dim);
	}
	input[type='checkbox'] {
		margin: 0;
		accent-color: var(--accent);
	}
	.text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.open {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		cursor: default;
	}
	.arrow {
		color: var(--text-dim);
		font-size: calc(10px * var(--text-scale, 1));
		transition: transform 0.12s ease-out;
	}
	.arrow.down {
		transform: rotate(90deg);
	}
	.detail {
		color: var(--text-dim);
		font-size: calc(11.5px * var(--text-scale, 1));
	}
	.track {
		height: 4px;
		margin-top: 3px;
		border-radius: 2px;
		background: var(--border);
		overflow: hidden;
	}
	.track span {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--plasma, var(--accent)), var(--current, var(--accent)));
	}
	.weight {
		text-align: right;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.pill {
		padding: 1px 7px;
		border-radius: 9px;
		font-size: calc(9.5px * var(--text-scale, 1));
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.pill.rebuilt,
	.pill.trash {
		color: var(--online, #22c55e);
		background: color-mix(in srgb, var(--online, #22c55e) 12%, transparent);
	}
	.pill.review {
		color: var(--signal, #ffb454);
		background: color-mix(in srgb, var(--signal, #ffb454) 12%, transparent);
	}
	.pill.projects {
		color: var(--current, var(--accent));
		background: color-mix(in srgb, var(--current, var(--accent)) 10%, transparent);
	}
	.roots {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 6px 16px 8px 44px;
		border-bottom: 1px solid var(--border);
	}
	.sig {
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(10.5px * var(--text-scale, 1));
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 24px;
		padding: 0 4px 0 10px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--text-scale, 1));
		white-space: nowrap;
	}
	.chip button {
		width: 18px;
		height: 18px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--text-dim);
		font: inherit;
	}
	.chip button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.chip.add {
		padding: 0 10px;
		color: var(--text-dim);
	}
	.section {
		padding: 20px 16px 4px;
	}
	.note {
		margin: 0;
		padding: 0 16px 8px;
		color: var(--text-dim);
	}
	.prog {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 90px auto;
		gap: 10px;
		align-items: center;
		padding: 6px 16px;
		border-bottom: 1px solid var(--border);
	}
	.ellipsis {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.band button,
	.prog button,
	.actions button {
		height: 26px;
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
	.band button:hover,
	.prog button:hover,
	.actions button:hover {
		background: var(--row-hover);
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.primary {
		background: var(--accent) !important;
		border-color: var(--accent) !important;
		color: var(--on-accent, #fff) !important;
	}
	.primary:disabled {
		opacity: 0.45;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		z-index: 10;
	}
	.dialog {
		width: min(480px, 90vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	.dialog h2 {
		margin: 0 0 10px;
		font-size: calc(15px * var(--text-scale, 1));
		font-weight: 600;
	}
	.dialog p {
		margin: 0 0 8px;
		line-height: 1.5;
	}
	.dialog ul {
		margin: 0 0 10px;
		padding-left: 18px;
		max-height: 130px;
		overflow-y: auto;
		color: var(--text-dim);
		word-break: break-all;
	}
	.rest {
		list-style: none;
		margin-left: -18px;
	}
	.dialog .note {
		padding: 0;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 16px;
	}
	.danger {
		border-color: transparent !important;
		background: #c42b1c !important;
		color: #fff;
	}
</style>
