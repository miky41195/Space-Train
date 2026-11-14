import type { Entry } from './ipc';
import type { Columns } from './stores/settings.svelte';
import { categoryFor } from './icons';
import { extension } from './locations';
import { MEDIA_COLUMNS } from './media';

/**
 * Columns of the details view. Rows and headers use the same function: it
 * is what keeps them aligned when the user hides one.
 */
export function columnsGrid(c: Columns): string {
	const media = (c.media ?? []).map((k) => MEDIA_COLUMNS.find((m) => m.key === k)?.width);
	return ['28px', 'minmax(0, 1fr)', c.type && '130px', c.size && '110px', c.date && '170px', ...media]
		.filter(Boolean)
		.join(' ');
}

const TYPES: Record<string, string> = {
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

/** Type description for the «Tipo» column, as Explorer would write it. */
export function describeType(e: Entry): string {
	if (e.total !== undefined) return 'Disco';
	if (e.kind === 'dir') return 'Cartella';
	if (e.kind === 'symlink') return 'Collegamento';
	const ext = extension(e.name);
	const type = TYPES[categoryFor(e.name)];
	if (type && ext) return `${type} ${ext.toUpperCase()}`;
	return ext ? `File ${ext.toUpperCase()}` : 'File';
}
