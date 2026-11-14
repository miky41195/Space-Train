<script lang="ts">
	import type { SettingsStore, FolderSizes } from '../stores/settings.svelte';
	import { TRAIN_PAUSES, DEFAULT_START_PAGE, LAST_FOLDER_START_PAGE } from '../menu';
	import { ON_LINUX } from '../platform';
	import { SHORTCUT_GROUPS, GLOBAL_SHORTCUT, type ShortcutItem } from '../shortcuts';
	import {
		accelerator,
		assign,
		combination,
		restore,
		keysOf,
		check,
		type SimpleAction
	} from '../custom-shortcuts';

	let {
		settings,
		showHidden,
		onhidden,
		isDefault,
		ondefault,
		version,
		receivedFolder,
		receivedChosen,
		onreceived,
		onpickfolder,
		onwhatsnew,
		ongallery,
		oneditor,
		onclose,
		ontestshortcut = undefined
	}: {
		settings: SettingsStore;
		/** Hidden items live in the tabs store, not here. */
		showHidden: boolean;
		onhidden: () => void;
		/** Space Train already opens folders instead of Explorer. */
		isDefault: boolean;
		ondefault: () => void;
		version: string;
		/** Where received files land today, even if it is the default one. */
		receivedFolder: string;
		/** The user picked one of their own. */
		receivedChosen: boolean;
		/** A new folder, or null to go back to the default one. */
		onreceived: (folder: string | null) => void;
		onpickfolder: (title: string, from: string | null) => Promise<string | null>;
		onwhatsnew: () => void;
		ongallery: () => void;
		oneditor: () => void;
		onclose: () => void;
		/** Asks Windows whether another program holds a combination (`null` = cannot tell). */
		ontestshortcut?: (accelerator: string) => Promise<boolean | null>;
	} = $props();

	// ── Custom shortcuts ─────────────────────────────────────────────
	const ACTIONS: SimpleAction[] = [
		...new Set(
			SHORTCUT_GROUPS.flatMap((g) => g.items)
				.map((i) => i.action)
				.filter((a): a is SimpleAction => typeof a === 'string')
		)
	];
	/** The action waiting for its new key combination. */
	let recording = $state<SimpleAction | null>(null);
	/** Why the last combination was refused, next to its action. */
	let refusal = $state<{ action: SimpleAction; text: string } | null>(null);
	/** Every change is confirmed: what the user is asked, warnings first. */
	let pending = $state<{ action: SimpleAction; name: string; combo: string; warnings: string[]; toRemove: SimpleAction[] } | null>(null);

	function itemKeys(i: ShortcutItem): string[] {
		return typeof i.action === 'string' ? keysOf(i.action, settings.shortcuts) : i.keys;
	}

	function startRecording(action: SimpleAction) {
		refusal = null;
		recording = action;
	}

	async function record(e: KeyboardEvent) {
		if (!recording) return;
		// The keys go to the recording, not to the app or the window.
		e.preventDefault();
		e.stopImmediatePropagation();
		if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
			recording = null;
			return;
		}
		const combo = combination(e);
		if (combo === null) return;
		const action = recording;
		recording = null;
		const v = check(combo, action, settings.shortcuts, ACTIONS);
		if (v.refusal) {
			refusal = { action, text: v.refusal };
			return;
		}
		const warnings = [...v.warnings];
		const acc = accelerator(combo);
		const free = acc && ontestshortcut ? await ontestshortcut(acc).catch(() => null) : null;
		if (free === false) warnings.unshift(`Un altro programma tiene già ${combo} per sé: la intercetta prima che arrivi a Space Train.`);
		const name = SHORTCUT_GROUPS.flatMap((g) => g.items).find((i) => i.action === action)?.label ?? action;
		pending = { action, name, combo, warnings, toRemove: v.toRemove };
	}

	function confirmShortcut() {
		if (!pending) return;
		settings.set('shortcuts', assign(settings.shortcuts, pending.action, pending.combo, pending.toRemove));
		pending = null;
	}

	const SECTIONS = [
		{ id: 'general', name: 'Generale' },
		{ id: 'files', name: 'File e cartelle' },
		{ id: 'appearance', name: 'Aspetto' },
		{ id: 'shortcuts', name: 'Scorciatoie' },
		{ id: 'network', name: 'Rete e amici' },
		{ id: 'info', name: 'Informazioni' }
	] as const;
	let section = $state<(typeof SECTIONS)[number]['id']>('general');

	const START_PAGES = [
		{ value: '::pc', name: 'Questo PC' },
		{ value: DEFAULT_START_PAGE, name: ON_LINUX ? 'File system (/)' : 'Disco C:' },
		{ value: LAST_FOLDER_START_PAGE, name: 'L’ultima cartella aperta' }
	];
	const FOLDER_SIZES: { value: FolderSizes; name: string }[] = [
		{ value: 'never', name: 'Mai, come Esplora' },
		{ value: 'open', name: 'Per la cartella aperta' },
		{ value: 'onRequest', name: 'Solo quando la chiedo' }
	];
	const DAYS = [3, 7, 14, 30];

	async function changeReceived() {
		const choice = await onpickfolder('Dove salvare i file in arrivo', receivedFolder || null).catch(() => null);
		if (choice) onreceived(choice);
	}

	let shortcutQuery = $state('');
	let shortcutGroups = $derived.by(() => {
		const q = shortcutQuery.trim().toLowerCase();
		if (!q) return SHORTCUT_GROUPS;
		const hit = (text: string) => text.toLowerCase().includes(q);
		return SHORTCUT_GROUPS.map((g) => ({
			name: g.name,
			items: g.items.filter((i) => hit(i.label) || i.keys.some(hit))
		})).filter((g) => g.items.length > 0);
	});

	let dialog = $state<HTMLDivElement | null>(null);
	$effect(() => {
		dialog?.querySelector<HTMLButtonElement>('.sections button.on')?.focus();
	});
