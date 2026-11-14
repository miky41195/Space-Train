<script lang="ts">
	import { locationName } from '../locations';

	/** Head of one half of the dual pane: a stop on the route, lit on the active pane. */
	let { path, active = false }: { path: string; active?: boolean } = $props();
</script>

<div class="pane-header" class:active title={path}>
	<i aria-hidden="true"></i><span>{locationName(path)}</span>
</div>

<style>
	.pane-header {
		display: flex;
		align-items: center;
		gap: 8px;
		height: calc(26px * var(--text-scale, 1));
		padding: 0 12px;
		border-bottom: 1px solid var(--border);
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
		flex-shrink: 0;
		min-width: 0;
	}
	.pane-header span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	i {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--rail-metal);
	}
	.active {
		color: var(--text);
	}
	.active span {
		font-weight: 600;
	}
	.active i {
		width: 8px;
		height: 8px;
		background: var(--current);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--current) 20%, transparent);
	}
</style>
