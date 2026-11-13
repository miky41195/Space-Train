<script lang="ts">
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { tauriBackend, type Entry } from '../ipc';
	import { categoryFor } from '../icons';
	import { byte } from '../posizioni';
	import { diffRighe, parteCambiata, righeAffiancate, type Riga } from '../diff';

	let {
		a,
		b,
		onchiudi,
		descriviErrore
	}: {
		a: Entry;
		b: Entry;
		onchiudi: () => void;
		descriviErrore: (e: unknown) => string;
	} = $props();

	/** The backend reads at most this much text of each file. */
	const LIMITE_TESTO = 256 * 1024;

	type Stato =
		| { modo: 'carico' }
		| { modo: 'testo'; righe: Riga[]; diverse: number; aggiunte: number; tolte: number }
		| { modo: 'troppoDiversi' }
		| { modo: 'immagine' }
		| { modo: 'binario'; uguali: boolean }
		| { modo: 'errore'; messaggio: string };

	let stato = $state<Stato>({ modo: 'carico' });
	let corrente = $state(-1);
	let elenco = $state<HTMLDivElement | null>(null);

	const data = (e: Entry) =>
		e.modified ? new Date(e.modified).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
	const immagine = (e: Entry) => categoryFor(e.name) === 'image';

	$effect(() => {
		const [x, y] = [a, b];
		stato = { modo: 'carico' };
		corrente = -1;
		void (async () => {
			try {
				if (immagine(x) && immagine(y)) {
					stato = { modo: 'immagine' };
					return;
				}
				const [tx, ty] = await Promise.all([tauriBackend.textPreview(x.path), tauriBackend.textPreview(y.path)]);
				if (tx !== null && ty !== null) {
					const ops = diffRighe(tx.split(/\r?\n/), ty.split(/\r?\n/));
					if (!ops) {
						stato = { modo: 'troppoDiversi' };
						return;
					}
					const righe = righeAffiancate(ops);
					stato = {
						modo: 'testo',
						righe,
						diverse: righe.filter((r) => r.tipo === 'cambiata').length,
						aggiunte: righe.filter((r) => r.tipo === 'aggiunta').length,
						tolte: righe.filter((r) => r.tipo === 'tolta').length
					};
					return;
				}
				// Not text: equal or not, by content.
				if (x.size !== y.size) {
					stato = { modo: 'binario', uguali: false };
					return;
				}
				const id = Date.now();
				const [hx, hy] = await Promise.all([
					tauriBackend.fileChecksum({ opId: id, path: x.path, algorithm: 'sha256' }),
					tauriBackend.fileChecksum({ opId: id + 1, path: y.path, algorithm: 'sha256' })
				]);
				stato = { modo: 'binario', uguali: hx !== null && hx === hy };
			} catch (e) {
				stato = { modo: 'errore', messaggio: descriviErrore(e) };
			}
		})();
	});

	/** Index of the first row of each block of changes, for F7. */
	let cambi = $derived.by(() => {
		if (stato.modo !== 'testo') return [] as number[];
		const out: number[] = [];
		stato.righe.forEach((r, i) => {
			const prima = stato.modo === 'testo' ? stato.righe[i - 1] : undefined;
			const cambia = r.tipo !== 'uguale' && r.tipo !== 'salto';
			const primaCambia = prima && prima.tipo !== 'uguale' && prima.tipo !== 'salto';
			if (cambia && !primaCambia) out.push(i);
		});
		return out;
	});

	function vai(verso: 1 | -1) {
		if (cambi.length === 0) return;
		corrente = (corrente + verso + cambi.length) % cambi.length;
		elenco?.querySelector(`[data-riga="${cambi[corrente]}"]`)?.scrollIntoView({ block: 'center' });
	}

	// Image slider: share of the second image shown, from the right.
	let taglio = $state(50);
	let palco = $state<HTMLDivElement | null>(null);
	function trascina(e: PointerEvent) {
		if (!palco || (e.type === 'pointermove' && e.buttons !== 1)) return;
		const r = palco.getBoundingClientRect();
		taglio = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'F7') {
			e.preventDefault();
			vai(e.shiftKey ? -1 : 1);
		}
	}}
/>

