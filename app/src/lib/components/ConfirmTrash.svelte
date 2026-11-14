<script lang="ts">
	import type { Entry } from '../ipc';

	let {
		items,
		permanent = false,
		onconfirm,
		oncancel
	}: {
		items: Entry[];
		/** Deletion without the Recycle Bin: sharper texts, no way back. */
		permanent?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	let button = $state<HTMLButtonElement | null>(null);

	// Focus starts on Annulla: an instinctive Enter must not delete anything.
	$effect(() => {
		button?.focus();
	});

	let description = $derived(
		items.length === 1 ? `«${items[0].name}»` : `${items.length} elementi`
	);
</script>

<div
	class="backdrop"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && oncancel()}
	onkeydown={(e) => e.key === 'Escape' && oncancel()}
>
	<div class="dialog" role="dialog" aria-modal="true" aria-label="Conferma eliminazione">
		<h2>{permanent ? 'Eliminare definitivamente?' : 'Spostare nel Cestino?'}</h2>

		<p>
			{description}
			{#if permanent}
				{items.length === 1 ? 'verrà eliminato' : 'verranno eliminati'} per sempre.
			{:else}
				{items.length === 1 ? 'verrà spostato' : 'verranno spostati'} nel Cestino di Windows.
			{/if}
		</p>

		{#if items.length > 1}
			<ul>
				{#each items.slice(0, 5) as v (v.path)}
					<li>{v.name}</li>
				{/each}
				{#if items.length > 5}
					<li class="rest">e altri {items.length - 5}…</li>
				{/if}
			</ul>
		{/if}

		<p class="note">
			{permanent
				? 'L’operazione non si può annullare e non passa dal Cestino.'
				: 'Puoi recuperarli dal Cestino finché non lo svuoti.'}
		</p>

		<div class="actions">
			<button bind:this={button} onclick={oncancel}>Annulla</button>
			<button class="danger" onclick={onconfirm}
				>{permanent ? 'Elimina definitivamente' : 'Sposta nel Cestino'}</button
			>
		</div>
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
		width: min(420px, 90vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	h2 {
		margin: 0 0 10px;
		font-size: calc(15px * var(--text-scale, 1));
		font-weight: 600;
	}
	p {
		margin: 0 0 10px;
		color: var(--text);
		line-height: 1.5;
	}
	.note {
		color: var(--text-dim);
	}
	ul {
		margin: 0 0 10px;
		padding-left: 18px;
		max-height: 120px;
		overflow-y: auto;
		color: var(--text-dim);
	}
	.rest {
		list-style: none;
		margin-left: -18px;
	}
	.actions {
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
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.danger {
		border-color: transparent;
		background: #c42b1c;
		color: #fff;
	}
	.danger:hover {
		background: #d13b2c;
	}
</style>
