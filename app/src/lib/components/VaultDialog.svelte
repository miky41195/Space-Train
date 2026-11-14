<script lang="ts">
	let {
		mode,
		name = '',
		count = 0,
		error = null,
		busy = false,
		onunlock = undefined,
		oncreate = undefined,
		onadd = undefined,
		oncancel
	}: {
		/** Open a vault, make a new one, or confirm what goes into it. */
		mode: 'unlock' | 'create' | 'add';
		/** The vault's name (unlock, add). */
		name?: string;
		/** Items about to go in (add). */
		count?: number;
		error?: string | null;
		/** Deriving the key takes a moment: buttons wait. */
		busy?: boolean;
		onunlock?: (password: string) => void;
		oncreate?: (name: string, password: string) => void;
		onadd?: (trashOriginals: boolean) => void;
		oncancel: () => void;
	} = $props();

	let newName = $state('');
	let password = $state('');
	let repeat = $state('');
	let trashOriginals = $state(false);
	let first = $state<HTMLInputElement | HTMLButtonElement | null>(null);

	$effect(() => {
		first?.focus();
	});

	let problem = $derived.by(() => {
		if (mode !== 'create') return null;
		if (!newName.trim()) return 'Scegli un nome.';
		if ([...password].length < 8) return 'La password deve avere almeno 8 caratteri.';
		if (repeat && repeat !== password) return 'Le due password non sono uguali.';
		if (!repeat) return 'Scrivi di nuovo la password.';
		return null;
	});

	let title = $derived(
		mode === 'unlock' ? `Apri «${name}»` : mode === 'create' ? 'Nuova cassaforte' : `Metti nella cassaforte «${name}»`
	);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		if (mode === 'unlock' && password) onunlock?.(password);
		else if (mode === 'create' && !problem) oncreate?.(newName.trim(), password);
		else if (mode === 'add') onadd?.(trashOriginals);
	}
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && !busy && oncancel()} onkeydown={(e) => e.key === 'Escape' && !busy && oncancel()}>
	<div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
		<form onsubmit={submit}>
			<div class="header">
				<span class="padlock" aria-hidden="true"></span>
				<h2>{title}</h2>
			</div>

			{#if mode === 'create'}
				<label>
					<span class="label">Nome</span>
					<input bind:this={first} bind:value={newName} maxlength="80" placeholder="Privato" />
				</label>
			{/if}

			{#if mode === 'unlock' || mode === 'create'}
				<label>
					<span class="label">Password</span>
					{#if mode === 'unlock'}
						<input bind:this={first} type="password" bind:value={password} autocomplete="current-password" />
					{:else}
						<input type="password" bind:value={password} autocomplete="new-password" />
					{/if}
				</label>
			{/if}

			{#if mode === 'create'}
				<label>
					<span class="label">Ripeti la password</span>
					<input type="password" bind:value={repeat} autocomplete="new-password" />
				</label>
				<p class="notice">
					Se perdi la password i file non si possono più aprire. Nemmeno Space Train li può recuperare: scrivila in un posto sicuro.
				</p>
			{/if}

			{#if mode === 'add'}
				<p>{count === 1 ? '1 elemento verrà cifrato' : `${count} elementi verranno cifrati`} dentro la cassaforte.</p>
				<label class="choice"><input type="checkbox" bind:checked={trashOriginals} /> Poi manda gli originali nel cestino</label>
				<p class="note">Senza questa scelta gli originali restano dove sono, leggibili come prima.</p>
			{/if}

			{#if error}<p class="error" role="alert">{error}</p>{/if}
			{#if mode === 'create' && problem && (newName || password)}<p class="note">{problem}</p>{/if}

			<div class="actions">
				<button type="button" onclick={oncancel} disabled={busy}>Annulla</button>
				{#if mode === 'add'}
					<button bind:this={first} type="submit" class="primary" disabled={busy}>Metti nella cassaforte</button>
				{:else}
					<button
						type="submit"
						class="primary"
						disabled={busy || (mode === 'unlock' ? !password : problem !== null)}
						>{busy ? 'Un momento…' : mode === 'unlock' ? 'Apri' : 'Crea cassaforte'}</button
					>
				{/if}
			</div>
		</form>
	</div>
</div>

<style>
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
		width: min(400px, 90vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	form {
		display: grid;
		gap: 12px;
	}
	.header {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	/* A signal-amber padlock: the vault's one mark. */
	.padlock {
		position: relative;
		flex: none;
		width: 14px;
		height: 11px;
		margin-top: 5px;
		border-radius: 2px;
		background: var(--signal, #ffb454);
	}
	.padlock::before {
		content: '';
		position: absolute;
		left: 3px;
		top: -6px;
		width: 8px;
		height: 7px;
		border: 2px solid var(--signal, #ffb454);
		border-bottom: 0;
		border-radius: 5px 5px 0 0;
		box-sizing: border-box;
	}
	h2 {
		margin: 0;
		font-size: calc(15px * var(--text-scale, 1));
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	label {
		display: grid;
		gap: 6px;
	}
	.label {
		font-family: var(--font-display);
		font-size: calc(11px * var(--text-scale, 1));
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	input:not([type='checkbox']) {
		height: 30px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	input:not([type='checkbox']):focus {
		border-color: var(--accent);
		outline: none;
	}
	.choice {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	p {
		margin: 0;
		line-height: 1.5;
	}
	.note {
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.notice,
	.error {
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: rgba(196, 43, 28, 0.12);
		color: var(--error-text, #ffb4ab);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
	}
	button {
		height: 30px;
		padding: 0 14px;
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
	button:disabled {
		opacity: 0.5;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.primary {
		border-color: transparent;
		background: var(--accent);
		color: #fff;
	}
</style>
