<script lang="ts">
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { tauriBackend, type Entry } from '../ipc';
	import { categoryFor } from '../icons';
	import { formatBytes } from '../locations';
	import { diffLines, changedPart, sideBySide, type Row } from '../diff';

	let {
		a,
		b,
		onclose,
		describeError
	}: {
		a: Entry;
		b: Entry;
		onclose: () => void;
		describeError: (e: unknown) => string;
	} = $props();

	/** The backend reads at most this much text of each file. */
	const TEXT_LIMIT = 256 * 1024;

	type View =
		| { mode: 'loading' }
		| { mode: 'text'; rows: Row[]; changed: number; added: number; removed: number }
		| { mode: 'tooDifferent' }
		| { mode: 'image' }
		| { mode: 'binary'; equal: boolean }
		| { mode: 'error'; message: string };

	let view = $state<View>({ mode: 'loading' });
	let current = $state(-1);
	let list = $state<HTMLDivElement | null>(null);

	const formatDate = (e: Entry) =>
		e.modified ? new Date(e.modified).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
	const isImage = (e: Entry) => categoryFor(e.name) === 'image';

	$effect(() => {
		const [x, y] = [a, b];
		view = { mode: 'loading' };
		current = -1;
		void (async () => {
			try {
				if (isImage(x) && isImage(y)) {
					view = { mode: 'image' };
					return;
				}
				const [tx, ty] = await Promise.all([tauriBackend.textPreview(x.path), tauriBackend.textPreview(y.path)]);
				if (tx !== null && ty !== null) {
					const ops = diffLines(tx.split(/\r?\n/), ty.split(/\r?\n/));
					if (!ops) {
						view = { mode: 'tooDifferent' };
						return;
					}
					const rows = sideBySide(ops);
					view = {
						mode: 'text',
						rows,
						changed: rows.filter((r) => r.kind === 'changed').length,
						added: rows.filter((r) => r.kind === 'added').length,
						removed: rows.filter((r) => r.kind === 'removed').length
					};
					return;
				}
				// Not text: equal or not, by content.
				if (x.size !== y.size) {
					view = { mode: 'binary', equal: false };
					return;
				}
				const id = Date.now();
				const [hx, hy] = await Promise.all([
					tauriBackend.fileChecksum({ opId: id, path: x.path, algorithm: 'sha256' }),
					tauriBackend.fileChecksum({ opId: id + 1, path: y.path, algorithm: 'sha256' })
				]);
				view = { mode: 'binary', equal: hx !== null && hx === hy };
			} catch (e) {
				view = { mode: 'error', message: describeError(e) };
			}
		})();
	});

	/** Index of the first row of each block of changes, for F7. */
	let changes = $derived.by(() => {
		if (view.mode !== 'text') return [] as number[];
		const out: number[] = [];
		view.rows.forEach((r, i) => {
			const before = view.mode === 'text' ? view.rows[i - 1] : undefined;
			const isChange = r.kind !== 'same' && r.kind !== 'gap';
			const beforeIsChange = before && before.kind !== 'same' && before.kind !== 'gap';
			if (isChange && !beforeIsChange) out.push(i);
		});
		return out;
	});

	function go(direction: 1 | -1) {
		if (changes.length === 0) return;
		current = (current + direction + changes.length) % changes.length;
		list?.querySelector(`[data-line="${changes[current]}"]`)?.scrollIntoView({ block: 'center' });
	}

	// Image slider: share of the second image shown, from the right.
	let cut = $state(50);
	let stage = $state<HTMLDivElement | null>(null);
	function drag(e: PointerEvent) {
		if (!stage || (e.type === 'pointermove' && e.buttons !== 1)) return;
		const r = stage.getBoundingClientRect();
		cut = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'F7') {
			e.preventDefault();
			go(e.shiftKey ? -1 : 1);
		}
	}}
/>

