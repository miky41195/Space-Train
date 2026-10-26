/**
 * jsdom non implementa ResizeObserver, che Svelte usa dietro
 * `bind:clientHeight`. Uno stub inerte basta: nei test le dimensioni si
 * impostano a mano, perché jsdom non fa comunque layout.
 */
class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
