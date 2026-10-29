<script lang="ts">
	/**
	 * Le icone piccole che prima erano caratteri (×, ✓, 📌): disegnate col
	 * tratto delle icone della barra dei comandi, così la finestra parla una
	 * lingua sola. Prendono il colore dal testo che le circonda.
	 */
	let { nome, lato = 12 }: { nome: 'chiudi' | 'spunta' | 'spillo'; lato?: number } = $props();

	const TRATTI = {
		chiudi: 'M4 4l8 8M12 4l-8 8',
		spunta: 'M3 8.5 6.5 12 13 4.5',
		spillo: 'M6 2h4l-.5 4 2.5 2.5H4L6.5 6zM8 8.5V14'
	};
</script>

<svg viewBox="0 0 16 16" width={lato} height={lato} aria-hidden="true">
	<path d={TRATTI[nome]} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
</svg>

<style>
	/* Blocco centrato: nei pulsanti, che centrano già in verticale, sta nel
	   mezzo senza regole in più. */
	svg {
		display: block;
		flex-shrink: 0;
		margin: 0 auto;
	}
</style>
