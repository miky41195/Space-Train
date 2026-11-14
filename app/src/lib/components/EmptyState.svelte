<script lang="ts">
	/**
	 * Screen for a list that has nothing to show.
	 *
	 * An empty screen is an invitation to act, not an error: every variant
	 * says what happened and which move is left available.
	 */
	let {
		variant,
		action = undefined,
		onaction = undefined
	}: {
		variant: 'emptyFolder' | 'noResults' | 'noDuplicates' | 'sameFolders' | 'accessDenied' | 'notReady';
		action?: string;
		onaction?: () => void;
	} = $props();

	const texts = {
		emptyFolder: {
			title: 'Deposito vuoto',
			body: 'Qui non c’è ancora niente. Crea una cartella o incolla quello che hai copiato.'
		},
		noResults: {
			title: 'Nessuna corrispondenza',
			body: 'Nessun elemento di questa cartella corrisponde alla ricerca.'
		},
		noDuplicates: {
			title: 'Nessun doppione',
			body: 'In questa cartella e nelle sue sottocartelle non ci sono file con lo stesso contenuto.'
		},
		sameFolders: {
			title: 'Binari paralleli',
			body: 'Le due cartelle hanno gli stessi file, con la stessa dimensione e la stessa data.'
		},
		accessDenied: {
			title: 'Segnale rosso',
			body: 'Windows non concede l’accesso a questa cartella con i permessi attuali.'
		},
		notReady: {
			title: 'Binario interrotto',
			body: 'L’unità non risponde. Controlla che il supporto sia inserito o la rete raggiungibile.'
		}
	} as const;
</script>

<div class="empty">
	<svg viewBox="0 0 64 40" width="192" height="120" shape-rendering="crispEdges" aria-hidden="true">
		<!-- Rail: present in every variant, it is the project's thread -->
		<rect class="tie-bar" x="4" y="33" width="56" height="1" />
		<rect class="rail" x="4" y="35" width="56" height="1" />
		{#each [8, 18, 28, 38, 48] as x (x)}
			<rect class="sleeper" {x} y="34" width="2" height="1" />
		{/each}

		{#if variant === 'emptyFolder'}
			<!-- Open, empty depot -->
			<rect class="structure" x="16" y="14" width="32" height="19" />
			<rect class="inside" x="19" y="18" width="26" height="15" />
			<rect class="roof" x="14" y="11" width="36" height="3" />
			<rect class="shadow" x="22" y="26" width="20" height="7" />
		{:else if variant === 'noResults' || variant === 'noDuplicates' || variant === 'sameFolders'}
			<!-- Magnifier above the rail -->
			<rect class="glass" x="22" y="8" width="14" height="2" />
			<rect class="glass" x="20" y="10" width="2" height="10" />
			<rect class="glass" x="36" y="10" width="2" height="10" />
			<rect class="glass" x="22" y="20" width="14" height="2" />
			<rect class="handle" x="37" y="22" width="2" height="2" />
			<rect class="handle" x="39" y="24" width="2" height="2" />
			<rect class="handle" x="41" y="26" width="2" height="2" />
		{:else if variant === 'accessDenied'}
			<!-- Railway signal with the red disc lit -->
			<rect class="pole" x="31" y="16" width="2" height="17" />
			<rect class="lantern" x="26" y="6" width="12" height="12" />
			<rect class="red" x="29" y="9" width="6" height="6" />
		{:else}
			<!-- Rail that breaks off -->
			<rect class="broken" x="30" y="30" width="2" height="8" />
			<rect class="broken" x="34" y="28" width="2" height="6" />
			<rect class="spark" x="28" y="24" width="2" height="2" />
			<rect class="spark" x="36" y="22" width="2" height="2" />
		{/if}
	</svg>

	<h2>{texts[variant].title}</h2>
	<p>{texts[variant].body}</p>

	{#if action && onaction}
		<button onclick={onaction}>{action}</button>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		flex: 1;
		padding: 24px;
		text-align: center;
		background: var(--surface);
	}

	h2 {
		margin: 12px 0 0;
		font-family: var(--font-display);
		font-size: calc(15px * var(--title-scale, var(--text-scale, 1)));
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text);
	}

	p {
		margin: 0;
		max-width: 42ch;
		color: var(--text-dim);
		line-height: 1.6;
	}

	button {
		margin-top: 14px;
		height: 30px;
		padding: 0 16px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
		border-color: var(--current);
	}

	.rail,
	.tie-bar {
		fill: var(--rail-metal);
	}
	.sleeper {
		fill: #4a4360;
	}
	.structure {
		fill: #2c2740;
	}
	.inside {
		fill: #1b1826;
	}
	.roof {
		fill: var(--plasma);
	}
	.shadow {
		fill: #15121f;
	}
	.glass {
		fill: var(--current);
	}
	.handle {
		fill: var(--plasma);
	}
	.pole {
		fill: var(--rail-metal);
	}
	.lantern {
		fill: #2c2740;
	}
	.red {
		fill: #ff5f6e;
	}
	.broken {
		fill: var(--rail-metal);
	}
	.spark {
		fill: var(--signal);
	}
</style>
