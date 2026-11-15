<script lang="ts">
	import { t } from '../i18n';
	/**
	 * The command bar of Windows 11 Explorer: «Nuovo» on the left, the
	 * operations on the selection as icons, then «Ordina» and «Visualizza».
	 * On the right the options that switch on and off.
	 */
	let {
		hasSelection = false,
		canPaste = true,
		editable = true,
		showHidden = false,
		preview = false,
		split = false,
		ontogglesplit = undefined,
		recent = false,
		onnew,
		oncut,
		oncopy,
		onpaste,
		onrename,
		ondelete,
		onsort,
		onview,
		onappearance,
		ontogglepreview,
		ontogglehidden,
		ontogglerecent
	}: {
		hasSelection?: boolean;
		canPaste?: boolean;
		/** False in the Recycle Bin, This PC, Network and among search results. */
		editable?: boolean;
		showHidden?: boolean;
		preview?: boolean;
		/** The dual pane is open. */
		split?: boolean;
		ontogglesplit?: () => void;
		/** The «Modificati di recente» zone is on. */
		recent?: boolean;
		onnew: (event: MouseEvent) => void;
		oncut: () => void;
		oncopy: () => void;
		onpaste: () => void;
		onrename: () => void;
		ondelete: () => void;
		onsort: (event: MouseEvent) => void;
		onview: (event: MouseEvent) => void;
		onappearance: (event: MouseEvent) => void;
		ontogglepreview: () => void;
		ontogglehidden: () => void;
		ontogglerecent: () => void;
	} = $props();
</script>

