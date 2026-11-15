<script lang="ts">
	import { t } from '../i18n';
	import type { Entry, ImageTarget } from '../ipc';

	/**
	 * Convert and resize images into new files beside the originals, which
	 * stay as they are. The dialog only chooses; the page runs the job.
	 */
	let {
		items,
		onconvert,
		onclose
	}: {
		items: Entry[];
		onconvert: (o: { target: ImageTarget; maxSide: number | null; quality: number }) => void;
		onclose: () => void;
	} = $props();

	const FORMATS: Array<{ id: ImageTarget; name: string }> = [
		{ id: 'jpg', name: 'JPG' },
		{ id: 'png', name: 'PNG' },
		{ id: 'webp', name: 'WebP' }
	];
	const SIDES: Array<number | null> = [null, 3840, 1920, 1280, 640];

	let format = $state<ImageTarget>('jpg');
	let side = $state<number | null>(1920);
	let quality = $state(85);
	let dialog = $state<HTMLElement | null>(null);

	$effect(() => {
		dialog?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
	});

	/** Same rule as Rust: «stem (side).ext», numbered there if taken. */
	let example = $derived.by(() => {
		const stem = items[0].name.replace(/\.[^.]+$/, '');
		return `${stem}${side ? ` (${side})` : ''}.${format}`;
	});

	function convert() {
		onconvert({ target: format, maxSide: side, quality: Math.min(100, Math.max(1, Math.round(quality) || 85)) });
	}
</script>

<div
	class="backdrop"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onclose()}
	onkeydown={(e) => e.key === 'Escape' && onclose()}
>
	<div bind:this={dialog} class="dialog" role="dialog" aria-modal="true" aria-label={t('Converti immagini')}>
		<h2>{items.length === 1 ? t('Converti «{0}»', [items[0].name]) : t('Converti {0} immagini', [items.length])}</h2>

		<div class="fields">
			<span>{t('Formato')}</span>
			<div class="choices" role="radiogroup" aria-label={t('Formato')}>
				{#each FORMATS as f (f.id)}
					<button role="radio" aria-checked={format === f.id} class:on={format === f.id} onclick={() => (format = f.id)}>{f.name}</button>
				{/each}
			</div>

			<span>{t('Lato massimo')}</span>
			<div class="choices" role="radiogroup" aria-label={t('Lato massimo')}>
				{#each SIDES as l (l)}
					<button role="radio" aria-checked={side === l} class:on={side === l} onclick={() => (side = l)}
						>{l ? `${l} px` : t('Originale')}</button
					>
				{/each}
			</div>

			{#if format === 'jpg'}
				<label for="quality">{t('Qualità')}</label>
				<input id="quality" type="number" min="1" max="100" bind:value={quality} />
			{/if}

			<span>{t('Nome')}</span>
			<span class="example">{example}</span>
		</div>

		<p class="note">{t('Gli originali restano intatti: le immagini nuove vanno accanto.')}</p>

		<div class="actions">
			<button onclick={onclose}>{t('Annulla')}</button>
			<button class="primary" onclick={convert}>{t('Converti')}</button>
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
		width: min(480px, 92vw);
		padding: 20px;
		display: grid;
		gap: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--shape, none);
		mask: var(--mask, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	h2 {
		margin: 0;
		font-size: calc(15px * var(--text-scale, 1));
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fields {
		display: grid;
		grid-template-columns: 100px minmax(0, 1fr);
		gap: 10px 12px;
		align-items: center;
		font-size: calc(12px * var(--text-scale, 1));
	}
	.fields > span:nth-child(odd),
	.fields > label {
		color: var(--text-dim);
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.example {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.note {
		margin: 0;
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
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
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
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
	.choices button {
		height: 24px;
		padding: 0 10px;
	}
	button.on {
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
	.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	.primary:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
</style>
