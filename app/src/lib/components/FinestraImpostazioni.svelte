<script lang="ts">
	import type { ImpostazioniStore, DimensioneCartelle } from '../stores/impostazioni.svelte';
	import { PAUSE_TRENO, INIZIALE_PREDEFINITA, INIZIALE_ULTIMA } from '../menu';

	let {
		impostazioni,
		mostraNascosti,
		onnascosti,
		predefinito,
		onpredefinito,
		versione,
		cartellaRicevuti,
		ricevutiScelta,
		onricevuti,
		onscegliCartella,
		onnovita,
		ongalleria,
		oneditor,
		onchiudi
	}: {
		impostazioni: ImpostazioniStore;
		/** Gli elementi nascosti vivono nello store delle schede, non qui. */
		mostraNascosti: boolean;
		onnascosti: () => void;
		/** Space Train apre già le cartelle al posto di Esplora. */
		predefinito: boolean;
		onpredefinito: () => void;
		versione: string;
		/** Dove arrivano oggi i file ricevuti, anche se è quella predefinita. */
		cartellaRicevuti: string;
		/** L'utente ne ha scelta una sua. */
		ricevutiScelta: boolean;
		/** Una cartella nuova, o null per tornare a quella predefinita. */
		onricevuti: (cartella: string | null) => void;
		onscegliCartella: (titolo: string, da: string | null) => Promise<string | null>;
		onnovita: () => void;
		ongalleria: () => void;
		oneditor: () => void;
		onchiudi: () => void;
	} = $props();

	const SEZIONI = [
		{ id: 'generale', nome: 'Generale' },
		{ id: 'file', nome: 'File e cartelle' },
		{ id: 'aspetto', nome: 'Aspetto' },
		{ id: 'rete', nome: 'Rete e amici' },
		{ id: 'info', nome: 'Informazioni' }
	] as const;
	let sezione = $state<(typeof SEZIONI)[number]['id']>('generale');

	const INIZIALI = [
		{ valore: '::pc', nome: 'Questo PC' },
		{ valore: INIZIALE_PREDEFINITA, nome: 'Disco C:' },
		{ valore: INIZIALE_ULTIMA, nome: 'L’ultima cartella aperta' }
	];
	const DIMENSIONI: { valore: DimensioneCartelle; nome: string }[] = [
		{ valore: 'mai', nome: 'Mai, come Esplora' },
		{ valore: 'aperta', nome: 'Per la cartella aperta' },
		{ valore: 'richiesta', nome: 'Solo quando la chiedo' }
	];
	const GIORNI = [3, 7, 14, 30];

	async function cambiaRicevuti() {
		const scelta = await onscegliCartella('Dove salvare i file in arrivo', cartellaRicevuti || null).catch(() => null);
		if (scelta) onricevuti(scelta);
	}

	let finestra = $state<HTMLDivElement | null>(null);
	$effect(() => {
		finestra?.querySelector<HTMLButtonElement>('.sezioni button.on')?.focus();
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onchiudi()} />

{#snippet interruttore(acceso: boolean, nome: string, cambia: () => void)}
	<button class="interruttore" class:acceso role="switch" aria-checked={acceso} aria-label={nome} onclick={cambia}
	></button>
{/snippet}

<div class="sfondo" role="presentation" onclick={(e) => e.target === e.currentTarget && onchiudi()}>
	<div class="finestra" role="dialog" aria-modal="true" aria-label="Impostazioni" bind:this={finestra}>
		<nav class="sezioni" aria-label="Sezioni delle impostazioni">
			<h2>Impostazioni</h2>
			{#each SEZIONI as s (s.id)}
				<button class:on={sezione === s.id} aria-current={sezione === s.id ? 'page' : undefined} onclick={() => (sezione = s.id)}
					>{s.nome}</button
				>
			{/each}
		</nav>

		<div class="corpo">
			<button class="chiudi" onclick={onchiudi} aria-label="Chiudi le impostazioni">
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
					><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg
				>
			</button>

			{#if sezione === 'generale'}
				<h3>Generale</h3>
				<label class="voce">
					<span class="testo">All’avvio apri</span>
					<select
						value={impostazioni.paginaIniziale}
						onchange={(e) => impostazioni.imposta('paginaIniziale', e.currentTarget.value)}
					>
						{#each INIZIALI as i (i.valore)}<option value={i.valore}>{i.nome}</option>{/each}
						{#if !INIZIALI.some((i) => i.valore === impostazioni.paginaIniziale)}
							<option value={impostazioni.paginaIniziale}>{impostazioni.paginaIniziale}</option>
						{/if}
					</select>
				</label>
				<div class="voce">
					<span class="testo">Riprendi le schede della volta scorsa</span>
					{@render interruttore(impostazioni.sessione, 'Riprendi le schede della volta scorsa', () =>
						impostazioni.imposta('sessione', !impostazioni.sessione)
					)}
				</div>
				<div class="voce">
					<span class="testo"
						>Apri le cartelle con Space Train<small
							>{predefinito ? 'Ora le cartelle si aprono qui invece che in Esplora risorse.' : 'Ora le cartelle si aprono in Esplora risorse.'}</small
						></span
					>
					<button class="pulsante" onclick={onpredefinito}>{predefinito ? 'Ripristina Esplora risorse' : 'Imposta come predefinito'}</button>
				</div>
			{:else if sezione === 'file'}
				<h3>File e cartelle</h3>
				<label class="voce">
					<span class="testo"
						>Dimensione delle cartelle<small>Va letta tutta la cartella: su quelle enormi ci vuole un po’.</small></span
					>
					<select
						value={impostazioni.dimensioneCartelle}
						onchange={(e) => impostazioni.imposta('dimensioneCartelle', e.currentTarget.value as DimensioneCartelle)}
					>
						{#each DIMENSIONI as d (d.valore)}<option value={d.valore}>{d.nome}</option>{/each}
					</select>
				</label>
				<div class="voce">
					<span class="testo">Estensioni dei nomi file</span>
					{@render interruttore(impostazioni.estensioni, 'Estensioni dei nomi file', () =>
						impostazioni.imposta('estensioni', !impostazioni.estensioni)
					)}
				</div>
				<div class="voce">
					<span class="testo">Elementi nascosti</span>
					{@render interruttore(mostraNascosti, 'Elementi nascosti', onnascosti)}
				</div>
				<div class="voce">
					<span class="testo">Visualizzazione compatta</span>
					{@render interruttore(impostazioni.compatta, 'Visualizzazione compatta', () =>
						impostazioni.imposta('compatta', !impostazioni.compatta)
					)}
				</div>
				<div class="voce">
					<span class="testo">Apri con un clic<small>Come l’opzione di Esplora. Ctrl e Maiusc selezionano.</small></span>
					{@render interruttore(impostazioni.unClic, 'Apri con un clic', () => impostazioni.imposta('unClic', !impostazioni.unClic))}
				</div>
				<div class="voce">
					<span class="testo">Chiedi conferma prima di spostare nel cestino</span>
					{@render interruttore(impostazioni.confermaCestino, 'Chiedi conferma prima di spostare nel cestino', () =>
						impostazioni.imposta('confermaCestino', !impostazioni.confermaCestino)
					)}
				</div>
				<div class="voce">
					<span class="testo">Modificati di recente in cima</span>
					<span class="insieme">
						<select
							aria-label="Giorni dei modificati di recente"
							value={impostazioni.giorniRecenti}
							disabled={!impostazioni.recenti}
							onchange={(e) => impostazioni.imposta('giorniRecenti', Number(e.currentTarget.value))}
						>
							{#each GIORNI as g (g)}<option value={g}>{g} giorni</option>{/each}
							{#if !GIORNI.includes(impostazioni.giorniRecenti)}
								<option value={impostazioni.giorniRecenti}>{impostazioni.giorniRecenti} giorni</option>
							{/if}
						</select>
						{@render interruttore(impostazioni.recenti, 'Modificati di recente in cima', () =>
							impostazioni.imposta('recenti', !impostazioni.recenti)
						)}
					</span>
				</div>
			{:else if sezione === 'aspetto'}
				<h3>Aspetto</h3>
				<div class="voce">
					<span class="testo">Tema e colore d’evidenziazione</span>
					<button class="pulsante" onclick={ongalleria}>Scegli un tema…</button>
				</div>
				<div class="voce">
					<span class="testo">I tuoi temi</span>
					<button class="pulsante" onclick={oneditor}>Crea o modifica un tema…</button>
				</div>
				<div class="voce">
					<span class="testo">Animazione all’avvio</span>
					{@render interruttore(impostazioni.animazioneAvvio, 'Animazione all’avvio', () =>
						impostazioni.imposta('animazioneAvvio', !impostazioni.animazioneAvvio)
					)}
				</div>
				<label class="voce">
					<span class="testo">Passaggi del treno e dei personaggi</span>
					<select
						value={impostazioni.pausaTreno}
						onchange={(e) => impostazioni.imposta('pausaTreno', Number(e.currentTarget.value))}
					>
						{#each PAUSE_TRENO as [secondi, nome] (secondi)}<option value={secondi}>{nome}</option>{/each}
					</select>
				</label>
			{:else if sezione === 'rete'}
				<h3>Rete e amici</h3>
				<div class="voce">
					<span class="testo"
						>Cartella dei file ricevuti<small class="percorso"
							>{cartellaRicevuti || 'Quella predefinita di Space Train'}</small
						></span
					>
					<span class="insieme">
						{#if ricevutiScelta}
							<button class="pulsante" onclick={() => onricevuti(null)}>Predefinita</button>
						{/if}
						<button class="pulsante" onclick={cambiaRicevuti}>Cambia…</button>
					</span>
				</div>
				<p class="nota">Ogni volta che arrivano file puoi comunque sceglierne un’altra nel riquadro «File in arrivo».</p>
			{:else}
				<h3>Informazioni</h3>
				<div class="voce">
					<span class="testo">Versione installata</span>
					<span class="numero">{versione || '—'}</span>
				</div>
				<div class="voce">
					<span class="testo">Cosa è cambiato</span>
					<button class="pulsante" onclick={onnovita}>Novità…</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.sfondo {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--void) 72%, transparent);
	}
	.finestra {
		position: relative;
		width: 680px;
		max-width: calc(100vw - 32px);
		height: 440px;
		max-height: calc(100vh - 64px);
		display: grid;
		grid-template-columns: 184px minmax(0, 1fr);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
		overflow: hidden;
	}

	/* Le sezioni sono fermate sul binario, come le posizioni della barra laterale. */
	.sezioni {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 18px 8px 18px 0;
		background: var(--bg);
		border-right: 1px solid var(--border);
	}
	.sezioni::before {
		content: '';
		position: absolute;
		left: 13px;
		top: 58px;
		bottom: 24px;
		width: 5px;
		border-left: 1px solid var(--rail-metal);
		border-right: 1px solid var(--rail-metal);
	}
	h2 {
		margin: 0 0 12px;
		padding-left: 18px;
		font-family: var(--font-display);
		font-size: calc(15px * var(--scala-titoli, var(--scala-testo, 1)));
		font-weight: 600;
	}
	.sezioni button {
		position: relative;
		height: 30px;
		padding: 0 10px 0 30px;
		border: none;
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		text-align: left;
		cursor: default;
	}
	.sezioni button::before {
		content: '';
		position: absolute;
		left: 11px;
		top: 50%;
		width: 9px;
		height: 9px;
		margin-top: -4.5px;
		border-radius: 50%;
		background: radial-gradient(circle, var(--bg) 0 2.2px, var(--rail-metal) 2.6px);
	}
	.sezioni button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.sezioni button.on {
		background: var(--accent-soft);
		color: var(--text);
	}
	.sezioni button.on::before {
		background: var(--current);
	}

	.corpo {
		position: relative;
		padding: 18px 22px;
		overflow-y: auto;
	}
	h3 {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-size: calc(15px * var(--scala-titoli, var(--scala-testo, 1)));
		font-weight: 600;
	}
	.chiudi {
		position: absolute;
		top: 12px;
		right: 12px;
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
		cursor: default;
	}
	.chiudi:hover {
		background: var(--row-hover);
		color: var(--text);
	}

	.voce {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 16px;
		min-height: 48px;
		padding: 6px 0;
		border-bottom: 1px solid var(--border);
	}
	.voce:last-of-type {
		border-bottom: none;
	}
	.testo {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	small {
		color: var(--text-dim);
		font-size: calc(11.5px * var(--scala-testo, 1));
	}
	.percorso {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.insieme {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.nota {
		margin: 8px 0 0;
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.numero {
		font-variant-numeric: tabular-nums;
		color: var(--text-dim);
	}

	select {
		height: 28px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	select:disabled {
		opacity: 0.5;
	}
	.pulsante {
		height: 28px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		white-space: nowrap;
		cursor: default;
	}
	.pulsante:hover {
		background: var(--row-hover);
	}

	/* Interruttore: binario spento o acceso, il cursore tondo come una fermata. */
	.interruttore {
		position: relative;
		width: 36px;
		height: 20px;
		padding: 0;
		border: none;
		border-radius: 999px;
		background: var(--rail-metal);
		cursor: default;
		transition: background 140ms ease;
	}
	.interruttore::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--text-dim);
		transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.interruttore.acceso {
		background: var(--accent);
	}
	.interruttore.acceso::after {
		background: #fff;
		transform: translateX(16px);
	}
	@media (prefers-reduced-motion: reduce) {
		.interruttore,
		.interruttore::after {
			transition: none;
		}
	}
</style>
