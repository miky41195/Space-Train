/**
 * jsdom does not implement ResizeObserver, which Svelte uses behind
 * `bind:clientHeight`. An inert stub is enough: in tests sizes are set
 * by hand, because jsdom does no layout anyway.
 */
class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
