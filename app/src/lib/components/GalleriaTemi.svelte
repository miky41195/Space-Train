<script lang="ts">
	import { ACCENTI, CATEGORIE, TEMI, categoriaDi, type IdAccento, type IdCategoria, type Tema } from '../temi';
	import type { AzioneMenu } from '../menu';
	import Icona from './Icona.svelte';

	let {
		tema,
		personali = [],
		accento,
		coloreAccento,
		x,
		y,
		onscegli,
		onchiudi
	}: {
		/** Id del tema in uso. */
		tema: string;
		personali?: readonly Tema[];
		accento: IdAccento;
		/** Il colore scelto per l'accento personalizzato. */
		coloreAccento: string;
		/** Bordo destro e bordo alto, in pixel: la galleria si apre sotto il pulsante. */
		x: number;
		y: number;
		onscegli: (azione: AzioneMenu) => void;
		onchiudi: () => void;
	} = $props();

	const tutti = $derived([...TEMI, ...personali]);
	const conteggi = $derived(
		Object.fromEntries(CATEGORIE.map((c) => [c.id, tutti.filter((t) => categoriaDi(t) === c.id).length]))
	);
	// Si apre sulla categoria del tema in uso.
	let categoria = $state<IdCategoria>('scuri');
	$effect.pre(() => {
		const attuale = tutti.find((t) => t.id === tema);
		if (attuale) categoria = categoriaDi(attuale);
	});
	const visibili = $derived(tutti.filter((t) => categoriaDi(t) === categoria));

	let pannello = $state<HTMLDivElement | null>(null);
	$effect(() => {
		pannello?.querySelector<HTMLButtonElement>('.scheda.attiva, .scheda')?.focus();
	});

	/** I quattro colori che riconoscono un tema a colpo d'occhio. */
	function anteprima(t: Tema): string {
		const v = t.variabili;
		return `--a: ${v['--void']}; --b: ${v['--hull']}; --c: ${v['--plasma']}; --d: ${v['--current']}; --e: ${v['--text-dim']}`;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onchiudi()} />

<div class="velo" role="presentation" onclick={onchiudi} oncontextmenu={(e) => (e.preventDefault(), onchiudi())}></div>

<div
	class="galleria"
	role="dialog"
	aria-label="Temi"
	bind:this={pannello}
	style:right="{x}px"
	style:top="{y}px"
