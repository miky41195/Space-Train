<script lang="ts">
	import type { Backend, Entry } from '../ipc';

	/**
	 * Checksum of one file, to check a download against the value its page
	 * publishes. SHA-256 is computed at once; SHA-1 and MD5 on request.
	 */
	let { voce, backend, onclose }: { voce: Entry; backend: Backend; onclose: () => void } = $props();

	type Algoritmo = 'sha256' | 'sha1' | 'md5';
	const ALGORITMI: Array<{ id: Algoritmo; nome: string }> = [
		{ id: 'sha256', nome: 'SHA-256' },
		{ id: 'sha1', nome: 'SHA-1' },
		{ id: 'md5', nome: 'MD5' }
	];
	/** Checksums start far from searches and transfers. */
	let prossimoId = 3_000_000;

	let algoritmo = $state<Algoritmo>('sha256');
	let valore = $state<string | null>(null);
	let errore = $state<string | null>(null);
	let confronto = $state('');
	let copiato = $state(false);
	let campo = $state<HTMLInputElement | null>(null);

	$effect(() => {
		const algo = algoritmo;
		const path = voce.path;
		const opId = prossimoId++;
		valore = null;
		errore = null;
		backend
			.fileChecksum({ opId, path, algorithm: algo })
			.then((v) => {
				if (v !== null) valore = v;
			})
			.catch((e) => (errore = e?.message ?? String(e)));
		return () => void backend.cancelTransfer(opId);
	});

	$effect(() => {
		campo?.focus();
	});

	/** What a download page prints: any case, spaces or a «sha256:» prefix are fine. */
	let pulito = $derived(confronto.trim().toLowerCase().replace(/^[a-z0-9-]+:/, '').replace(/\s+/g, ''));
	let esito = $derived(valore && pulito ? (pulito === valore ? 'uguale' : 'diverso') : null);

	async function copia() {
		if (!valore) return;
		try {
			await navigator.clipboard.writeText(valore);
			copiato = true;
		} catch {
			copiato = false;
		}
	}
</script>

<div
	class="sfondo"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onclose()}
	onkeydown={(e) => e.key === 'Escape' && onclose()}
>
	<div class="finestra" role="dialog" aria-modal="true" aria-label="Somma di controllo">
		<h2>Somma di controllo · <span class="nome">{voce.name}</span></h2>

		<div class="algoritmi" role="radiogroup" aria-label="Algoritmo">
			{#each ALGORITMI as a (a.id)}
				<button
					role="radio"
					aria-checked={algoritmo === a.id}
					class:acceso={algoritmo === a.id}
					onclick={() => (algoritmo = a.id)}>{a.nome}</button
				>
			{/each}
		</div>

		<div class="valore" aria-live="polite">
			{#if errore}
				<span class="errore">{errore}</span>
			{:else if valore}
				<code>{valore}</code>
			{:else}
				<span class="calcolo">Calcolo in corso…</span>
			{/if}
		</div>

		<label class="confronto">
			<span>Confronta con il valore pubblicato</span>
			<input bind:this={campo} bind:value={confronto} spellcheck="false" autocomplete="off" placeholder="Incolla qui" />
		</label>

		{#if esito === 'uguale'}
			<p class="esito uguale" role="status">Coincide: il file è quello pubblicato.</p>
		{:else if esito === 'diverso'}
			<p class="esito diverso" role="status">Non coincide: il file è diverso da quello pubblicato.</p>
		{/if}

		<div class="azioni">
			<button onclick={copia} disabled={!valore}>{copiato ? 'Copiato' : 'Copia'}</button>
			<button class="primario" onclick={onclose}>Chiudi</button>
		</div>
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
		width: min(480px, 92vw);
		padding: 20px;
		display: grid;
		gap: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	h2 {
		margin: 0;
		font-size: calc(15px * var(--scala-testo, 1));
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.nome {
		font-weight: 400;
		color: var(--text-dim);
	}
	.algoritmi {
		display: flex;
		gap: 4px;
	}
	.valore {
		min-height: 40px;
		padding: 8px 10px;
		background: var(--bg);
		border-radius: var(--radius-sm);
	}
	code {
		font-family: Consolas, 'Cascadia Mono', monospace;
		font-size: calc(12px * var(--scala-testo, 1));
		word-break: break-all;
		user-select: text;
	}
	.calcolo {
		color: var(--text-dim);
	}
	.errore {
		color: var(--errore-testo);
	}
	.confronto {
		display: grid;
		gap: 4px;
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	input {
		height: 28px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font-family: Consolas, 'Cascadia Mono', monospace;
		font-size: calc(12px * var(--scala-testo, 1));
	}
	input:focus {
		border-color: var(--accent);
		outline: none;
	}
	.esito {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.esito::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: currentColor;
	}
	.uguale {
		color: var(--in-linea);
	}
	.diverso {
		color: var(--errore-testo);
	}
	.azioni {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
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
	.algoritmi button {
		height: 24px;
		padding: 0 10px;
		font-size: calc(12px * var(--scala-testo, 1));
	}
	button.acceso {
		background: var(--accent-soft);
		border-color: transparent;
	}
	button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	button:disabled {
		opacity: 0.4;
	}
	button:focus-visible {
		outline: 2px solid var(--current);
		outline-offset: 2px;
	}
	.primario {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	.primario:hover:not(:disabled) {
		background: var(--accent);
		filter: brightness(1.1);
	}
</style>
