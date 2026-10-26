<script lang="ts">
	import { convertFileSrc } from '@tauri-apps/api/core';
	import type { Backend, Entry } from '../ipc';
	import { categoryFor } from '../icons';
	import { descriviTipo } from '../colonne';
	import { byte, estensione } from '../posizioni';

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

	type Modo = 'immagine' | 'video' | 'audio' | 'pdf' | 'testo' | 'info';

	const TESTUALI = new Set(['code', 'markup', 'style', 'data', 'text', 'config']);

	let modo = $derived.by((): Modo => {
		if (!voce || voce.kind === 'dir' || voce.path.startsWith('::')) return 'info';
		const cat = categoryFor(voce.name);
		if (estensione(voce.name) === 'pdf') return 'pdf';
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

	$effect(() => {
		testo = null;
		if (modo !== 'testo' || !voce) return;
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

	let sorgente = $derived(voce && modo !== 'info' && modo !== 'testo' ? convertFileSrc(voce.path) : '');

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
			{:else if modo === 'testo' && testo !== null}
				<pre>{testo}</pre>
			{:else if modo === 'testo' && caricando}
				<p class="vuoto">Lettura…</p>
			{:else}
				<p class="vuoto">Nessuna anteprima disponibile.</p>
			{/if}
		</div>

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
		font-size: 11.5px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--text);
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
		font-size: 12px;
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