<div class="compare">
	<div class="band" role="status">
		{#if view.mode === 'loading'}
			<span>Confronto in corso…</span>
		{:else if view.mode === 'text'}
			{#if changes.length === 0}
				<span><b>Identici</b> riga per riga</span>
			{:else}
				{#if view.changed}<span><b>{view.changed}</b> {view.changed === 1 ? 'riga diversa' : 'righe diverse'}</span>{/if}
				{#if view.removed}<span><b>{view.removed}</b> solo a sinistra</span>{/if}
				{#if view.added}<span><b>{view.added}</b> solo a destra</span>{/if}
			{/if}
			{#if a.size > TEXT_LIMIT || b.size > TEXT_LIMIT}<span class="note">confrontati i primi 256 KB</span>{/if}
		{:else if view.mode === 'image'}
			<span>Trascina il confine, o usa le frecce, per passare da una all’altra.</span>
		{:else if view.mode === 'binary'}
			<span><b>{view.equal ? 'Uguali' : 'Diversi'}</b> {view.equal ? 'byte per byte' : 'nel contenuto'}</span>
		{:else if view.mode === 'tooDifferent'}
			<span>Troppo diversi per un confronto riga per riga.</span>
		{:else if view.mode === 'error'}
			<span class="error">{view.message}</span>
		{/if}
		<span class="spacer"></span>
		{#if changes.length > 0}
			<button onclick={() => go(-1)} title="Differenza precedente (Maiusc+F7)">↑</button>
			<button onclick={() => go(1)} title="Differenza successiva (F7)">↓</button>
		{/if}
		<button onclick={onclose}>Chiudi</button>
	</div>

	{#if view.mode === 'text'}
		<div class="headers">
			<span title={a.path}>{a.name}<small>{formatDate(a)}</small></span>
			<span title={b.path}>{b.name}<small>{formatDate(b)}</small></span>
		</div>
		<div class="lines" bind:this={list}>
			{#each view.rows as r, i (i)}
				{#if r.kind === 'gap'}
					<div class="gap">⋯ {r.count} {r.count === 1 ? 'riga uguale' : 'righe uguali'}</div>
				{:else}
					<div class="line {r.kind}" data-line={i} class:current={changes[current] === i}>
						{#each [r.left, r.right] as side, j (j)}
							<span class="side" class:empty={!side}>
								<span class="n">{side?.n ?? ''}</span>
								<span class="t"
									>{#if side && r.kind === 'changed'}{@const [p, m, d] = changedPart(side.text, (j === 0 ? r.right : r.left)?.text ?? '')}{p}<mark
											>{m}</mark
										>{d}{:else}{side?.text ?? ''}{/if}</span
								>
							</span>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{:else if view.mode === 'image'}
		<div
			class="stage"
			bind:this={stage}
			role="slider"
			tabindex="0"
			aria-label="Confine fra le due immagini"
			aria-valuenow={Math.round(cut)}
			aria-valuemin={0}
			aria-valuemax={100}
			onpointerdown={drag}
			onpointermove={drag}
			onkeydown={(e) => {
				if (e.key === 'ArrowLeft') cut = Math.max(0, cut - 5);
				if (e.key === 'ArrowRight') cut = Math.min(100, cut + 5);
			}}
		>
			<img src={convertFileSrc(a.path)} alt={a.name} draggable="false" />
			<img src={convertFileSrc(b.path)} alt={b.name} draggable="false" style:clip-path="inset(0 0 0 {cut}%)" />
			<span class="divider" style:left="{cut}%"></span>
			<span class="label left">{a.name}</span>
			<span class="label right">{b.name}</span>
		</div>
		<div class="band footer">
			<span><b>{formatBytes(a.size)}</b> · {formatDate(a)}</span>
			<span class="spacer"></span>
			<span><b>{formatBytes(b.size)}</b> · {formatDate(b)}</span>
		</div>
	{:else if view.mode === 'binary'}
		<div class="summary">
			{#each [a, b] as e (e.path)}
				<div><b>{e.name}</b><span>{formatBytes(e.size)} · {formatDate(e)}</span><small>{e.path}</small></div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.compare {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.band {
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
	.band.footer {
		border-top: 1px solid var(--border);
		border-bottom: 0;
	}
	.band b {
		color: var(--text);
		font-family: var(--font-display);
		font-weight: 400;
		font-size: calc(15px * var(--text-scale, 1));
		font-variant-numeric: tabular-nums;
	}
	.spacer {
		flex: 1;
	}
	.error {
		color: var(--error-text, #ffb4ab);
	}
	.band button {
		min-width: 26px;
		height: 26px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	.band button:hover {
		background: var(--row-hover);
	}
	.band button:focus-visible,
	.stage:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.headers {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-bottom: 1px solid var(--border);
	}
	.headers span {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
		padding: 6px 12px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-weight: 600;
	}
	.headers span + span {
		border-left: 1px solid var(--border);
	}
	.headers small {
		font-weight: 400;
		color: var(--text-dim);
	}
	.lines {
		flex: 1;
		overflow-y: auto;
		font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace;
		font-size: calc(12px * var(--text-scale, 1));
		line-height: 1.6;
	}
	.line {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.side {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr);
		min-width: 0;
	}
	.side + .side {
		border-left: 1px solid var(--border);
	}
	.n {
		padding-right: 10px;
		text-align: right;
		color: var(--text-dim);
		opacity: 0.6;
		user-select: none;
	}
	.t {
		padding-right: 10px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.removed .side:first-child,
	.changed .side:first-child {
		background: rgba(255, 107, 107, 0.12);
	}
	.added .side:last-child,
	.changed .side:last-child {
		background: rgba(34, 197, 94, 0.12);
	}
	.side.empty {
		background: repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--border) 60%, transparent) 6px 7px);
	}
	.changed .side:first-child mark {
		background: rgba(255, 107, 107, 0.34);
		color: inherit;
		border-radius: 2px;
	}
	.changed .side:last-child mark {
		background: rgba(34, 197, 94, 0.34);
		color: inherit;
		border-radius: 2px;
	}
	.line.current {
		box-shadow: inset 3px 0 0 var(--current, var(--accent));
	}
	.gap {
		padding: 2px 0 2px 54px;
		color: var(--text-dim);
		background: color-mix(in srgb, var(--surface) 50%, transparent);
		font-family: var(--font-ui);
		font-size: calc(11.5px * var(--text-scale, 1));
	}
	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
		margin: 12px;
		overflow: hidden;
		touch-action: none;
		cursor: ew-resize;
	}
	.stage img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		user-select: none;
	}
	.divider {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		background: var(--current, var(--accent));
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
		pointer-events: none;
	}
	.label {
		position: absolute;
		top: 8px;
		max-width: 45%;
		padding: 2px 8px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		border-radius: 4px;
		background: color-mix(in srgb, var(--bg) 75%, transparent);
		font-size: calc(11.5px * var(--text-scale, 1));
		pointer-events: none;
	}
	.label.left {
		left: 8px;
	}
	.label.right {
		right: 8px;
	}
	.summary {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		padding: 16px;
	}
	.summary div {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.summary span,
	.summary small {
		color: var(--text-dim);
		overflow-wrap: anywhere;
	}
</style>
