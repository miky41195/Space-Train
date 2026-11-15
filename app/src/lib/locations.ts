import { t } from './i18n';
/**
 * Locations that are not disk folders, and small readings of paths that
 * only serve to show things: composing paths stays in Rust.
 */

// These values are saved (start page, session): they stay as they are.
export const THIS_PC = '::pc';
export const NETWORK = '::rete';
export const TRASH = '::cestino';
/** The PCs with Space Train found on the local network. */
export const LAN = '::lan';
/** Friends on Space Train, wherever they are. */
export const FRIENDS = '::amici';
/** Remote servers (SFTP, FTP, WebDAV) the user added. */
export const SERVER = '::server';
/**
 * Not a location: it is the free space between the tabs, where dropping a
 * folder opens it in a new tab.
 */
export const NEW_TAB = '::new-tab';

const VIRTUAL_NAMES: Record<string, string> = {
	[THIS_PC]: t('Questo PC'),
	[NETWORK]: t('Rete'),
	[TRASH]: t('Cestino'),
	[LAN]: t('Rete locale'),
	[FRIENDS]: t('Amici'),
	[SERVER]: t('Server')
};

/**
 * True for what lives on another PC: the local network, friends and
 * everything browsed inside them. It opens, copies and drags the same way.
 */
export function isLan(path: string): boolean {
	return [LAN, FRIENDS, SERVER].some((r) => path === r || path.startsWith(r + '\\'));
}

/** A folder on a remote server (or the list of servers). */
export function isServer(path: string): boolean {
	return path === SERVER || path.startsWith(SERVER + '\\');
}

/** Server names by id: the path carries the id, the route shows the name. */
let serverNames: Record<string, string> = {};

export function setServerNames(names: Record<string, string>) {
	serverNames = names;
}

/**
 * Friend names by code: the path carries the code, long and unreadable,
 * the breadcrumbs and tabs show the name.
 */
let friendNames: Record<string, string> = {};

export function setFriendNames(names: Record<string, string>) {
	friendNames = names;
}

export function isVirtual(path: string): boolean {
	return path.startsWith('::');
}

export interface Crumb {
	name: string;
	path: string;
}

/**
 * The stretches of the path, each with the folder it leads to.
 *
 * A disk starts from «Questo PC», a network path from «Rete»: as in
 * Explorer, the chain always reaches a clickable root.
 */
export function breadcrumbs(path: string): Crumb[] {
	for (const root of [LAN, FRIENDS, SERVER]) {
		if (!path.startsWith(root + '\\')) continue;
		const parts = path.slice(root.length + 1).split('\\').filter(Boolean);
		const out: Crumb[] = [{ name: VIRTUAL_NAMES[root], path: root }];
		let current = root;
		parts.forEach((p, i) => {
			current = `${current}\\${p}`;
			const name =
				root === FRIENDS && i === 0 ? (friendNames[p] ?? t('Amico')) : root === SERVER && i === 0 ? (serverNames[p] ?? t('Server')) : p;
			out.push({ name, path: current });
		});
		return out;
	}
	if (isVirtual(path)) {
		return [{ name: VIRTUAL_NAMES[path] ?? path, path }];
	}

	if (path.startsWith('\\\\')) {
		const parts = path.slice(2).split('\\').filter(Boolean);
		const out: Crumb[] = [{ name: t('Rete'), path: NETWORK }];
		let current = '\\\\';
		parts.forEach((p, i) => {
			current = i === 0 ? `\\\\${p}` : `${current}\\${p}`;
			out.push({ name: p, path: current });
		});
		return out;
	}

	if (isPosix(path)) {
		const out: Crumb[] = [
			{ name: VIRTUAL_NAMES[THIS_PC], path: THIS_PC },
			{ name: t('File system'), path: '/' }
		];
		let current = '';
		for (const p of path.split('/').filter(Boolean)) {
			current = `${current}/${p}`;
			out.push({ name: p, path: current });
		}
		return out;
	}

	const parts = path.split(/[\\/]/).filter(Boolean);
	if (parts.length === 0) return [{ name: path, path }];

	const out: Crumb[] = [{ name: t('Questo PC'), path: THIS_PC }];
	let current = '';
	parts.forEach((p, i) => {
		current = i === 0 ? `${p}\\` : current.endsWith('\\') ? current + p : `${current}\\${p}`;
		out.push({ name: p, path: current });
	});
	return out;
}

