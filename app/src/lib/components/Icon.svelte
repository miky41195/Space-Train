<script lang="ts">
	/**
	 * The small icons that used to be characters (×, ✓, 📌): drawn with the
	 * stroke of the command bar icons, so the window speaks one language.
	 * They take the colour of the text around them.
	 */
	let { name, side = 12 }: { name: 'close' | 'check' | 'pin'; side?: number } = $props();

	const PATHS = {
		close: 'M4 4l8 8M12 4l-8 8',
		check: 'M3 8.5 6.5 12 13 4.5',
		pin: 'M6 2h4l-.5 4 2.5 2.5H4L6.5 6zM8 8.5V14'
	};
</script>

<svg viewBox="0 0 16 16" width={side} height={side} aria-hidden="true">
	<path d={PATHS[name]} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
</svg>

<style>
	/* Centred block: in buttons, which already centre vertically, it sits in
	   the middle without extra rules. */
	svg {
		display: block;
		flex-shrink: 0;
		margin: 0 auto;
	}
</style>
