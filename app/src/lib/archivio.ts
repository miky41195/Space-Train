import type { ArchiveItem, Entry } from './ipc';

/**
 * An archive opened like a folder. Its items are shown as entries whose
 * path is `<archive>::<inner path>`: never a real path, so nothing outside
 * the archive view must act on them.
 */
export const SEPARATORE_ARCHIVIO = '::';

export function percorsoInterno(archivio: string, interno: string): string {
	return `${archivio}${SEPARATORE_ARCHIVIO}${interno}`;
}

/** The inner path of an entry from the archive view. */
export function internoDi(path: string): string {
	const i = path.lastIndexOf(SEPARATORE_ARCHIVIO);
	return i === -1 ? path : path.slice(i + SEPARATORE_ARCHIVIO.length);
}

/**
 * The entries directly inside `dentro` ('' = the archive's root). Folders
 * that only appear as part of a path (TAR and 7z often skip them) are made up.
 */
export function livello(voci: ArchiveItem[], dentro: string, archivio: string): Entry[] {
	const prefisso = dentro === '' ? '' : `${dentro}/`;
	const cartelle = new Map<string, Entry>();
	const file: Entry[] = [];
	for (const v of voci) {
		if (!v.path.startsWith(prefisso) || v.path === dentro) continue;
		const resto = v.path.slice(prefisso.length);
		const [nome, ...sotto] = resto.split('/');
		if (!nome) continue;
		const interno = prefisso + nome;
		if (sotto.length > 0 || v.dir) {
			const gia = cartelle.get(nome);
			cartelle.set(nome, {
				name: nome,
				path: percorsoInterno(archivio, interno),
				kind: 'dir',
				size: 0,
				modified: v.dir && sotto.length === 0 ? v.modified : (gia?.modified ?? null),
				hidden: false
			});
		} else {
			file.push({ name: nome, path: percorsoInterno(archivio, interno), kind: 'file', size: v.size, modified: v.modified, hidden: false });
		}
	}
	const perNome = (a: Entry, b: Entry) => a.name.localeCompare(b.name, 'it', { numeric: true });
	return [...[...cartelle.values()].sort(perNome), ...file.sort(perNome)];
}

/** The folder above `dentro`, or `null` at the root (leaving the archive). */
export function sopra(dentro: string): string | null {
	if (dentro === '') return null;
	const i = dentro.lastIndexOf('/');
	return i === -1 ? '' : dentro.slice(0, i);
}