<div class="commands" role="toolbar" aria-label={t('Comandi')}>
	<button class="command new" onclick={onnew} disabled={!editable} aria-haspopup="menu">
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<path d="M8 2.5v11M2.5 8h11" stroke="var(--accent)" stroke-width="1.8" />
		</svg> {t('Nuovo')} <svg class="arrow" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
			<path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" stroke-width="1.2" />
		</svg>
	</button>

	<span class="separator"></span>

	<button class="icon" onclick={oncut} disabled={!hasSelection} aria-label={t('Taglia')} title={t('Taglia (Ctrl+X)')}>
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<circle cx="4.5" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3" />
			<circle cx="11.5" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3" />
			<path d="M5.8 10.3 12 2M10.2 10.3 4 2" stroke="currentColor" stroke-width="1.3" />
		</svg>
	</button>
	<button class="icon" onclick={oncopy} disabled={!hasSelection} aria-label={t('Copia')} title={t('Copia (Ctrl+C)')}>
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
			<path d="M11 3V2.5A1.5 1.5 0 0 0 9.5 1h-6A1.5 1.5 0 0 0 2 2.5v6A1.5 1.5 0 0 0 3.5 10H4" fill="none" stroke="currentColor" stroke-width="1.3" />
		</svg>
	</button>
	<button
		class="icon"
		onclick={onpaste}
		disabled={!editable || !canPaste}
		aria-label={t('Incolla')}
		title={t('Incolla (Ctrl+V)')}
	>
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<rect x="3" y="2.5" width="10" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
			<rect x="5.5" y="1" width="5" height="3" rx="1" fill="currentColor" />
		</svg>
	</button>
	<button
		class="icon"
		onclick={onrename}
		disabled={!hasSelection || !editable}
		aria-label={t('Rinomina')}
		title={t('Rinomina (F2)')}
	>
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<path d="M2 14l1-3.5L11 2.5 13.5 5 5.5 13z" fill="none" stroke="currentColor" stroke-width="1.3" />
		</svg>
	</button>
	<button
		class="icon danger"
		onclick={ondelete}
		disabled={!hasSelection}
		aria-label={t('Elimina')}
		title={t('Elimina (Canc)')}
	>
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 10h6.6L12 4" fill="none" stroke="currentColor" stroke-width="1.3" />
		</svg>
	</button>

	<span class="separator"></span>

	<!-- Two labelled drop-down menus, as in Explorer: they are the choices
	     people look for by name. -->
	<button class="command" onclick={onsort} aria-haspopup="menu">
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<path d="M4 2v11M1.5 10.5 4 13l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.3" />
			<path d="M9 4h6M9 8h4.5M9 12h3" stroke="currentColor" stroke-width="1.3" />
		</svg> {t('Ordina')} <svg class="arrow" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
			<path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" stroke-width="1.2" />
		</svg>
	</button>
	<button class="command" onclick={onview} aria-haspopup="menu">
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<rect x="1.5" y="2" width="13" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
			<rect x="1.5" y="7" width="13" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
			<rect x="1.5" y="12" width="13" height="2" rx="1" fill="currentColor" />
		</svg> {t('Visualizza')} <svg class="arrow" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
			<path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" stroke-width="1.2" />
		</svg>
	</button>

	<span class="separator"></span>

	<button
		class="command"
		class:on={recent}
		onclick={ontogglerecent}
		aria-pressed={recent}
		title={t('Mostra in cima ciò che è stato modificato di recente')}
	>
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3" />
			<path d="M8 4v4.5l3 1.8" fill="none" stroke="currentColor" stroke-width="1.3" />
		</svg> {t('Recenti')} </button>

	<div class="right">
		<button class="icon" onclick={onappearance} title={t('Aspetto')} aria-label={t('Aspetto')} aria-haspopup="menu">
			<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
				<path
					d="M8 1.5a6.5 6.5 0 1 0 0 13c1 0 1.5-.7 1.5-1.4 0-.9-.8-1.2-.8-2 0-.7.6-1.2 1.3-1.2h1.8a2.7 2.7 0 0 0 2.7-2.7C14.5 4 11.6 1.5 8 1.5z"
					fill="none"
					stroke="currentColor"
					stroke-width="1.2"
				/>
				<circle cx="4.8" cy="7.5" r="1" fill="currentColor" />
				<circle cx="7" cy="4.6" r="1" fill="currentColor" />
				<circle cx="10.4" cy="5" r="1" fill="currentColor" />
			</svg>
		</button>
		{#if ontogglesplit}
			<button
				class="icon"
				class:on={split}
				onclick={ontogglesplit}
				aria-pressed={split}
				title={t('Doppio pannello (Ctrl+Maiusc+D)')}
				aria-label={t('Doppio pannello')}
			>
				<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
					<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
					<path d="M8 3v10" stroke="currentColor" stroke-width="1.3" />
				</svg>
			</button>
		{/if}
		<button
			class="icon"
			class:on={preview}
			onclick={ontogglepreview}
			aria-pressed={preview}
			title={t('Riquadro di anteprima (Alt+P)')}
			aria-label={t('Riquadro di anteprima')}
		>
			<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
				<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
				<rect x="9" y="3" width="5" height="10" fill="currentColor" opacity="0.6" />
			</svg>
		</button>
		<!-- The lit eye shows at a glance: you are also looking at
		     system files. -->
		<button
			class="icon"
			class:on={showHidden}
			onclick={ontogglehidden}
			aria-pressed={showHidden}
			title={showHidden ? t('Nascondi i file di sistema') : t('Mostra i file di sistema')}
		>
			<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
				<path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" fill="none" stroke="currentColor" stroke-width="1.3" />
				<circle cx="8" cy="8" r="2" fill="currentColor" />
				{#if !showHidden}
					<path d="M3 13 L13 3" stroke="currentColor" stroke-width="1.3" />
				{/if}
			</svg>
		</button>
	</div>
</div>

<style>
	.commands {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 40px;
		padding: 0 10px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	button {
		border: none;
		border-radius: var(--radius-sm);
		clip-path: var(--shape-sm, none);
		mask: var(--mask-sm, none);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover:not(:disabled) {
		background: var(--row-hover);
	}
	button:disabled {
		opacity: 0.35;
	}
	.command {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 10px;
		white-space: nowrap;
	}
	.command .arrow {
		color: var(--text-dim);
	}
	/* «Nuovo» is the bar's first gesture: a little bolder. */
	.new {
		font-weight: 600;
	}
	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 30px;
		color: var(--text-dim);
	}
	.icon:hover:not(:disabled) {
		color: var(--text);
	}
	.icon.on,
	.command.on {
		color: var(--current);
	}
	.command.on {
		background: var(--accent-soft);
	}
	.danger:hover:not(:disabled) {
		background: rgba(196, 43, 28, 0.22);
		color: var(--error-text);
	}
	.separator {
		width: 1px;
		height: 20px;
		margin: 0 6px;
		background: var(--border);
	}
	.right {
		display: flex;
		gap: 2px;
		margin-left: auto;
	}
</style>
