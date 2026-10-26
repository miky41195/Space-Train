import type { Entry } from './ipc';
import type { Colonne } from './stores/impostazioni.svelte';
import { categoryFor } from './icons';
import { estensione } from './posizioni';

/**
 * Colonne della vista dettagli. Righe e intestazioni usano la stessa
 * funzione: è ciò che le tiene allineate quando l'utente ne nasconde una.
 */
export function grigliaColonne(c: Colonne): string {
	return ['28px', 'minmax(0, 1fr)', c.tipo && '130px', c.dimensione && '110px', c.data && '170px']
		.filter(Boolean)
		.join(' ');
}

const TIPI: Record<string, string> = {
	code: 'Codice sorgente',
	markup: 'Pagina',
	style: 'Foglio di stile',
	data: 'Dati',
	text: 'Documento di testo',
	doc: 'Documento',
	sheet: 'Foglio di calcolo',
	slide: 'Presentazione',
	image: 'Immagine',
	video: 'Video',
	audio: 'Audio',
	archive: 'Archivio',
	exec: 'Applicazione',
	font: 'Carattere',
	config: 'Configurazione'
};

/** Descrizione del tipo per la colonna «Tipo», come la scriverebbe Esplora. */
export function descriviTipo(e: Entry): string {
	if (e.totale !== undefined) return 'Disco';
	if (e.kind === 'dir') return 'Cartella';
	if (e.kind === 'symlink') return 'Collegamento';
	const ext = estensione(e.name);
	const tipo = TIPI[categoryFor(e.name)];
	if (tipo && ext) return `${tipo} ${ext.toUpperCase()}`;
	return ext ? `File ${ext.toUpperCase()}` : 'File';
}
