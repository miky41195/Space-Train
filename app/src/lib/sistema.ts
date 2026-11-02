/**
 * Which system the app runs on, for the few things that differ: features
 * that only the Windows Shell offers, and the default starting folder.
 *
 * Read from the webview's user agent: WebKitGTK on Linux says "Linux",
 * WebView2 on Windows says "Windows". jsdom (the tests) says neither.
 */
function suLinux(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent;
	return /Linux/.test(ua) && !/Android|jsdom/.test(ua);
}

export const SU_LINUX = suLinux();

/** Where a new tab opens when there is nothing better: the system disk. */
export const RADICE_SISTEMA = SU_LINUX ? '/' : 'C:\\';

/**
 * Menu actions that need the Windows Shell: its own context menu,
 * Properties, Open with, run as administrator, show in Explorer.
 */
export const SOLO_WINDOWS: ReadonlySet<string> = new Set([
	'altreOpzioni',
	'proprieta',
	'apriCon',
	'amministratore',
	'mostraInEsplora'
]);