</script>

<svelte:window
	onkeydowncapture={record}
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		if (pending) pending = null;
		else onclose();
	}}
/>

{#snippet toggle(isOn: boolean, label: string, change: () => void)}
	<button class="switch" class:on={isOn} role="switch" aria-checked={isOn} aria-label={label} onclick={change}
	></button>
{/snippet}

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog" role="dialog" aria-modal="true" aria-label="Impostazioni" bind:this={dialog}>
		<nav class="sections" aria-label="Sezioni delle impostazioni">
			<h2>Impostazioni</h2>
			{#each SECTIONS as s (s.id)}
				<button class:on={section === s.id} aria-current={section === s.id ? 'page' : undefined} onclick={() => (section = s.id)}
					>{s.name}</button
				>
			{/each}
		</nav>

		<div class="body">
			<button class="close" onclick={onclose} aria-label="Chiudi le impostazioni">
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
					><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg
				>
			</button>

			{#if section === 'general'}
				<h3>Generale</h3>
				<label class="item">
					<span class="text">All’avvio apri</span>
					<select
						value={settings.startPage}
						onchange={(e) => settings.set('startPage', e.currentTarget.value)}
					>
						{#each START_PAGES as i (i.value)}<option value={i.value}>{i.name}</option>{/each}
						{#if !START_PAGES.some((i) => i.value === settings.startPage)}
							<option value={settings.startPage}>{settings.startPage}</option>
						{/if}
					</select>
				</label>
				<div class="item">
					<span class="text">Riprendi le schede della volta scorsa</span>
					{@render toggle(settings.session, 'Riprendi le schede della volta scorsa', () =>
						settings.set('session', !settings.session)
					)}
				</div>
				{#if !ON_LINUX}
					<div class="item">
						<span class="text"
							>Apri le cartelle con Space Train<small
								>{isDefault ? 'Ora le cartelle si aprono qui invece che in Esplora risorse.' : 'Ora le cartelle si aprono in Esplora risorse.'}</small
							></span
						>
						<button class="button" onclick={ondefault}>{isDefault ? 'Ripristina Esplora risorse' : 'Imposta come predefinito'}</button>
					</div>
				{/if}
			{:else if section === 'files'}
				<h3>File e cartelle</h3>
				<label class="item">
					<span class="text"
						>Dimensione delle cartelle<small>Va letta tutta la cartella: su quelle enormi ci vuole un po’.</small></span
					>
					<select
						value={settings.folderSizes}
						onchange={(e) => settings.set('folderSizes', e.currentTarget.value as FolderSizes)}
					>
						{#each FOLDER_SIZES as d (d.value)}<option value={d.value}>{d.name}</option>{/each}
					</select>
				</label>
				<div class="item">
					<span class="text">Estensioni dei nomi file</span>
					{@render toggle(settings.extensions, 'Estensioni dei nomi file', () =>
						settings.set('extensions', !settings.extensions)
					)}
				</div>
				<div class="item">
					<span class="text">Elementi nascosti</span>
					{@render toggle(showHidden, 'Elementi nascosti', onhidden)}
				</div>
				<div class="item">
					<span class="text">Visualizzazione compatta</span>
					{@render toggle(settings.compact, 'Visualizzazione compatta', () =>
						settings.set('compact', !settings.compact)
					)}
				</div>
				<div class="item">
					<span class="text">Apri con un clic<small>Come l’opzione di Esplora. Ctrl e Maiusc selezionano.</small></span>
					{@render toggle(settings.singleClick, 'Apri con un clic', () => settings.set('singleClick', !settings.singleClick))}
				</div>
				<label class="item">
					<span class="text">Chiudi le casseforti dopo<small>Minuti senza usarle; si chiudono anche uscendo da Space Train.</small></span>
					<select
						value={String(settings.vaultAutoLock)}
						onchange={(e) => settings.set('vaultAutoLock', Number(e.currentTarget.value))}
					>
						{#each [1, 5, 15, 30, 60] as m (m)}<option value={String(m)}>{m === 1 ? '1 minuto' : `${m} minuti`}</option>{/each}
					</select>
				</label>
				<label class="item">
					<span class="text">Avvisa quando un disco è quasi pieno<small>Una banda sopra l’elenco, al massimo una volta al giorno, con il collegamento alla Pulizia.</small></span>
					<select value={String(settings.diskThreshold)} onchange={(e) => settings.set('diskThreshold', Number(e.currentTarget.value))}>
						{#each [0, 5, 10, 15, 20] as p (p)}<option value={String(p)}>{p === 0 ? 'Mai' : `Sotto il ${p}% libero`}</option>{/each}
					</select>
				</label>
				<div class="item">
					<span class="text">Stato Git nelle cartelle dei progetti<small>Segna i file modificati e nuovi e mostra il ramo. Serve git installato.</small></span>
					{@render toggle(settings.git, 'Stato Git nelle cartelle dei progetti', () => settings.set('git', !settings.git))}
				</div>
				<div class="item">
					<span class="text">Chiedi conferma prima di spostare nel cestino</span>
					{@render toggle(settings.confirmTrash, 'Chiedi conferma prima di spostare nel cestino', () =>
						settings.set('confirmTrash', !settings.confirmTrash)
					)}
				</div>
				<div class="item">
					<span class="text">Modificati di recente in cima</span>
					<span class="together">
						<select
							aria-label="Giorni dei modificati di recente"
							value={settings.recentDays}
							disabled={!settings.recent}
							onchange={(e) => settings.set('recentDays', Number(e.currentTarget.value))}
						>
							{#each DAYS as g (g)}<option value={g}>{g} giorni</option>{/each}
							{#if !DAYS.includes(settings.recentDays)}
								<option value={settings.recentDays}>{settings.recentDays} giorni</option>
							{/if}
						</select>
						{@render toggle(settings.recent, 'Modificati di recente in cima', () =>
							settings.set('recent', !settings.recent)
						)}
					</span>
				</div>
			{:else if section === 'appearance'}
				<h3>Aspetto</h3>
				<div class="item">
					<span class="text">Tema e colore d’evidenziazione</span>
					<button class="button" onclick={ongallery}>Scegli un tema…</button>
				</div>
				<div class="item">
					<span class="text">I tuoi temi</span>
					<button class="button" onclick={oneditor}>Crea o modifica un tema…</button>
				</div>
				<div class="item">
					<span class="text">Animazione all’avvio</span>
					{@render toggle(settings.introAnimation, 'Animazione all’avvio', () =>
						settings.set('introAnimation', !settings.introAnimation)
					)}
				</div>
				<label class="item">
					<span class="text">Passaggi del treno e dei personaggi</span>
					<select
						value={settings.trainPause}
						onchange={(e) => settings.set('trainPause', Number(e.currentTarget.value))}
					>
						{#each TRAIN_PAUSES as [seconds, name] (seconds)}<option value={seconds}>{name}</option>{/each}
					</select>
				</label>
			{:else if section === 'shortcuts'}
				<h3>Scorciatoie</h3>
				<input
					class="key-search"
					type="search"
					placeholder="Cerca un’azione o un tasto…"
					aria-label="Cerca fra le scorciatoie"
					bind:value={shortcutQuery}
				/>
				<div class="global">
					<span class="text">{GLOBAL_SHORTCUT.label}<small>Da qualsiasi programma</small></span>
					<span class="keys">{#each GLOBAL_SHORTCUT.keys as k (k)}<kbd>{k}</kbd>{/each}</span>
				</div>
				{#each shortcutGroups as g (g.name)}
					<h4>{g.name}</h4>
					<ul class="timetable">
						{#each g.items as i (i.label)}
							{@const action = typeof i.action === 'string' ? i.action : null}
							<li class:recording={action !== null && recording === action}>
								<span
									>{i.label}{#if action && recording === action}<small class="recording-note"
											>Premi la combinazione nuova… (Esc annulla)</small
										>{/if}{#if action && refusal?.action === action}<small class="refusal">{refusal.text}</small>{/if}</span
								>
								<span class="keys"
									>{#each itemKeys(i) as k (k)}<kbd>{k}</kbd>{:else}{#if action}<span class="none">nessuna</span>{/if}{/each}</span
								>
								<span class="change">
									{#if action}
										{#if settings.shortcuts[action] !== undefined}
											<button class="link" onclick={() => settings.set('shortcuts', restore(settings.shortcuts, action))}
												>Ripristina</button
											>
										{/if}
										<button class="button small" onclick={() => startRecording(action)} aria-label={`Cambia la scorciatoia di «${i.label}»`}
											>Cambia</button
										>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="note">Nessuna scorciatoia per «{shortcutQuery.trim()}».</p>
				{/each}
				{#if Object.keys(settings.shortcuts).length > 0}
					<button class="button restore-all" onclick={() => settings.set('shortcuts', {})}>Ripristina tutte</button>
				{/if}
				{#if pending}
					<div class="confirm" role="alertdialog" aria-modal="true" aria-label="Conferma scorciatoia">
						<h4>Usare {pending.combo} per «{pending.name}»?</h4>
						{#each pending.warnings as a, k (k)}
							<p class="notice">{a}</p>
						{:else}
							<p>La combinazione è libera.</p>
						{/each}
						<div class="actions">
							<button class="button" onclick={() => (pending = null)}>Annulla</button>
							<button class="button primary" onclick={confirmShortcut}>Usa {pending.combo}</button>
						</div>
					</div>
				{/if}
			{:else if section === 'network'}
				<h3>Rete e amici</h3>
				<div class="item">
					<span class="text"
						>Cartella dei file ricevuti<small class="path"
							>{receivedFolder || 'Quella predefinita di Space Train'}</small
						></span
					>
					<span class="together">
						{#if receivedChosen}
							<button class="button" onclick={() => onreceived(null)}>Predefinita</button>
						{/if}
						<button class="button" onclick={changeReceived}>Cambia…</button>
					</span>
				</div>
				<p class="note">Ogni volta che arrivano file puoi comunque sceglierne un’altra nel riquadro «File in arrivo».</p>
			{:else}
				<h3>Informazioni</h3>
				<div class="item">
					<span class="text">Versione installata</span>
					<span class="number">{version || '—'}</span>
				</div>
				<div class="item">
					<span class="text">Cosa è cambiato</span>
					<button class="button" onclick={onwhatsnew}>Novità…</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--void) 72%, transparent);
	}
	.dialog {
		position: relative;
		width: 680px;
		max-width: calc(100vw - 32px);
		height: 440px;
		max-height: calc(100vh - 64px);
		display: grid;
		grid-template-columns: 184px minmax(0, 1fr);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
		overflow: hidden;
	}

	/* The sections are stops on the rail, like the sidebar locations. */
	.sections {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 18px 8px 18px 0;
		background: var(--bg);
		border-right: 1px solid var(--border);
	}
	.sections::before {
		content: '';
		position: absolute;
		left: 13px;
		top: 58px;
		bottom: 24px;
		width: 5px;
		border-left: 1px solid var(--rail-metal);
		border-right: 1px solid var(--rail-metal);
	}
	h2 {
		margin: 0 0 12px;
		padding-left: 18px;
		font-family: var(--font-display);
		font-size: calc(15px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
	}
	.sections button {
		position: relative;
		height: 30px;
		padding: 0 10px 0 30px;
		border: none;
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		text-align: left;
		cursor: default;
	}
	.sections button::before {
		content: '';
		position: absolute;
		left: 11px;
		top: 50%;
		width: 9px;
		height: 9px;
		margin-top: -4.5px;
		border-radius: 50%;
		background: radial-gradient(circle, var(--bg) 0 2.2px, var(--rail-metal) 2.6px);
	}
	.sections button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.sections button.on {
		background: var(--accent-soft);
		color: var(--text);
	}
	.sections button.on::before {
		background: var(--current);
	}

	.body {
		position: relative;
		padding: 18px 22px;
		overflow-y: auto;
	}
	h3 {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-size: calc(15px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
	}
	.close {
		position: absolute;
		top: 12px;
		right: 12px;
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
	.close:hover {
		background: var(--row-hover);
		color: var(--text);
	}

	.item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 16px;
		min-height: 48px;
		padding: 6px 0;
		border-bottom: 1px solid var(--border);
	}
	.item:last-of-type {
		border-bottom: none;
	}
	.text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	small {
		color: var(--text-dim);
		font-size: calc(11.5px * var(--text-scale, 1));
	}
	.path {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.together {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.note {
		margin: 8px 0 0;
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.number {
		font-variant-numeric: tabular-nums;
		color: var(--text-dim);
	}

	/* Shortcuts: a timetable, alternate rows and keys as small signs. */
	.key-search {
		width: 100%;
		height: 28px;
		margin: 4px 0 12px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.key-search:hover {
		border-color: var(--text-dim);
	}
	.global {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
	}
	h4 {
		margin: 16px 0 4px;
		font-family: var(--font-display);
		font-size: calc(10px * var(--text-scale, 1));
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	.timetable {
		display: grid;
		gap: 1px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.timetable li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 12px;
		min-height: 28px;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
	}
	.timetable li:nth-child(odd) {
		background: var(--row-hover);
	}
	/* Waiting for keys: the drop-target line, so it reads as «listening». */
	.timetable li.recording {
		background: color-mix(in srgb, var(--current) 10%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	.timetable li > span:first-child small {
		display: block;
		font-size: calc(11px * var(--text-scale, 1));
	}
	.recording-note {
		color: var(--current);
	}
	.refusal {
		color: var(--error-text);
	}
	.none {
		color: var(--text-dim);
		font-size: calc(11px * var(--text-scale, 1));
	}
	.change {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.button.small {
		height: 22px;
		padding: 0 8px;
		font-size: calc(11.5px * var(--text-scale, 1));
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		color: var(--text-dim);
		font: inherit;
		font-size: calc(11.5px * var(--text-scale, 1));
		text-decoration: underline;
		cursor: default;
	}
	.link:hover {
		color: var(--text);
	}
	.restore-all {
		justify-self: start;
		margin-top: 12px;
	}
	/* Confirmation of a new shortcut: always asked, warnings in signal amber. */
	.confirm {
		position: sticky;
		bottom: 0;
		display: grid;
		gap: 8px;
		margin-top: 12px;
		padding: 14px 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
	}
	.confirm h4 {
		margin: 0;
	}
	.confirm p {
		margin: 0;
	}
	.confirm .notice {
		padding: 8px 10px;
		border: 1px solid color-mix(in srgb, var(--signal, #ffb454) 45%, transparent);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--signal, #ffb454) 8%, transparent);
	}
	.confirm .actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.button.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	.keys {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: 4px;
	}
	kbd {
		padding: 0 6px;
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		border-radius: 4px;
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-display);
		font-size: calc(12px * var(--text-scale, 1));
		line-height: 1.6;
		white-space: nowrap;
	}

	select {
		height: 28px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	select:disabled {
		opacity: 0.5;
	}
	.button {
		height: 28px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		white-space: nowrap;
		cursor: default;
	}
	.button:hover {
		background: var(--row-hover);
	}

	/* Switch: rail off or on, the round knob like a stop. */
	.switch {
		position: relative;
		width: 36px;
		height: 20px;
		padding: 0;
		border: none;
		border-radius: 999px;
		background: var(--rail-metal);
		cursor: default;
		transition: background 140ms ease;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--text-dim);
		transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.switch.on {
		background: var(--accent);
	}
	.switch.on::after {
		background: #fff;
		transform: translateX(16px);
	}
	@media (prefers-reduced-motion: reduce) {
		.switch,
		.switch::after {
			transition: none;
		}
	}
</style>
