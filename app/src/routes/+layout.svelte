<script lang="ts">
	import '../app.css';
	import FinestraEditor from '$lib/components/FinestraEditor.svelte';
	import { finestraDaAvvisare } from '$lib/editor-finestra';

	let { children } = $props();

	/** In una finestra aperta per l'editor dei temi si mostra solo lui. */
	const editorPer = finestraDaAvvisare();

	/**
	 * Il menu del browser (Indietro, Aggiorna, Stampa…) non c'entra con
	 * l'app: si toglie ovunque. Resta nei campi di testo, dove servono
	 * Taglia, Copia e Incolla. I menu dell'app fermano l'evento da soli.
	 */
	function menuDelBrowser(e: MouseEvent) {
		const t = e.target as HTMLElement | null;
		if (t?.closest('input, textarea, [contenteditable="true"]')) return;
		e.preventDefault();
	}
</script>

<svelte:window oncontextmenu={menuDelBrowser} />

{#if editorPer}
	<FinestraEditor da={editorPer} />
{:else}
	{@render children()}
{/if}
