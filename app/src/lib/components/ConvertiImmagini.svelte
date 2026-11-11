<script lang="ts">
	import type { Entry, ImageTarget } from '../ipc';

	/**
	 * Convert and resize images into new files beside the originals, which
	 * stay as they are. The dialog only chooses; the page runs the job.
	 */
	let {
		voci,
		onconverti,
		onclose
	}: {
		voci: Entry[];
		onconverti: (o: { target: ImageTarget; maxSide: number | null; quality: number }) => void;
		onclose: () => void;
	} = $props();

	const FORMATI: Array<{ id: ImageTarget; nome: string }> = [
		{ id: 'jpg', nome: 'JPG' },
		{ id: 'png', nome: 'PNG' },
		{ id: 'webp', nome: 'WebP' }
	];
	const LATI: Array<number | null> = [null, 3840, 1920, 1280, 640];

	let formato = $state<ImageTarget>('jpg');
	let lato = $state<number | null>(1920);
	let qualita = $state(85);
	let finestra = $state<HTMLElement | null>(null);

	$effect(() => {
		finestra?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
	});

	/** Same rule as Rust: «stem (side).ext», numbered there if taken. */
	let esempio = $derived.by(() => {
		const stem = voci[0].name.replace(/\.[^.]+$/, '');
		return `${stem}${lato ? ` (${lato})` : ''}.${formato}`;
	});

	function converti() {
		onconverti({ target: formato, maxSide: lato, quality: Math.min(100, Math.max(1, Math.round(qualita) || 85)) });
	}
</script>

<div
	class="sfondo"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onclose()}
	onkeydown={(e) => e.key === 'Escape' && onclose()}
>
	<div bind:this={finestra} class="finestra" role="dialog" aria-modal="true" aria-label="Converti immagini">
		<h2>{voci.length === 1 ? `Converti «${voci[0].name}»` : `Converti ${voci.length} immagini`}</h2>

		<div class="campi">
			<span>Formato</span>
			<div class="scelte" role="radiogroup" aria-label="Formato">
				{#each FORMATI as f (f.id)}
					<button role="radio" aria-checked={formato === f.id} class:acceso={formato === f.id} onclick={() => (formato = f.id)}>{f.nome}</button>
				{/each}
			</div>

			<span>Lato massimo</span>
			<div class="scelte" role="radiogroup" aria-label="Lato massimo">
				{#each LATI as l (l)}
					<button role="radio" aria-checked={lato === l} class:acceso={lato === l} onclick={() => (lato = l)}
						>{l ? `${l} px` : 'Originale'}</button
					>
				{/each}
			</div>

			{#if formato === 'jpg'}
				<label for="qualita">Qualità</label>
				<input id="qualita" type="number" min="1" max="100" bind:value={qualita} />
			{/if}

			<span>Nome</span>
			<span class="esempio">{esempio}</span>
		</div>

		<p class="nota">Gli originali restano intatti: le immagini nuove vanno accanto.</p>

		<div class="azioni">
			<button onclick={onclose}>Annulla</button>
			<button class="primario" onclick={converti}>Converti</button>
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
	.campi {
		display: grid;
		grid-template-columns: 100px minmax(0, 1fr);
		gap: 10px 12px;
		align-items: center;
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.campi > span:nth-child(odd),
	.campi > label {
		color: var(--text-dim);
	}
	.scelte {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.esempio {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.nota {
		margin: 0;
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	input {
		width: 72px;
		height: 26px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-variant-numeric: tabular-nums;
	}
	input:focus {
		border-color: var(--accent);
		outline: none;
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
	.scelte button {
		height: 24px;
		padding: 0 10px;
	}
	button.acceso {
		background: var(--accent-soft);
		border-color: transparent;
	}
	button:hover {
		background: var(--row-hover);
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
	.primario:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
</style>
