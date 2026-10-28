<script lang="ts">
	import type { Progresso } from '../ipc';

	let {
		progresso,
		modo,
		oncancel
	}: {
		progresso: Progresso;
		modo: 'copy' | 'move' | 'comprimi' | 'estrai' | 'invio' | 'ricezione';
		oncancel: () => void;
	} = $props();

	let percentuale = $derived(
		progresso.total === 0
			? 0
			: Math.min(100, Math.round((progresso.transferred / progresso.total) * 100))
	);

	const ETICHETTE = {
		copy: 'Copia',
		move: 'Spostamento',
		comprimi: 'Compressione',
		estrai: 'Estrazione',
		invio: 'Invio in rete locale',
		ricezione: 'Ricezione dalla rete locale'
	} as const;

	function byte(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
		if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
		return `${(n / 1024 ** 3).toFixed(2)} GB`;
	}
</script>

<div class="barra">
	<span class="etichetta">{ETICHETTE[modo]} in corso…</span>

	<div
		class="traccia"
		role="progressbar"
		aria-valuenow={percentuale}
		aria-valuemin="0"
		aria-valuemax="100"
	>
		<div class="riempimento" style:width="{percentuale}%">
			<span class="testa"></span>
		</div>
	</div>

	<span class="numeri">
		{byte(progresso.transferred)} di {byte(progresso.total)} · {percentuale}%
	</span>

	<button onclick={oncancel}>Annulla</button>
</div>

<style>
	.barra {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 40px;
		padding: 0 12px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.etichetta {
		white-space: nowrap;
		font-family: var(--font-display);
		font-size: calc(12px * var(--scala-testo, 1));
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	/* Il tratto di binario già percorso dal carico. */
	.traccia {
		position: relative;
		flex: 1;
		min-width: 60px;
		height: 6px;
		border-radius: 3px;
		background: var(--rail-metal);
	}
	.riempimento {
		position: relative;
		height: 100%;
		border-radius: 3px;
		background: linear-gradient(90deg, var(--plasma), var(--current));
		transition: width 120ms linear;
	}
	/* Il muso del convoglio: dove la corrente è arrivata adesso. */
	.testa {
		position: absolute;
		right: -1px;
		top: 50%;
		width: 3px;
		height: 12px;
		transform: translateY(-50%);
		border-radius: 2px;
		background: var(--current);
		box-shadow: 0 0 10px var(--current);
	}
	.numeri {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	button {
		height: 24px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
	}
</style>
