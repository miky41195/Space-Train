<script lang="ts">
	/**
	 * La barra dei comandi di Esplora di Windows 11: «Nuovo» a sinistra, le
	 * operazioni sulla selezione come icone, poi «Ordina» e «Visualizza».
	 * A destra le opzioni che si accendono e si spengono.
	 */
	let {
		haSelezione = false,
		puoIncollare = true,
		modificabile = true,
		mostraNascosti = false,
		anteprima = false,
		recenti = false,
		onnuovo,
		ontaglia,
		oncopia,
		onincolla,
		onrinomina,
		onelimina,
		onordina,
		onvista,
		onaspetto,
		ontoggleanteprima,
		ontogglenascosti,
		ontogglerecenti
	}: {
		haSelezione?: boolean;
		puoIncollare?: boolean;
		/** Falso in Cestino, Questo PC, Rete e fra i risultati di ricerca. */
		modificabile?: boolean;
		mostraNascosti?: boolean;
		anteprima?: boolean;
		/** La zona «Modificati di recente» è accesa. */
		recenti?: boolean;
		onnuovo: (evento: MouseEvent) => void;
		ontaglia: () => void;
		oncopia: () => void;
		onincolla: () => void;
		onrinomina: () => void;
		onelimina: () => void;
		onordina: (evento: MouseEvent) => void;
		onvista: (evento: MouseEvent) => void;
		onaspetto: (evento: MouseEvent) => void;
		ontoggleanteprima: () => void;
		ontogglenascosti: () => void;
		ontogglerecenti: () => void;
	} = $props();
</script>

