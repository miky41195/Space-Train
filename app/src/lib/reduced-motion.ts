/**
 * True when the user asked the system to reduce animations.
 *
 * Needed where CSS is not enough: a component can be hidden with a media
 * query, but its timers would keep running. Timed sequences must be turned
 * off at the root, not made invisible.
 *
 * Outside a browser — in logic-only tests — it answers `false`: a missing
 * `matchMedia` is not an expressed preference.
 */
export function reducedMotion(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return false;
	}
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
