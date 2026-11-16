<script lang="ts">
	import { t, locale } from '../i18n';
	import { locationName, nameOf } from '../locations';
	import { describeOperation, type HistoryEntry, type Operation } from '../stores/undo.svelte';
	import Icon from './Icon.svelte';

	/**
	 * The last 30 days of operations, newest first, grouped by day. Each one
	 * can be undone on its own; one that can no longer be undone stays,
	 * switched off, with the reason.
	 */
	let {
		entries,
		onundo,
		onclose
	}: {
		entries: HistoryEntry[];
		onundo: (id: string) => void;
		onclose: () => void;
	} = $props();

	let busy = $state<string | null>(null);

	const parentOf = (p: string) => p.replace(/[\\/]+[^\\/]+[\\/]*$/, '') || p;

	/** Where it happened, in a few words. */
	function detail(op: Operation): string {
		switch (op.kind) {
			case 'rename':
				return `${nameOf(op.from)} → ${nameOf(op.to)}`;
			case 'batchRename':
				return locationName(parentOf(op.steps[0][0]));
			case 'move':
				return `${locationName(parentOf(op.pairs[0][0]))} → ${locationName(parentOf(op.pairs[0][1]))}`;
			case 'create':
				return locationName(parentOf(op.paths[0]));
			case 'trash':
				return op.originals.length === 1 ? nameOf(op.originals[0]) : locationName(parentOf(op.originals[0]));
			case 'rotate':
				return locationName(parentOf(op.paths[0]));
		}
	}

	const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

	function dayOf(at: number): string {
		const d = new Date(at);
		const today = new Date();
		const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const days = Math.round((start(today) - start(d)) / 86_400_000);
		if (days === 0) return t('Oggi');
		if (days === 1) return t('Ieri');
		return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
	}

	let groups = $derived.by(() => {
		const out: Array<{ day: string; items: HistoryEntry[] }> = [];
		for (const e of [...entries].reverse()) {
			const day = dayOf(e.at);
			if (out[out.length - 1]?.day !== day) out.push({ day, items: [] });
			out[out.length - 1].items.push(e);
		}
		return out;
	});

	const time = (at: number) => new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

	async function undo(id: string) {
		busy = id;
		try {
			await onundo(id);
		} finally {
			busy = null;
		}
	}
</script>

<aside class="history" aria-label={t('Cronologia')}>
	<header>
		<h2>{t('Cronologia')}</h2>
		<button class="close" aria-label={t('Chiudi')} title={t('Chiudi (Ctrl+H)')} onclick={onclose}><Icon name="close" /></button>
	</header>

	{#if groups.length === 0}
		<p class="empty">{t('Qui compaiono le operazioni sui file degli ultimi 30 giorni: spostamenti, copie, rinomine, eliminazioni. Ognuna si può annullare.')}</p>
	{:else}
		<div class="list">
			{#each groups as g (g.day)}
				<h3>{g.day}</h3>
				{#each g.items as e (e.id)}
					<div class="op" class:off={e.undone || e.failed}>
						<span class="what">{capital(describeOperation(e.op))}</span>
						<span class="where">{detail(e.op)} · {time(e.at)}</span>
						{#if e.undone}
							<span class="state">{t('Annullata')}</span>
						{:else if e.failed}
							<span class="state">{e.failed}</span>
						{:else}
							<button class="undo" disabled={busy !== null} onclick={() => void undo(e.id)}>
								{busy === e.id ? t('Annullo…') : t('Annulla operazione')}
							</button>
						{/if}
					</div>
				{/each}
			{/each}
		</div>
	{/if}
</aside>

<style>
	.history {
		display: flex;
		flex-direction: column;
		width: 280px;
		flex-shrink: 0;
		border-left: 1px solid var(--border);
		background: var(--surface);
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 40px;
		padding: 0 6px 0 14px;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		font: 600 calc(11px * var(--text-scale, 1)) var(--font-display, inherit);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	.close {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-dim);
	}
	.close:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.list {
		overflow-y: auto;
		padding: 4px 8px 12px;
		display: grid;
		gap: 4px;
		align-content: start;
	}
	h3 {
		margin: 10px 6px 2px;
		font: 600 calc(10px * var(--text-scale, 1)) var(--font-display, inherit);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	.op {
		display: grid;
		gap: 1px;
		padding: 7px 8px;
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.what {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.where,
	.state {
		color: var(--text-dim);
		font-size: calc(11px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}
	.op.off {
		opacity: 0.6;
	}
	.undo {
		justify-self: start;
		margin: 3px 0 0 -6px;
		height: 22px;
		padding: 0 6px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--current);
		font: inherit;
		font-size: calc(11px * var(--text-scale, 1));
	}
	.undo:hover:not(:disabled) {
		background: var(--accent-soft);
	}
	.undo:disabled {
		color: var(--text-dim);
	}
	button:focus-visible {
		outline: 2px solid var(--current);
		outline-offset: 1px;
	}
	.empty {
		margin: 0;
		padding: 16px 14px;
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
</style>
