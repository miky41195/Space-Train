<script lang="ts">
	import { t } from '../i18n';
	import { ZONE_HEADER } from '../virtual';

	let {
		label,
		tone = undefined,
		count,
		top
	}: {
		label: string;
		/** Favourites have the signal colour; the other zones are neutral. */
		tone?: 'favorites' | 'recent';
		count: number;
		/** Position in the spacer: the header scrolls with its zone. */
		top: number;
	} = $props();
</script>

<div
	class="header"
	class:favorites={tone === 'favorites'}
	class:recent={tone === 'recent'}
	style:top="{top}px"
	style:height="{ZONE_HEADER}px"
	role="separator"
	aria-label={t('{0}, {1}', [label, count])}
>
	<span class="label">
		{#if tone === 'favorites'}
			<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
				<path
					fill="currentColor"
					d="M8 1.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12l-4.2 2.2.8-4.7L1.2 6.2l4.7-.7z"
				/>
			</svg>
		{:else if tone === 'recent'}
			<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
				<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6" />
				<path d="M8 4v4.5l3 1.8" fill="none" stroke="currentColor" stroke-width="1.6" />
			</svg>
		{/if}
		{label}
	</span>
	<span class="rail"></span>
	<span class="count">{String(count).padStart(2, '0')}</span>
</div>

<style>
	/* Same language as the column headers: departure board, spaced
	   uppercase. The line in the middle is the rail separating the two zones. */
	.header {
		position: absolute;
		inset-inline: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
		font-family: var(--font-display);
		font-size: calc(11px * var(--title-scale, var(--text-scale, 1)));
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dim);
		user-select: none;
	}
	.label {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.rail {
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.count {
		font-variant-numeric: tabular-nums;
	}
	.favorites {
		color: var(--signal);
	}
	.recent {
		color: var(--current);
	}
	.recent .rail {
		background: linear-gradient(90deg, color-mix(in srgb, var(--current) 50%, transparent), transparent);
	}
	.favorites .rail {
		background: linear-gradient(90deg, rgba(255, 180, 84, 0.5), transparent);
	}
</style>
