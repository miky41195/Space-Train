<script lang="ts">
	import { t } from '../i18n';
	/** The transfer queue under the progress bar: the running job, then the waiting ones. */
	let {
		running,
		queue,
		paused,
		onpause,
		oncancelrunning,
		onup,
		onremove
	}: {
		running: { id: number; title: string };
		queue: Array<{ id: number; title: string }>;
		paused: boolean;
		onpause: () => void;
		oncancelrunning: () => void;
		onup: (id: number) => void;
		onremove: (id: number) => void;
	} = $props();
</script>

<ul class="queue" aria-label={t('Coda dei trasferimenti')}>
	<li class="running">
		<span class="title">{running.title}<small>{paused ? t('in pausa') : t('in corso')}</small></span>
		<button onclick={onpause}>{paused ? t('Riprendi') : t('Pausa')}</button>
		<button onclick={oncancelrunning} aria-label={t('Annulla il trasferimento in corso')}>✕</button>
	</li>
	{#each queue as l, i (l.id)}
		<li>
			<span class="title">{l.title}<small>{t('in coda')}</small></span>
			<button onclick={() => onup(l.id)} disabled={i === 0} aria-label={t('Anticipa «{0}»', [l.title])}>↑</button>
			<button onclick={() => onremove(l.id)} aria-label={t('Togli dalla coda «{0}»', [l.title])}>✕</button>
		</li>
	{/each}
</ul>

<style>
	.queue {
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
	li.running {
		background: var(--row-hover);
	}
	.title {
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
