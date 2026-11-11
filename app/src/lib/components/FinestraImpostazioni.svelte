<script lang="ts">
	import type { ImpostazioniStore, DimensioneCartelle } from '../stores/impostazioni.svelte';
	import { PAUSE_TRENO, INIZIALE_PREDEFINITA, INIZIALE_ULTIMA } from '../menu';
	import { SU_LINUX } from '../sistema';
	import { SHORTCUT_GROUPS, GLOBAL_SHORTCUT, type ShortcutItem } from '../scorciatoie';
	import {
		acceleratore,
		assegna,
		combinazione,
		ripristina,
		tastiDi,
		verifica,
		type AzioneSemplice
	} from '../scorciatoie-personali';

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
		onchiudi,
		onprovaScorciatoia = undefined
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
		/** Asks Windows whether another program holds a combination (`null` = cannot tell). */
		onprovaScorciatoia?: (acceleratore: string) => Promise<boolean | null>;
	} = $props();

	// ── Custom shortcuts ─────────────────────────────────────────────
	const AZIONI: AzioneSemplice[] = [
		...new Set(
			SHORTCUT_GROUPS.flatMap((g) => g.items)
				.map((i) => i.action)
				.filter((a): a is AzioneSemplice => typeof a === 'string')
		)
	];
	/** The action waiting for its new key combination. */
	let registrando = $state<AzioneSemplice | null>(null);
	/** Why the last combination was refused, next to its action. */
	let rifiuto = $state<{ azione: AzioneSemplice; testo: string } | null>(null);
	/** Every change is confirmed: what the user is asked, warnings first. */
	let conferma = $state<{ azione: AzioneSemplice; nome: string; combo: string; avvisi: string[]; daTogliere: AzioneSemplice[] } | null>(null);

	function tastiVoce(i: ShortcutItem): string[] {
		return typeof i.action === 'string' ? tastiDi(i.action, impostazioni.scorciatoie) : i.keys;
	}

	function avviaRegistrazione(azione: AzioneSemplice) {
		rifiuto = null;
		registrando = azione;
	}

	async function registra(e: KeyboardEvent) {
		if (!registrando) return;
		// The keys go to the recording, not to the app or the window.
		e.preventDefault();
		e.stopImmediatePropagation();
		if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
			registrando = null;
			return;
		}
		const combo = combinazione(e);
		if (combo === null) return;
		const azione = registrando;
		registrando = null;
		const v = verifica(combo, azione, impostazioni.scorciatoie, AZIONI);
		if (v.rifiuto) {
			rifiuto = { azione, testo: v.rifiuto };
			return;
		}
		const avvisi = [...v.avvisi];
		const acc = acceleratore(combo);
		const libera = acc && onprovaScorciatoia ? await onprovaScorciatoia(acc).catch(() => null) : null;
		if (libera === false) avvisi.unshift(`Un altro programma tiene già ${combo} per sé: la intercetta prima che arrivi a Space Train.`);
		const nome = SHORTCUT_GROUPS.flatMap((g) => g.items).find((i) => i.action === azione)?.label ?? azione;
		conferma = { azione, nome, combo, avvisi, daTogliere: v.daTogliere };
	}

	function confermaScorciatoia() {
		if (!conferma) return;
		impostazioni.imposta('scorciatoie', assegna(impostazioni.scorciatoie, conferma.azione, conferma.combo, conferma.daTogliere));
		conferma = null;
	}

	const SEZIONI = [
		{ id: 'generale', nome: 'Generale' },
		{ id: 'file', nome: 'File e cartelle' },
		{ id: 'aspetto', nome: 'Aspetto' },
		{ id: 'scorciatoie', nome: 'Scorciatoie' },
		{ id: 'rete', nome: 'Rete e amici' },
		{ id: 'info', nome: 'Informazioni' }
	] as const;
	let sezione = $state<(typeof SEZIONI)[number]['id']>('generale');

	const INIZIALI = [
		{ valore: '::pc', nome: 'Questo PC' },
		{ valore: INIZIALE_PREDEFINITA, nome: SU_LINUX ? 'File system (/)' : 'Disco C:' },
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

	let shortcutQuery = $state('');
	let shortcutGroups = $derived.by(() => {
		const q = shortcutQuery.trim().toLowerCase();
		if (!q) return SHORTCUT_GROUPS;
		const hit = (text: string) => text.toLowerCase().includes(q);
		return SHORTCUT_GROUPS.map((g) => ({
			name: g.name,
			items: g.items.filter((i) => hit(i.label) || i.keys.some(hit))
		})).filter((g) => g.items.length > 0);
	});

	let finestra = $state<HTMLDivElement | null>(null);
	$effect(() => {
		finestra?.querySelector<HTMLButtonElement>('.sezioni button.on')?.focus();
	});
</script>

<svelte:window
	onkeydowncapture={registra}
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		if (conferma) conferma = null;
		else onchiudi();
	}}
