import { describe, it, expect } from 'vitest';
import { clampMove } from './draggable';

describe('movable dialog', () => {
	const dialog = { left: 200, top: 100, width: 600, height: 400 };
	const screen = { width: 1000, height: 700 };

	it('moves freely inside the app window', () => {
		expect(clampMove(-150, 80, dialog, screen)).toEqual({ dx: -150, dy: 80 });
	});

	it('never leaves the app window, on any side', () => {
		expect(clampMove(-2000, 0, dialog, screen).dx).toBe(-200);
		expect(clampMove(2000, 0, dialog, screen).dx).toBe(1000 - 600 - 200);
		expect(clampMove(0, -500, dialog, screen).dy).toBe(-100);
		expect(clampMove(0, 5000, dialog, screen).dy).toBe(700 - 400 - 100);
	});

	it('larger than the app window: it stays stuck at the top left', () => {
		const large = { left: 0, top: 0, width: 1200, height: 900 };
		expect(clampMove(300, 300, large, screen)).toEqual({ dx: 0, dy: 0 });
		expect(clampMove(-300, -300, large, screen)).toEqual({ dx: 0, dy: 0 });
	});
});
