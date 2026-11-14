import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Layout from './+layout.svelte';

afterEach(cleanup);

describe('browser menu', () => {
	const page = createRawSnippet(() => ({
		render: () => '<div><p class="empty">testo</p><input class="field" /></div>'
	}));

	function rightClick(el: Element): boolean {
		const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		el.dispatchEvent(e);
		return e.defaultPrevented;
	}

	it('does not appear outside text fields', () => {
		const { container } = render(Layout, { children: page });
		expect(rightClick(container.querySelector('.empty')!)).toBe(true);
	});

	it('stays in text fields, for cut, copy and paste', () => {
		const { container } = render(Layout, { children: page });
		expect(rightClick(container.querySelector('.field')!)).toBe(false);
	});
});
