<script lang="ts">
	/**
	 * Schermata per una lista che non ha niente da mostrare.
	 *
	 * Uno schermo vuoto è un invito ad agire, non un errore: ogni variante
	 * dice cosa è successo e quale mossa resta a disposizione.
	 */
	let {
		variante,
		azione = undefined,
		onazione = undefined
	}: {
		variante: 'cartellaVuota' | 'nessunRisultato' | 'accessoNegato' | 'nonPronta';
		azione?: string;
		onazione?: () => void;
	} = $props();

	const testi = {
		cartellaVuota: {
			titolo: 'Deposito vuoto',
			corpo: 'Qui non c’è ancora niente. Crea una cartella o incolla quello che hai copiato.'
		},
		nessunRisultato: {
			titolo: 'Nessuna corrispondenza',
			corpo: 'Nessun elemento di questa cartella corrisponde alla ricerca.'
		},
		accessoNegato: {
			titolo: 'Segnale rosso',
			corpo: 'Windows non concede l’accesso a questa cartella con i permessi attuali.'
		},
		nonPronta: {
			titolo: 'Binario interrotto',
			corpo: 'L’unità non risponde. Controlla che il supporto sia inserito o la rete raggiungibile.'
		}
	} as const;
</script>

<div class="vuoto">
	<svg viewBox="0 0 64 40" width="192" height="120" shape-rendering="crispEdges" aria-hidden="true">
		<!-- Binario: presente in tutte le varianti, è il filo del progetto -->
		<rect class="traversa" x="4" y="33" width="56" height="1" />
		<rect class="rotaia" x="4" y="35" width="56" height="1" />
		{#each [8, 18, 28, 38, 48] as x (x)}
			<rect class="traversina" {x} y="34" width="2" height="1" />
		{/each}

		{#if variante === 'cartellaVuota'}
			<!-- Deposito aperto e sgombro -->
			<rect class="struttura" x="16" y="14" width="32" height="19" />
			<rect class="interno" x="19" y="18" width="26" height="15" />
			<rect class="tetto" x="14" y="11" width="36" height="3" />
			<rect class="ombra" x="22" y="26" width="20" height="7" />
		{:else if variante === 'nessunRisultato'}
			<!-- Lente sopra il binario -->
			<rect class="vetro" x="22" y="8" width="14" height="2" />
			<rect class="vetro" x="20" y="10" width="2" height="10" />
			<rect class="vetro" x="36" y="10" width="2" height="10" />
			<rect class="vetro" x="22" y="20" width="14" height="2" />
			<rect class="manico" x="37" y="22" width="2" height="2" />
			<rect class="manico" x="39" y="24" width="2" height="2" />
			<rect class="manico" x="41" y="26" width="2" height="2" />
		{:else if variante === 'accessoNegato'}
			<!-- Segnale ferroviario col disco rosso acceso -->
			<rect class="palo" x="31" y="16" width="2" height="17" />
			<rect class="lanterna" x="26" y="6" width="12" height="12" />
			<rect class="rosso" x="29" y="9" width="6" height="6" />
		{:else}
			<!-- Binario che si interrompe -->
			<rect class="rotto" x="30" y="30" width="2" height="8" />
			<rect class="rotto" x="34" y="28" width="2" height="6" />
			<rect class="scintilla" x="28" y="24" width="2" height="2" />
			<rect class="scintilla" x="36" y="22" width="2" height="2" />
		{/if}
	</svg>

	<h2>{testi[variante].titolo}</h2>
	<p>{testi[variante].corpo}</p>

	{#if azione && onazione}
		<button onclick={onazione}>{azione}</button>
	{/if}
</div>

<style>
	.vuoto {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		flex: 1;
		padding: 24px;
		text-align: center;
		background: var(--surface);
	}

	h2 {
		margin: 12px 0 0;
		font-family: var(--font-display);
		font-size: calc(15px * var(--scala-titoli, var(--scala-testo, 1)));
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text);
	}

	p {
		margin: 0;
		max-width: 42ch;
		color: var(--text-dim);
		line-height: 1.6;
	}

	button {
		margin-top: 14px;
		height: 30px;
		padding: 0 16px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
		border-color: var(--current);
	}

	.rotaia,
	.traversa {
		fill: var(--rail-metal);
	}
	.traversina {
		fill: #4a4360;
	}
	.struttura {
		fill: #2c2740;
	}
	.interno {
		fill: #1b1826;
	}
	.tetto {
		fill: var(--plasma);
	}
	.ombra {
		fill: #15121f;
	}
	.vetro {
		fill: var(--current);
	}
	.manico {
		fill: var(--plasma);
	}
	.palo {
		fill: var(--rail-metal);
	}
	.lanterna {
		fill: #2c2740;
	}
	.rosso {
		fill: #ff5f6e;
	}
	.rotto {
		fill: var(--rail-metal);
	}
	.scintilla {
		fill: var(--signal);
	}
</style>
