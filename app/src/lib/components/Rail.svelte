<script lang="ts">
	/**
	 * Binario elettrificato.
	 *
	 * Non è ornamento: la velocità e la luminosità della corrente dicono se
	 * il sistema sta muovendo dati. A riposo passa un impulso ogni nove
	 * secondi, appena percettibile; sotto carico ne passano due, veloci e
	 * accesi. Guardare il binario deve bastare per sapere se sta lavorando.
	 */
	let {
		orientamento = 'orizzontale',
		attivo = false
	}: {
		orientamento?: 'orizzontale' | 'verticale';
		attivo?: boolean;
	} = $props();
</script>

<div
	class="binario"
	class:verticale={orientamento === 'verticale'}
	class:attivo
	aria-hidden="true"
>
	<span class="corrente"></span>
	{#if attivo}
		<span class="corrente seconda"></span>
	{/if}
</div>

<style>
	/* Due fili paralleli: il binario spento è metallo, non una linea sola. */
	.binario {
		position: relative;
		flex-shrink: 0;
		height: 5px;
		overflow: hidden;
		background:
			linear-gradient(var(--rail-metal), var(--rail-metal)) 0 1px / 100% 1px no-repeat,
			linear-gradient(var(--rail-metal), var(--rail-metal)) 0 3px / 100% 1px no-repeat;
	}

	.binario.verticale {
		width: 5px;
		height: auto;
		align-self: stretch;
		background:
			linear-gradient(var(--rail-metal), var(--rail-metal)) 1px 0 / 1px 100% no-repeat,
			linear-gradient(var(--rail-metal), var(--rail-metal)) 3px 0 / 1px 100% no-repeat;
	}

	/* L'alone del nucleo deve uscire dai cinque pixel del binario: il clip
	   resta, ma con un margine. */
	.binario {
		overflow: clip;
		overflow-clip-margin: 8px;
	}

	/* Solo transform e opacity: restano sul compositore, non ridisegnano.
	   La corrente ha un verso: una coda di plasma che si spegne dietro e un
	   nucleo bianco davanti, l'unica cosa dell'app che fa luce. */
	.corrente {
		position: absolute;
		top: 0;
		left: 0;
		width: 24%;
		height: 100%;
		opacity: 0.3;
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in srgb, var(--plasma) 70%, transparent) 45%,
			var(--current) 88%,
			transparent
		);
		animation: scorre 9s linear infinite;
	}
	.corrente::after {
		content: '';
		position: absolute;
		top: 0;
		right: 6%;
		width: 6px;
		height: 100%;
		background: #fff;
		box-shadow:
			0 0 3px #fff,
			0 0 10px 2px var(--current);
	}

	.verticale .corrente {
		width: 100%;
		height: 24%;
		background: linear-gradient(
			180deg,
			transparent,
			color-mix(in srgb, var(--plasma) 70%, transparent) 45%,
			var(--current) 88%,
			transparent
		);
		animation-name: scorre-verticale;
	}
	.verticale .corrente::after {
		top: auto;
		right: 0;
		bottom: 6%;
		width: 100%;
		height: 6px;
	}

	.attivo .corrente {
		opacity: 1;
		animation-duration: 1.6s;
	}

	.seconda {
		animation-delay: 0.8s;
	}

	@keyframes scorre {
		from {
			transform: translateX(-110%);
		}
		to {
			transform: translateX(520%);
		}
	}

	@keyframes scorre-verticale {
		from {
			transform: translateY(-110%);
		}
		to {
			transform: translateY(520%);
		}
	}

	/* Senza movimento resta il binario acceso ma fermo: l'informazione
	   "sta lavorando" passa dalla luminosità invece che dal moto. */
	@media (prefers-reduced-motion: reduce) {
		.corrente {
			animation: none;
			transform: none;
			width: 100%;
			opacity: 0.18;
		}
		.corrente::after {
			display: none;
		}
		.verticale .corrente {
			height: 100%;
		}
		.attivo .corrente {
			opacity: 0.6;
		}
		.seconda {
			display: none;
		}
	}
</style>
