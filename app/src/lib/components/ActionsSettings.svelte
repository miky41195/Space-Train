<script lang="ts">
	import { t, tr } from '../i18n';
	import type { Backend, FsError } from '../ipc';
	import { SYSTEM_ROOT } from '../platform';
	import { actionName, check, combination, type CustomShortcuts, type SimpleAction } from '../custom-shortcuts';
	import { parseExtensions, type ActionMode, type ActionsStore, type CustomAction } from '../stores/actions.svelte';

	let {
		actions,
		selection,
		backend,
		shortcuts,
		all
	}: {
		actions: ActionsStore;
		/** Files selected now: the preview uses them. */
		selection: string[];
		backend: Backend;
		shortcuts: CustomShortcuts;
		/** The app's own actions, whose keys cannot be taken here. */
		all: readonly SimpleAction[];
	} = $props();

	let openId = $state<string | null>(null);
	let current = $derived(actions.items.find((a) => a.id === openId) ?? null);
	let recording = $state(false);
	let refusal = $state<string | null>(null);

	const TOKENS = ['{file}', '{files}', t('{cartella}'), t('{nome}')];
	const MODES: Array<[ActionMode, string]> = [
		['terminal', t('Nel terminale')],
		['background', t('In sottofondo')]
	];

	function edit(part: Partial<CustomAction>) {
		if (current) actions.save({ ...current, ...part });
	}

	function create() {
		const id = `action-${Date.now()}`;
		actions.save({ id, name: t('Nuova azione'), command: '', mode: 'background', extensions: [], enabled: true, keys: null });
		show(id);
	}

	function show(id: string) {
		openId = openId === id ? null : id;
		recording = false;
		refusal = null;
	}

	function record(e: KeyboardEvent) {
		if (!recording) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.key === 'Escape') {
			recording = false;
			return;
		}
		const combo = combination(e);
		if (combo === null || !current) return;
		recording = false;
		// Not one of the app's actions: every combination in use belongs to someone else.
		const v = check(combo, '' as SimpleAction, shortcuts, all);
		const other = actions.items.find((a) => a.id !== current?.id && a.keys === combo);
		const taken = v.toRemove[0] ? actionName(v.toRemove[0]) : other?.name;
		refusal = v.refusal ?? (taken ? t('Già usata per «{0}».', [taken]) : null);
		if (!refusal) edit({ keys: combo });
	}

	// ── Live preview ──
	let lines = $state<string[]>([]);
	let problem = $state<string | null>(null);
	$effect(() => {
		const command = current?.command ?? '';
		lines = [];
		problem = null;
		if (!command.trim()) return;
		const ext = current?.extensions[0] ?? 'txt';
		const paths = selection.length > 0 ? selection : [`${SYSTEM_ROOT}${t('Esempio')}.${ext}`];
		let valid = true;
		backend
			.actionLines(command, paths)
			.then((l) => valid && (lines = l))
			.catch((e) => {
				if (valid) problem = tr((e as FsError & { message?: string })?.message ?? String(e));
			});
		return () => (valid = false);
	});
</script>

<h3>{t('Azioni')}</h3>
<p class="note">{t('Comandi tuoi sui file selezionati: compaiono nel menu del tasto destro e nella palette.')}</p>

