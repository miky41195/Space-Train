<script lang="ts">
	import { nomePosizione } from '../posizioni';

	/** Head of one half of the dual pane: a stop on the route, lit on the active pane. */
	let { path, attivo = false }: { path: string; attivo?: boolean } = $props();
</script>

<div class="testata" class:attivo title={path}>
	<i aria-hidden="true"></i><span>{nomePosizione(path)}</span>
</div>

<style>
	.testata {
		display: flex;
		align-items: center;
		gap: 8px;
		height: calc(26px * var(--scala-testo, 1));
		padding: 0 12px;
		border-bottom: 1px solid var(--border);
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
		flex-shrink: 0;
		min-width: 0;
	}
	.testata span {
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
	.attivo {
		color: var(--text);
	}
	.attivo span {
		font-weight: 600;
	}
	.attivo i {
		width: 8px;
		height: 8px;
		background: var(--current);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--current) 20%, transparent);
	}
</style>
