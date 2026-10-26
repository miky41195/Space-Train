import type { Entry } from './ipc';

const CARTELLA =
	'<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 5v7A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12z"/></svg>';

const FILE =
	'<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5h5L13 5.5v9A1.5 1.5 0 0 1 11.5 16h-8A1.5 1.5 0 0 1 2 14.5v-11A1.5 1.5 0 0 1 3.5 1.5z" opacity=".85"/></svg>';

/** Categorie riconosciute per estensione. */
const CATEGORIE: Record<string, string[]> = {
	code: ['ts', 'tsx', 'js', 'jsx', 'rs', 'py', 'go', 'java', 'c', 'cpp', 'cs', 'rb', 'php', 'swift'],
	markup: ['html', 'xml', 'svelte', 'vue'],
	style: ['css', 'scss', 'less'],
	data: ['json', 'yaml', 'yml', 'toml', 'csv', 'sql', 'db'],
	text: ['txt', 'md', 'rtf', 'log'],
	doc: ['pdf', 'doc', 'docx', 'odt'],
	sheet: ['xls', 'xlsx', 'ods'],
	slide: ['ppt', 'pptx', 'odp'],
	image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'],
	video: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv'],
	audio: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'],
	archive: ['zip', 'rar', '7z', 'tar', 'gz', 'xz', 'iso'],
	exec: ['exe', 'msi', 'bat', 'cmd', 'ps1', 'dll'],
	font: ['ttf', 'otf', 'woff', 'woff2'],
	config: ['ini', 'cfg', 'conf', 'env', 'lock']
};

const PER_ESTENSIONE = new Map<string, string>();
for (const [categoria, estensioni] of Object.entries(CATEGORIE)) {
	for (const e of estensioni) PER_ESTENSIONE.set(e, categoria);
}

export function categoryFor(name: string): string {
	const i = name.lastIndexOf('.');
	if (i <= 0) return 'plain';
	return PER_ESTENSIONE.get(name.slice(i + 1).toLowerCase()) ?? 'plain';
}

/** Categorie per cui vale la pena leggere il file per una miniatura vera. */
const CON_MINIATURA = new Set(['image', 'video', 'doc', 'slide']);

/**
 * Vero se l'elemento merita una miniatura reale invece dell'icona di tipo.
 *
 * Le cartelle no: Windows genererebbe un collage del contenuto, costoso e
 * di scarsa utilità in una lista fitta.
 */
export function vuoleMiniatura(entry: Entry): boolean {
	// Programmi, collegamenti, cartelle con `desktop.ini`: l'icona di tipo
	// sarebbe quella generica, la loro vera la dà solo il file.
	if (entry.iconaPropria) return true;
	if (entry.kind === 'dir') return false;
	return CON_MINIATURA.has(categoryFor(entry.name));
}

/** Chiave di cache per l'icona di tipo: le voci dello stesso tipo la condividono. */
export function chiaveIcona(entry: Entry, large = false): string {
	if (entry.kind === 'dir') return `dir|${large}`;
	const i = entry.name.lastIndexOf('.');
	const ext = i > 0 ? entry.name.slice(i + 1).toLowerCase() : '';
	return `${ext}|${large}`;
}

export function iconFor(entry: Entry): string {
	return entry.kind === 'dir' ? CARTELLA : FILE;
}

/**
 * Cartella colorata a due toni, disegnata a qualsiasi lato: la linguetta
 * dietro più scura, il corpo davanti col colore scelto dall'utente.
 */
export function iconaCartella(colore: string): string {
	return `<svg viewBox="0 0 48 40" width="100%" height="100%" aria-hidden="true"><path d="M3 6a3 3 0 0 1 3-3h12l4 4h20a3 3 0 0 1 3 3v24a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="${colore}"/><path d="M3 6a3 3 0 0 1 3-3h12l4 4h20a3 3 0 0 1 3 3v24a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="#000" opacity=".28"/><path d="M3 14a3 3 0 0 1 3-3h36a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="${colore}"/><path d="M3 14a3 3 0 0 1 3-3h36a3 3 0 0 1 3 3v2H3z" fill="#fff" opacity=".18"/></svg>`;
}
