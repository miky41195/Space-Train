import { t } from './i18n';
/**
 * Makes a dialog movable by dragging it by its header, so it can be moved
 * aside to look at what is behind it (a theme's preview).
 *
 * It attaches to the dialog; `handle` is the selector of the part it is
 * taken by. Buttons and fields inside the handle stay clickable. The dialog
 * stays entirely inside the app's window: outside it would be cut.
 */

/**
 * The movement allowed for rectangle `r` to stay entirely inside the
 * screen. If it is larger, it stays stuck at the top left.
 */
export function clampMove(
	dx: number,
	dy: number,
	r: { left: number; top: number; width: number; height: number },
	screen: { width: number; height: number }
): { dx: number; dy: number } {
	const minX = 0 - r.left;
	const maxX = Math.max(minX, screen.width - r.width - r.left);
	const minY = 0 - r.top;
	const maxY = Math.max(minY, screen.height - r.height - r.top);
	return { dx: Math.min(maxX, Math.max(minX, dx)), dy: Math.min(maxY, Math.max(minY, dy)) };
}

export function draggable(dialog: HTMLElement, handle = 'header') {
	let x = 0;
	let y = 0;

	function down(e: PointerEvent) {
		if (e.button !== 0) return;
		const target = e.target as HTMLElement;
		const grip = target.closest<HTMLElement>(handle);
		if (!grip || !dialog.contains(grip)) return;
		if (target.closest('button, input, select, textarea, a')) return;
		e.preventDefault();

		const start = { px: e.clientX, py: e.clientY, x, y };
		// The rectangle without the movement already made: the limits are
		// computed from the original position.
		const b = dialog.getBoundingClientRect();
		const origin = { left: b.left - x, top: b.top - y, width: b.width, height: b.height };
		grip.setPointerCapture?.(e.pointerId);
		dialog.classList.add('being-moved');

		function move(m: PointerEvent) {
			const d = clampMove(start.x + m.clientX - start.px, start.y + m.clientY - start.py, origin, {
				width: window.innerWidth,
				height: window.innerHeight
			});
			x = d.dx;
			y = d.dy;
			dialog.style.translate = t('{0}px {1}px', [x, y]);
		}

		function up() {
			grip!.removeEventListener('pointermove', move);
			grip!.removeEventListener('pointerup', up);
			grip!.removeEventListener('pointercancel', up);
			dialog.classList.remove('being-moved');
		}

		grip.addEventListener('pointermove', move);
		grip.addEventListener('pointerup', up);
		grip.addEventListener('pointercancel', up);
	}

	/**
	 * If the dialog grows (a section opening) or the app shrinks, the
	 * movement made could take it outside: it is brought back in.
	 */
	function realign() {
		if (x === 0 && y === 0) return;
		const b = dialog.getBoundingClientRect();
		const d = clampMove(
			x,
			y,
			{ left: b.left - x, top: b.top - y, width: b.width, height: b.height },
			{ width: window.innerWidth, height: window.innerHeight }
		);
		if (d.dx === x && d.dy === y) return;
		x = d.dx;
		y = d.dy;
		dialog.style.translate = t('{0}px {1}px', [x, y]);
	}

	const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(realign);
	observer?.observe(dialog);
	window.addEventListener('resize', realign);
	dialog.addEventListener('pointerdown', down);
	return {
		destroy() {
			observer?.disconnect();
			window.removeEventListener('resize', realign);
			dialog.removeEventListener('pointerdown', down);
		}
	};
}
