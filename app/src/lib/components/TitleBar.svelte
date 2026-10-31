<script lang="ts">
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import type { TabsStore } from '../stores/tabs.svelte';
	import { NUOVA_SCHEDA, eVirtuale, nomePosizione } from '../posizioni';

	let {
		store,
		bersaglio = null,
		onnovita = undefined,
		onimpostazioni = undefined
	}: {
		store: TabsStore;
		/** Cartella sopra cui passa un trascinamento. */
		bersaglio?: string | null;
		/** Riapre le novità della versione installata. */
		onnovita?: () => void;
		onimpostazioni?: () => void;
	} = $props();

	const win = getCurrentWindow();

	/**
	 * A finestra in secondo piano le lampade si spengono, come i segnali di
	 * una linea non alimentata. È il dettaglio che distingue la finestra
	 * attiva quando ne hai due aperte affiancate.
	 */
	let attiva = $state(true);

	function nomeTab(path: string): string {
		return nomePosizione(path);
	}
</script>

<svelte:window onfocus={() => (attiva = true)} onblur={() => (attiva = false)} />

<header class="titlebar" data-tauri-drag-region class:inattiva={!attiva}>
	<span class="marchio" data-tauri-drag-region>Space Train</span>

	<!-- Lo spazio libero fra le schede, dove passa il treno, sposta la
	     finestra come la scritta: Tauri reagisce solo se il clic cade
	     proprio su un elemento marcato, quindi le schede restano cliccabili. -->
	<!-- Una cartella rilasciata nello spazio libero fra le schede si apre in
	     una scheda nuova: `data-nuova-scheda` lo distingue da una scheda. -->
	<div class="tabs" data-tauri-drag-region data-nuova-scheda class:bersaglio={bersaglio === NUOVA_SCHEDA}>
		{#each store.tabs as tab (tab.id)}
			<button
				class="tab"
				class:active={tab.id === store.activeId}
				class:bersaglio={bersaglio === tab.path}
				data-cartella={eVirtuale(tab.path) ? undefined : tab.path}
				title={tab.path}
				onclick={() => store.setActive(tab.id)}
				onauxclick={(e) => {
					// Clic con la rotella: chiude, come nei browser.
					if (e.button === 1) store.closeTab(tab.id);
				}}
			>
				<span class="label">{nomeTab(tab.path)}</span>
				<span
					class="chiudi"
					role="button"
					tabindex="0"
					onclick={(e) => {
						e.stopPropagation();
						store.closeTab(tab.id);
					}}
					onkeydown={(e) => e.key === 'Enter' && store.closeTab(tab.id)}
					><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></span
				>
			</button>
		{/each}
		<button
			class="nuovo"
			onclick={() => store.openTab(store.activeTab?.path ?? 'C:\\')}
			title="Nuova scheda (Ctrl+T)"
			aria-label="Nuova scheda"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button
		>
	</div>

	{#if onnovita || onimpostazioni}
		<!-- Strumenti della finestra, prima delle lampade e staccati da un filo:
		     sono pulsanti, non segnali. -->
		<div class="strumenti">
			{#if onnovita}
				<button class="strumento" onclick={onnovita} title="Novità di questa versione" aria-label="Novità di questa versione">
					<svg viewBox="0 0 16 16" aria-hidden="true"
						><path d="M2 6.5v3h2.2L10 13V3L4.2 6.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /><path
							d="M12.3 5.6a3.3 3.3 0 0 1 0 4.8M4.6 9.6l.9 4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
							stroke-linecap="round"
						/></svg
					>
				</button>
			{/if}
			{#if onimpostazioni}
				<button class="strumento" onclick={onimpostazioni} title="Impostazioni" aria-label="Impostazioni">
					<svg viewBox="0 0 16 16" aria-hidden="true"
						><circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4" /><path
							d="M6.8 1.5h2.4l.4 1.8 1.2.7 1.8-.6 1.2 2.1-1.4 1.2v1.4l1.4 1.2-1.2 2.1-1.8-.6-1.2.7-.4 1.8H6.8l-.4-1.8-1.2-.7-1.8.6-1.2-2.1 1.4-1.2V7.3L2.2 6.1l1.2-2.1 1.8.6 1.2-.7z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
							stroke-linejoin="round"
						/></svg
					>
				</button>
			{/if}
		</div>
	{/if}

	<!-- A destra, come su Windows: chiudi resta l'ultimo, nell'angolo che
	     la mano cerca. Cambia la posizione, non il trattamento. -->
	<div class="lampade">
		<button class="lampada riduci" onclick={() => win.minimize()} aria-label="Riduci a icona">
			<svg viewBox="0 0 8 8" aria-hidden="true"
				><path d="M2 4 L6 4" stroke="currentColor" stroke-width="1.4" /></svg
			>
		</button>
		<button class="lampada allarga" onclick={() => win.toggleMaximize()} aria-label="Ingrandisci">
			<svg viewBox="0 0 8 8" aria-hidden="true"
				><path
					d="M2.5 5.5 L2.5 2.5 L5.5 2.5 M5.5 2.5 L2.5 5.5"
					stroke="currentColor"
					stroke-width="1.3"
					fill="none"
				/></svg
			>
		</button>
		<button class="lampada chiudi" onclick={() => win.close()} aria-label="Chiudi">
			<svg viewBox="0 0 8 8" aria-hidden="true"
				><path d="M2 2 L6 6 M6 2 L2 6" stroke="currentColor" stroke-width="1.4" /></svg
			>
		</button>
	</div>
</header>

<style>
	/* Tre strati, perché il convoglio passi fra lo sfondo e il contenuto:
	   il cielo sta in un ::before sotto il convoglio (z 3, nella linea
	   principale), marchio, schede e lampade sopra (z 4). */
	.titlebar {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 40px;
		padding-left: 8px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	/* Il pezzo di cielo che il convoglio attraversa: fondo dello spazio e
	   il disegno del tema (stelle, griglia, bolle…: `variabiliCielo`). */
	.titlebar::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--stelle, none) 0 0 / var(--cielo-misura, 480px 40px) repeat, var(--bg);
		pointer-events: none;
	}
	.marchio,
	.tabs,
	.lampade {
		position: relative;
		z-index: 4;
	}
	/* Il marchio in DIN, spaziato come una targa di stazione. Piccolo:
	   deve dare identità, non rubare spazio ai tab. */
	.marchio {
		flex-shrink: 0;
		padding: 0 12px 0 4px;
		font-family: var(--font-display);
		font-size: calc(12px * var(--scala-titoli, var(--scala-testo, 1)));
		font-weight: 600;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--text-dim);
		user-select: none;
	}

	.tabs {
		display: flex;
		align-items: flex-end;
		align-self: stretch;
		gap: 4px;
		overflow-x: auto;
		scrollbar-width: none;
		flex: 1;
	}
	.tabs.bersaglio {
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	/* Le schede poggiano sul bordo inferiore della testata; il profilo
	   (tetto, trapezio, arco, pillola) viene dal tema: `variabiliForme`. */
	.tab {
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 180px;
		height: var(--scheda-altezza, 32px);
		margin-bottom: var(--scheda-stacco, 0px);
		padding: var(--scheda-margini, 0 8px 0 12px);
		border: none;
		border-radius: var(--scheda-raggio, var(--radius-sm) var(--radius-sm) 0 0);
		clip-path: var(--scheda-forma, none);
		mask: var(--scheda-maschera, none);
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
		white-space: nowrap;
	}
	.tab:hover {
		background: var(--row-hover);
	}
	.tab.bersaglio {
		box-shadow: inset 0 0 0 1px var(--current);
	}
	/* La scheda aperta è un pezzo della fiancata: stessa superficie del
	   contenuto, niente cornice. */
	.tab.active {
		background: var(--surface);
		color: var(--text);
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tab .chiudi {
		display: inline-flex;
		opacity: 0.5;
		padding: 0 2px;
	}
	.tab .chiudi:hover {
		opacity: 1;
	}
	.nuovo {
		align-self: center;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: transparent;
		color: var(--text-dim);
		font-size: calc(16px * var(--scala-testo, 1));
		cursor: default;
	}
	.nuovo:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	/* Tre lampade di segnalazione. La forma è quella del semaforo Mac —
	   pastiglie tonde — ma il trattamento è ferroviario: ghiera scura,
	   nucleo acceso, riflesso in alto a sinistra. Non fanno alone: l'unica
	   luce che si spande nella finestra è la corrente. */
	.lampade {
		display: flex;
		gap: 8px;
		padding: 0 14px 0 12px;
		flex-shrink: 0;
	}

	.strumenti {
		position: relative;
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 2px;
		padding-right: 10px;
		border-right: 1px solid var(--border);
		height: 16px;
		flex-shrink: 0;
	}
	.strumento {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: transparent;
		color: var(--text-dim);
		cursor: default;
	}
	.strumento svg {
		width: 16px;
		height: 16px;
	}
	.strumento:hover {
		background: var(--row-hover);
		color: var(--text);
	}

	.lampada {
		position: relative;
		width: 13px;
		height: 13px;
		padding: 0;
		border: 1px solid rgba(0, 0, 0, 0.55);
		border-radius: 50%;
		background: var(--nucleo);
		color: transparent;
		cursor: default;
		transition:
			box-shadow 160ms ease,
			color 160ms ease;
	}

	/* Il riflesso: è ciò che fa leggere il cerchio come una lampada di
	   vetro invece che come un pallino colorato. */
	.lampada::after {
		content: '';
		position: absolute;
		top: 1.5px;
		left: 2.5px;
		width: 4px;
		height: 3px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.45);
		pointer-events: none;
	}

	.lampada svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.chiudi {
		--nucleo: #ff5f6e;
		--alone: #ff5f6e;
	}
	.riduci {
		--nucleo: var(--signal);
		--alone: var(--signal);
	}
	.allarga {
		--nucleo: var(--current);
		--alone: var(--current);
	}

	/* I simboli compaiono passando sul gruppo, non sulla singola lampada:
	   così si legge come una pulsantiera unica. */
	.lampade:hover .lampada {
		color: rgba(0, 0, 0, 0.62);
	}

	/* Al passaggio la ghiera si accende del colore della lampada. */
	.lampada:hover,
	.lampada:focus-visible {
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--alone) 45%, transparent);
	}

	.lampada:active {
		filter: brightness(0.8);
	}

	/* Spente, ma non invisibili: restano cliccabili e riconoscibili. */
	.inattiva .lampada {
		background: #4a4360;
	}
	.inattiva .lampada::after {
		background: rgba(255, 255, 255, 0.18);
	}
	.inattiva .marchio {
		opacity: 0.55;
	}

	@media (prefers-reduced-motion: reduce) {
		.lampada {
			transition: none;
		}
	}
</style>