{#each actions.items as a (a.id)}
	<div class="row">
		<button
			class="switch"
			class:on={a.enabled}
			role="switch"
			aria-checked={a.enabled}
			aria-label={t('Attiva «{0}»', [a.name])}
			onclick={() => actions.save({ ...a, enabled: !a.enabled })}
		></button>
		<i class="glyph" class:terminal={a.mode === 'terminal'} aria-hidden="true"></i>
		<span class="name">{a.name}</span>
		{#if a.keys}<kbd>{a.keys}</kbd>{/if}
		<button class="button" aria-expanded={openId === a.id} aria-label={t('Modifica «{0}»', [a.name])} onclick={() => show(a.id)}>{t('Modifica')}</button>
	</div>
	{#if openId === a.id && current}
		<div class="form">
			<div class="two">
				<label><span>{t('Nome')}</span><input value={current.name} maxlength="60" oninput={(e) => edit({ name: e.currentTarget.value })} /></label>
				<label
					><span>{t('Solo per')}</span><input
						value={current.extensions.join(', ')}
						placeholder={t('mp4, mkv… vuoto = tutti')}
						onchange={(e) => edit({ extensions: parseExtensions(e.currentTarget.value) })}
					/></label
				>
			</div>
			<label
				><span>{t('Comando')}</span><input
					class="code"
					value={current.command}
					spellcheck="false"
					oninput={(e) => edit({ command: e.currentTarget.value })}
				/></label
			>
			<div class="tokens">
				{#each TOKENS as token (token)}
					<button class="token" onclick={() => edit({ command: `${current?.command ?? ''} ${token}`.trim() })}>{token}</button>
				{/each}
			</div>
			<div class="tokens" role="group" aria-label={t('Dove gira')}>
				{#each MODES as [id, name] (id)}
					<button class="button" class:on={current.mode === id} aria-pressed={current.mode === id} onclick={() => edit({ mode: id })}>{name}</button>
				{/each}
			</div>
			<div class="tokens">
				<span>{t('Scorciatoia')}</span>
				<button class="button" onclick={() => ((recording = true), (refusal = null))} onkeydown={record}
					>{recording ? t('Premi i tasti… (Esc annulla)') : (current.keys ?? t('Assegna…'))}</button
				>
				{#if current.keys}<button class="button" onclick={() => edit({ keys: null })}>{t('Togli')}</button>{/if}
				{#if refusal}<small class="problem" role="alert">{refusal}</small>{/if}
			</div>
			{#if problem}
				<p class="problem" role="alert">{problem}</p>
			{:else if lines.length > 0}
				<pre class="runs"><b>{selection.length > 0 ? t('Con i file selezionati verrà eseguito') : t('Esempio')}</b>
{lines.slice(0, 3).join('\n')}{lines.length > 3 ? '\n…' : ''}</pre>
			{/if}
			<div class="tokens"><button class="button" onclick={() => actions.remove(a.id)}>{t('Elimina')}</button></div>
		</div>
	{/if}
{/each}
<div class="tokens"><button class="button" onclick={create}>{t('Nuova azione')}</button></div>

<style>
	h3 {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-size: calc(15px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
	}
	.note {
		margin: 0 0 8px;
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		border-bottom: 1px solid var(--border);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.glyph {
		flex: none;
		width: 10px;
		height: 10px;
		border: 1.5px solid var(--current);
		border-radius: 3px;
	}
	.glyph.terminal {
		border-color: var(--signal, #ffb454);
	}
	kbd,
	.tokens span,
	label span {
		color: var(--text-dim);
		font: inherit;
		font-size: calc(11.5px * var(--text-scale, 1));
	}
	.form {
		display: grid;
		gap: 10px;
		padding: 10px 0 14px;
		border-bottom: 1px solid var(--border);
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	label {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	input {
		min-width: 0;
		height: 28px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.code,
	.token,
	.runs {
		font-family: 'Cascadia Mono', Consolas, monospace;
		font-size: calc(12px * var(--text-scale, 1));
	}
	.tokens {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 2px;
	}
	.token,
	.button {
		height: 26px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		cursor: default;
	}
	.button {
		font: inherit;
	}
	.token {
		color: var(--current);
	}
	.token:hover,
	.button:hover {
		background: var(--row-hover);
	}
	.button.on {
		border-color: var(--current);
		background: var(--accent-soft);
	}
	.runs {
		margin: 0;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text-dim);
		overflow-x: auto;
	}
	.problem {
		margin: 0;
		color: var(--error-text, #ffb4ab);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.switch {
		position: relative;
		flex: none;
		width: 34px;
		height: 18px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: transparent;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--text-dim);
	}
	.switch.on {
		background: var(--accent);
	}
	.switch.on::after {
		left: 18px;
		background: #fff;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
