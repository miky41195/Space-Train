<script lang="ts">
	import '../app.css';
	import FinestraEditor from '$lib/components/FinestraEditor.svelte';
	import { finestraDaAvvisare } from '$lib/editor-finestra';

	let { children } = $props();

	/** In una finestra aperta per l'editor dei temi si mostra solo lui. */
	const editorPer = finestraDaAvvisare();
</script>

{#if editorPer}
	<FinestraEditor da={editorPer} />
{:else}
	{@render children()}
{/if}
