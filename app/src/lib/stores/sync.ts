/**
 * Several app windows share the same local storage. When one saves, the
 * others get the `storage` event and read again: a theme or a colour
 * changed in one window shows at once in the others too.
 */
export function onChangeOf(key: string, reload: (value: string | null) => void): void {
	if (typeof window === 'undefined') return;
	window.addEventListener('storage', (e) => {
		if (e.key === key) reload(e.newValue);
	});
}
