import type { ArchiveItem, Entry } from './ipc';

/**
 * An archive opened like a folder. Its items are shown as entries whose
 * path is `<archive>::<inner path>`: never a real path, so nothing outside
 * the archive view must act on them.
 */
export const ARCHIVE_SEPARATOR = '::';

export function innerPath(archive: string, inner: string): string {
	return `${archive}${ARCHIVE_SEPARATOR}${inner}`;
}

/** The inner path of an entry from the archive view. */
export function innerOf(path: string): string {
	const i = path.lastIndexOf(ARCHIVE_SEPARATOR);
	return i === -1 ? path : path.slice(i + ARCHIVE_SEPARATOR.length);
}

/**
 * The entries directly inside `inner` ('' = the archive's root). Folders
 * that only appear as part of a path (TAR and 7z often skip them) are made up.
 */
export function level(items: ArchiveItem[], inner: string, archive: string): Entry[] {
	const prefix = inner === '' ? '' : `${inner}/`;
	const folders = new Map<string, Entry>();
	const files: Entry[] = [];
	for (const v of items) {
		if (!v.path.startsWith(prefix) || v.path === inner) continue;
		const rest = v.path.slice(prefix.length);
		const [name, ...below] = rest.split('/');
		if (!name) continue;
		const path = prefix + name;
		if (below.length > 0 || v.dir) {
			const already = folders.get(name);
			folders.set(name, {
				name,
				path: innerPath(archive, path),
				kind: 'dir',
				size: 0,
				modified: v.dir && below.length === 0 ? v.modified : (already?.modified ?? null),
				hidden: false
			});
		} else {
			files.push({ name, path: innerPath(archive, path), kind: 'file', size: v.size, modified: v.modified, hidden: false });
		}
	}
	const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, 'it', { numeric: true });
	return [...[...folders.values()].sort(byName), ...files.sort(byName)];
}

/** The folder above `inner`, or `null` at the root (leaving the archive). */
export function above(inner: string): string | null {
	if (inner === '') return null;
	const i = inner.lastIndexOf('/');
	return i === -1 ? '' : inner.slice(0, i);
}
