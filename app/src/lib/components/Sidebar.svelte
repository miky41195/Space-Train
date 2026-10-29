<script lang="ts">
	import type { Backend, Drive, KnownFolder, Pari, StatoAmici, StatoLan } from '../ipc';
	import type { TabsStore } from '../stores/tabs.svelte';
	import Icona from './Icona.svelte';
	import { QUESTO_PC, RETE, CESTINO, RETE_LOCALE, AMICI, byte, stessoPath, nomeDi } from '../posizioni';

	let {
		store,
		backend,
		bersaglio = null,
		aggiornamento = 0,
		coloreDi = undefined,
		lan = null,
		pari = [],
		ontogglevisibile = undefined,
		onindirizzi = undefined,
		amici = null,
		onapriamici = undefined,
		accessoRapido = [],
		onmenuaccesso = undefined
	}: {
		store: TabsStore;
		backend: Backend;
		/** Cartella sopra cui passa un trascinamento. */
		bersaglio?: string | null;
		/** Cambia quando lo spazio sui dischi può essere cambiato. */
		aggiornamento?: number;
		/** Colore che l'utente ha dato a una cartella. */
		coloreDi?: (path: string) => string | undefined;
		/** Stato della rete locale di questo PC, se il servizio risponde. */
		lan?: StatoLan | null;
		/** Gli altri PC con Space Train trovati in rete locale. */
		pari?: Pari[];
		ontogglevisibile?: () => void;
		/** La lista nuova dei PC aggiunti per indirizzo. */
		onindirizzi?: (indirizzi: string[]) => void;
		/** Amici su Space Train, se il servizio risponde. */
		amici?: StatoAmici | null;
		/** Apre il pannello con il codice personale e la lista completa. */
		onapriamici?: () => void;
		/** Le cartelle fissate dall'utente, nell'ordine scelto. */
		accessoRapido?: string[];
		/** Clic destro su una voce dell'Accesso rapido. */
		onmenuaccesso?: (path: string, evento: MouseEvent) => void;
	} = $props();

	let drives = $state<Drive[]>([]);
	let folders = $state<KnownFolder[]>([]);

	$effect(() => {
		backend.knownFolders().then((f) => (folders = f));
	});

	// Lo spazio libero si rilegge ogni volta che la pagina lo chiede: dopo
	// un'operazione, al ritorno in primo piano e una volta al minuto.
	$effect(() => {
		aggiornamento;
		backend.drives().then((d) => (drives = d));
	});

	/** Il campo per aggiungere un PC per indirizzo, aperto o chiuso. */
	let aggiungendo = $state(false);
	let nuovoIndirizzo = $state('');

	function aggiungiIndirizzo() {
		const t = nuovoIndirizzo.trim();
		const gia = lan?.indirizzi ?? [];
		if (t && !gia.some((i) => i.toLowerCase() === t.toLowerCase())) onindirizzi?.([...gia, t]);
		nuovoIndirizzo = '';
		aggiungendo = false;
	}

	function togliIndirizzo(i: string) {
		onindirizzi?.((lan?.indirizzi ?? []).filter((x) => x !== i));
	}

	/** Un PC aggiunto per indirizzo risponde: è fra quelli trovati con quell'IP. */
	function raggiunto(indirizzo: string): boolean {
		return pari.some((p) => p.ip === indirizzo.trim().split(':')[0]);
	}

	function vai(path: string) {
		if (store.activeId !== null) store.navigate(store.activeId, path);
	}

	/** La cartella condivisa da un altro PC, vista come posizione virtuale. */
	function pathPari(p: Pari): string {
		return RETE_LOCALE + '\\' + p.id;
	}

	let confermati = $derived(amici?.amici.filter((a) => a.stato === 'confermato') ?? []);
	let inAttesa = $derived(amici?.amici.filter((a) => a.stato === 'ricevuta').length ?? 0);

	function dentro(path: string): boolean {
		const t = store.activeTab?.path.toLowerCase();
		return !!t && (t === path.toLowerCase() || t.startsWith(path.toLowerCase() + '\\'));
	}

	function corrente(path: string): boolean {
		return store.activeTab ? stessoPath(store.activeTab.path, path) : false;
	}

	const posizioni = [
		{ path: QUESTO_PC, label: 'Questo PC' },
		{ path: RETE, label: 'Rete' },
		{ path: CESTINO, label: 'Cestino' }
	];
