<script lang="ts">
	import type { Backend, Entry } from '../ipc';
	import { nomeDi } from '../posizioni';
	import { CATEGORIES, matches, parseExts, problem, type Action, type Condition, type Rule } from '../rules';
	import { COLORI_CARTELLA, type IdColore } from '../stores/colori.svelte';
	import type { LogEntry } from '../stores/rules.svelte';

	let {
		folder,
		rules: initial,
		log,
		backend,
		labelName,
		onsave,
		onclose,
		onundo
	}: {
		folder: string;
		rules: Rule[];
		/** Past actions of the rules of this folder, newest first. */
		log: LogEntry[];
		backend: Pick<Backend, 'listDir' | 'scegliCartella'>;
		labelName: (id: IdColore) => string;
		onsave: (rules: Rule[]) => void;
		onclose: () => void;
		onundo: (id: number) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let rules = $state<Rule[]>(initial.map((r) => structuredClone($state.snapshot(r)) as Rule));
	/** Texts typed in the value fields, kept as typed (an extension list, a number). */
	// svelte-ignore state_referenced_locally
	let typed = $state<Record<string, string>>(Object.fromEntries(initial.map((r) => [r.id, valueText(r.if)])));
	let files = $state<Entry[] | null>(null);
	let shown = $state<string | null>(null);

	$effect(() => {
		backend
			.listDir(folder, { key: 'name', ascending: true }, false)
			.then((l) => (files = l.entries))
			.catch(() => (files = []));
	});

	let now = Date.now();
	let problems = $derived(rules.map(problem));
	let canSave = $derived(problems.every((p) => p === null));

	function valueText(c: Condition): string {
		switch (c.type) {
			case 'ext':
				return c.exts.join(', ');
			case 'name':
				return c.text;
			case 'olderThan':
				return String(c.days);
			case 'largerThan':
				return String(c.mb);
			default:
				return '';
		}
	}

	function newId(): string {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function add() {
		const r: Rule = {
			id: newId(),
			folder,
			when: 'arrival',
			if: { type: 'ext', exts: ['pdf'] },
			then: { type: 'move', dest: '' },
			enabled: true
		};
		typed[r.id] = 'pdf';
		rules.push(r);
	}

	function setCondition(r: Rule, type: Condition['type']) {
		const defaults: Record<Condition['type'], [Condition, string]> = {
			any: [{ type: 'any' }, ''],
			category: [{ type: 'category', category: 'image' }, ''],
			ext: [{ type: 'ext', exts: ['pdf'] }, 'pdf'],
			name: [{ type: 'name', text: '' }, ''],
			olderThan: [{ type: 'olderThan', days: 30 }, '30'],
			largerThan: [{ type: 'largerThan', mb: 100 }, '100']
		};
		[r.if, typed[r.id]] = defaults[type];
	}

	function setValue(r: Rule, text: string) {
		typed[r.id] = text;
		const n = Number(text.replace(',', '.'));
		if (r.if.type === 'ext') r.if = { type: 'ext', exts: parseExts(text) };
		else if (r.if.type === 'name') r.if = { type: 'name', text };
		else if (r.if.type === 'olderThan') r.if = { type: 'olderThan', days: Math.floor(n) };
		else if (r.if.type === 'largerThan') r.if = { type: 'largerThan', mb: n };
	}

	function setAction(r: Rule, type: Action['type']) {
		const dest = r.then.type === 'move' || r.then.type === 'copy' ? r.then.dest : '';
		if (type === 'move' || type === 'copy') r.then = { type, dest };
		else if (type === 'label') r.then = { type: 'label', color: 'rosso' };
		else r.then = { type: 'trash' };
	}

	async function pickDest(r: Rule) {
		if (r.then.type !== 'move' && r.then.type !== 'copy') return;
		const chosen = await backend.scegliCartella('Dove mettere i file', r.then.dest || folder).catch(() => null);
		if (chosen && (r.then.type === 'move' || r.then.type === 'copy')) r.then = { type: r.then.type, dest: chosen };
	}

	function matching(r: Rule): Entry[] {
		return (files ?? []).filter((f) => matches(r.if, f, now));
	}

	const ora = (t: number) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
</script>

<div class="sfondo" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
	<div class="finestra" role="dialog" aria-modal="true" aria-label={`Regole di ${nomeDi(folder) || folder}`}>
		<h2>Regole di {nomeDi(folder) || folder}</h2>
		<p class="nota">Valgono per i file di questa cartella, non per le sottocartelle. Non sovrascrivono mai niente e il cestino è il massimo: nessuna eliminazione definitiva.</p>

		{#if rules.length === 0}
			<p class="vuoto">Nessuna regola. Aggiungine una per mettere in ordine questa cartella da sola.</p>
		{/if}

		<ul class="regole">
			{#each rules as r, i (r.id)}
				{@const n = files ? matching(r).length : null}
				<li class="regola" class:spenta={!r.enabled}>
					<div class="frase">
						<select aria-label="Quando" value={r.when} onchange={(e) => (r.when = e.currentTarget.value as Rule['when'])}>
							<option value="arrival">Quando arriva un file</option>
							<option value="daily">Ogni giorno</option>
						</select>
						<span class="kw">se</span>
						<select aria-label="Condizione" value={r.if.type} onchange={(e) => setCondition(r, e.currentTarget.value as Condition['type'])}>
							<option value="ext">ha estensione</option>
							<option value="category">è del tipo</option>
							<option value="name">il nome contiene</option>
							<option value="olderThan">è più vecchio di (giorni)</option>
							<option value="largerThan">è più grande di (MB)</option>
							<option value="any">è un file qualsiasi</option>
						</select>
						{#if r.if.type === 'category'}
							{@const c = r.if}
							<select aria-label="Tipo di file" value={c.category} onchange={(e) => (r.if = { type: 'category', category: e.currentTarget.value as typeof c.category })}>
								{#each CATEGORIES as cat (cat.id)}<option value={cat.id}>{cat.plural}</option>{/each}
							</select>
						{:else if r.if.type !== 'any'}
							<input
								aria-label="Valore della condizione"
								class:numero={r.if.type === 'olderThan' || r.if.type === 'largerThan'}
								inputmode={r.if.type === 'olderThan' || r.if.type === 'largerThan' ? 'decimal' : 'text'}
								value={typed[r.id] ?? ''}
								oninput={(e) => setValue(r, e.currentTarget.value)}
							/>
						{/if}
						<span class="kw">allora</span>
						<select aria-label="Azione" value={r.then.type} onchange={(e) => setAction(r, e.currentTarget.value as Action['type'])}>
							<option value="move">spostalo in</option>
							<option value="copy">copialo in</option>
							<option value="label">dagli l’etichetta</option>
							<option value="trash">mandalo nel cestino</option>
						</select>
						{#if r.then.type === 'move' || r.then.type === 'copy'}
							<button class="scegli" title={r.then.dest || undefined} onclick={() => void pickDest(r)}>
								{r.then.dest ? nomeDi(r.then.dest) || r.then.dest : 'Scegli cartella…'}
							</button>
						{:else if r.then.type === 'label'}
							{@const a = r.then}
							<select aria-label="Etichetta" value={a.color} onchange={(e) => (r.then = { type: 'label', color: e.currentTarget.value as IdColore })}>
								{#each COLORI_CARTELLA as c (c.id)}<option value={c.id}>{labelName(c.id)}</option>{/each}
							</select>
						{/if}
					</div>
					<div class="piede">
						<label class="attiva"><input type="checkbox" bind:checked={r.enabled} /> Attiva</label>
						{#if problems[i]}
							<span class="problema" role="alert">{problems[i]}</span>
						{:else if n !== null}
							<span class="anteprima">
								{r.when === 'daily' ? 'Oggi agirebbe su' : 'Fra i file di adesso corrispondono'}
								<b>{n === 1 ? '1 file' : `${n} file`}</b>
								{#if n > 0}
									· <button class="link" onclick={() => (shown = shown === r.id ? null : r.id)}>{shown === r.id ? 'nascondi' : 'mostra'}</button>
								{/if}
							</span>
						{/if}
						<button class="link togli" onclick={() => rules.splice(i, 1)}>Elimina regola</button>
					</div>
					{#if shown === r.id}
						<ul class="elenco">
							{#each matching(r).slice(0, 12) as f (f.path)}<li>{f.name}</li>{/each}
							{#if matching(r).length > 12}<li class="resto">e altri {matching(r).length - 12}…</li>{/if}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>

		<button class="aggiungi" onclick={add}>+ Aggiungi regola</button>

		{#if log.length > 0}
			<h3>Ultime azioni</h3>
			<ul class="registro">
				{#each log.slice(0, 20) as l (l.id)}
					<li class:fallita={l.failed}>
						<time>{ora(l.time)}</time>
						<span class="testo" title={l.text}>{l.text}</span>
						{#if l.undo && !l.undone}
							<button class="link" onclick={() => onundo(l.id)}>Annulla</button>
						{:else if l.undone}
							<span class="annullata">annullata</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<div class="azioni">
			<button onclick={onclose}>Annulla</button>
			<button class="primario" disabled={!canSave} onclick={() => onsave($state.snapshot(rules) as Rule[])}>Salva</button>
		</div>
	</div>
</div>

<style>
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
		width: min(680px, 94vw);
		max-height: 86vh;
		overflow-y: auto;
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	h2 {
		margin: 0 0 6px;
		font-size: calc(15px * var(--scala-testo, 1));
		font-weight: 600;
	}
	h3 {
		margin: 18px 0 6px;
		font-family: var(--font-display);
		font-size: calc(11px * var(--scala-testo, 1));
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	.nota,
	.vuoto {
		margin: 0 0 12px;
		color: var(--text-dim);
		line-height: 1.5;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.regole {
		display: grid;
		gap: 8px;
	}
	.regola {
		display: grid;
		gap: 8px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
	}
	.regola.spenta .frase {
		opacity: 0.55;
	}
	.frase {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.kw {
		font-family: var(--font-display);
		font-size: calc(10px * var(--scala-testo, 1));
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	select,
	input:not([type='checkbox']),
	.scegli {
		height: 26px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
		color: var(--text);
		font: inherit;
	}
	input:not([type='checkbox']) {
		width: 140px;
		background: var(--surface);
	}
	input.numero {
		width: 70px;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.scegli {
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: default;
	}
	.piede {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		font-size: calc(12px * var(--scala-testo, 1));
		color: var(--text-dim);
	}
	.attiva {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text);
	}
	.anteprima b {
		color: var(--text);
		font-weight: 600;
	}
	.problema {
		color: var(--errore-testo, #ffb4ab);
	}
	.togli {
		margin-left: auto;
	}
	.link {
		padding: 0;
		border: none;
		background: none;
		color: var(--current, var(--accent));
		font: inherit;
		cursor: default;
	}
	.link:hover {
		text-decoration: underline;
	}
	.elenco {
		padding-left: 4px;
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.resto {
		font-style: italic;
	}
	.aggiungi {
		margin-top: 10px;
		padding: 0;
		border: none;
		background: none;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
	}
	.aggiungi:hover {
		color: var(--text);
	}
	.registro li {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) auto;
		gap: 8px;
		align-items: center;
		padding: 3px 6px;
		border-radius: var(--radius-sm);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.registro li:hover {
		background: var(--row-hover);
	}
	.registro time {
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		color: var(--text-dim);
	}
	.registro .testo {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fallita .testo {
		color: var(--errore-testo, #ffb4ab);
	}
	.annullata {
		color: var(--text-dim);
	}
	.azioni {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 16px;
	}
	.azioni button {
		height: 30px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	.azioni button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	.azioni button:disabled {
		opacity: 0.5;
	}
	.azioni .primario {
		border-color: transparent;
		background: var(--accent);
		color: #fff;
	}
	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
