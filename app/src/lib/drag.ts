/** Pixels of movement past which a press becomes a drag. */
export const DRAG_THRESHOLD = 5;

/**
 * To call on mousedown: if the pointer moves past the threshold with the
 * button still down, it calls `start` once.
 *
 * Without a threshold every slightly shaky click would start a drag and
 * selection would no longer work.
 */
export function onDrag(down: MouseEvent, start: () => void): void {
	if (down.button !== 0) return;
	const x0 = down.clientX;
	const y0 = down.clientY;

	function move(e: MouseEvent) {
		if ((e.buttons & 1) === 0) return end();
		if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < DRAG_THRESHOLD) return;
		end();
		start();
	}

	function end() {
		window.removeEventListener('mousemove', move);
		window.removeEventListener('mouseup', end);
	}

	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', end);
}

/** How long the pointer rests on an item before one-click mode selects it. */
export const HOVER_SELECT_MS = 500;

// One timer for the whole page: the pointer rests on one item at a time.
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Explorer's "point to select" for one-click mode: resting on an item selects
 * it. Skipped while a button is down (drag or selection rectangle).
 */
export function hoverSelect(e: MouseEvent, select: () => void): void {
	clearTimeout(hoverTimer);
	if (e.buttons !== 0) return;
	hoverTimer = setTimeout(select, HOVER_SELECT_MS);
}

export function cancelHoverSelect(): void {
	clearTimeout(hoverTimer);
}
