<script lang="ts">
	/** The transfer queue under the progress bar: the running job, then the waiting ones. */
	let {
		corrente,
		coda,
		inPausa,
		onpausa,
		onannullaCorrente,
		onsu,
		ontogli
	}: {
		corrente: { id: number; titolo: string };
		coda: Array<{ id: number; titolo: string }>;
		inPausa: boolean;
		onpausa: () => void;
		onannullaCorrente: () => void;
		onsu: (id: number) => void;
		ontogli: (id: number) => void;
	} = $props();
</script>

<ul class="coda" aria-label="Coda dei trasferimenti">
	<li class="corrente">
		<span class="titolo">{corrente.titolo}<small>{inPausa ? 'in pausa' : 'in corso'}</small></span>
		<button onclick={onpausa}>{inPausa ? 'Riprendi' : 'Pausa'}</button>
		<button onclick={onannullaCorrente} aria-label="Annulla il trasferimento in corso">✕</button>
	</li>
	{#each coda as l, i (l.id)}
		<li>
			<span class="titolo">{l.titolo}<small>in coda</small></span>
			<button onclick={() => onsu(l.id)} disabled={i === 0} aria-label={`Anticipa «${l.titolo}»`}>↑</button>
			<button onclick={() => ontogli(l.id)} aria-label={`Togli dalla coda «${l.titolo}»`}>✕</button>
		</li>
	{/each}
</ul>

<style>
	.coda {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 6px 12px;
		list-style: none;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 6px;
		align-items: center;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
	}
	li.corrente {
		background: var(--row-hover);
	}
	.titolo {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	small {
		margin-left: 8px;
		color: var(--text-dim);
	}
	button {
		min-width: 24px;
		height: 24px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
	}
	button:hover:not(:disabled) {
		background: var(--row-hover);
		color: var(--text);
	}
	button:disabled {
		opacity: 0.35;
	}
</style>
