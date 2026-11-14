import { describe, it, expect } from 'vitest';
import {
	encode,
	decode,
	guess,
	drawing,
	style,
	frameSize,
	withZone,
	sequence,
	parseOrder,
	formatOrder,
	alternateWithFirst,
	pingPong,
	normalize,
	railSize,
	grid,
	cell,
	frameStep,
	gridBoxes,
	snapBox
} from './spritesheet';

describe('spritesheet', () => {
	it('a strip of square frames is recognised on its own', () => {
		const s = guess('C:\\gatto.png', 256, 32);
		expect(s.frames).toBe(8);
		expect([s.x, s.y, s.w, s.h]).toEqual([0, 0, 256, 32]);
	});

	it('a non-strip image starts from a single frame', () => {
		expect(guess('C:\\a.png', 100, 70).frames).toBe(1);
		expect(guess('C:\\a.png', 64, 64).frames).toBe(1);
	});

	it('goes to the parade and back without losing anything', () => {
		const s = { ...guess('C:\\x.png', 128, 128), x: 10, y: 20, w: 90, h: 37, frames: 3, fps: 12 };
		expect(decode(encode(s))).toEqual(s);
	});

	it('keeps the names earlier versions saved', () => {
		const s = { ...guess('C:\\x.png', 128, 32), frames: 4, gapX: 2, railHeight: 64, order: [1, 0] };
		const saved = JSON.parse(encode(s).slice('sprite:'.length));
		expect(saved).toMatchObject({ larghezza: 128, altezza: 32, fotogrammi: 4, spazioX: 2, alto: 64, ordine: [1, 0], nitido: true });
		expect(Object.keys(saved)).not.toContain('frames');
	});

	it('the zone stays inside the image, at whole pixels', () => {
		const s = guess('C:\\x.png', 100, 50);
		expect(withZone(s, -20, -5, 500, 500)).toMatchObject({ x: 0, y: 0, w: 100, h: 50 });
		expect(withZone(s, 90.4, 40.6, 30, 30)).toMatchObject({ x: 90, y: 41, w: 10, h: 9 });
		expect(withZone(s, 10, 10, 0, -3)).toMatchObject({ w: 1, h: 1 });
		// No more frames than the zone's pixels.
		expect(decode(encode({ ...withZone(s, 0, 0, 4, 4), frames: 99 }))!.frames).toBe(4);
	});

	it('wild values are brought back within the limits', () => {
		const s = decode('sprite:' + JSON.stringify({ src: 'a', larghezza: 64, altezza: 64, fotogrammi: 0, fps: 999 }))!;
		expect(s.frames).toBe(1);
		expect(s.fps).toBe(30);
		expect([s.w, s.h]).toEqual([64, 64]);
		expect(decode('sprite:{rotto')).toBeNull();
		expect(decode('img:C:\\a.png')).toBeNull();
	});

	it('themes saved as a grid become the equivalent zone', () => {
		const old = { src: 'a', larghezza: 512, altezza: 256, colonne: 8, righe: 4, riga: 2, inizio: 3, fotogrammi: 3, fps: 8, nitido: true };
		expect(decode('sprite:' + JSON.stringify(old))).toMatchObject({ x: 192, y: 128, w: 192, h: 64, frames: 3 });
		const noStart = { src: 'a', larghezza: 256, altezza: 32, colonne: 8, righe: 1, riga: 0, fotogrammi: 8 };
		expect(decode('sprite:' + JSON.stringify(noStart))).toMatchObject({ x: 0, y: 0, w: 256, h: 32, frames: 8 });
	});

	it('a free zone: starts from its corner and runs through its frames', () => {
		// Zone 90×60 from (30, 40) with 3 frames of 30×60, drawn 30 tall.
		const s = { ...guess('C:\\x.png', 300, 200), x: 30, y: 40, w: 90, h: 60, frames: 3, fps: 6 };
		expect(frameSize(s)).toEqual({ width: 30, height: 60 });
		const d = drawing(s, 30);
		expect(d.width).toBe(15);
		expect(d.sheetWidth).toBe(150);
		expect(d.sheetHeight).toBe(100);
		expect(d.x).toBe(-15);
		expect(d.y).toBe(-20);
		expect(d.travel).toBe(45);
		expect(d.duration).toBe(0.5);
		const st = style(s, 'a', 30);
		expect(st).toContain('background-position:-15px -20px');
		expect(st).toContain('--end:-60px');
		expect(st).toContain('animation-name:sprite-0-1-2');
		expect(st).toContain('--step:15px');
	});

	it('the style animates in jumps and keeps pixels crisp', () => {
		const st = style({ ...guess('C:\\x.png', 64, 16), crisp: true }, 'asset://x.png');
		expect(st).toContain('animation-name:sprite-0-1-2-3');
		expect(st).toContain('animation-timing-function:step-end');
		expect(st).toContain('image-rendering:pixelated');
		expect(st).toContain('background-image:url("asset://x.png")');
	});

	it('a Windows path inside url() stays whole', () => {
		// The path is C:\Dati\"strano".png: backslashes and quotes must be protected.
		const st = style(guess('C:\\x.png', 64, 16), 'C:\\Dati\\"strano".png');
		expect(st).toContain(String.raw`url("C:\\Dati\\\"strano\".png")`);
	});

	it('frame order: still between one step and the other', () => {
		const s = { ...guess('C:\\x.png', 96, 32), order: alternateWithFirst(3) };
		expect(s.order).toEqual([1, 0, 2, 0]);
		expect(formatOrder(s)).toBe('2, 1, 3, 1');
		// A round lasts as long as the sequence, not as the frames.
		expect(drawing({ ...s, fps: 8 }).duration).toBe(0.5);
		expect(style(s, 'a')).toContain('animation-name:sprite-1-0-2-0');
		expect(decode(encode(s))!.order).toEqual([1, 0, 2, 0]);
	});

	it('the hand-written order counts from 1 and ignores what does not exist', () => {
		expect(parseOrder('2, 1, 3, 1', 3)).toEqual([1, 0, 2, 0]);
		expect(parseOrder('2 1 9 0 x 3', 3)).toEqual([1, 0, 2]);
		expect(parseOrder('', 3)).toEqual([]);
		expect(pingPong(4)).toEqual([0, 1, 2, 3, 2, 1]);
		// Fewer frames: the order loses the ones gone; empty goes back to a row.
		const s = normalize({ ...guess('C:\\x.png', 96, 32), order: [1, 0, 2, 0], frames: 2 });
		expect(s.order).toEqual([1, 0, 0]);
		const empty = normalize({ ...guess('C:\\x.png', 96, 32), order: [7] });
		expect(empty.order).toBeUndefined();
		expect(sequence(empty)).toEqual([0, 1, 2]);
	});

	it('on the rail: 30 tall by default, or as tall as wanted, with proportional width', () => {
		// 32×32 frames: square.
		const s = guess('C:\\x.png', 96, 32);
		expect(railSize(s)).toEqual({ width: 30, height: 30 });
		const tall = { ...s, railHeight: 90 };
		expect(railSize(tall)).toEqual({ width: 90, height: 90 });
		const d = drawing(tall);
		expect([d.width, d.height, d.sheetWidth, d.sheetHeight, d.travel]).toEqual([90, 90, 270, 90, 270]);
	});

	it('free width: the sprite stretches, and the preview keeps the proportions', () => {
		const s = { ...guess('C:\\x.png', 96, 32), x: 0, y: 0, railHeight: 90, railWidth: 45 };
		const d = drawing(s);
		expect([d.width, d.height]).toEqual([45, 90]);
		// In width each sheet pixel becomes 45/32, in height 90/32.
		expect(d.sheetWidth).toBeCloseTo(135);
		expect(d.sheetHeight).toBeCloseTo(90);
		expect(style(s, 'a')).toContain('--step:45px');
		// Preview 48 tall: same ratio, width half the height.
		const p = drawing(s, 48);
		expect([p.width, p.height]).toEqual([24, 48]);
	});

	it('rail sizes stay within the limits and are saved', () => {
		const s = normalize({ ...guess('C:\\x.png', 96, 32), railHeight: 9999, railWidth: 1.4 });
		expect(s.railHeight).toBe(240);
		expect(s.railWidth).toBe(4);
		expect(decode(encode({ ...guess('a', 96, 32), railHeight: 64 }))).toMatchObject({ railHeight: 64 });
		expect('railWidth' in normalize({ ...guess('a', 96, 32), railWidth: undefined })).toBe(false);
	});

	it('16 frames in a 4×4 grid: left to right, then row by row', () => {
		// 128×128 sheet, 32×32 frames.
		const s = normalize({ ...guess('C:\\x.png', 128, 128), rows: 4, columns: 4, frames: 16 });
		expect(grid(s)).toEqual({ columns: 4, rows: 4 });
		expect(frameSize(s)).toEqual({ width: 32, height: 32 });
		expect(cell(s, 0)).toEqual({ column: 0, row: 0 });
		expect(cell(s, 5)).toEqual({ column: 1, row: 1 });
		expect(cell(s, 15)).toEqual({ column: 3, row: 3 });
		expect(sequence(s)).toHaveLength(16);
		// On the rail: a square frame 30 tall, not a strip of 16.
		expect(railSize(s)).toEqual({ width: 30, height: 30 });
		const d = drawing(s);
		expect([d.sheetWidth, d.sheetHeight]).toEqual([120, 120]);
		const st = style(s, 'a');
		expect(st).toContain('--step:30px');
		expect(st).toContain('--step-y:30px');
		expect(st).toContain('animation-name:sprite-g4-0-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15');
		expect(decode(encode(s))).toEqual(s);
	});

	it('grid with an incomplete last row, and limits', () => {
		const s = normalize({ ...guess('C:\\x.png', 128, 128), rows: 4, columns: 4, frames: 99 });
		expect(s.frames).toBe(16);
		const fifteen = normalize({ ...s, frames: 15 });
		expect(grid(fifteen)).toEqual({ columns: 4, rows: 4 });
		// A single row: columns and rows are not saved, the frames apply.
		const row = normalize({ ...s, rows: 1 });
		expect('rows' in row || 'columns' in row).toBe(false);
		expect(grid({ ...guess('a', 96, 32) })).toEqual({ columns: 3, rows: 1 });
		// Rows without columns: the columns are enough to hold the frames.
		expect(grid(normalize({ ...guess('a', 128, 128), rows: 3, frames: 8 }))).toEqual({ columns: 3, rows: 3 });
	});

	it('gap between frames: the frame does not include it, the step does', () => {
		// 4 frames of 32 with 3 px between each: 4·32 + 3·3 = 137.
		const s = normalize({ ...guess('C:\\x.png', 137, 32), frames: 4, gapX: 3 });
		expect(frameSize(s)).toEqual({ width: 32, height: 32 });
		expect(frameStep(s)).toEqual({ x: 35, y: 32 });
		const st = style(s, 'a');
		// 30 tall: scale 30/32, the step becomes 35 · 0.9375.
		expect(st).toContain('width:30px');
		expect(st).toContain('--step:32.8125px');
		expect(gridBoxes(s).map((r) => r.x)).toEqual([0, 35, 70, 105]);
		// It is saved, and a zero gap is not written.
		expect(decode(encode(s))!.gapX).toBe(3);
		expect('gapX' in normalize({ ...s, gapX: 0 })).toBe(false);
	});

	it('hand-made frames of different sizes: the largest gives the size on the rail', () => {
		// Still 32×32, then the blow with the wave twice as long.
		const s = normalize({
			...guess('C:\\x.png', 96, 32),
			boxes: [
				{ x: 0, y: 0, w: 32, h: 32 },
				{ x: 32, y: 0, w: 64, h: 32 }
			]
		});
		expect(s.frames).toBe(2);
		expect(frameSize(s)).toEqual({ width: 64, height: 32 });
		expect(railSize(s)).toEqual({ width: 60, height: 30 });
		const st = style(s, 'a');
		// It starts from the first, 30 wide; the scale goes to the animation.
		expect(st).toContain('width:30px');
		expect(st).toContain('--sx:0.9375');
		expect(st).toMatch(/animation-name:sprite-r\w+/);
		expect(decode(encode(s))!.boxes).toEqual(s.boxes);
		// Boxes stay inside the sheet; the order only among the ones there are.
		const outside = normalize({ ...s, boxes: [{ x: 90, y: -4, w: 50, h: 99 }], order: [0, 1, 0] });
		expect(outside.boxes).toEqual([{ x: 90, y: 0, w: 6, h: 32 }]);
		expect(outside.order).toEqual([0, 0]);
	});
});

describe('snapping hand-made frames', () => {
	const near = { x: 0, y: 0, w: 32, h: 32 };

	it('moved next to another, it sticks to its edge and lines up at the top', () => {
		// Dropped 3 px away and 2 px lower.
		expect(snapBox({ x: 35, y: 2, w: 32, h: 32 }, [near], 4)).toEqual({ x: 32, y: 0, w: 32, h: 32 });
	});

	it('far away it stays where it is', () => {
		expect(snapBox({ x: 50, y: 10, w: 32, h: 32 }, [near], 4)).toEqual({ x: 50, y: 10, w: 32, h: 32 });
	});

	it('dragging a side snaps only that one', () => {
		const r = snapBox({ x: 35, y: 0, w: 20, h: 30 }, [near], 4, { n: false, s: true, e: false, w: true });
		// The left side goes to the other's right edge, the bottom one to its
		// bottom; the right side, not dragged, stays where it was.
		expect(r).toEqual({ x: 32, y: 0, w: 23, h: 32 });
	});
});
