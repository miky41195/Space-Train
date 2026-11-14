/**
 * Which system the app runs on, for the few things that differ: features
 * that only the Windows Shell offers, and the default starting folder.
 *
 * Read from the webview's user agent: WebKitGTK on Linux says "Linux",
 * WebView2 on Windows says "Windows". jsdom (the tests) says neither.
 */
function onLinux(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent;
	return /Linux/.test(ua) && !/Android|jsdom/.test(ua);
}

export const ON_LINUX = onLinux();

/** Where a new tab opens when there is nothing better: the system disk. */
export const SYSTEM_ROOT = ON_LINUX ? '/' : 'C:\\';

/**
 * Menu actions that need the Windows Shell: its own context menu,
 * Properties, Open with, run as administrator, show in Explorer.
 */
export const WINDOWS_ONLY: ReadonlySet<string> = new Set([
	'moreOptions',
	'properties',
	'openWith',
	'runAsAdmin',
	'revealInExplorer'
]);
