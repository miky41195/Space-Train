import { t } from './i18n';
/**
 * Marquee selection and click on empty space, as in Explorer.
 *
 * It attaches to the scrolling viewport of a list or a grid: pressing the
 * left button on empty space and dragging draws a rectangle, and the items
 * it touches are selected. A click on empty space without dragging clears
 * the selection.
 *
 * Items are recognised by the `data-item` attribute with their path. With
 * virtualised lists only the drawn ones count: automatic scrolling near the
 * edges brings them on screen as it goes.
 */

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The rectangle between two points, with width and height never negative. */
export function boxBetween(x0: number, y0: number, x1: number, y1: number): Box {
	return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function overlap(a: Box, b: Box): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export interface MarqueeOptions {
	/** Pressed on empty space: the starting selection must be remembered. */
	onstart?: () => void;
	/** The items inside the rectangle; `add` when Ctrl or Shift was held. */
	onchange: (paths: string[], add: boolean) => void;
	/** Click on empty space without dragging and without Ctrl: nothing selected. */
	onempty: () => void;
}

/** Pixels past which the press becomes a rectangle. */
const THRESHOLD = 5;
/** Maximum pixels of scrolling per frame, with the pointer outside the list. */
const EDGE = 24;

export function marqueeSelection(node: HTMLElement, options: MarqueeOptions) {
	let o = options;

	function down(e: MouseEvent) {
		if (e.button !== 0) return;
		const target = e.target as HTMLElement | null;
		if (!target || target.closest('input, button')) return;
		// Over an item it and file dragging rule: the rectangle starts only
		// from empty space.
		if (target.closest('[data-item]')) return;
		const outer = node.getBoundingClientRect();
		// A click on the scrollbar is not a click on empty space.
		if (e.clientX - outer.left >= node.clientWidth || e.clientY - outer.top >= node.clientHeight) return;

		const add = e.ctrlKey || e.shiftKey;
		// The content limits are measured before drawing: the rectangle lives
		// inside the viewport, and without these limits it would stretch it by
		// itself, scrolling it forever.
		const limitX = node.clientWidth;
		const limitY = Math.max(node.scrollHeight, node.clientHeight);
		const content = (cx: number, cy: number) => {
			const r = node.getBoundingClientRect();
			return {
				x: Math.min(limitX, Math.max(0, cx - r.left + node.scrollLeft)),
				y: Math.min(limitY, Math.max(0, cy - r.top + node.scrollTop))
			};
		};
		const start = content(e.clientX, e.clientY);
		let last = { x: e.clientX, y: e.clientY };
		let box: HTMLDivElement | null = null;
		let frame = 0;
		/**
		 * Where each item seen during the gesture is, in content coordinates.
		 * Lists are virtualised: an item that left the screen disappears from
		 * the page, but stays inside the rectangle.
		 */
		const positions = new Map<string, Box>();

		// No text selection while dragging.
		e.preventDefault();
		o.onstart?.();

		function update() {
			const end = content(last.x, last.y);
			const r = boxBetween(start.x, start.y, end.x, end.y);
			if (box) {
				box.style.transform = t('translate({0}px, {1}px)', [r.x, r.y]);
				box.style.width = `${r.w}px`;
				box.style.height = `${r.h}px`;
			}
			const base = node.getBoundingClientRect();
			for (const el of node.querySelectorAll<HTMLElement>('[data-item]')) {
				const b = el.getBoundingClientRect();
				positions.set(el.dataset.item!, {
					x: b.left - base.left + node.scrollLeft,
					y: b.top - base.top + node.scrollTop,
					w: b.width,
					h: b.height
				});
			}
			const inside: string[] = [];
			for (const [path, item] of positions) if (overlap(r, item)) inside.push(path);
			o.onchange(inside, add);
		}

		// With the pointer past the edge, above or below, the list scrolls and
		// the rectangle follows it. Inside the list it does not scroll: starting
		// near the bottom must not make everything run away downwards.
		function scroll() {
			const r = node.getBoundingClientRect();
			let step = 0;
			if (last.y < r.top) step = -Math.min(EDGE, r.top - last.y);
			else if (last.y > r.bottom) step = Math.min(EDGE, last.y - r.bottom);
			if (step !== 0) {
				node.scrollTop += step;
				update();
			}
			frame = requestAnimationFrame(scroll);
		}

		function move(m: MouseEvent) {
			last = { x: m.clientX, y: m.clientY };
			if (!box) {
				const a = content(m.clientX, m.clientY);
				if (Math.abs(a.x - start.x) + Math.abs(a.y - start.y) < THRESHOLD) return;
				box = document.createElement('div');
				box.className = 'selection-marquee';
				node.appendChild(box);
				frame = requestAnimationFrame(scroll);
			}
			update();
		}

		function up() {
			window.removeEventListener('mousemove', move);
			window.removeEventListener('mouseup', up);
			cancelAnimationFrame(frame);
			if (box) {
				box.remove();
				// The click that ends the gesture would fall on a row and select
				// it alone, cancelling the rectangle.
				const swallow = (c: MouseEvent) => {
					c.stopPropagation();
					c.preventDefault();
				};
				window.addEventListener('click', swallow, { capture: true, once: true });
				setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
			} else if (!add) o.onempty();
		}

		window.addEventListener('mousemove', move);
		window.addEventListener('mouseup', up);
	}

	node.addEventListener('mousedown', down);
	return {
		update(next: MarqueeOptions) {
			o = next;
		},
		destroy() {
			node.removeEventListener('mousedown', down);
		}
	};
}
