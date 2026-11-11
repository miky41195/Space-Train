<script lang="ts">
	import { ETICHETTE_TIPO, filtraComandi, type Comando } from '../palette';

	/** Ctrl+Maiusc+P: type to find any action, folder, saved search, theme or setting. */
	let { comandi, onclose }: { comandi: Comando[]; onclose: () => void } = $props();

	let testo = $state('');
	let attivo = $state(0);
	let campo = $state<HTMLInputElement | null>(null);
	let trovati = $derived(filtraComandi(comandi, testo));

	$effect(() => {
		campo?.focus();
	});
	$effect(() => {
		testo;
		attivo = 0;
	});

	function esegui(c: Comando) {
		onclose();
		c.esegui();
	}

	function tasti(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const n = trovati.length;
			if (n > 0) attivo = (attivo + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const t = trovati[attivo];
			if (t) esegui(t.comando);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}

	function segmenti(nome: string, pos: number[]) {
		const set = new Set(pos);
		const out: Array<{ t: string; forte: boolean }> = [];
		for (let i = 0; i < nome.length; i++) {
			const forte = set.has(i);
			const u = out[out.length - 1];
			if (u && u.forte === forte) u.t += nome[i];
			else out.push({ t: nome[i], forte });
		}
		return out;
	}
</script>

<div class="sfondo" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="palette" role="dialog" aria-modal="true" aria-label="Palette dei comandi">
		<input
			bind:this={campo}
			bind:value={testo}
			onkeydown={tasti}
			placeholder="Cerca un’azione, una cartella, un tema…"
			spellcheck="false"
			autocomplete="off"
			role="combobox"
			aria-expanded="true"
			aria-controls="palette-lista"
			aria-activedescendant={trovati.length ? `palette-${attivo}` : undefined}
		/>
		<ul id="palette-lista" role="listbox" aria-label="Comandi">
			{#each trovati as t, i (i)}
				<li
					id="palette-{i}"
					role="option"
					aria-selected={i === attivo}
					class:attivo={i === attivo}
					onmousemove={() => (attivo = i)}
					onclick={() => esegui(t.comando)}
					onkeydown={() => {}}
				>
					<span class="tipo">{ETICHETTE_TIPO[t.comando.tipo]}</span>
					<span class="nome"
						>{#each segmenti(t.comando.nome, t.posizioni) as s, j (j)}{#if s.forte}<mark>{s.t}</mark>{:else}{s.t}{/if}{/each}{#if t.comando.dettaglio}<span
								class="dettaglio">{t.comando.dettaglio}</span
							>{/if}</span
					>
					{#if t.comando.tasti}<kbd>{t.comando.tasti}</kbd>{/if}
				</li>
			{:else}
				<li class="nessuno">Nessun comando trovato.</li>
			{/each}
		</ul>
	</div>
</div>

<style>
	.sfondo {
		position: fixed;
		inset: 0;
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 12vh;
		background: color-mix(in srgb, var(--bg) 55%, transparent);
		z-index: 20;
	}
	.palette {
		width: min(560px, 92vw);
		padding: 8px;
		display: grid;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	input {
		height: 34px;
		padding: 0 12px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: calc(14px * var(--scala-testo, 1));
		outline: none;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: min(420px, 60vh);
		overflow-y: auto;
	}
	li {
		display: grid;
		grid-template-columns: 74px minmax(0, 1fr) auto;
		gap: 10px;
		align-items: center;
		min-height: 30px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		cursor: default;
	}
	li.attivo {
		background: var(--accent-soft);
	}
	.tipo {
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(9.5px * var(--scala-testo, 1));
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.nome {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	mark {
		background: transparent;
		color: var(--accent);
		font-weight: 600;
	}
	.dettaglio {
		margin-left: 10px;
		color: var(--text-dim);
		font-size: calc(11px * var(--scala-testo, 1));
	}
	kbd {
		padding: 1px 6px;
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		border-radius: 4px;
		background: var(--bg);
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-testo, 1));
		white-space: nowrap;
	}
	.nessuno {
		display: block;
		padding: 10px;
		color: var(--text-dim);
	}
</style>
