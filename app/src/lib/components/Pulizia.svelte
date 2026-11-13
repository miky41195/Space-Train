<script lang="ts">
	import { onDestroy } from 'svelte';
	import { tauriBackend, type CategoriaPulizia, type Programma, type Trovato } from '../ipc';
	import { byte } from '../posizioni';
	import { CATEGORIE, ETICHETTE, corto, eta, piano, preselezione, type Piano } from '../pulizia';

	let {
		drive,
		radici,
		onradici,
		onlibera,
		onchiudi,
		descriviErrore
	}: {
		/** Drive root, like `C:\`. */
		drive: string;
		/** Folders where projects are looked for. */
		radici: string[];
		onradici: (r: string[]) => void;
		/** Runs the deletions with the progress bar. */
		onlibera: (p: Piano) => Promise<void>;
		onchiudi: () => void;
		/** Backend errors in words. */
		descriviErrore: (e: unknown) => string;
	} = $props();

	/** `undefined` while being weighed. */
	let trovati = $state<Partial<Record<CategoriaPulizia, Trovato[]>>>({});
	let scelti = $state<Partial<Record<CategoriaPulizia, string[]>>>({});
	let aperte = $state<Set<CategoriaPulizia>>(new Set());
	let programmi = $state<Programma[] | null>(null);
	let confermando = $state(false);
	let liberando = $state(false);
	let errore = $state<string | null>(null);
	let giro = 0;

	async function cerca(ids: CategoriaPulizia[]) {
		const mio = ++giro;
		await tauriBackend.cleanupRound(mio).catch(() => {});
		for (const id of ids) {
			delete trovati[id];
			const c = CATEGORIE.find((c) => c.id === id)!;
			void tauriBackend
				.cleanupScan(id, drive, radici, mio)
				.then((voci) => {
					if (!voci || mio !== giro) return;
					trovati[id] = voci;
					scelti[id] = preselezione(c.tipo, voci, Date.now());
				})
				.catch(() => {
					if (mio === giro) trovati[id] = [];
				});
		}
	}

	function cercaProgrammi() {
		programmi = null;
		void tauriBackend
			.programsList(drive)
			.then((p) => (programmi = p))
			.catch(() => (programmi = []));
	}

	// Everything again when the drive changes; only projects when their folders do.
	let ultimeRadici = '';
	$effect(() => {
		void drive;
		ultimeRadici = JSON.stringify(radici);
		void cerca(CATEGORIE.map((c) => c.id));
		cercaProgrammi();
	});
	$effect(() => {
		const r = JSON.stringify(radici);
		if (r !== ultimeRadici) {
			ultimeRadici = r;
			void cerca(['progetti']);
		}
	});
	onDestroy(() => void tauriBackend.cleanupRound(++giro).catch(() => {}));

	const peso = (voci: Trovato[] | undefined) => (voci ?? []).reduce((n, v) => n + v.size, 0);
	let massimo = $derived(Math.max(1, ...CATEGORIE.map((c) => peso(trovati[c.id]))));
	let totale = $derived(CATEGORIE.reduce((n, c) => n + peso(trovati[c.id]), 0));
	let daFare = $derived(piano(trovati, scelti));
	let inCorso = $derived(CATEGORIE.filter((c) => !trovati[c.id]).length);

	function alternaCategoria(id: CategoriaPulizia) {
		const voci = trovati[id] ?? [];
		scelti[id] = (scelti[id]?.length ?? 0) === voci.length ? [] : voci.map((v) => v.path);
	}
	function alternaVoce(id: CategoriaPulizia, path: string) {
		const s = scelti[id] ?? [];
		scelti[id] = s.includes(path) ? s.filter((p) => p !== path) : [...s, path];
	}
	function alternaAperta(id: CategoriaPulizia) {
		const n = new Set(aperte);
		if (!n.delete(id)) n.add(id);
		aperte = n;
	}

	async function aggiungiRadice() {
		const c = await tauriBackend.scegliCartella('Cerca progetti in…', radici[0] ?? null).catch(() => null);
		if (c && !radici.some((r) => r.toLowerCase() === c.toLowerCase())) onradici([...radici, c]);
	}

	async function libera() {
		confermando = false;
		liberando = true;
		errore = null;
		try {
			await onlibera(daFare);
		} catch (e) {
			errore = descriviErrore(e);
		} finally {
			liberando = false;
			void cerca(CATEGORIE.map((c) => c.id));
		}
	}

	async function disinstalla(p: Programma) {
		errore = null;
		try {
			await tauriBackend.programUninstall(p.id);
		} catch (e) {
			errore = `«${p.name}»: ${descriviErrore(e)}`;
		}
	}

	let annulla = $state<HTMLButtonElement | null>(null);
	$effect(() => {
		if (confermando) annulla?.focus();
	});
</script>

