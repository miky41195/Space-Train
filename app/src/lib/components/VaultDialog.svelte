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

	let nuovoNome = $state('');
	let password = $state('');
	let ripeti = $state('');
	let cestina = $state(false);
	let primo = $state<HTMLInputElement | HTMLButtonElement | null>(null);

	$effect(() => {
		primo?.focus();
	});

	let problema = $derived.by(() => {
		if (mode !== 'create') return null;
		if (!nuovoNome.trim()) return 'Scegli un nome.';
		if ([...password].length < 8) return 'La password deve avere almeno 8 caratteri.';
		if (ripeti && ripeti !== password) return 'Le due password non sono uguali.';
		if (!ripeti) return 'Scrivi di nuovo la password.';
		return null;
	});

	let titolo = $derived(
		mode === 'unlock' ? `Apri «${name}»` : mode === 'create' ? 'Nuova cassaforte' : `Metti nella cassaforte «${name}»`
	);

	function conferma(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		if (mode === 'unlock' && password) onunlock?.(password);
		else if (mode === 'create' && !problema) oncreate?.(nuovoNome.trim(), password);
		else if (mode === 'add') onadd?.(cestina);
	}
</script>

<div class="sfondo" role="presentation" onclick={(e) => e.target === e.currentTarget && !busy && oncancel()} onkeydown={(e) => e.key === 'Escape' && !busy && oncancel()}>
	<div class="finestra" role="dialog" aria-modal="true" aria-label={titolo}>
		<form onsubmit={conferma}>
			<div class="testata">
				<span class="lucchetto" aria-hidden="true"></span>
				<h2>{titolo}</h2>
			</div>

			{#if mode === 'create'}
				<label>
					<span class="etichetta">Nome</span>
					<input bind:this={primo} bind:value={nuovoNome} maxlength="80" placeholder="Privato" />
				</label>
			{/if}

			{#if mode === 'unlock' || mode === 'create'}
				<label>
					<span class="etichetta">Password</span>
					{#if mode === 'unlock'}
						<input bind:this={primo} type="password" bind:value={password} autocomplete="current-password" />
					{:else}
						<input type="password" bind:value={password} autocomplete="new-password" />
					{/if}
				</label>
			{/if}

			{#if mode === 'create'}
				<label>
					<span class="etichetta">Ripeti la password</span>
					<input type="password" bind:value={ripeti} autocomplete="new-password" />
				</label>
				<p class="avviso">
					Se perdi la password i file non si possono più aprire. Nemmeno Space Train li può recuperare: scrivila in un posto sicuro.
				</p>
			{/if}

			{#if mode === 'add'}
				<p>{count === 1 ? '1 elemento verrà cifrato' : `${count} elementi verranno cifrati`} dentro la cassaforte.</p>
				<label class="scelta"><input type="checkbox" bind:checked={cestina} /> Poi manda gli originali nel cestino</label>
				<p class="nota">Senza questa scelta gli originali restano dove sono, leggibili come prima.</p>
			{/if}

			{#if error}<p class="errore" role="alert">{error}</p>{/if}
			{#if mode === 'create' && problema && (nuovoNome || password)}<p class="nota">{problema}</p>{/if}

			<div class="azioni">
				<button type="button" onclick={oncancel} disabled={busy}>Annulla</button>
				{#if mode === 'add'}
					<button bind:this={primo} type="submit" class="primario" disabled={busy}>Metti nella cassaforte</button>
				{:else}
					<button
						type="submit"
						class="primario"
						disabled={busy || (mode === 'unlock' ? !password : problema !== null)}
						>{busy ? 'Un momento…' : mode === 'unlock' ? 'Apri' : 'Crea cassaforte'}</button
					>
				{/if}
			</div>
		</form>
	</div>
</div>

<style>
	.sfondo {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		z-index: 10;
	}
	.finestra {
		width: min(400px, 90vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	form {
		display: grid;
		gap: 12px;
	}
	.testata {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	/* A signal-amber padlock: the vault's one mark. */
	.lucchetto {
		position: relative;
		flex: none;
		width: 14px;
		height: 11px;
		margin-top: 5px;
		border-radius: 2px;
		background: var(--signal, #ffb454);
	}
	.lucchetto::before {
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
		font-size: calc(15px * var(--scala-testo, 1));
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	label {
		display: grid;
		gap: 6px;
	}
	.etichetta {
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-testo, 1));
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
	.scelta {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	p {
		margin: 0;
		line-height: 1.5;
	}
	.nota {
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.avviso,
	.errore {
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		background: rgba(196, 43, 28, 0.12);
		color: var(--errore-testo, #ffb4ab);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.azioni {
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
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
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
	.primario {
		border-color: transparent;
		background: var(--accent);
		color: #fff;
	}
</style>
