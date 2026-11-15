import { t } from './i18n';
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
	code: t('Codice sorgente'),
	markup: t('Pagina'),
	style: 'Foglio di stile',
	data: t('Dati'),
	text: t('Documento di testo'),
	doc: t('Documento'),
	sheet: t('Foglio di calcolo'),
	slide: t('Presentazione'),
	image: t('Immagine'),
	video: t('Video'),
	audio: t('Audio'),
	archive: t('Archivio'),
	exec: t('Applicazione'),
	font: 'Carattere',
	config: t('Configurazione')
};

/** Type description for the «Tipo» column, as Explorer would write it. */
export function describeType(e: Entry): string {
	if (e.total !== undefined) return t('Disco');
	if (e.kind === 'dir') return t('Cartella');
	if (e.kind === 'symlink') return t('Collegamento');
	const ext = extension(e.name);
	const type = TYPES[categoryFor(e.name)];
	if (type && ext) return t('{0} {1}', [type, ext.toUpperCase()]);
	return ext ? t('File {0}', [ext.toUpperCase()]) : t('File');
}