<div class="pulizia">
	<div class="banda" role="status">
		<span><b>{byte(daFare.byte)}</b> scelti su <b>{byte(totale)}</b> trovati</span>
		{#if inCorso > 0}<span class="pesando">pesando {inCorso} {inCorso === 1 ? 'categoria' : 'categorie'}…</span>{/if}
		<span class="spazio"></span>
		<button onclick={onchiudi}>Chiudi</button>
		<button class="primario" disabled={daFare.byte === 0 || liberando} onclick={() => (confermando = true)}>
			Libera {byte(daFare.byte)}
		</button>
	</div>
	{#if errore}<div class="errore">{errore}</div>{/if}

	<div class="elenco">
		{#each CATEGORIE as c (c.id)}
			{@const voci = trovati[c.id]}
			{@const presi = scelti[c.id]?.length ?? 0}
			{@const aperta = aperte.has(c.id)}
			<div class="cat" class:vuota={voci?.length === 0}>
				<input
					type="checkbox"
					aria-label={c.nome}
					disabled={!voci?.length}
					checked={!!voci?.length && presi === voci.length}
					indeterminate={presi > 0 && presi < (voci?.length ?? 0)}
					onchange={() => alternaCategoria(c.id)}
				/>
				<div class="testo">
					<div class="nome">
						{#if voci?.length && c.tipo !== 'cestino'}
							<button class="apri" aria-expanded={aperta} onclick={() => alternaAperta(c.id)}>
								{c.nome}<span class="freccia" class:giu={aperta}>▸</span>
							</button>
						{:else}
							<span>{c.nome}</span>
						{/if}
						<span class="pill {c.tipo}">{ETICHETTE[c.tipo]}</span>
					</div>
					<div class="dettaglio">
						{#if !voci}pesando…{:else if c.tipo === 'cestino'}{voci.length} {voci.length === 1 ? 'elemento' : 'elementi'}{:else if voci.length === 0}niente da togliere{:else}{c.dettaglio}{/if}
					</div>
					<div class="traccia"><span style:width="{(peso(voci) / massimo) * 100}%"></span></div>
				</div>
				<span class="peso">{voci ? byte(peso(voci)) : '—'}</span>
			</div>
			{#if c.id === 'progetti'}
				<div class="radici">
					<span class="sig">Cerca progetti in</span>
					{#each radici as r (r)}
						<span class="chip"
							>{r}<button aria-label="Togli {r}" onclick={() => onradici(radici.filter((x) => x !== r))}>×</button></span
						>
					{/each}
					<button class="chip aggiungi" onclick={aggiungiRadice}>+ Aggiungi cartella</button>
				</div>
			{/if}
			{#if aperta && voci}
				{#each voci as v (v.path)}
					<label class="cat sub">
						<input type="checkbox" checked={scelti[c.id]?.includes(v.path)} onchange={() => alternaVoce(c.id, v.path)} />
						<div class="testo">
							<div class="nome ellissi" title={v.path}>{c.id === 'progetti' ? corto(v.path, radici) : v.path}</div>
							{#if v.used > 0}<div class="dettaglio">usata {eta(v.used, Date.now())}</div>{/if}
						</div>
						<span class="peso">{byte(v.size)}</span>
					</label>
				{/each}
			{/if}
		{/each}

		{#if programmi === null || programmi.length > 0}
			<div class="sezione sig">Programmi più grandi</div>
			<p class="nota">Space Train non li tocca: «Disinstalla» avvia il programma di disinstallazione ufficiale.</p>
			{#if programmi === null}
				<div class="prog"><span class="dettaglio">pesando…</span></div>
			{:else}
				{#each programmi as p (p.id)}
					<div class="prog">
						<span class="ellissi">{p.name}{#if p.publisher}<span class="dettaglio">{` · ${p.publisher}`}</span>{/if}</span>
						<span class="peso">{byte(p.size)}</span>
						<button onclick={() => void disinstalla(p)}>Disinstalla</button>
					</div>
				{/each}
			{/if}
		{/if}
	</div>
</div>

{#if confermando}
	<div
		class="sfondo"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && (confermando = false)}
		onkeydown={(e) => e.key === 'Escape' && (confermando = false)}
	>
		<div class="finestra" role="dialog" aria-modal="true" aria-label="Conferma pulizia">
			<h2>Liberare {byte(daFare.byte)}?</h2>
			{#if daFare.disco.length > 0}
				<p><b>{daFare.disco.length}</b> {daFare.disco.length === 1 ? 'elemento si ricrea' : 'elementi si ricreano'} da soli: eliminati per sempre.</p>
			{/if}
			{#if daFare.cestino.length > 0}
				<p><b>{daFare.cestino.length}</b> da guardare: {daFare.cestino.length === 1 ? 'va' : 'vanno'} nel Cestino.</p>
			{/if}
			{#if daFare.svuota}<p>Il Cestino si svuota.</p>{/if}
			<ul>
				{#each [...daFare.disco, ...daFare.cestino].slice(0, 6) as p (p)}<li>{p}</li>{/each}
				{#if daFare.disco.length + daFare.cestino.length > 6}<li class="resto">e altri {daFare.disco.length + daFare.cestino.length - 6}…</li>{/if}
			</ul>
			<p class="nota">I file in uso si saltano e te lo dico.</p>
			<div class="azioni">
				<button bind:this={annulla} onclick={() => (confermando = false)}>Annulla</button>
				<button class="pericolo" onclick={() => void libera()}>Libera</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.pulizia {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.banda {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		min-height: 40px;
		padding: 4px 12px 4px 16px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		color: var(--text-dim);
	}
	.banda b {
		color: var(--text);
		font-family: var(--font-display);
		font-weight: 400;
		font-size: calc(15px * var(--scala-testo, 1));
		font-variant-numeric: tabular-nums;
	}
	.spazio {
		flex: 1;
	}
	.errore {
		padding: 8px 16px;
		color: var(--errore-testo, #ffb4ab);
		border-bottom: 1px solid var(--border);
	}
	.elenco {
		flex: 1;
		overflow-y: auto;
		padding-bottom: 24px;
	}
	.cat {
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr) 90px;
		gap: 10px;
		align-items: center;
		padding: 8px 16px;
		border-bottom: 1px solid var(--border);
	}
	.cat:hover {
		background: var(--row-hover);
	}
	.cat.sub {
		padding-left: 44px;
		background: color-mix(in srgb, var(--bg) 40%, transparent);
	}
	.cat.vuota {
		color: var(--text-dim);
	}
	input[type='checkbox'] {
		margin: 0;
		accent-color: var(--accent);
	}
	.testo {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.nome {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.apri {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		cursor: default;
	}
	.freccia {
		color: var(--text-dim);
		font-size: calc(10px * var(--scala-testo, 1));
		transition: transform 0.12s ease-out;
	}
	.freccia.giu {
		transform: rotate(90deg);
	}
	.dettaglio {
		color: var(--text-dim);
		font-size: calc(11.5px * var(--scala-testo, 1));
	}
	.traccia {
		height: 4px;
		margin-top: 3px;
		border-radius: 2px;
		background: var(--border);
		overflow: hidden;
	}
	.traccia span {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--plasma, var(--accent)), var(--current, var(--accent)));
	}
	.peso {
		text-align: right;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.pill {
		padding: 1px 7px;
		border-radius: 9px;
		font-size: calc(9.5px * var(--scala-testo, 1));
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.pill.ricrea,
	.pill.cestino {
		color: var(--in-linea, #22c55e);
		background: color-mix(in srgb, var(--in-linea, #22c55e) 12%, transparent);
	}
	.pill.guarda {
		color: var(--signal, #ffb454);
		background: color-mix(in srgb, var(--signal, #ffb454) 12%, transparent);
	}
	.pill.progetti {
		color: var(--current, var(--accent));
		background: color-mix(in srgb, var(--current, var(--accent)) 10%, transparent);
	}
	.radici {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 6px 16px 8px 44px;
		border-bottom: 1px solid var(--border);
	}
	.sig {
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(10.5px * var(--scala-testo, 1));
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 24px;
		padding: 0 4px 0 10px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--scala-testo, 1));
		white-space: nowrap;
	}
	.chip button {
		width: 18px;
		height: 18px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--text-dim);
		font: inherit;
	}
	.chip button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.chip.aggiungi {
		padding: 0 10px;
		color: var(--text-dim);
	}
	.sezione {
		padding: 20px 16px 4px;
	}
	.nota {
		margin: 0;
		padding: 0 16px 8px;
		color: var(--text-dim);
	}
	.prog {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 90px auto;
		gap: 10px;
		align-items: center;
		padding: 6px 16px;
		border-bottom: 1px solid var(--border);
	}
	.ellissi {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.banda button,
	.prog button,
	.azioni button {
		height: 26px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	.banda button:hover,
	.prog button:hover,
	.azioni button:hover {
		background: var(--row-hover);
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.primario {
		background: var(--accent) !important;
		border-color: var(--accent) !important;
		color: #fff !important;
	}
	.primario:disabled {
		opacity: 0.45;
	}
	.sfondo {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		z-index: 10;
	}
	.finestra {
		width: min(480px, 90vw);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	.finestra h2 {
		margin: 0 0 10px;
		font-size: calc(15px * var(--scala-testo, 1));
		font-weight: 600;
	}
	.finestra p {
		margin: 0 0 8px;
		line-height: 1.5;
	}
	.finestra ul {
		margin: 0 0 10px;
		padding-left: 18px;
		max-height: 130px;
		overflow-y: auto;
		color: var(--text-dim);
		word-break: break-all;
	}
	.resto {
		list-style: none;
		margin-left: -18px;
	}
	.finestra .nota {
		padding: 0;
	}
	.azioni {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 16px;
	}
	.pericolo {
		border-color: transparent !important;
		background: #c42b1c !important;
		color: #fff;
	}
</style>
