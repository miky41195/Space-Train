<script lang="ts">
	import { tauriBackend, type Backend, type FsError, type TextFile } from '../ipc';

	let {
		path,
		name,
		onclose,
		onsaved = undefined,
		describeError,
		backend = tauriBackend
	}: {
		path: string;
		name: string;
		onclose: () => void;
		/** After a save: the list can show the new date and size. */
		onsaved?: () => void;
		describeError: (e: unknown) => string;
		backend?: Backend;
	} = $props();

	let file = $state<TextFile | null>(null);
	let text = $state('');
	let error = $state<string | null>(null);
	let saving = $state(false);
	/** Someone else changed the file on disk since it was opened. */
	let changedOnDisk = $state(false);
	/** Closing with unsaved changes: asks first. */
	let asking = $state(false);
	let area = $state<HTMLTextAreaElement | null>(null);
	let dirty = $derived(file !== null && text !== file.text);
	let lines = $derived(text.split('\n').length);

	$effect(() => {
		void backend
			.textRead(path)
			.then((f) => {
				file = f;
				text = f.text;
				queueMicrotask(() => area?.focus());
			})
			.catch((e) => (error = describeError(e)));
	});

	async function save(force = false): Promise<boolean> {
		if (!file || saving) return false;
		saving = true;
		error = null;
		try {
			const modified = await backend.textWrite(path, { text, crlf: file.crlf, bom: file.bom }, file.modified, force);
			file = { ...file, text, modified };
			changedOnDisk = false;
			onsaved?.();
			return true;
		} catch (e) {
			if ((e as FsError)?.kind === 'changed') changedOnDisk = true;
			else error = describeError(e);
			return false;
		} finally {
			saving = false;
		}
	}

	function close() {
		if (dirty) asking = true;
		else onclose();
	}

	async function saveAndClose() {
		asking = false;
		if (await save()) onclose();
	}

	function keys(e: KeyboardEvent) {
		// The page's own shortcuts must not act on the list behind.
		e.stopPropagation();
		if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 's') {
			e.preventDefault();
			void save();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (asking) asking = false;
			else close();
		} else if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && e.target === area && area) {
			// A tab character, as every text editor does; Esc then Tab leaves the field.
			e.preventDefault();
			const { selectionStart: a, selectionEnd: b } = area;
			text = text.slice(0, a) + '\t' + text.slice(b);
			queueMicrotask(() => area?.setSelectionRange(a + 1, a + 1));
		}
	}
</script>

<div class="backdrop" role="presentation" onkeydown={keys}>
	<div class="dialog" role="dialog" aria-modal="true" aria-label="Modifica {name}">
		<div class="band">
			<span class="title ellipsis" title={path}>{name}{#if dirty}<span class="dot" aria-label="modifiche non salvate"> ●</span>{/if}</span>
			{#if file}<span class="detail">{lines} {lines === 1 ? 'riga' : 'righe'} · {file.crlf ? 'CRLF' : 'LF'}{file.bom ? ' · BOM' : ''}</span>{/if}
			<span class="spacer"></span>
			<button onclick={close}>Chiudi</button>
			<button class="primary" disabled={!dirty || saving} onclick={() => void save()} title="Ctrl+S">Salva</button>
		</div>
		{#if changedOnDisk}
			<div class="notice">
				Il file è cambiato su disco da quando l’hai aperto.
				<button onclick={() => void save(true)}>Sovrascrivi</button>
				<button onclick={() => (changedOnDisk = false)}>Annulla</button>
			</div>
		{/if}
		{#if error}<div class="error">{error}</div>{/if}
		{#if file}
			<textarea bind:this={area} bind:value={text} spellcheck="false" aria-label="Testo di {name}"></textarea>
		{:else if !error}
			<div class="loading">Apro il file…</div>
		{/if}
	</div>

	{#if asking}
		<div class="ask" role="alertdialog" aria-modal="true" aria-label="Modifiche non salvate">
			<p>Salvare le modifiche a «{name}»?</p>
			<div class="actions">
				<button onclick={() => (asking = false)}>Annulla</button>
				<button class="danger" onclick={onclose}>Non salvare</button>
				<!-- svelte-ignore a11y_autofocus -->
				<button class="primary" autofocus onclick={() => void saveAndClose()}>Salva</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.45);
	}
	.dialog {
		width: min(1100px, calc(100vw - 48px));
		height: calc(100vh - 64px);
		display: flex;
		flex-direction: column;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
		overflow: hidden;
	}
	.band {
		display: flex;
		align-items: center;
		gap: 8px 14px;
		min-height: 40px;
		padding: 4px 12px 4px 16px;
		border-bottom: 1px solid var(--border);
	}
	.title {
		font-family: var(--font-display);
		font-weight: 600;
		min-width: 0;
	}
	.dot {
		color: var(--current);
	}
	.detail,
	.loading {
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
		white-space: nowrap;
	}
	.loading {
		padding: 16px;
	}
	.spacer {
		flex: 1;
	}
	.ellipsis {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.notice,
	.error {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 16px;
		border-bottom: 1px solid var(--border);
	}
	.error {
		color: var(--error-text, var(--text));
	}
	textarea {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 12px 16px;
		border: 0;
		outline: none;
		resize: none;
		background: transparent;
		color: var(--text);
		font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace;
		font-size: calc(13px * var(--text-scale, 1));
		line-height: 1.5;
		tab-size: 4;
		white-space: pre;
		overflow: auto;
	}
	.ask {
		position: fixed;
		z-index: 31;
		width: 380px;
		max-width: calc(100vw - 32px);
		padding: 18px 20px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
	}
	.ask p {
		margin: 0 0 14px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	button {
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
	button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.primary:hover:not(:disabled) {
		background: var(--accent);
		filter: brightness(1.1);
	}
	.primary:disabled {
		opacity: 0.45;
	}
	.danger {
		border-color: transparent;
		background: #c42b1c;
		color: #fff;
	}
</style>
