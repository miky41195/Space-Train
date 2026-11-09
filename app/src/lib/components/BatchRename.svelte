<script lang="ts">
	import type { Entry } from '../ipc';
	import { planRename, type RenameRule } from '../batch-rename';

	let {
		entries,
		taken,
		onconfirm,
		oncancel
	}: {
		/** The selected items, in list order: the counter follows it. */
		entries: Entry[];
		/** Lowercase names already in the folder. */
		taken: Set<string>;
		onconfirm: (plan: ReturnType<typeof planRename>) => void;
		oncancel: () => void;
	} = $props();

	let mode = $state<'pattern' | 'replace'>('pattern');
	let pattern = $state('');
	let start = $state(1);
	let find = $state('');
	let replace = $state('');
	let matchCase = $state(false);
	let keepExtension = $state(true);

	let rule = $derived<RenameRule>(
		mode === 'pattern'
			? { mode, pattern, start: Number.isFinite(start) ? start : 1, keepExtension }
			: { mode, find, replace, matchCase, keepExtension }
	);
	let plan = $derived(
		planRename(
			entries.map((e) => ({ path: e.path, name: e.name, isDir: e.kind === 'dir' })),
			rule,
			taken
		)
	);
	let problems = $derived(plan.filter((p) => p.problem).length);
	let changes = $derived(plan.filter((p) => p.newName !== p.item.name).length);
	// An empty pattern is not a rename: the counter alone would wipe every name.
	let ready = $derived(problems === 0 && changes > 0 && (mode === 'replace' || pattern.trim() !== ''));

	let first = $state<HTMLInputElement | null>(null);
	$effect(() => {
		mode;
		first?.focus();
	});

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (ready) onconfirm(plan);
	}

	/** Splits the new name so the counter or the replaced text can be lit. */
	function changed(oldName: string, newName: string) {
		let a = 0;
		while (a < oldName.length && a < newName.length && oldName[a] === newName[a]) a++;
		let b = 0;
		while (
			b < oldName.length - a &&
			b < newName.length - a &&
			oldName[oldName.length - 1 - b] === newName[newName.length - 1 - b]
		)
			b++;
		return [newName.slice(0, a), newName.slice(a, newName.length - b), newName.slice(newName.length - b)];
	}
</script>

<div
	class="sfondo"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && oncancel()}
	onkeydown={(e) => {
		e.stopPropagation();
		if (e.key === 'Escape') oncancel();
	}}
