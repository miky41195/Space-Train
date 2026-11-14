/**
 * Watches a reactive read outside a component.
 *
 * For tests: checking that a value is right does not prove the interface
 * is told about the change. Writing to the raw object instead of the
 * `$state` proxy produces exactly this case, right value and frozen
 * screen, and only an observer tells them apart.
 *
 * Returns the function that stops watching.
 */
export function observe<T>(read: () => T, onChange: (value: T) => void): () => void {
	return $effect.root(() => {
		$effect(() => onChange(read()));
	});
}