>
	<div class="categorie" role="tablist" aria-label="Categorie di temi" aria-orientation="vertical">
		{#each CATEGORIE as c (c.id)}
			<button
				role="tab"
				aria-selected={categoria === c.id}
				class:on={categoria === c.id}
				onclick={() => (categoria = c.id)}
			>
				<span>{c.nome}</span><span class="conta">{conteggi[c.id]}</span>
			</button>
		{/each}
	</div>

	<div class="temi" role="tabpanel">
		{#if visibili.length === 0}
			<p class="vuoto">Non hai ancora temi tuoi. Creane uno con «Crea o modifica un tema…».</p>
		{/if}
		{#each visibili as t (t.id)}
			<button
				class="scheda"
				class:attiva={t.id === tema}
				aria-pressed={t.id === tema}
				style={anteprima(t)}
				onclick={() => onscegli(`tema:${t.id}` as AzioneMenu)}
			>
				<span class="mini" aria-hidden="true">
					<span class="cielo"></span>
					<span class="corpo"><i class="nome-finto"></i><i class="sel"></i><i class="riga"></i></span>
				</span>
				<span class="nome">
					<span>{t.nome}</span>
					{#if t.id === tema}<span class="spunta"><Icona nome="spunta" /></span>{/if}
				</span>
			</button>
		{/each}
	</div>

	<div class="piede">
		<span class="etichetta">Colore d’evidenziazione</span>
		<div class="campioni" role="group" aria-label="Colore d’evidenziazione">
			{#each ACCENTI as a (a.id)}
				<button
					class="campione"
					class:attivo={accento === a.id}
					class:vuoto={a.id === 'tema'}
					class:arcobaleno={a.id === 'personalizzato'}
					style:--campione={a.id === 'personalizzato' ? coloreAccento : (a.colore ?? 'transparent')}
					aria-pressed={accento === a.id}
					aria-label={a.nome}
					title={a.nome}
					onclick={() => onscegli(`accento:${a.id}` as AzioneMenu)}
				></button>
			{/each}
		</div>
		<button class="crea" onclick={() => onscegli('editorTemi')}>Crea o modifica un tema…</button>
	</div>
</div>

<style>
	.velo {
		position: fixed;
		inset: 0;
		z-index: 20;
	}

	.galleria {
		position: fixed;
		z-index: 21;
		width: min(560px, calc(100vw - 24px));
		max-height: min(440px, calc(100vh - 80px));
		display: grid;
		grid-template-columns: 136px minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) auto;
		background: var(--hull);
		border: 1px solid var(--border);
		border-radius: min(var(--radius), 14px);
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
		overflow: hidden;
	}

	.categorie {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		border-right: 1px solid var(--border);
	}
	.categorie button {
		display: flex;
		align-items: center;
		height: 30px;
		padding: 0 10px;
		border: none;
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		text-align: left;
		cursor: default;
	}
	.categorie button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.categorie button.on {
		background: var(--accent-soft);
		color: var(--text);
	}
	.conta {
		margin-left: auto;
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-titoli, var(--scala-testo, 1)));
		font-variant-numeric: tabular-nums;
	}

	.temi {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
		gap: 8px;
		align-content: start;
		padding: 10px;
		overflow-y: auto;
	}
	.vuoto {
		grid-column: 1 / -1;
		margin: 8px 4px;
		color: var(--text-dim);
	}

	/* Ogni tema è una finestra in miniatura nei suoi colori: cielo, pannello,
	   un nome, una riga selezionata e la corrente. */
	.scheda {
		display: flex;
		flex-direction: column;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		text-align: left;
		overflow: hidden;
		cursor: default;
	}
	.scheda:hover {
		border-color: var(--text-dim);
	}
	.scheda.attiva {
		border-color: var(--current);
		box-shadow: inset 0 0 0 1px var(--current);
	}
	.mini {
		display: grid;
		grid-template-rows: 14px 1fr;
		height: 52px;
	}
	.cielo {
		background: var(--a);
		border-bottom: 2px solid var(--d);
	}
	.corpo {
		display: grid;
		align-content: center;
		gap: 4px;
		padding: 0 8px;
		background: var(--b);
	}
	.corpo i {
		display: block;
		height: 4px;
		border-radius: 2px;
	}
	.nome-finto {
		width: 55%;
		background: var(--e);
		opacity: 0.6;
	}
	.sel {
		width: 80%;
		background: var(--c);
	}
	.riga {
		width: 40%;
		background: var(--e);
		opacity: 0.35;
	}
	.nome {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 6px 8px;
		font-size: calc(12px * var(--scala-testo, 1));
		white-space: nowrap;
	}
	.nome > span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.spunta {
		display: inline-flex;
		color: var(--current);
	}

	.piede {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		padding: 10px 12px;
		border-top: 1px solid var(--border);
	}
	.etichetta {
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.campioni {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.campione {
		width: 18px;
		height: 18px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: var(--campione);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
		cursor: default;
	}
	.campione:hover {
		transform: scale(1.12);
	}
	.campione.attivo {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--text);
	}
	.campione.vuoto {
		background: linear-gradient(135deg, transparent 45%, var(--text-dim) 45% 55%, transparent 55%);
		box-shadow: inset 0 0 0 1px var(--text-dim);
	}
	.campione.arcobaleno {
		background:
			radial-gradient(circle, var(--campione) 0 4px, transparent 4.5px),
			conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #8b5cf6, #ec4899, #ef4444);
	}
	.crea {
		margin-left: auto;
		height: 28px;
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
	.crea:hover {
		background: var(--row-hover);
	}
</style>