/>

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
				{#if !SU_LINUX}
					<div class="voce">
						<span class="testo"
							>Apri le cartelle con Space Train<small
								>{predefinito ? 'Ora le cartelle si aprono qui invece che in Esplora risorse.' : 'Ora le cartelle si aprono in Esplora risorse.'}</small
							></span
						>
						<button class="pulsante" onclick={onpredefinito}>{predefinito ? 'Ripristina Esplora risorse' : 'Imposta come predefinito'}</button>
					</div>
				{/if}
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
					<span class="testo">Stato Git nelle cartelle dei progetti<small>Segna i file modificati e nuovi e mostra il ramo. Serve git installato.</small></span>
					{@render interruttore(impostazioni.git, 'Stato Git nelle cartelle dei progetti', () => impostazioni.imposta('git', !impostazioni.git))}
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
			{:else if sezione === 'scorciatoie'}
				<h3>Scorciatoie</h3>
				<input
					class="cerca-tasti"
					type="search"
					placeholder="Cerca un’azione o un tasto…"
					aria-label="Cerca fra le scorciatoie"
					bind:value={shortcutQuery}
				/>
				<div class="globale">
					<span class="testo">{GLOBAL_SHORTCUT.label}<small>Da qualsiasi programma</small></span>
					<span class="tasti">{#each GLOBAL_SHORTCUT.keys as k (k)}<kbd>{k}</kbd>{/each}</span>
				</div>
				{#each shortcutGroups as g (g.name)}
					<h4>{g.name}</h4>
					<ul class="orario">
						{#each g.items as i (i.label)}
							{@const azione = typeof i.action === 'string' ? i.action : null}
							<li class:registra={azione !== null && registrando === azione}>
								<span
									>{i.label}{#if azione && registrando === azione}<small class="nota-registra"
											>Premi la combinazione nuova… (Esc annulla)</small
										>{/if}{#if azione && rifiuto?.azione === azione}<small class="rifiuto">{rifiuto.testo}</small>{/if}</span
								>
								<span class="tasti"
									>{#each tastiVoce(i) as k (k)}<kbd>{k}</kbd>{:else}{#if azione}<span class="senza">nessuna</span>{/if}{/each}</span
								>
								<span class="cambia">
									{#if azione}
										{#if impostazioni.scorciatoie[azione] !== undefined}
											<button class="link" onclick={() => impostazioni.imposta('scorciatoie', ripristina(impostazioni.scorciatoie, azione))}
												>Ripristina</button
											>
										{/if}
										<button class="pulsante piccolo" onclick={() => avviaRegistrazione(azione)} aria-label={`Cambia la scorciatoia di «${i.label}»`}
											>Cambia</button
										>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="nota">Nessuna scorciatoia per «{shortcutQuery.trim()}».</p>
				{/each}
				{#if Object.keys(impostazioni.scorciatoie).length > 0}
					<button class="pulsante ripristina-tutte" onclick={() => impostazioni.imposta('scorciatoie', {})}>Ripristina tutte</button>
				{/if}
				{#if conferma}
					<div class="conferma" role="alertdialog" aria-modal="true" aria-label="Conferma scorciatoia">
						<h4>Usare {conferma.combo} per «{conferma.nome}»?</h4>
						{#each conferma.avvisi as a, k (k)}
							<p class="avviso">{a}</p>
						{:else}
							<p>La combinazione è libera.</p>
						{/each}
						<div class="azioni">
							<button class="pulsante" onclick={() => (conferma = null)}>Annulla</button>
							<button class="pulsante primario" onclick={confermaScorciatoia}>Usa {conferma.combo}</button>
						</div>
					</div>
				{/if}
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

	/* Shortcuts: a timetable, alternate rows and keys as small signs. */
	.cerca-tasti {
		width: 100%;
		height: 28px;
		margin: 4px 0 12px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.cerca-tasti:hover {
		border-color: var(--text-dim);
	}
	.globale {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
	}
	h4 {
		margin: 16px 0 4px;
		font-family: var(--font-display);
		font-size: calc(10px * var(--scala-testo, 1));
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	.orario {
		display: grid;
		gap: 1px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.orario li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 12px;
		min-height: 28px;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
	}
	.orario li:nth-child(odd) {
		background: var(--row-hover);
	}
	/* Waiting for keys: the drop-target line, so it reads as «listening». */
	.orario li.registra {
		background: color-mix(in srgb, var(--current) 10%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	.orario li > span:first-child small {
		display: block;
		font-size: calc(11px * var(--scala-testo, 1));
	}
	.nota-registra {
		color: var(--current);
	}
	.rifiuto {
		color: var(--errore-testo);
	}
	.senza {
		color: var(--text-dim);
		font-size: calc(11px * var(--scala-testo, 1));
	}
	.cambia {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.pulsante.piccolo {
		height: 22px;
		padding: 0 8px;
		font-size: calc(11.5px * var(--scala-testo, 1));
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		color: var(--text-dim);
		font: inherit;
		font-size: calc(11.5px * var(--scala-testo, 1));
		text-decoration: underline;
		cursor: default;
	}
	.link:hover {
		color: var(--text);
	}
	.ripristina-tutte {
		justify-self: start;
		margin-top: 12px;
	}
	/* Confirmation of a new shortcut: always asked, warnings in signal amber. */
	.conferma {
		position: sticky;
		bottom: 0;
		display: grid;
		gap: 8px;
		margin-top: 12px;
		padding: 14px 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
	}
	.conferma h4 {
		margin: 0;
	}
	.conferma p {
		margin: 0;
	}
	.conferma .avviso {
		padding: 8px 10px;
		border: 1px solid color-mix(in srgb, var(--signal, #ffb454) 45%, transparent);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--signal, #ffb454) 8%, transparent);
	}
	.conferma .azioni {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.pulsante.primario {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	.tasti {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: 4px;
	}
	kbd {
		padding: 0 6px;
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		border-radius: 4px;
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-display);
		font-size: calc(12px * var(--scala-testo, 1));
		line-height: 1.6;
		white-space: nowrap;
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
