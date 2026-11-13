<script lang="ts">
	import type { TabsStore } from '../stores/tabs.svelte';
	import { briciole, eVirtuale, nomeDi, nomePosizione } from '../posizioni';

	const DUPLICATES_STOP = '::duplicati';

	let {
		store,
		inModifica = $bindable(false),
		onindirizzo = undefined,
		onvai = undefined,
		oncerca = undefined,
		bersaglio = null,
		ramo = null,
		chiusura = null,
		onchiudi = undefined,
		fermata = null,
		onfermata = undefined
	}: {
		store: TabsStore;
		/** La barra mostra il campo di testo invece delle stazioni. */
		inModifica?: boolean;
		/** L'utente ha scritto un indirizzo e premuto Invio. */
		onindirizzo?: (testo: string) => void;
		/** Clic su una stazione: porta direttamente a quella cartella. */
		onvai?: (path: string) => void;
		/** Il pulsante di ricerca accanto all'indirizzo, come in Esplora. */
		oncerca?: () => void;
		/** Cartella sopra cui passa un trascinamento. */
		bersaglio?: string | null;
		/** Git branch of the open folder, with commits to push and to pull. */
		ramo?: { branch: string; ahead: number; behind: number } | null;
		/** Time left before the open vault locks itself, as shown («4:52»). */
		chiusura?: string | null;
		/** Locks the open vault now. */
		onchiudi?: () => void;
		/** An extra last stop set by the page (disk cleanup), and how to leave it. */
		fermata?: string | null;
		onfermata?: () => void;
	} = $props();

	let titoloRamo = $derived(
		ramo
			? [
					`Ramo git ${ramo.branch}`,
					ramo.ahead ? `${ramo.ahead} commit da inviare` : '',
					ramo.behind ? `${ramo.behind} da ricevere` : ''
				]
					.filter(Boolean)
					.join(', ')
			: ''
	);

	let percorso = $derived(store.activeTab?.path ?? '');
	// Duplicates and folder comparison are one more stop after their folder: clicking the folder goes back to it.
	let fermataExtra = $derived(
		fermata ?? (store.activeTab?.duplicati
			? 'Duplicati'
			: store.activeTab?.confronto
				? `Confronto con ${nomePosizione(store.activeTab.confronto.altro)}`
				: store.activeTab?.archivio
					? [nomeDi(store.activeTab.archivio.file), ...store.activeTab.archivio.dentro.split('/').filter(Boolean)].join(' › ')
					: store.activeTab?.etichetta
					? `Etichetta ${store.activeTab.etichetta}`
					: store.activeTab?.spazio
						? 'Spazio'
						: null)
	);
	let stazioni = $derived(
		fermataExtra ? [...briciole(percorso), { nome: fermataExtra, path: DUPLICATES_STOP }] : briciole(percorso)
	);
	let campo = $state<HTMLInputElement | null>(null);
	let linea = $state<HTMLDivElement | null>(null);

	// Un percorso più lungo della barra mostra la sua fine, come Esplora: la
	// stazione che conta è quella in cui ti trovi, non la radice.
	// Anche quando cambia la larghezza delle stazioni: un tema con un altro
	// carattere o una finestra stretta spostano la fine fuori vista.
	$effect(() => {
		stazioni;
		const l = linea;
		if (!l) return;
		const allaFine = () => (l.scrollLeft = l.scrollWidth);
		allaFine();
		if (typeof ResizeObserver === 'undefined') return;
		const osserva = new ResizeObserver(allaFine);
		osserva.observe(l);
		for (const figlio of l.children) osserva.observe(figlio);
		return () => osserva.disconnect();
	});

	/** Le posizioni virtuali si scrivono col loro nome, non con `::pc`. */
	let testoCampo = $derived(eVirtuale(percorso) ? nomePosizione(percorso) : percorso);

	$effect(() => {
		if (!inModifica || !campo) return;
		campo.focus();
		campo.select();
	});

	function conferma() {
		const testo = campo?.value.trim() ?? '';
		inModifica = false;
		if (testo !== '' && testo !== testoCampo) onindirizzo?.(testo);
	}

	let id = $derived(store.activeId);

	function vaiA(path: string) {
		if (id === null || path === DUPLICATES_STOP) return;
		if (path === percorso) {
			if (fermata) onfermata?.();
			else if (store.activeTab?.spazio) void store.impostaSpazio(id, false);
			else if (fermataExtra) void store.fermaRicerca(id);
			return;
		}
		if (onvai) onvai(path);
		else store.navigate(id, path);
	}
</script>

