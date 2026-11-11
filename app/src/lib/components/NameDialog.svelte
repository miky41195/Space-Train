<script lang="ts">
	let {
		title,
		label,
		value = '',
		confirm = 'Salva',
		error = null,
		onconfirm,
		oncancel
	}: {
		title: string;
		label: string;
		value?: string;
		confirm?: string;
		/** Shown under the field, e.g. when the name is taken. */
		error?: string | null;
		onconfirm: (name: string) => void;
		oncancel: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let name = $state(value);
	let field = $state<HTMLInputElement | null>(null);

	$effect(() => {
		field?.focus();
		field?.select();
	});
</script>

<div
	class="sfondo"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && oncancel()}
	onkeydown={(e) => e.key === 'Escape' && oncancel()}
>
	<div class="finestra" role="dialog" aria-modal="true" aria-label={title}>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			if (name.trim()) onconfirm(name.trim());
		}}
	>
		<h2>{title}</h2>
		<label>
			<span class="etichetta">{label}</span>
			<input bind:this={field} bind:value={name} maxlength="40" aria-invalid={error ? 'true' : undefined} />
		</label>
		{#if error}<p class="errore" role="alert">{error}</p>{/if}
		<div class="azioni">
			<button type="button" onclick={oncancel}>Annulla</button>
			<button type="submit" class="primario" disabled={!name.trim()}>{confirm}</button>
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
		width: min(380px, 90vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	h2 {
		margin: 0 0 12px;
		font-size: calc(15px * var(--scala-testo, 1));
		font-weight: 600;
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
	input {
		height: 30px;
		padding: 0 10px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		outline: none;
	}
	.errore {
		margin: 8px 0 0;
		color: var(--errore-testo, #ffb4ab);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.azioni {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 16px;
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
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	button:disabled {
		opacity: 0.5;
	}
	.primario {
		border-color: transparent;
		background: var(--accent);
		color: #fff;
	}
	.primario:hover:not(:disabled) {
		background: var(--accent);
		filter: brightness(1.1);
	}
</style>