<div class="comandi" role="toolbar" aria-label="Comandi">
	<button class="comando nuovo" onclick={onnuovo} disabled={!modificabile} aria-haspopup="menu">
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<path d="M8 2.5v11M2.5 8h11" stroke="var(--accent)" stroke-width="1.8" />
		</svg>
		Nuovo
		<svg class="freccia" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
			<path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" stroke-width="1.2" />
		</svg>
	</button>

	<span class="stacco"></span>

	<button class="icona" onclick={ontaglia} disabled={!haSelezione} aria-label="Taglia" title="Taglia (Ctrl+X)">
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<circle cx="4.5" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3" />
			<circle cx="11.5" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3" />
			<path d="M5.8 10.3 12 2M10.2 10.3 4 2" stroke="currentColor" stroke-width="1.3" />
		</svg>
	</button>
	<button class="icona" onclick={oncopia} disabled={!haSelezione} aria-label="Copia" title="Copia (Ctrl+C)">
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
			<path d="M11 3V2.5A1.5 1.5 0 0 0 9.5 1h-6A1.5 1.5 0 0 0 2 2.5v6A1.5 1.5 0 0 0 3.5 10H4" fill="none" stroke="currentColor" stroke-width="1.3" />
		</svg>
	</button>
	<button
		class="icona"
		onclick={onincolla}
		disabled={!modificabile || !puoIncollare}
		aria-label="Incolla"
		title="Incolla (Ctrl+V)"
	>
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<rect x="3" y="2.5" width="10" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
			<rect x="5.5" y="1" width="5" height="3" rx="1" fill="currentColor" />
		</svg>
	</button>
	<button
		class="icona"
		onclick={onrinomina}
		disabled={!haSelezione || !modificabile}
		aria-label="Rinomina"
		title="Rinomina (F2)"
	>
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<path d="M2 14l1-3.5L11 2.5 13.5 5 5.5 13z" fill="none" stroke="currentColor" stroke-width="1.3" />
		</svg>
	</button>
	<button
		class="icona pericolo"
		onclick={onelimina}
		disabled={!haSelezione}
		aria-label="Elimina"
		title="Elimina (Canc)"
	>
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 10h6.6L12 4" fill="none" stroke="currentColor" stroke-width="1.3" />
		</svg>
	</button>

	<span class="stacco"></span>

	<!-- Due menu a tendina con etichetta, come in Esplora: sono le scelte
	     che si cercano per nome. -->
	<button class="comando" onclick={onordina} aria-haspopup="menu">
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<path d="M4 2v11M1.5 10.5 4 13l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.3" />
			<path d="M9 4h6M9 8h4.5M9 12h3" stroke="currentColor" stroke-width="1.3" />
		</svg>
		Ordina
		<svg class="freccia" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
			<path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" stroke-width="1.2" />
		</svg>
	</button>
	<button class="comando" onclick={onvista} aria-haspopup="menu">
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<rect x="1.5" y="2" width="13" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
			<rect x="1.5" y="7" width="13" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
			<rect x="1.5" y="12" width="13" height="2" rx="1" fill="currentColor" />
		</svg>
		Visualizza
		<svg class="freccia" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
			<path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" stroke-width="1.2" />
		</svg>
	</button>

	<span class="stacco"></span>

	<button
		class="comando"
		class:acceso={recenti}
		onclick={ontogglerecenti}
		aria-pressed={recenti}
		title="Mostra in cima ciò che è stato modificato di recente"
	>
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3" />
			<path d="M8 4v4.5l3 1.8" fill="none" stroke="currentColor" stroke-width="1.3" />
		</svg>
		Recenti
	</button>

	<div class="destra">
		<button class="icona" onclick={onaspetto} title="Aspetto" aria-label="Aspetto" aria-haspopup="menu">
			<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
				<path
					d="M8 1.5a6.5 6.5 0 1 0 0 13c1 0 1.5-.7 1.5-1.4 0-.9-.8-1.2-.8-2 0-.7.6-1.2 1.3-1.2h1.8a2.7 2.7 0 0 0 2.7-2.7C14.5 4 11.6 1.5 8 1.5z"
					fill="none"
					stroke="currentColor"
					stroke-width="1.2"
				/>
				<circle cx="4.8" cy="7.5" r="1" fill="currentColor" />
				<circle cx="7" cy="4.6" r="1" fill="currentColor" />
				<circle cx="10.4" cy="5" r="1" fill="currentColor" />
			</svg>
		</button>
		<button
			class="icona"
			class:acceso={anteprima}
			onclick={ontoggleanteprima}
			aria-pressed={anteprima}
			title="Riquadro di anteprima (Alt+P)"
			aria-label="Riquadro di anteprima"
		>
			<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
				<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
				<rect x="9" y="3" width="5" height="10" fill="currentColor" opacity="0.6" />
			</svg>
		</button>
		<!-- L'occhio acceso si vede a colpo d'occhio: stai guardando anche
		     i file di sistema. -->
		<button
			class="icona"
			class:acceso={mostraNascosti}
			onclick={ontogglenascosti}
			aria-pressed={mostraNascosti}
			title={mostraNascosti ? 'Nascondi i file di sistema' : 'Mostra i file di sistema'}
		>
			<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
				<path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" fill="none" stroke="currentColor" stroke-width="1.3" />
				<circle cx="8" cy="8" r="2" fill="currentColor" />
				{#if !mostraNascosti}
					<path d="M3 13 L13 3" stroke="currentColor" stroke-width="1.3" />
				{/if}
			</svg>
		</button>
	</div>
</div>

<style>
	.comandi {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 40px;
		padding: 0 10px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	button {
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	button:disabled {
		opacity: 0.35;
	}
	.comando {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 10px;
		white-space: nowrap;
	}
	.comando .freccia {
		color: var(--text-dim);
	}
	/* «Nuovo» è il primo gesto della barra: un po' più marcato. */
	.nuovo {
		font-weight: 600;
	}
	.icona {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 30px;
		color: var(--text-dim);
	}
	.icona:hover:not(:disabled) {
		color: var(--text);
	}
	.icona.acceso,
	.comando.acceso {
		color: var(--current);
	}
	.comando.acceso {
		background: var(--accent-soft);
	}
	.pericolo:hover:not(:disabled) {
		background: rgba(196, 43, 28, 0.22);
		color: var(--errore-testo);
	}
	.stacco {
		width: 1px;
		height: 20px;
		margin: 0 6px;
		background: var(--border);
	}
	.destra {
		display: flex;
		gap: 2px;
		margin-left: auto;
	}
</style>