<div class="confronto">
	<div class="banda" role="status">
		{#if stato.modo === 'carico'}
			<span>Confronto in corso…</span>
		{:else if stato.modo === 'testo'}
			{#if cambi.length === 0}
				<span><b>Identici</b> riga per riga</span>
			{:else}
				{#if stato.diverse}<span><b>{stato.diverse}</b> {stato.diverse === 1 ? 'riga diversa' : 'righe diverse'}</span>{/if}
				{#if stato.tolte}<span><b>{stato.tolte}</b> solo a sinistra</span>{/if}
				{#if stato.aggiunte}<span><b>{stato.aggiunte}</b> solo a destra</span>{/if}
			{/if}
			{#if a.size > LIMITE_TESTO || b.size > LIMITE_TESTO}<span class="nota">confrontati i primi 256 KB</span>{/if}
		{:else if stato.modo === 'immagine'}
			<span>Trascina il confine, o usa le frecce, per passare da una all’altra.</span>
		{:else if stato.modo === 'binario'}
			<span><b>{stato.uguali ? 'Uguali' : 'Diversi'}</b> {stato.uguali ? 'byte per byte' : 'nel contenuto'}</span>
		{:else if stato.modo === 'troppoDiversi'}
			<span>Troppo diversi per un confronto riga per riga.</span>
		{:else if stato.modo === 'errore'}
			<span class="errore">{stato.messaggio}</span>
		{/if}
		<span class="spazio"></span>
		{#if cambi.length > 0}
			<button onclick={() => vai(-1)} title="Differenza precedente (Maiusc+F7)">↑</button>
			<button onclick={() => vai(1)} title="Differenza successiva (F7)">↓</button>
		{/if}
		<button onclick={onchiudi}>Chiudi</button>
	</div>

	{#if stato.modo === 'testo'}
		<div class="testate">
			<span title={a.path}>{a.name}<small>{data(a)}</small></span>
			<span title={b.path}>{b.name}<small>{data(b)}</small></span>
		</div>
		<div class="righe" bind:this={elenco}>
			{#each stato.righe as r, i (i)}
				{#if r.tipo === 'salto'}
					<div class="salto">⋯ {r.quante} {r.quante === 1 ? 'riga uguale' : 'righe uguali'}</div>
				{:else}
					<div class="riga {r.tipo}" data-riga={i} class:attuale={cambi[corrente] === i}>
						{#each [r.sx, r.dx] as lato, j (j)}
							<span class="lato" class:vuoto={!lato}>
								<span class="n">{lato?.n ?? ''}</span>
								<span class="t"
									>{#if lato && r.tipo === 'cambiata'}{@const [p, m, d] = parteCambiata(lato.testo, (j === 0 ? r.dx : r.sx)?.testo ?? '')}{p}<mark
											>{m}</mark
										>{d}{:else}{lato?.testo ?? ''}{/if}</span
								>
							</span>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{:else if stato.modo === 'immagine'}
		<div
			class="palco"
			bind:this={palco}
			role="slider"
			tabindex="0"
			aria-label="Confine fra le due immagini"
			aria-valuenow={Math.round(taglio)}
			aria-valuemin={0}
			aria-valuemax={100}
			onpointerdown={trascina}
			onpointermove={trascina}
			onkeydown={(e) => {
				if (e.key === 'ArrowLeft') taglio = Math.max(0, taglio - 5);
				if (e.key === 'ArrowRight') taglio = Math.min(100, taglio + 5);
			}}
		>
			<img src={convertFileSrc(a.path)} alt={a.name} draggable="false" />
			<img src={convertFileSrc(b.path)} alt={b.name} draggable="false" style:clip-path="inset(0 0 0 {taglio}%)" />
			<span class="confine" style:left="{taglio}%"></span>
			<span class="etichetta sx">{a.name}</span>
			<span class="etichetta dx">{b.name}</span>
		</div>
		<div class="banda piede">
			<span><b>{byte(a.size)}</b> · {data(a)}</span>
			<span class="spazio"></span>
			<span><b>{byte(b.size)}</b> · {data(b)}</span>
		</div>
	{:else if stato.modo === 'binario'}
		<div class="riepilogo">
			{#each [a, b] as e (e.path)}
				<div><b>{e.name}</b><span>{byte(e.size)} · {data(e)}</span><small>{e.path}</small></div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.confronto {
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
	.banda.piede {
		border-top: 1px solid var(--border);
		border-bottom: 0;
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
		color: var(--errore-testo, #ffb4ab);
	}
	.banda button {
		min-width: 26px;
		height: 26px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	.banda button:hover {
		background: var(--row-hover);
	}
	.banda button:focus-visible,
	.palco:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.testate {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-bottom: 1px solid var(--border);
	}
	.testate span {
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
	.testate span + span {
		border-left: 1px solid var(--border);
	}
	.testate small {
		font-weight: 400;
		color: var(--text-dim);
	}
	.righe {
		flex: 1;
		overflow-y: auto;
		font-family: 'Cascadia Mono', Consolas, ui-monospace, monospace;
		font-size: calc(12px * var(--scala-testo, 1));
		line-height: 1.6;
	}
	.riga {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.lato {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr);
		min-width: 0;
	}
	.lato + .lato {
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
	.tolta .lato:first-child,
	.cambiata .lato:first-child {
		background: rgba(255, 107, 107, 0.12);
	}
	.aggiunta .lato:last-child,
	.cambiata .lato:last-child {
		background: rgba(34, 197, 94, 0.12);
	}
	.lato.vuoto {
		background: repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--border) 60%, transparent) 6px 7px);
	}
	.cambiata .lato:first-child mark {
		background: rgba(255, 107, 107, 0.34);
		color: inherit;
		border-radius: 2px;
	}
	.cambiata .lato:last-child mark {
		background: rgba(34, 197, 94, 0.34);
		color: inherit;
		border-radius: 2px;
	}
	.riga.attuale {
		box-shadow: inset 3px 0 0 var(--current, var(--accent));
	}
	.salto {
		padding: 2px 0 2px 54px;
		color: var(--text-dim);
		background: color-mix(in srgb, var(--surface) 50%, transparent);
		font-family: var(--font-ui);
		font-size: calc(11.5px * var(--scala-testo, 1));
	}
	.palco {
		position: relative;
		flex: 1;
		min-height: 0;
		margin: 12px;
		overflow: hidden;
		touch-action: none;
		cursor: ew-resize;
	}
	.palco img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		user-select: none;
	}
	.confine {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		background: var(--current, var(--accent));
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
		pointer-events: none;
	}
	.etichetta {
		position: absolute;
		top: 8px;
		max-width: 45%;
		padding: 2px 8px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		border-radius: 4px;
		background: color-mix(in srgb, var(--bg) 75%, transparent);
		font-size: calc(11.5px * var(--scala-testo, 1));
		pointer-events: none;
	}
	.etichetta.sx {
		left: 8px;
	}
	.etichetta.dx {
		right: 8px;
	}
	.riepilogo {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		padding: 16px;
	}
	.riepilogo div {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.riepilogo span,
	.riepilogo small {
		color: var(--text-dim);
		overflow-wrap: anywhere;
	}
</style>
