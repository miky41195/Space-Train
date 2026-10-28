<script lang="ts">
	import { emitTo } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import EditorTemi from './EditorTemi.svelte';
	import { tauriBackend } from '../ipc';
	import { ImpostazioniStore } from '../stores/impostazioni.svelte';
	import { applicaTema, coloreAccento, temaDa, type TemaPersonale } from '../temi';
	import { EVENTO_EDITOR, type MessaggioEditor } from '../editor-finestra';

	let { da }: { /** La finestra dell'app che ha aperto l'editor. */ da: string } = $props();

	const impostazioni = new ImpostazioniStore();
	const temaAttuale = temaDa(impostazioni.tema, impostazioni.temiPersonali);
	applicaTema(temaAttuale, coloreAccento(temaAttuale, impostazioni.accento, impostazioni.coloreAccento));

	function manda(m: MessaggioEditor): Promise<void> {
		return emitTo(da, EVENTO_EDITOR, m).catch(() => {});
	}

	async function chiudi(ultimo?: MessaggioEditor) {
		if (ultimo) await manda(ultimo);
		await getCurrentWindow().close();
	}
</script>

<EditorTemi
	finestra
	{temaAttuale}
	personali={impostazioni.temiPersonali}
	backend={tauriBackend}
	onanteprima={(t: TemaPersonale) => {
		// Anche l'editor si veste del tema che si sta creando.
		applicaTema(t, t.variabili['--plasma']);
		void manda({ tipo: 'anteprima', tema: t });
	}}
	onsalva={(t) => void chiudi({ tipo: 'salva', tema: t })}
	onelimina={(id) => void chiudi({ tipo: 'elimina', id })}
	onchiudi={() => void chiudi()}
/>
