import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Layout from './+layout.svelte';

afterEach(cleanup);

describe('menu del browser', () => {
	const pagina = createRawSnippet(() => ({
		render: () => '<div><p class="vuoto">testo</p><input class="campo" /></div>'
	}));

	function clicDestro(el: Element): boolean {
		const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		el.dispatchEvent(e);
		return e.defaultPrevented;
	}

	it('non compare fuori dai campi di testo', () => {
		const { container } = render(Layout, { children: pagina });
		expect(clicDestro(container.querySelector('.vuoto')!)).toBe(true);
	});

	it('resta nei campi di testo, per taglia, copia e incolla', () => {
		const { container } = render(Layout, { children: pagina });
		expect(clicDestro(container.querySelector('.campo')!)).toBe(false);
	});
});