</script>

<nav class="sidebar">
	<div class="gruppo">
		<div class="titolo">Posizioni</div>
		{#each posizioni as p (p.path)}
			<button
				class="voce"
				class:corrente={corrente(p.path)}
				class:bersaglio={bersaglio === p.path}
				data-cartella={p.path === CESTINO ? CESTINO : undefined}
				onclick={() => vai(p.path)}>{p.label}</button
			>
		{/each}
	</div>

	{#if lan}
		<div class="gruppo">
			<div class="titolo riga-titolo">
				<span>Rete locale</span>
				<!-- Interruttore: finché è spento questo PC non si annuncia e non
				     risponde a nessuno. -->
				<button
					class="interruttore"
					class:acceso={lan.visibile}
					role="switch"
					aria-checked={lan.visibile}
					aria-label="Rendi visibile questo PC in rete locale"
					title={lan.visibile ? 'Visibile agli altri PC con Space Train' : 'Invisibile in rete locale'}
					onclick={ontogglevisibile}
				><span></span></button>
			</div>
			<div class="stato-lan">
				{lan.visibile ? `Visibile come ${lan.nome}` : 'Questo PC è invisibile'}
				{#if lan.visibile && lan.condivisa}
					<br />Condivide «{nomeDi(lan.condivisa)}»
				{/if}
			</div>
			{#each pari as p (p.id)}
				<!-- Un PC trovato in rete risponde: la sua fermata è in linea. -->
				<button
					class="voce in-linea"
					class:corrente={store.activeTab?.path.toLowerCase().startsWith(pathPari(p).toLowerCase())}
					onclick={() => vai(pathPari(p))}
					title={p.condivisa ? `${p.nome} — condivide «${p.condivisa}»` : `${p.nome} — nessuna cartella condivisa`}
				>
					{p.nome}
				</button>
			{:else}
				<div class="vuoto-lan">
					{lan.visibile ? 'Nessun altro PC con Space Train trovato.' : 'Accendi per trovare gli altri PC.'}
				</div>
			{/each}
			<!-- PC lontani, raggiunti per indirizzo: per esempio attraverso una VPN
			     come Tailscale, che non porta gli annunci a tutta la rete. -->
			{#each lan.indirizzi ?? [] as i (i)}
				<div class="indirizzo" title={raggiunto(i) ? 'Raggiunto' : 'In attesa di risposta: Space Train acceso e visibile anche dall’altra parte?'}>
					<span class="pallino-stato" class:acceso={raggiunto(i)}></span>
					<span class="testo-indirizzo">{i}</span>
					<button class="togli" aria-label="Togli {i}" onclick={() => togliIndirizzo(i)}
						><svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"
							><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg
						></button
					>
				</div>
			{/each}
			{#if aggiungendo}
				<form class="nuovo-indirizzo" onsubmit={(e) => { e.preventDefault(); aggiungiIndirizzo(); }}>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						bind:value={nuovoIndirizzo}
						placeholder="IP o nome, es. 100.64.0.2"
						aria-label="Indirizzo del PC da aggiungere"
						autofocus
						onkeydown={(e) => e.key === 'Escape' && (aggiungendo = false)}
						onblur={() => !nuovoIndirizzo.trim() && (aggiungendo = false)}
					/>
				</form>
			{:else}
				<button class="voce aggiungi-pc" onclick={() => (aggiungendo = true)}>Aggiungi PC per indirizzo</button>
			{/if}
		</div>
	{/if}

	{#if amici}
		<div class="gruppo">
			<div class="titolo">Amici</div>
			{#each confermati as a (a.id)}
				<!-- In linea o no lo dice il colore del nodo della fermata. -->
				<button
					class="voce"
					class:in-linea={a.inLinea}
					class:corrente={dentro(AMICI + '\\' + a.id)}
					onclick={() => vai(AMICI + '\\' + a.id)}
					title={a.inLinea ? `${a.nome} — in linea` : `${a.nome} — non in linea`}
				>
					{a.nome}
				</button>
			{/each}
			{#if inAttesa > 0}
				<button class="voce richieste" onclick={onapriamici}>
					{inAttesa === 1 ? '1 richiesta d’amicizia' : `${inAttesa} richieste d’amicizia`}
				</button>
			{/if}
			<button class="voce aggiungi-pc" onclick={onapriamici}>
				{confermati.length === 0 ? 'Aggiungi amici' : 'Gestisci amici'}
			</button>
		</div>
	{/if}

	<div class="gruppo">
		<div class="titolo">Cartelle</div>
		{#each folders as f (f.path)}
			<button
				class="voce"
				class:corrente={corrente(f.path)}
				class:bersaglio={bersaglio === f.path}
				data-cartella={f.path}
				onclick={() => vai(f.path)}
			>
				{#if coloreDi?.(f.path)}<span class="pallino" style:background={coloreDi(f.path)}></span>{/if}
				{f.label}
			</button>
		{/each}
		<!-- Le cartelle fissate dall'utente stanno accanto a quelle di Windows,
		     nell'ordine scelto; il clic destro le riordina o le toglie. -->
		{#each accessoRapido as p (p)}
			<button
				class="voce fissata"
				class:corrente={corrente(p)}
				class:bersaglio={bersaglio === p}
				data-cartella={p}
				title={p}
				onclick={() => vai(p)}
				oncontextmenu={(e) => {
					e.preventDefault();
					onmenuaccesso?.(p, e);
				}}
			>
				<span class="spillo" aria-hidden="true"><Icona nome="spillo" lato={11} /></span>
				{#if coloreDi?.(p)}<span class="pallino" style:background={coloreDi(p)}></span>{/if}
				{nomeDi(p)}
			</button>
		{/each}
	</div>

	<div class="gruppo">
		<div class="titolo">Unità</div>
		{#each drives as d (d.path)}
			{@const occupato = d.totale && d.libero !== null ? 1 - d.libero / d.totale : null}
			<button
				class="voce disco"
				class:corrente={corrente(d.path)}
				class:bersaglio={bersaglio === d.path}
				data-cartella={d.path}
				onclick={() => vai(d.path)}
				title={d.libero !== null && d.totale ? `${byte(d.libero)} liberi di ${byte(d.totale)}` : d.label}
			>
				<span class="etichetta">{d.label}</span>
				{#if occupato !== null && d.libero !== null}
					<span class="riempimento" class:pieno={occupato > 0.9}>
						<span style:width="{Math.round(occupato * 100)}%"></span>
					</span>
					<span class="libero">{byte(d.libero)} liberi</span>
				{/if}
			</button>
		{/each}
	</div>
</nav>

<style>
	.sidebar {
		width: 212px;
		flex-shrink: 0;
		padding: 12px 8px 12px 30px;
		background: var(--surface-glass);
		overflow-y: auto;
	}
	.indirizzo {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 0;
		font-size: calc(12px * var(--scala-testo, 1));
		color: var(--text-dim);
	}
	.testo-indirizzo {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pallino-stato {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-dim);
		opacity: 0.5;
	}
	/* Le azioni non sono fermate: il binario ci passa accanto senza nodo. */
	.voce.richieste,
	.voce.aggiungi-pc {
		background-image: none;
	}
	.richieste {
		color: var(--accent);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	/* Un PC o un amico raggiungibile adesso. */
	.voce.in-linea {
		--nodo: var(--in-linea);
	}
	.pallino-stato.acceso {
		background: var(--in-linea);
		opacity: 1;
	}
	.togli {
		border: none;
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
		padding: 0 4px;
	}
	.togli:hover {
		color: var(--text);
	}
	/* Le azioni si distinguono dalle fermate per il tono: più piccole e
	   spente, e si accendono solo al passaggio. */
	.voce.aggiungi-pc {
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.voce.aggiungi-pc:hover {
		color: var(--text);
	}
	.nuovo-indirizzo input {
		width: 100%;
		box-sizing: border-box;
		height: 26px;
		padding: 0 8px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--scala-testo, 1));
		outline: none;
	}
	.gruppo + .gruppo {
		margin-top: 16px;
	}
	.titolo {
		padding: 0 0 6px;
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-testo, 1));
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
	/* Ogni posizione è una fermata sul binario verticale, che corre sotto la
	   barra a 13 px dal bordo (vedi `.luoghi` in +page.svelte): il nodo
	   tondo, con ghiera e centro, sta sopra i due fili. Disegnato come
	   sfondo, così il colore al passaggio del mouse non lo copre. */
	.voce {
		display: block;
		width: calc(100% + 22px);
		margin-left: -22px;
		min-height: 30px;
		padding: 0 12px 0 22px;
		border: none;
		border-radius: var(--radius-sm);
		--nodo: var(--rail-metal);
		--nodo-dentro: var(--surface);
		background-color: transparent;
		background-image: radial-gradient(
			circle,
			var(--nodo-dentro) 0 2.2px,
			var(--nodo) 2.7px 3.6px,
			transparent 4.1px
		);
		background-size: 9px 9px;
		background-position: 3px 50%;
		background-repeat: no-repeat;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: default;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.voce:hover {
		background-color: var(--row-hover);
	}
	.riga-titolo {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	/* Interruttore a slitta, come nelle impostazioni di Windows. */
	.interruttore {
		position: relative;
		width: 30px;
		height: 16px;
		padding: 0;
		border: 1px solid var(--text-dim);
		border-radius: 8px;
		background: transparent;
		cursor: default;
	}
	.interruttore span {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--text-dim);
		transition: transform 120ms ease;
	}
	.interruttore.acceso {
		border-color: var(--accent);
		background: var(--accent);
	}
	.interruttore.acceso span {
		background: #fff;
		transform: translateX(14px);
	}
	.stato-lan,
	.vuoto-lan {
		padding: 0 0 6px;
		color: var(--text-dim);
		font-size: calc(11px * var(--scala-testo, 1));
		line-height: 1.4;
	}
	.spillo {
		display: inline-flex;
		vertical-align: -1px;
		margin-right: 8px;
		color: var(--text-dim);
	}
	.pallino {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 8px;
		border-radius: 50%;
		vertical-align: middle;
	}
	.voce.bersaglio {
		--nodo: var(--current);
		background-color: color-mix(in srgb, var(--current) 14%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	/* La fermata in cui ti trovi: il nodo si accende. */
	.voce.corrente {
		--nodo: var(--current);
		--nodo-dentro: var(--current);
		background-color: var(--accent-soft);
		color: var(--text);
	}

	/* Il disco mostra quanto è pieno: la barra diventa rossa oltre il 90%. */
	.disco {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		padding-top: 6px;
		padding-bottom: 6px;
	}
	.etichetta {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.riempimento {
		display: block;
		height: 4px;
		border-radius: 2px;
		background: var(--border);
		overflow: hidden;
	}
	.riempimento span {
		display: block;
		height: 100%;
		background: var(--current);
	}
	.riempimento.pieno span {
		background: #ff5f6e;
	}
	.libero {
		color: var(--text-dim);
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		font-size: calc(11px * var(--scala-testo, 1));
	}
</style>