>
	<div class="finestra" role="dialog" aria-modal="true" aria-labelledby="batch-title">
	<form onsubmit={submit}>
		<header>
			<h2 id="batch-title">Rinomina {entries.length} elementi</h2>
			<div class="modi" role="tablist" aria-label="Modo di rinomina">
				<button type="button" role="tab" aria-selected={mode === 'pattern'} class:on={mode === 'pattern'} onclick={() => (mode = 'pattern')}
					>Schema</button
				>
				<button type="button" role="tab" aria-selected={mode === 'replace'} class:on={mode === 'replace'} onclick={() => (mode = 'replace')}
					>Trova e sostituisci</button
				>
			</div>
		</header>

		{#if mode === 'pattern'}
			<div class="campi">
				<label class="largo">
					<span>Nome</span>
					<input bind:this={first} bind:value={pattern} placeholder="Vacanze_###" spellcheck="false" autocomplete="off" />
				</label>
				<label>
					<span>Parti da</span>
					<input type="number" min="0" bind:value={start} />
				</label>
			</div>
			<p class="aiuto">Ogni <kbd>#</kbd> è una cifra del contatore: <b>###</b> diventa 001, 002, 003…</p>
		{:else}
			<div class="campi">
				<label>
					<span>Trova</span>
					<input bind:this={first} bind:value={find} spellcheck="false" autocomplete="off" />
				</label>
				<label>
					<span>Sostituisci con</span>
					<input bind:value={replace} spellcheck="false" autocomplete="off" />
				</label>
			</div>
		{/if}

		<div class="opzioni">
			<label class="spunta"><input type="checkbox" bind:checked={keepExtension} />Lascia com’è l’estensione</label>
			{#if mode === 'replace'}
				<label class="spunta"><input type="checkbox" bind:checked={matchCase} />Maiuscole e minuscole</label>
			{/if}
		</div>

		<ol class="anteprima" aria-label="Anteprima dei nuovi nomi">
			{#each plan as p (p.item.path)}
				{@const [prima, nuovo, dopo] = changed(p.item.name, p.newName)}
				<li class:problema={p.problem} class:uguale={!p.problem && p.newName === p.item.name}>
					<span class="vecchio" title={p.item.name}>{p.item.name}</span>
					<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"
						><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" /></svg
					>
					<span class="nuovo" title={p.newName}>
						{#if p.problem}{p.newName} · {p.problem}{:else if p.newName === p.item.name}invariato{:else}{prima}<b>{nuovo}</b>{dopo}{/if}
					</span>
				</li>
			{/each}
		</ol>

		<footer>
			<span class="stato" aria-live="polite">
				{#if problems > 0}{problems === 1 ? '1 nome non va bene' : `${problems} nomi non vanno bene`}{:else if changes > 0}{changes === 1 ? '1 nome cambia' : `${changes} nomi cambiano`}{/if}
			</span>
			<span class="azioni">
				<button type="button" onclick={oncancel}>Annulla</button>
				<button type="submit" class="primario" disabled={!ready}>Rinomina</button>
			</span>
		</footer>
	</form>
	</div>
</div>

<style>
	.sfondo {
		position: fixed;
		inset: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
	}
	.finestra {
		width: min(560px, 92vw);
		max-height: calc(100vh - 64px);
		padding: 20px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		clip-path: var(--forma, none);
		mask: var(--maschera, none);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
	}
	form {
		display: grid;
		gap: 12px;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	h2 {
		margin: 0;
		font-size: calc(15px * var(--scala-testo, 1));
		font-weight: 600;
	}
	.modi {
		display: flex;
		gap: 4px;
	}
	.modi button {
		height: 26px;
		padding: 0 10px;
		border: none;
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		cursor: default;
	}
	.modi button:hover {
		background: var(--row-hover);
		color: var(--text);
	}
	.modi button.on {
		background: var(--accent-soft);
		color: var(--text);
	}
	.campi {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.campi:has(.largo) {
		grid-template-columns: minmax(0, 1fr) 96px;
	}
	label > span {
		display: block;
		margin-bottom: 4px;
		font-family: var(--font-display);
		font-size: calc(10px * var(--scala-testo, 1));
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	input:not([type='checkbox']) {
		width: 100%;
		height: 28px;
		padding: 0 10px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		clip-path: var(--forma-sm, none);
		mask: var(--maschera-sm, none);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	input[type='number'] {
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.aiuto {
		margin: -4px 0 0;
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.aiuto b {
		font-family: var(--font-display);
		font-weight: 400;
		color: var(--text);
	}
	kbd {
		padding: 0 5px;
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		border-radius: 4px;
		background: var(--bg);
		font-family: var(--font-display);
	}
	.opzioni {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}
	.spunta {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.spunta input {
		accent-color: var(--accent);
		margin: 0;
	}
	.anteprima {
		min-height: 0;
		max-height: 260px;
		margin: 0;
		padding: 8px 0 0;
		overflow-y: auto;
		list-style: none;
		border-top: 1px solid var(--border);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.anteprima li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 12px minmax(0, 1fr);
		align-items: center;
		gap: 8px;
		min-height: 24px;
		padding: 0 6px;
		border-radius: var(--radius-sm);
	}
	.anteprima span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.vecchio,
	.anteprima svg {
		color: var(--text-dim);
	}
	.nuovo b {
		color: var(--current);
		font-weight: 600;
	}
	.uguale .nuovo {
		color: var(--text-dim);
	}
	.problema {
		background: rgba(196, 43, 28, 0.16);
	}
	.problema .nuovo {
		color: var(--errore-testo, #ffb4ab);
	}
	footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.stato {
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.azioni {
		display: flex;
		gap: 8px;
	}
	footer button {
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
	footer button:hover {
		background: var(--row-hover);
	}
	.primario {
		border-color: transparent;
		background: var(--accent);
		color: #fff;
	}
	.primario:hover:not(:disabled) {
		background: var(--accent);
		filter: brightness(1.1);
	}
	.primario:disabled {
		opacity: 0.45;
	}
</style>
