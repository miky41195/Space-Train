<script lang="ts">
	import { t } from '../i18n';
	import { KIND_LABELS, filterCommands, type Command } from '../palette';

	/** Ctrl+Maiusc+P: type to find any action, folder, saved search, theme or setting. */
	let { commands, onclose }: { commands: Command[]; onclose: () => void } = $props();

	let query = $state('');
	let active = $state(0);
	let field = $state<HTMLInputElement | null>(null);
	let matches = $derived(filterCommands(commands, query));

	$effect(() => {
		field?.focus();
	});
	$effect(() => {
		query;
		active = 0;
	});

	function run(c: Command) {
		onclose();
		c.run();
	}

	function onKeys(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const n = matches.length;
			if (n > 0) active = (active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const t = matches[active];
			if (t) run(t.command);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}

	function segments(name: string, pos: number[]) {
		const set = new Set(pos);
		const out: Array<{ t: string; strong: boolean }> = [];
		for (let i = 0; i < name.length; i++) {
			const strong = set.has(i);
			const u = out[out.length - 1];
			if (u && u.strong === strong) u.t += name[i];
			else out.push({ t: name[i], strong });
		}
		return out;
	}
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="palette" role="dialog" aria-modal="true" aria-label={t('Palette dei comandi')}>
		<input
			bind:this={field}
			bind:value={query}
			onkeydown={onKeys}
			placeholder={t('Cerca un’azione, una cartella, un tema…')}
			spellcheck="false"
			autocomplete="off"
			role="combobox"
			aria-expanded="true"
			aria-controls="palette-list"
			aria-activedescendant={matches.length ? `palette-${active}` : undefined}
		/>
		<ul id="palette-list" role="listbox" aria-label={t('Comandi')}>
			{#each matches as t, i (i)}
				<li
					id="palette-{i}"
					role="option"
					aria-selected={i === active}
					class:active={i === active}
					onmousemove={() => (active = i)}
					onclick={() => run(t.command)}
					onkeydown={() => {}}
				>
					<span class="kind">{KIND_LABELS[t.command.kind]}</span>
					<span class="name"
						>{#each segments(t.command.name, t.positions) as s, j (j)}{#if s.strong}<mark>{s.t}</mark>{:else}{s.t}{/if}{/each}{#if t.command.detail}<span
								class="detail">{t.command.detail}</span
							>{/if}</span
					>
					{#if t.command.keys}<kbd>{t.command.keys}</kbd>{/if}
				</li>
			{:else}
				<li class="none">{t('Nessun comando trovato.')}</li>
			{/each}
		</ul>
	</div>
</div>

<style>
	.backdrop {
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
		clip-path: var(--shape, none);
		mask: var(--mask, none);
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
		font-size: calc(14px * var(--text-scale, 1));
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
	li.active {
		background: var(--accent-soft);
	}
	.kind {
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(9.5px * var(--text-scale, 1));
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	mark {
		background: transparent;
		color: var(--accent);
		font-weight: 600;
	}
	.detail {
		margin-left: 10px;
		color: var(--text-dim);
		font-size: calc(11px * var(--text-scale, 1));
	}
	kbd {
		padding: 1px 6px;
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		border-radius: 4px;
		background: var(--bg);
		color: var(--text-dim);
		font-family: var(--font-display);
		font-size: calc(11px * var(--text-scale, 1));
		white-space: nowrap;
	}
	.none {
		display: block;
		padding: 10px;
		color: var(--text-dim);
	}
</style>