<div class="barra">
	<button
		class="nav"
		disabled={!store.activeTab || store.activeTab.historyIndex === 0}
		onclick={() => id !== null && store.goBack(id)}
		aria-label="Indietro"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button
	>
	<button
		class="nav"
		disabled={!store.activeTab || store.activeTab.historyIndex >= store.activeTab.history.length - 1}
		onclick={() => id !== null && store.goForward(id)}
		aria-label="Avanti"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button
	>
	<button class="nav" onclick={() => id !== null && store.goUp(id)} aria-label="Su"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button>

	<!-- Mappa della linea: ogni cartella è una stazione, l'ultima è dove ti
	     trovi. Il tracciato che le unisce è lo stesso percorso che hai fatto
	     per arrivare qui. -->
	{#if inModifica}
		<input
			class="indirizzo"
			bind:this={campo}
			value={testoCampo}
			spellcheck="false"
			autocomplete="off"
			aria-label="Indirizzo"
			onkeydown={(e) => {
				e.stopPropagation();
				if (e.key === 'Enter') conferma();
				else if (e.key === 'Escape') inModifica = false;
			}}
			onblur={() => (inModifica = false)}
		/>
	{:else}
		<!-- Il clic sullo spazio libero della linea apre il campo, come in
		     Esplora: le stazioni fermano l'evento perché portano altrove. -->
		<div
			class="linea"
			bind:this={linea}
			role="button"
			tabindex="-1"
			aria-label="Modifica l'indirizzo"
			onclick={() => (inModifica = true)}
			onkeydown={(e) => e.key === 'Enter' && (inModifica = true)}
		>
			{#each stazioni as s, i (s.path)}
				<button
					class="stazione"
					class:capolinea={i === stazioni.length - 1}
					class:bersaglio={bersaglio === s.path}
					data-cartella={eVirtuale(s.path) || s.path === DUPLICATES_STOP ? undefined : s.path}
					onclick={(e) => {
						e.stopPropagation();
						vaiA(s.path);
					}}
					aria-current={i === stazioni.length - 1 ? 'location' : undefined}
				>
					<span class="nodo"></span>
					<span class="nome">{s.nome}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if chiusura && !inModifica}
		<button class="chiusura" onclick={onchiudi} title="La cassaforte si chiude da sola. Premi per chiuderla adesso."
			>si chiude fra {chiusura}</button
		>
	{/if}

	{#if ramo && !inModifica}
		<span class="ramo" title={titoloRamo}
			><span class="ramo-nodo" aria-hidden="true"></span><span class="ramo-nome">{ramo.branch}</span
			>{#if ramo.ahead}<span class="conta">↑{ramo.ahead}</span>{/if}{#if ramo.behind}<span class="conta">↓{ramo.behind}</span>{/if}</span
		>
	{/if}

	{#if oncerca}
		<button class="cerca" onclick={oncerca} title="Cerca (Ctrl+F)">
			<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
				<circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
				<path d="M10 10l4 4" stroke="currentColor" stroke-width="1.4" />
			</svg>
			Cerca in {stazioni[stazioni.length - 1]?.nome ?? ''}
		</button>
	{/if}
</div>

<style>
	/* Git branch: a route sign after the last stop, outlined in rail metal. */
	.ramo {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 220px;
		height: 22px;
		padding: 0 9px;
		border: 1px solid var(--rail-metal, var(--border));
		border-radius: 11px;
		color: var(--text);
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-testo, 1));
		letter-spacing: 0.04em;
		font-variant-numeric: tabular-nums;
	}
	.chiusura {
		flex: none;
		height: 22px;
		padding: 0 9px;
		border: 1px solid color-mix(in srgb, var(--signal, #ffb454) 45%, transparent);
		border-radius: 11px;
		background: transparent;
		color: var(--signal, #ffb454);
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-testo, 1));
		font-variant-numeric: tabular-nums;
		cursor: default;
	}
	.chiusura:hover {
		background: var(--row-hover);
	}
	.ramo-nome {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.ramo-nodo {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--in-linea, #22c55e);
	}
	.conta {
		flex: none;
		color: var(--text-dim);
	}
	.barra {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 40px;
		padding: 0 12px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.nav {
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
	.nav:hover:not(:disabled) {
		background: var(--row-hover);
		color: var(--text);
	}
	.nav:disabled {
		opacity: 0.3;
	}
	.linea {
		display: flex;
		align-items: center;
		align-self: stretch;
		margin-left: 10px;
		overflow: hidden;
		flex: 1;
		cursor: text;
	}
	.indirizzo {
		flex: 1;
		height: 28px;
		margin-left: 10px;
		padding: 0 10px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		outline: none;
	}
	.cerca {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 220px;
		height: 28px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: var(--bg);
		color: var(--text-dim);
		font: inherit;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: text;
		flex-shrink: 0;
	}
	.cerca:hover {
		border-color: var(--text-dim);
	}
	.stazione.bersaglio {
		color: var(--current);
	}

	.stazione {
		display: flex;
		align-items: center;
		gap: 6px;
		position: relative;
		padding: 4px 10px 4px 0;
		border: none;
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		white-space: nowrap;
		cursor: default;
	}

	/* Il tratto di binario che collega questa stazione alla precedente. */
	.stazione + .stazione {
		padding-left: 18px;
	}
	.stazione + .stazione::before {
		content: '';
		position: absolute;
		left: 0;
		top: 50%;
		width: 14px;
		height: 1px;
		background: var(--rail-metal);
	}

	/* Nodi tondi, come le fermate della barra laterale. */
	.nodo {
		width: 6px;
		height: 6px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--rail-metal);
	}

	.stazione:hover {
		color: var(--text);
	}
	.stazione:hover .nodo {
		background: var(--plasma);
	}

	/* Dove ti trovi adesso: nodo acceso e nome in chiaro. */
	.capolinea {
		color: var(--text);
	}
	.capolinea .nome {
		font-weight: 600;
	}
	.capolinea .nodo {
		width: 8px;
		height: 8px;
		background: var(--current);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--current) 20%, transparent);
	}
	/* L'ultimo tratto, quello che arriva dove sei, porta la corrente. */
	.capolinea.stazione::before {
		height: 2px;
		margin-top: -0.5px;
		background: linear-gradient(90deg, var(--plasma), var(--current));
	}
</style>
