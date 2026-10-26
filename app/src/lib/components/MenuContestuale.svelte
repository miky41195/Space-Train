<script lang="ts">
	import { posizionaMenu, type AzioneMenu, type VoceMenu } from '../menu';

	let {
		voci,
		x,
		y,
		onscegli,
		onchiudi
	}: {
		voci: VoceMenu[];
		x: number;
		y: number;
		onscegli: (azione: AzioneMenu) => void;
		onchiudi: () => void;
	} = $props();

	let pannello = $state<HTMLDivElement | null>(null);
	let misura = $state({ larghezza: 0, altezza: 0 });

	// Le misure reali si conoscono solo dopo il montaggio: stimarle a
	// priori sbaglia appena cambia il numero di voci.
	$effect(() => {
		if (!pannello) return;
		voci;
		misura = { larghezza: pannello.offsetWidth, altezza: pannello.offsetHeight };
	});

	/**
	 * Derivata da x e y, non copiata: aprendo un menu mentre un altro è
	 * ancora aperto il componente non viene rimontato, e una copia
	 * lascerebbe il pannello alla posizione del clic precedente.
	 */
	let posizione = $derived(
		posizionaMenu(x, y, misura, {
			larghezza: window.innerWidth,
			altezza: window.innerHeight
		})
	);

	// Il fuoco va sulla prima voce a ogni apertura, non solo alla prima.
	$effect(() => {
		x;
		y;
		pannello?.querySelector('button')?.focus();
	});

	function tasti(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onchiudi();
			return;
		}

		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

		e.preventDefault();
		const bottoni = Array.from(pannello?.querySelectorAll('button') ?? []);
		const corrente = bottoni.indexOf(document.activeElement as HTMLButtonElement);
		const passo = e.key === 'ArrowDown' ? 1 : -1;
		// Ciclico: dal fondo si torna in cima, come in ogni menu.
		const prossimo = (corrente + passo + bottoni.length) % bottoni.length;
		bottoni[prossimo]?.focus();
	}
</script>

<svelte:window onkeydown={tasti} />

<!-- Il velo intercetta il clic fuori e la rotella: un menu che resta
     appeso mentre la lista scorre sotto è peggio di nessun menu. -->
<div
	class="velo"
	role="presentation"
	onclick={onchiudi}
	oncontextmenu={(e) => {
		e.preventDefault();
		onchiudi();
	}}
	onwheel={onchiudi}
></div>

<div
	class="menu"
	bind:this={pannello}
	role="menu"
	tabindex="-1"
	style:left="{posizione.x}px"
	style:top="{posizione.y}px"
>
	{#each voci as v (v.azione)}
		{#if v.stacca}<div class="stacco"></div>{/if}
		{#if v.sezione}<div class="sezione">{v.sezione}</div>{/if}
		{#if v.tavolozza}
			<div class="tavolozza-voce">
				<span class="titolo-tavolozza">{v.etichetta}</span>
				<div class="tavolozza" role="group" aria-label={v.etichetta}>
					{#each v.tavolozza as c (c.azione)}
						<button
							class="campione"
							class:attivo={c.attivo}
							class:vuoto={c.colore === null && !c.personalizzato}
							class:arcobaleno={c.personalizzato}
							style:--campione={c.colore ?? 'transparent'}
							role="menuitemradio"
							aria-checked={c.attivo}
							aria-label={c.nome}
							title={c.nome}
							onclick={() => onscegli(c.azione)}
						></button>
					{/each}
				</div>
			</div>
		{:else}
		<button
			role={v.spunta !== undefined ? 'menuitemcheckbox' : 'menuitem'}
			aria-checked={v.spunta}
			aria-label={v.nomeAccessibile}
			class:pericolosa={v.pericolosa}
			onclick={() => onscegli(v.azione)}
		>
			<span
				>{#if v.spunta !== undefined}<span class="spunta" aria-hidden="true"
						>{v.spunta ? '✓' : ''}</span
					>{/if}{v.etichetta}</span
			>
			{#if v.scorciatoia}<kbd>{v.scorciatoia}</kbd>{/if}
		</button>
		{/if}
	{/each}
</div>

<style>
	.velo {
		position: fixed;
		inset: 0;
		z-index: 20;
	}

	/* Un menu più alto della finestra scorre invece di uscire dallo schermo. */
	.menu {
		max-height: calc(100vh - 16px);
		overflow-y: auto;
		position: fixed;
		z-index: 21;
		min-width: 200px;
		padding: 4px;
		background: var(--hull-glass);
		backdrop-filter: blur(24px) saturate(160%);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
	}

	button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		width: 100%;
		height: 28px;
		padding: 0 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: default;
	}

	button:hover,
	button:focus-visible {
		background: var(--accent-soft);
		outline: none;
	}

	.pericolosa:hover,
	.pericolosa:focus-visible {
		background: rgba(196, 43, 28, 0.22);
		color: var(--errore-testo);
	}

	kbd {
		color: var(--text-dim);
		font: inherit;
		font-size: 11px;
	}

	.spunta {
		display: inline-block;
		width: 18px;
		color: var(--current);
	}

	.sezione {
		padding: 6px 10px 2px;
		color: var(--text-dim);
		font-size: 11px;
		letter-spacing: 0.04em;
	}

	.tavolozza-voce {
		padding: 4px 10px 6px;
	}
	.titolo-tavolozza {
		display: block;
		margin-bottom: 6px;
		color: var(--text-dim);
		font-size: 11px;
	}
	.tavolozza {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	/* I campioni di colore: tondi, il bordo acceso indica quello attuale. */
	.campione {
		width: 20px;
		height: 20px;
		padding: 0;
		border-radius: 50%;
		background: var(--campione);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
	}
	.campione:hover,
	.campione:focus-visible {
		background: var(--campione);
		transform: scale(1.12);
	}
	.campione.attivo {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--text);
	}
	/* «Personalizzato»: il colore scelto, cerchiato dall'arcobaleno. */
	.campione.arcobaleno {
		box-shadow:
			inset 0 0 0 3px var(--surface),
			0 0 0 2px transparent;
		background:
			linear-gradient(var(--campione), var(--campione)) padding-box,
			conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #8b5cf6, #ec4899, #ef4444) border-box;
		border: 3px solid transparent;
	}
	/* «Nessuno»: un tondo vuoto barrato. */
	.campione.vuoto {
		background: linear-gradient(
			135deg,
			transparent 45%,
			var(--text-dim) 45%,
			var(--text-dim) 55%,
			transparent 55%
		);
		box-shadow: inset 0 0 0 1px var(--text-dim);
	}

	.stacco {
		height: 1px;
		margin: 4px 6px;
		background: var(--border);
	}
</style>
