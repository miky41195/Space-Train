<script lang="ts">
	import type { Backend, Drive, KnownFolder, Pari, StatoAmici, StatoLan } from '../ipc';
	import type { TabsStore } from '../stores/tabs.svelte';
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

	// Lo spazio libero cambia con ogni copia: si rilegge quando la pagina
	// segnala un'operazione conclusa, non a intervalli.
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
				<button
					class="voce"
					class:corrente={store.activeTab?.path.toLowerCase().startsWith(pathPari(p).toLowerCase())}
					onclick={() => vai(pathPari(p))}
					title={p.condivisa ? `${p.nome} — condivide «${p.condivisa}»` : `${p.nome} — nessuna cartella condivisa`}
				>
					<span class="pc" aria-hidden="true">🖥</span>{p.nome}
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
					<button class="togli" aria-label="Togli {i}" onclick={() => togliIndirizzo(i)}>×</button>
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
				<button class="voce aggiungi-pc" onclick={() => (aggiungendo = true)}>+ Aggiungi PC per indirizzo</button>
			{/if}
		</div>
	{/if}

	{#if amici}
		<div class="gruppo">
			<div class="titolo">Amici</div>
			{#each confermati as a (a.id)}
				<button
					class="voce"
					class:corrente={dentro(AMICI + '\\' + a.id)}
					onclick={() => vai(AMICI + '\\' + a.id)}
					title={a.inLinea ? `${a.nome} — in linea` : `${a.nome} — non in linea`}
				>
					<span class="pallino-stato amico" class:acceso={a.inLinea}></span>{a.nome}
				</button>
			{/each}
			{#if inAttesa > 0}
				<button class="voce richieste" onclick={onapriamici}>
					{inAttesa === 1 ? '1 richiesta d’amicizia' : `${inAttesa} richieste d’amicizia`}
				</button>
			{/if}
			<button class="voce aggiungi-pc" onclick={onapriamici}>
				{confermati.length === 0 ? '+ Aggiungi amici' : 'Gestisci amici'}
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
				<span class="spillo" aria-hidden="true">📌</span>
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
		width: 200px;
		flex-shrink: 0;
		padding: 12px 8px;
		background: var(--surface-glass);
		backdrop-filter: blur(24px) saturate(160%);
		overflow-y: auto;
	}
	.indirizzo {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 10px;
		font-size: 12px;
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
	.pallino-stato.amico {
		display: inline-block;
		margin-right: 8px;
		vertical-align: middle;
	}
	.richieste {
		color: var(--accent);
		font-size: 12px;
	}
	.pallino-stato.acceso {
		background: #22c55e;
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
	.aggiungi-pc {
		color: var(--text-dim);
		font-size: 12px;
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
		font-size: 12px;
		outline: none;
	}
	.gruppo + .gruppo {
		margin-top: 16px;
	}
	.titolo {
		padding: 0 12px 6px;
		color: var(--text-dim);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.voce {
		display: block;
		width: 100%;
		min-height: 30px;
		padding: 0 12px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: default;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.voce:hover {
		background: var(--row-hover);
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
		padding: 0 12px 6px;
		color: var(--text-dim);
		font-size: 11px;
		line-height: 1.4;
	}
	.pc,
	.spillo {
		margin-right: 8px;
	}
	.spillo {
		font-size: 11px;
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
		background: color-mix(in srgb, var(--current) 14%, transparent);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	/* La stazione in cui ti trovi: un contatto acceso sul binario. */
	.voce.corrente {
		position: relative;
		background: var(--accent-soft);
		color: var(--text);
	}
	.voce.corrente::before {
		content: '';
		position: absolute;
		left: 0;
		top: 50%;
		width: 3px;
		height: 14px;
		transform: translateY(-50%);
		border-radius: 2px;
		background: var(--current);
		box-shadow: 0 0 8px var(--current);
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
		font-size: 11px;
	}
</style>
