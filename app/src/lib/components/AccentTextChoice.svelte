<script lang="ts">
	import { t, locale } from '../i18n';
	import { contrast, textOnAccent, type AccentText } from '../themes';

	let {
		accent,
		value,
		onchange
	}: {
		/** The accent the text goes over. */
		accent: string;
		value: AccentText;
		onchange: (choice: AccentText) => void;
	} = $props();

	const MODES: Array<[AccentText, string]> = [
		['auto', t('Automatico')],
		['light', t('Testo chiaro')],
		['dark', t('Testo scuro')]
	];
	let custom = $derived(value.startsWith('#'));
	let on = $derived(textOnAccent(accent, value));
	let ratio = $derived(contrast(accent, on));
</script>

<div class="choice" role="group" aria-label={t('Testo sull’evidenziazione')}>
	<span class="label">{t('Testo sull’evidenziazione')}</span>
	{#each MODES as [id, name] (id)}
		<button type="button" class:on={value === id} aria-pressed={value === id} onclick={() => onchange(id)}>{name}</button>
	{/each}
	<input
		type="color"
		class:on={custom}
		value={on}
		aria-label={t('Scegli il colore del testo')}
		title={t('Scegli il colore del testo')}
		oninput={(e) => onchange(e.currentTarget.value as AccentText)}
	/>
	<span class="sample" style:background={accent} style:color={on}>Aa</span>
	<span class="ratio" class:low={ratio < 4.5}
		>{t('contrasto {0} : 1', [ratio.toLocaleString(locale, { maximumFractionDigits: 1 })])}</span
	>
</div>

<style>
	.choice {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		width: 100%;
	}
	.label,
	.ratio {
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.ratio.low {
		color: var(--error-text, #ffb4ab);
	}
	button {
		height: 24px;
		padding: 0 8px;
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
	button.on {
		border-color: var(--current);
		background: var(--accent-soft);
	}
	input {
		width: 26px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
	}
	input.on {
		border-color: var(--current);
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.sample {
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: calc(12px * var(--text-scale, 1));
		font-weight: 600;
	}
</style>
