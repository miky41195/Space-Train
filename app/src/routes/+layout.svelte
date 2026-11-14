<script lang="ts">
	import '../app.css';
	import EditorWindow from '$lib/components/EditorWindow.svelte';
	import { windowToNotify } from '$lib/editor-window';

	let { children } = $props();

	/** A window opened for the theme editor shows only the editor. */
	const editorFor = windowToNotify();

	/**
	 * The browser menu (Back, Reload, Print…) has nothing to do with the
	 * app: it is removed everywhere. It stays in text fields, where Cut,
	 * Copy and Paste are needed. The app's menus stop the event by themselves.
	 */
	function browserMenu(e: MouseEvent) {
		const t = e.target as HTMLElement | null;
		if (t?.closest('input, textarea, [contenteditable="true"]')) return;
		e.preventDefault();
	}
</script>

<svelte:window oncontextmenu={browserMenu} />

{#if editorFor}
	<EditorWindow from={editorFor} />
{:else}
	{@render children()}
{/if}
