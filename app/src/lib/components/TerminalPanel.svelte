<script lang="ts">
	import { onMount } from 'svelte';
	import '@xterm/xterm/css/xterm.css';
	import { tauriBackend, type Backend } from '../ipc';
	import { ON_LINUX } from '../platform';

	let {
		cwd,
		folder,
		onclose,
		backend = tauriBackend
	}: {
		/** Where the shell starts. */
		cwd: string;
		/** The folder open now: «Vai qui» takes the shell there. */
		folder: string | null;
		onclose: () => void;
		backend?: Backend;
	} = $props();

	const HEIGHT_KEY = 'space-train.terminal-height';
	let height = $state(readHeight());
	let host = $state<HTMLDivElement | null>(null);
	let panel = $state<HTMLDivElement | null>(null);
	let id: number | null = null;
	let ended = $state(false);
	let error = $state<string | null>(null);

	function readHeight(): number {
		try {
			const h = Number(localStorage.getItem(HEIGHT_KEY));
			return h >= 120 ? h : 260;
		} catch {
			return 260;
		}
	}

	/** A path with spaces or quotes, as PowerShell (or sh, on Linux) reads it. */
	function quoted(p: string): string {
		return ON_LINUX ? `'${p.replace(/'/g, "'\\''")}'` : `'${p.replace(/'/g, "''")}'`;
	}

	onMount(() => {
		let disposed = false;
		let cleanup = () => {};
		void (async () => {
			// Loaded only when the panel opens: the app starts without it.
			const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
			if (disposed || !host || !panel) return;
			const css = getComputedStyle(panel);
			const accent = css.getPropertyValue('--current').trim() || css.color;
			const term = new Terminal({
				fontFamily: "'Cascadia Mono', Consolas, monospace",
				fontSize: 13,
				cursorBlink: true,
				theme: { background: css.backgroundColor, foreground: css.color, cursor: accent }
			});
			const fit = new FitAddon();
			term.loadAddon(fit);
			term.open(host);
			fit.fit();
			try {
				id = await backend.terminalOpen(cwd, term.cols, term.rows, (e) => {
					if (e.kind === 'data') term.write(e.text);
					else ended = true;
				});
			} catch (e) {
				error = 'Il terminale non è partito.';
				term.dispose();
				return;
			}
			if (disposed) {
				void backend.terminalClose(id);
				return;
			}
			term.onData((d) => id !== null && void backend.terminalWrite(id, d).catch(() => {}));
			term.onResize(({ cols, rows }) => id !== null && void backend.terminalResize(id, cols, rows).catch(() => {}));
			const observer = new ResizeObserver(() => fit.fit());
			observer.observe(host);
			term.focus();
			cleanup = () => {
				observer.disconnect();
				term.dispose();
			};
		})();
		return () => {
			disposed = true;
			cleanup();
			if (id !== null) void backend.terminalClose(id).catch(() => {});
		};
	});

	function goHere() {
		if (id !== null && folder) void backend.terminalWrite(id, `cd ${quoted(folder)}\r`);
	}

	// Dragging the top edge changes the height; remembered on this PC.
	function startResize(e: PointerEvent) {
		const startY = e.clientY;
		const startH = height;
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		const move = (m: PointerEvent) => (height = Math.min(window.innerHeight - 160, Math.max(120, startH + startY - m.clientY)));
		const up = () => {
			el.removeEventListener('pointermove', move);
			try {
				localStorage.setItem(HEIGHT_KEY, String(Math.round(height)));
			} catch {
				// Not remembered: the default comes back next time.
			}
		};
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up, { once: true });
	}
</script>

<div class="terminal" bind:this={panel} style:height="{height}px">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="grip" onpointerdown={startResize} title="Trascina per cambiare l’altezza"></div>
	<div class="band">
		<span class="title">Terminale</span>
		{#if ended}<span class="detail">sessione terminata</span>{/if}
		<span class="spacer"></span>
		{#if folder && !ended}<button onclick={goHere} title={folder}>Vai alla cartella aperta</button>{/if}
		<button onclick={onclose} aria-label="Chiudi il terminale" title="Chiudi (Ctrl+Maiusc+T)">×</button>
	</div>
	{#if error}<div class="error">{error}</div>{/if}
	<!-- Keys typed here belong to the shell, not to the list. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="host"
		bind:this={host}
		onkeydown={(e) => {
			e.stopPropagation();
			if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') {
				e.preventDefault();
				onclose();
			}
		}}
	></div>
</div>

<style>
	.terminal {
		position: relative;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		min-height: 120px;
		background: var(--void, var(--surface));
		color: var(--text);
		border-top: 1px solid var(--border);
	}
	.grip {
		position: absolute;
		top: -3px;
		inset-inline: 0;
		height: 6px;
		cursor: ns-resize;
		z-index: 1;
	}
	.band {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 30px;
		padding: 0 8px 0 12px;
		border-bottom: 1px solid var(--border);
	}
	.title {
		font-family: var(--font-display);
		font-size: calc(11px * var(--title-scale, var(--text-scale, 1)));
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	.detail {
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.spacer {
		flex: 1;
	}
	button {
		height: 22px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--text-scale, 1));
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.error {
		padding: 6px 12px;
		color: var(--error-text, var(--text));
	}
	.host {
		flex: 1;
		min-height: 0;
		padding: 4px 0 0 8px;
	}
</style>
