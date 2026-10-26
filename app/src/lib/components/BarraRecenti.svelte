<script lang="ts">
	import { PERIODI_RECENTI } from '../raggruppa';

	let {
		giorni,
		quanti,
		oncambia,
		onchiudi
	}: {
		/** Periodo attuale, in giorni. */
		giorni: number;
		/** Quante voci rientrano nel periodo, per il riepilogo accanto. */
		quanti: number;
		oncambia: (giorni: number) => void;
		onchiudi: () => void;
	} = $props();

	/** Il cursore scorre fra i periodi, non fra i giorni: i passi hanno un nome. */
	let indice = $derived(
		Math.max(
			0,
			PERIODI_RECENTI.findIndex((p) => p.giorni >= giorni)
		)
	);
	let periodo = $derived(PERIODI_RECENTI[indice]);
</script>

<div class="recenti" role="group" aria-label="Periodo dei recenti">
	<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
		<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3" />
		<path d="M8 4v4.5l3 1.8" fill="none" stroke="currentColor" stroke-width="1.3" />
	</svg>
	<span class="etichetta">Modificati</span>
	<input
		type="range"
		min="0"
		max={PERIODI_RECENTI.length - 1}
		step="1"
		value={indice}
		aria-label="Periodo"
		aria-valuetext={periodo.nome}
		oninput={(e) => oncambia(PERIODI_RECENTI[Number(e.currentTarget.value)].giorni)}
	/>
	<span class="periodo">{periodo.nome}</span>
	<span class="conta">{quanti === 0 ? 'nessun elemento' : quanti === 1 ? '1 elemento' : `${quanti} elementi`}</span>
	<button onclick={onchiudi} aria-label="Nascondi i recenti" title="Nascondi i recenti">×</button>
</div>

<style>
	.recenti {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 34px;
		padding: 0 14px;
		background: color-mix(in srgb, var(--current) 6%, var(--surface));
		border-bottom: 1px solid var(--border);
		color: var(--current);
		flex-shrink: 0;
	}
	.etichetta {
		color: var(--text-dim);
	}
	input {
		width: 180px;
		accent-color: var(--current);
	}
	.periodo {
		min-width: 130px;
		color: var(--text);
		font-weight: 600;
	}
	.conta {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	button {
		margin-left: auto;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-dim);
		font-size: 15px;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
</style>
