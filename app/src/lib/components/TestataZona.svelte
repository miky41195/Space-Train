<script lang="ts">
	import { ZONA_TESTATA } from '../virtual';

	let {
		etichetta,
		tono = undefined,
		quante,
		top
	}: {
		etichetta: string;
		/** I preferiti hanno il colore del segnale; le altre zone sono neutre. */
		tono?: 'preferiti' | 'recenti';
		quante: number;
		/** Posizione nello spaziatore: la testata scorre con la sua zona. */
		top: number;
	} = $props();
</script>

<div
	class="testata"
	class:preferiti={tono === 'preferiti'}
	class:recenti={tono === 'recenti'}
	style:top="{top}px"
	style:height="{ZONA_TESTATA}px"
	role="separator"
	aria-label="{etichetta}, {quante}"
>
	<span class="etichetta">
		{#if tono === 'preferiti'}
			<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
				<path
					fill="currentColor"
					d="M8 1.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12l-4.2 2.2.8-4.7L1.2 6.2l4.7-.7z"
				/>
			</svg>
		{:else if tono === 'recenti'}
			<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
				<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6" />
				<path d="M8 4v4.5l3 1.8" fill="none" stroke="currentColor" stroke-width="1.6" />
			</svg>
		{/if}
		{etichetta}
	</span>
	<span class="binario"></span>
	<span class="conta">{String(quante).padStart(2, '0')}</span>
</div>

<style>
	/* Stessa lingua delle intestazioni di colonna: tabellone, maiuscolo
	   spaziato. La linea in mezzo è il binario che separa le due zone. */
	.testata {
		position: absolute;
		inset-inline: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-titoli, var(--scala-testo, 1)));
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dim);
		user-select: none;
	}
	.etichetta {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.binario {
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.conta {
		font-variant-numeric: tabular-nums;
	}
	.preferiti {
		color: var(--signal);
	}
	.recenti {
		color: var(--current);
	}
	.recenti .binario {
		background: linear-gradient(90deg, color-mix(in srgb, var(--current) 50%, transparent), transparent);
	}
	.preferiti .binario {
		background: linear-gradient(90deg, rgba(255, 180, 84, 0.5), transparent);
	}
</style>
