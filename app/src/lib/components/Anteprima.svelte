<script lang="ts">
	import { convertFileSrc } from '@tauri-apps/api/core';
	import type { Backend, Entry } from '../ipc';
	import { categoryFor } from '../icons';
	import { descriviTipo } from '../colonne';
	import { byte, eArchivio, estensione } from '../posizioni';
	import { csv, evidenzia, markdown } from '../anteprima-testi';
	import { livello } from '../archivio';

	let {
		voce,
		quante,
		backend
	}: {
		/** La voce da mostrare: l'ultima selezionata. */
		voce: Entry | null;
		/** Quante voci sono selezionate in tutto. */
		quante: number;
		backend: Backend;
	} = $props();

	type Modo = 'immagine' | 'video' | 'audio' | 'pdf' | 'testo' | 'markdown' | 'codice' | 'csv' | 'archivio' | 'info';
	/** Text kinds with a richer reading: they can be switched back to plain text. */
	const RICCHI = new Set<Modo>(['markdown', 'codice', 'csv']);

	const TESTUALI = new Set(['code', 'markup', 'style', 'data', 'text', 'config']);

	let modo = $derived.by((): Modo => {
		if (!voce || voce.kind === 'dir' || voce.path.includes('::')) return 'info';
		const cat = categoryFor(voce.name);
		const ext = estensione(voce.name);
		if (ext === 'pdf') return 'pdf';
		if (eArchivio(voce.name)) return 'archivio';
		if (ext === 'md' || ext === 'markdown') return 'markdown';
		if (ext === 'csv' || ext === 'tsv') return 'csv';
		if (['code', 'markup', 'style', 'config'].includes(cat) || ['json', 'yaml', 'yml', 'toml', 'sql'].includes(ext)) return 'codice';
		if (cat === 'image') return 'immagine';
		if (cat === 'video') return 'video';
		if (cat === 'audio') return 'audio';
		// Un file senza estensione nota ma piccolo è spesso testo: si prova,
		// e se risulta binario resta solo la scheda informativa.
		if (TESTUALI.has(cat) || (cat === 'plain' && voce.size < 512 * 1024)) return 'testo';
		return 'info';
	});

	let testo = $state<string | null>(null);
	let caricando = $state(false);

	/** «Testo semplice»: the raw text instead of the rich reading. */
	let semplice = $state(false);
	let leggeTesto = $derived(modo === 'testo' || RICCHI.has(modo));
	let blocchi = $derived(modo === 'markdown' && testo !== null ? markdown(testo) : []);
	let gettoni = $derived(modo === 'codice' && testo !== null ? evidenzia(testo, estensione(voce?.name ?? '')) : []);
	let tabella = $derived(modo === 'csv' && testo !== null ? csv(testo) : []);
	const NUMERO = /^-?[\d.,]+$/;

	let contenutoArchivio = $state<{ voci: Entry[]; totale: number } | null>(null);
	$effect(() => {
		contenutoArchivio = null;
		if (modo !== 'archivio' || !voce) return;
		const file = voce.path;
		let valido = true;
		backend
			.archiveList(file)
			.then((v) => {
				if (valido) contenutoArchivio = { voci: livello(v, '', file), totale: v.filter((x) => !x.dir).length };
			})
			.catch(() => {});
		return () => (valido = false);
	});

	$effect(() => {
		testo = null;
		if (!leggeTesto || !voce) return;
		const path = voce.path;
		caricando = true;
		let valido = true;
		backend
			.textPreview(path)
			.then((t) => {
				if (valido) testo = t;
			})
			.catch(() => {
				if (valido) testo = null;
			})
			.finally(() => {
				if (valido) caricando = false;
			});
		// Selezione cambiata prima della risposta: quella vecchia si scarta.
		return () => (valido = false);
	});

	let sorgente = $derived(voce && ['immagine', 'video', 'audio', 'pdf'].includes(modo) ? convertFileSrc(voce.path) : '');

	function data(ms: number | null): string {
		if (ms === null) return '—';
		return new Date(ms).toLocaleString('it-IT', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<aside class="anteprima" aria-label="Anteprima">
	{#if !voce}
		<p class="vuoto">
			{quante > 1 ? `${quante} elementi selezionati` : 'Seleziona un file per vederne l’anteprima.'}
		</p>
	{:else}
		<div class="schermo">
			{#if modo === 'immagine'}
				<img src={sorgente} alt={voce.name} />
			{:else if modo === 'video'}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video src={sorgente} controls></video>
			{:else if modo === 'audio'}
				<audio src={sorgente} controls></audio>
			{:else if modo === 'pdf'}
				<iframe src={sorgente} title={voce.name}></iframe>
			{:else if leggeTesto && testo !== null && (modo === 'testo' || semplice)}
				<pre>{testo}</pre>
			{:else if modo === 'markdown' && testo !== null}
				<div class="md">
					{#each blocchi as b, i (i)}
						{#if b.tipo === 'titolo'}
							<p class="titolo t{Math.min(b.livello, 3)}">{#each b.tratti as t, j (j)}{@render tratto(t)}{/each}</p>
						{:else if b.tipo === 'paragrafo'}
							<p>{#each b.tratti as t, j (j)}{@render tratto(t)}{/each}</p>
						{:else if b.tipo === 'citazione'}
							<blockquote>{#each b.tratti as t, j (j)}{@render tratto(t)}{/each}</blockquote>
						{:else if b.tipo === 'codice'}
							<pre class="blocco">{b.testo}</pre>
						{:else if b.tipo === 'linea'}
							<hr />
						{:else if b.ordinato}
							<ol>{#each b.voci as v, j (j)}<li>{#each v as t, k (k)}{@render tratto(t)}{/each}</li>{/each}</ol>
						{:else}
							<ul>{#each b.voci as v, j (j)}<li>{#each v as t, k (k)}{@render tratto(t)}{/each}</li>{/each}</ul>
						{/if}
					{/each}
				</div>
			{:else if modo === 'codice' && testo !== null}
				<pre class="codice">{#each gettoni as g, i (i)}{#if g.classe}<span class={g.classe}>{g.testo}</span>{:else}{g.testo}{/if}{/each}</pre>
			{:else if modo === 'csv' && testo !== null}
				<div class="tabella">
					<table>
						<tbody>
							{#each tabella as riga, i (i)}
								<tr>
									{#each riga as cella, j (j)}
										{#if i === 0}<th>{cella}</th>{:else}<td class:numero={NUMERO.test(cella.trim())}>{cella}</td>{/if}
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if modo === 'archivio' && contenutoArchivio}
				<div class="archivio">
					<p class="conteggio">{contenutoArchivio.totale} file nell’archivio</p>
					<ul>
						{#each contenutoArchivio.voci.slice(0, 40) as v (v.path)}
							<li class:cartella={v.kind === 'dir'}><span>{v.name}</span>{#if v.kind !== 'dir'}<span class="peso">{byte(v.size)}</span>{/if}</li>
						{/each}
					</ul>
				</div>
			{:else if leggeTesto && caricando}
				<p class="vuoto">Lettura…</p>
			{:else}
				<p class="vuoto">Nessuna anteprima disponibile.</p>
			{/if}
		</div>

		{#if RICCHI.has(modo) && testo !== null}
			<label class="semplice"><input type="checkbox" bind:checked={semplice} /> Testo semplice</label>
		{/if}
		<dl class="scheda">
			<dt>Nome</dt>
			<dd title={voce.name}>{voce.name}</dd>
			<dt>Tipo</dt>
			<dd>{descriviTipo(voce)}</dd>
			{#if voce.kind !== 'dir'}
				<dt>Dimensione</dt>
				<dd>{byte(voce.size)}</dd>
			{/if}
			{#if voce.totale !== undefined && voce.libero !== undefined}
				<dt>Spazio</dt>
				<dd>{byte(voce.libero)} liberi di {byte(voce.totale)}</dd>
			{/if}
			<dt>{voce.origine ? 'Eliminato' : 'Modificato'}</dt>
			<dd>{data(voce.modified)}</dd>
			{#if voce.origine}
				<dt>Posizione originale</dt>
				<dd title={voce.origine}>{voce.origine}</dd>
			{/if}
			{#if quante > 1}
				<dt>Selezione</dt>
				<dd>{quante} elementi</dd>
			{/if}
		</dl>
	{/if}
</aside>

{#snippet tratto(t: { testo: string; forte?: boolean; corsivo?: boolean; codice?: boolean })}
	{#if t.codice}<code>{t.testo}</code>{:else if t.forte}<strong>{t.testo}</strong>{:else if t.corsivo}<em>{t.testo}</em>{:else}{t.testo}{/if}
{/snippet}

<style>
	.anteprima {
		display: flex;
		flex-direction: column;
		width: 300px;
		flex-shrink: 0;
		border-left: 1px solid var(--border);
		background: var(--surface);
		overflow: hidden;
	}
	.schermo {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		min-height: 0;
		padding: 12px;
		overflow: auto;
	}
	img,
	video {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 6px;
	}
	audio {
		width: 100%;
	}
	iframe {
		width: 100%;
		height: 100%;
		border: none;
		background: white;
	}
	pre {
		align-self: stretch;
		width: 100%;
		margin: 0;
		font-family: 'Cascadia Mono', Consolas, monospace;
		font-size: calc(11.5px * var(--scala-testo, 1));
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--text);
	}
	/* Rich previews read from the top, not centred like an image. */
	.md,
	.tabella,
	.archivio,
	pre.codice {
		align-self: stretch;
		width: 100%;
	}
	.md {
		font-size: calc(12.5px * var(--scala-testo, 1));
		line-height: 1.55;
		overflow-wrap: anywhere;
	}
	.md p,
	.md ul,
	.md ol,
	.md blockquote {
		margin: 0 0 8px;
	}
	.md ul,
	.md ol {
		padding-left: 18px;
	}
	.md .titolo {
		font-weight: 600;
	}
	.md .t1 {
		font-size: calc(16px * var(--scala-testo, 1));
	}
	.md .t2 {
		font-size: calc(14px * var(--scala-testo, 1));
	}
	.md blockquote {
		padding-left: 10px;
		border-left: 2px solid var(--border);
		color: var(--text-dim);
	}
	.md hr {
		border: none;
		border-top: 1px solid var(--border);
	}
	.md code,
	.md pre.blocco {
		font-family: 'Cascadia Mono', Consolas, monospace;
		font-size: 0.92em;
		background: var(--bg);
		border-radius: 4px;
	}
	.md code {
		padding: 0 4px;
	}
	.md pre.blocco {
		padding: 8px;
		margin: 0 0 8px;
	}
	pre.codice .commento {
		color: var(--text-dim);
		font-style: italic;
	}
	pre.codice .stringa {
		color: var(--current);
	}
	pre.codice .numero {
		color: var(--signal, #ffb454);
	}
	pre.codice .parola {
		color: var(--accent);
		font-weight: 600;
	}
	.tabella {
		overflow: auto;
	}
	table {
		border-collapse: collapse;
		font-size: calc(11.5px * var(--scala-testo, 1));
	}
	th,
	td {
		padding: 3px 8px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		white-space: nowrap;
	}
	th {
		position: sticky;
		top: 0;
		background: var(--surface);
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(10px * var(--scala-testo, 1));
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	td.numero {
		text-align: right;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.archivio .conteggio {
		margin: 0 0 8px;
		color: var(--text-dim);
	}
	.archivio ul {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.archivio li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 2px 0;
	}
	.archivio li span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.archivio li.cartella span:first-child::after {
		content: '/';
		color: var(--text-dim);
	}
	.archivio .peso {
		flex: none;
		color: var(--text-dim);
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.semplice {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 16px;
		border-top: 1px solid var(--border);
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.vuoto {
		margin: auto;
		padding: 24px;
		color: var(--text-dim);
		text-align: center;
	}
	.scheda {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		margin: 0;
		padding: 12px 16px;
		border-top: 1px solid var(--border);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	dt {
		color: var(--text-dim);
	}
	dd {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