/** Short name of the location, for the tab title. */
export function locationName(path: string): string {
	const b = breadcrumbs(path);
	return b[b.length - 1]?.name ?? path;
}

/** Last stretch of the path: the item's name. */
export function nameOf(path: string): string {
	const i = path.replace(/[\\/]+$/, '').search(/[^\\/]+$/);
	return i === -1 ? path : path.slice(i).replace(/[\\/]+$/, '');
}

/**
 * A Linux/Unix path: starts at `/`. Virtual places (`::…`) and Windows
 * paths (`C:\…`, `\\server\…`) never do.
 */
export function isPosix(path: string): boolean {
	return path.startsWith('/');
}

/** The separator used inside `path`. */
export function separator(path: string): '/' | '\\' {
	return isPosix(path) ? '/' : '\\';
}

/** `child` is `folder` itself or somewhere inside it. */
export function isInside(child: string, folder: string): boolean {
	const posix = isPosix(folder);
	const norm = (p: string) => (posix ? p : p.toLowerCase());
	const f = norm(folder).replace(/[\\/]+$/, '');
	const c = norm(child);
	return c === f || c.startsWith(f + separator(folder)) || (f === '' && posix);
}

/** The folder that contains `path`, only to show it. */
export function folderOf(path: string): string {
	if (isPosix(path)) {
		const i = path.replace(/\/+$/, '').lastIndexOf('/');
		return i <= 0 ? '/' : path.slice(0, i);
	}
	const i = path.lastIndexOf('\\');
	if (i <= 0) return path;
	const g = path.slice(0, i);
	return g.endsWith(':') ? `${g}\\` : g;
}

/**
 * The volume a path is on: the drive letter or `\\server\share`.
 * It decides whether dragging moves (same volume) or copies, as in Explorer.
 */
export function volume(path: string): string {
	if (path.startsWith('\\\\')) {
		return path.split('\\').slice(0, 4).join('\\').toLowerCase();
	}
	if (isPosix(path)) {
		// Removable disks and mounted shares live under these folders; the
		// rest is taken as the system disk.
		const parts = path.split('/').filter(Boolean);
		const depth = parts[0] === 'media' ? 3 : parts[0] === 'run' && parts[1] === 'media' ? 4 : parts[0] === 'mnt' ? 2 : 0;
		return depth > 0 && parts.length >= depth ? '/' + parts.slice(0, depth).join('/') : '/';
	}
	return path.slice(0, 2).toLowerCase();
}

export function sameVolume(a: string, b: string): boolean {
	return volume(a) === volume(b);
}

export function extension(name: string): string {
	const i = name.lastIndexOf('.');
	return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** The name without extension, as Explorer shows it with extensions hidden. */
export function withoutExtension(name: string): string {
	const i = name.lastIndexOf('.');
	return i > 0 ? name.slice(0, i) : name;
}

export function isZip(name: string): boolean {
	return extension(name) === 'zip';
}

/** Archives Space Train reads: ZIP, 7z, RAR, TAR and TAR.GZ. */
export function isArchive(name: string): boolean {
	return /\.(zip|7z|rar|tar|tgz|tar\.gz)$/i.test(name);
}

const EXECUTABLES = new Set(['exe', 'msi', 'bat', 'cmd', 'com']);

/** Items it makes sense to run as administrator. */
export function isExecutable(name: string): boolean {
	return EXECUTABLES.has(extension(name));
}

/**
 * Two paths point to the same item: Windows ignores case, Linux does not.
 */
export function samePath(a: string, b: string): boolean {
	if (isPosix(a) || isPosix(b)) {
		const clean = (p: string) => p.replace(/(.)\/+$/, '$1');
		return clean(a) === clean(b);
	}
	return a.replace(/\\+$/, '').toLowerCase() === b.replace(/\\+$/, '').toLowerCase();
}

/** Bytes in readable form. */
export function formatBytes(n: number): string {
	if (n < 1024) return t('{0} B', [n]);
	if (n < 1024 ** 2) return t('{0} KB', [(n / 1024).toFixed(0)]);
	if (n < 1024 ** 3) return t('{0} MB', [(n / 1024 ** 2).toFixed(1)]);
	if (n < 1024 ** 4) return t('{0} GB', [(n / 1024 ** 3).toFixed(1)]);
	return t('{0} TB', [(n / 1024 ** 4).toFixed(2)]);
}
