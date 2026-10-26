/**
 * Vero se l'utente ha chiesto al sistema di ridurre le animazioni.
 *
 * Serve dove non basta il CSS: un componente si può nascondere con una
 * media query, ma i suoi timer continuerebbero a girare. Le sequenze a
 * tempo vanno spente alla radice, non rese invisibili.
 *
 * Fuori da un browser — nei test di sola logica — risponde `false`:
 * l'assenza di `matchMedia` non è una preferenza espressa.
 */
export function motoRidotto(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return false;
	}
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
