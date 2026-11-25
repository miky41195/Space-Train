<script lang="ts">
	import { t } from '../i18n';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import type { Backend, Entry, MediaProps, FsError } from '../ipc';
	import { mediaLines } from '../media';
	import { categoryFor } from '../icons';
	import { describeType } from '../columns';
	import { formatBytes, isArchive, extension } from '../locations';
	import { csv, highlight, markdown } from '../text-preview';
	import { level } from '../archive';

	let {
		item,
		count,
		backend,
		media = undefined
	}: {
		/** The item to show: the last one selected. */
		item: Entry | null;
		/** How many items are selected in all. */
		count: number;
		backend: Backend;
		/** Photo/video/music details of `item`, when known. */
		media?: MediaProps | null;
	} = $props();

	type Mode = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'markdown' | 'code' | 'csv' | 'archive' | 'info';
	/** Text kinds with a richer reading: they can be switched back to plain text. */
	const RICH = new Set<Mode>(['markdown', 'code', 'csv']);

	const TEXTUAL = new Set(['code', 'markup', 'style', 'data', 'text', 'config']);

	let mode = $derived.by((): Mode => {
		if (!item || item.kind === 'dir' || item.path.includes('::')) return 'info';
		const cat = categoryFor(item.name);
		const ext = extension(item.name);
		if (ext === 'pdf') return 'pdf';
		if (isArchive(item.name)) return 'archive';
		if (ext === 'md' || ext === 'markdown') return 'markdown';
		if (ext === 'csv' || ext === 'tsv') return 'csv';
		if (['code', 'markup', 'style', 'config'].includes(cat) || ['json', 'yaml', 'yml', 'toml', 'sql'].includes(ext)) return 'code';
		if (cat === 'image') return 'image';
		if (cat === 'video') return 'video';
		if (cat === 'audio') return 'audio';
		// A small file with no known extension is often text: it is tried,
		// and if it turns out binary only the info card stays.
		if (TEXTUAL.has(cat) || (cat === 'plain' && item.size < 512 * 1024)) return 'text';
		return 'info';
	});

	let text = $state<string | null>(null);
	let loading = $state(false);

	/** «Testo plain»: the raw text instead of the rich reading. */
	let plain = $state(false);
	let readsText = $derived(mode === 'text' || RICH.has(mode));
	let blocks = $derived(mode === 'markdown' && text !== null ? markdown(text) : []);
	let tokens = $derived(mode === 'code' && text !== null ? highlight(text, extension(item?.name ?? '')) : []);
	let table = $derived(mode === 'csv' && text !== null ? csv(text) : []);
	const NUMBER = /^-?[\d.,]+$/;

	let archiveContents = $state<{ items: Entry[]; total: number } | null>(null);
	let archiveLocked = $state(false);
	$effect(() => {
		archiveContents = null;
		archiveLocked = false;
		if (mode !== 'archive' || !item) return;
		const file = item.path;
		let valid = true;
		backend
			.archiveList(file)
			.then((v) => {
				if (valid) archiveContents = { items: level(v, '', file), total: v.filter((x) => !x.dir).length };
			})
			.catch((e) => {
				if (valid) archiveLocked = (e as FsError)?.kind === 'archivePassword';
			});
		return () => (valid = false);
	});

	$effect(() => {
		text = null;
		if (!readsText || !item) return;
		const path = item.path;
		loading = true;
		let valid = true;
		backend
			.textPreview(path)
			.then((t) => {
				if (valid) text = t;
			})
			.catch(() => {
				if (valid) text = null;
			})
			.finally(() => {
				if (valid) loading = false;
			});
		// Selection changed before the reply: the old one is discarded.
		return () => (valid = false);
	});

	let source = $derived(item && ['image', 'video', 'audio', 'pdf'].includes(mode) ? convertFileSrc(item.path) : '');

	function formatDate(ms: number | null): string {
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

<aside class="preview" aria-label={t('Anteprima')}>
	{#if !item}
		<p class="empty">
			{count > 1 ? t('{0} elementi selezionati', [count]) : t('Seleziona un file per vederne l’anteprima.')}
		</p>
	{:else}
		<div class="screen">
			{#if mode === 'image'}
				<img src={source} alt={item.name} />
			{:else if mode === 'video'}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video src={source} controls></video>
			{:else if mode === 'audio'}
				<audio src={source} controls></audio>
			{:else if mode === 'pdf'}
				<iframe src={source} title={item.name}></iframe>
			{:else if readsText && text !== null && (mode === 'text' || plain)}
				<pre>{text}</pre>
			{:else if mode === 'markdown' && text !== null}
				<div class="md">
					{#each blocks as b, i (i)}
						{#if b.kind === 'heading'}
							<p class="heading t{Math.min(b.level, 3)}">{#each b.spans as t, j (j)}{@render span(t)}{/each}</p>
						{:else if b.kind === 'paragraph'}
							<p>{#each b.spans as t, j (j)}{@render span(t)}{/each}</p>
						{:else if b.kind === 'quote'}
							<blockquote>{#each b.spans as t, j (j)}{@render span(t)}{/each}</blockquote>
						{:else if b.kind === 'code'}
							<pre class="block">{b.text}</pre>
						{:else if b.kind === 'rule'}
							<hr />
						{:else if b.ordered}
							<ol>{#each b.items as v, j (j)}<li>{#each v as t, k (k)}{@render span(t)}{/each}</li>{/each}</ol>
						{:else}
							<ul>{#each b.items as v, j (j)}<li>{#each v as t, k (k)}{@render span(t)}{/each}</li>{/each}</ul>
						{/if}
					{/each}
				</div>
			{:else if mode === 'code' && text !== null}
				<pre class="code">{#each tokens as g, i (i)}{#if g.kind}<span class={g.kind}>{g.text}</span>{:else}{g.text}{/if}{/each}</pre>
			{:else if mode === 'csv' && text !== null}
				<div class="table">
					<table>
						<tbody>
							{#each table as row, i (i)}
								<tr>
									{#each row as cell, j (j)}
										{#if i === 0}<th>{cell}</th>{:else}<td class:number={NUMBER.test(cell.trim())}>{cell}</td>{/if}
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if mode === 'archive' && archiveContents}
				<div class="archive">
					<p class="count">{t('{0} file nell’archivio', [archiveContents.total])}</p>
					<ul>
						{#each archiveContents.items.slice(0, 40) as v (v.path)}
							<li class:folder={v.kind === 'dir'}><span>{v.name}</span>{#if v.kind !== 'dir'}<span class="weight">{formatBytes(v.size)}</span>{/if}</li>
						{/each}
					</ul>
				</div>
			{:else if archiveLocked}
				<p class="empty">{t('L’archivio è protetto da password.')}</p>
			{:else if readsText && loading}
				<p class="empty">{t('Lettura…')}</p>
			{:else}
				<p class="empty">{t('Nessuna anteprima disponibile.')}</p>
			{/if}
		</div>

		{#if RICH.has(mode) && text !== null}
			<label class="plain"><input type="checkbox" bind:checked={plain} /> {t('Testo semplice')}</label>
		{/if}
		<dl class="card">
			<dt>{t('Nome')}</dt>
			<dd title={item.name}>{item.name}</dd>
			<dt>{t('Tipo')}</dt>
			<dd>{describeType(item)}</dd>
			{#if item.kind !== 'dir'}
				<dt>{t('Dimensione')}</dt>
				<dd>{formatBytes(item.size)}</dd>
			{/if}
			{#if item.total !== undefined && item.free !== undefined}
				<dt>{t('Spazio')}</dt>
				<dd>{t('{0} liberi di {1}', [formatBytes(item.free), formatBytes(item.total)])}</dd>
			{/if}
			<dt>{item.origin ? t('Eliminato') : t('Modificato')}</dt>
			<dd>{formatDate(item.modified)}</dd>
			{#each mediaLines(media) as [k, v] (k)}
				<dt>{k}</dt>
				<dd title={v}>{v}</dd>
			{/each}
			{#if item.origin}
				<dt>{t('Posizione originale')}</dt>
				<dd title={item.origin}>{item.origin}</dd>
			{/if}
			{#if count > 1}
				<dt>{t('Selezione')}</dt>
				<dd>{t('{0} elementi', [count])}</dd>
			{/if}
		</dl>
	{/if}
</aside>

{#snippet span(t: { text: string; bold?: boolean; italic?: boolean; code?: boolean })}
	{#if t.code}<code>{t.text}</code>{:else if t.bold}<strong>{t.text}</strong>{:else if t.italic}<em>{t.text}</em>{:else}{t.text}{/if}
{/snippet}

<style>
	.preview {
		display: flex;
		flex-direction: column;
		width: 300px;
		flex-shrink: 0;
		border-left: 1px solid var(--border);
		background: var(--surface);
		overflow: hidden;
	}
	.screen {
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
		font-size: calc(11.5px * var(--text-scale, 1));
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--text);
	}
	/* Rich previews read from the top, not centred like an image. */
	.md,
	.table,
	.archive,
	pre.code {
		align-self: stretch;
		width: 100%;
	}
	.md {
		font-size: calc(12.5px * var(--text-scale, 1));
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
	.md .heading {
		font-weight: 600;
	}
	.md .t1 {
		font-size: calc(16px * var(--text-scale, 1));
	}
	.md .t2 {
		font-size: calc(14px * var(--text-scale, 1));
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
	.md pre.block {
		font-family: 'Cascadia Mono', Consolas, monospace;
		font-size: 0.92em;
		background: var(--bg);
		border-radius: 4px;
	}
	.md code {
		padding: 0 4px;
	}
	.md pre.block {
		padding: 8px;
		margin: 0 0 8px;
	}
	pre.code .comment {
		color: var(--text-dim);
		font-style: italic;
	}
	pre.code .string {
		color: var(--current);
	}
	pre.code .number {
		color: var(--signal, #ffb454);
	}
	pre.code .keyword {
		color: var(--accent);
		font-weight: 600;
	}
	.table {
		overflow: auto;
	}
	table {
		border-collapse: collapse;
		font-size: calc(11.5px * var(--text-scale, 1));
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
		font-size: calc(10px * var(--text-scale, 1));
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	td.number {
		text-align: right;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.archive .count {
		margin: 0 0 8px;
		color: var(--text-dim);
	}
	.archive ul {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: calc(12px * var(--text-scale, 1));
	}
	.archive li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 2px 0;
	}
	.archive li span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.archive li.folder span:first-child::after {
		content: '/';
		color: var(--text-dim);
	}
	.archive .weight {
		flex: none;
		color: var(--text-dim);
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.plain {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 16px;
		border-top: 1px solid var(--border);
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.empty {
		margin: auto;
		padding: 24px;
		color: var(--text-dim);
		text-align: center;
	}
	.card {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		margin: 0;
		padding: 12px 16px;
		border-top: 1px solid var(--border);
		font-size: calc(12px * var(--text-scale, 1));
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
