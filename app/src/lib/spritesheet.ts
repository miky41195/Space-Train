/**
 * Spritesheet: an image with the frames of a character. On the sheet a free
 * rectangular zone is chosen, holding the walking frames in a row or in a
 * grid; on the rail one is shown at a time, sliding the background in
 * jumps: that is how game sprites walk.
 *
 * In a theme's parade a spritesheet is an entry `sprite:<json>`.
 */

export interface Spritesheet {
	/** Path of the image saved in the app's folder. */
	src: string;
	/** Size of the whole image, in pixels. */
	sheetWidth: number;
	sheetHeight: number;
	/** The zone chosen on the sheet, in image pixels. */
	x: number;
	y: number;
	w: number;
	h: number;
	/**
	 * How many frames to use. They count left to right and then row by
	 * row; with a single row the zone splits into as many columns.
	 */
	frames: number;
	/**
	 * Grid inside the zone, only when there is more than one row: then the
	 * columns are given apart and the last row may be incomplete.
	 */
	rows?: number;
	columns?: number;
	/** Empty space between one grid cell and the next, in sheet pixels. */
	gapX?: number;
	gapY?: number;
	/**
	 * Hand-made frames: each is a box of its own, even of different sizes
	 * (a stretching blow, an energy wave). When present, they apply and the
	 * grid does not count.
	 */
	boxes?: FrameBox[];
	/**
	 * In which order to show them, from 0: for a three-frame walk (still,
	 * left foot, right foot) it is `[1, 0, 2, 0]`. Without it, they show in
	 * a row.
	 */
	order?: number[];
	fps: number;
	/** Pixel art: enlarge without blurring. */
	crisp: boolean;
	/** Height of the character on the rail, in pixels; without it, `RAIL_HEIGHT`. */
	railHeight?: number;
	/**
	 * Width of a frame on the rail, in pixels. Without it, it follows the
	 * height keeping the frame's proportions.
	 */
	railWidth?: number;
}

/** A rectangle on the sheet, in image pixels. */
export interface FrameBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** How many hand-made frames at most. */
export const MAX_BOXES = 64;

/** Limits of the sizes on the rail, in pixels. */
export const RAIL_HEIGHT_MIN = 12;
export const RAIL_HEIGHT_MAX = 240;
export const RAIL_WIDTH_MIN = 4;
export const RAIL_WIDTH_MAX = 480;

/** Height at which a character is drawn on the rail. */
export const RAIL_HEIGHT = 30;

export const PREFIX = 'sprite:';

// Spritesheets are saved inside themes with the names earlier versions wrote.
const STORED_KEYS: Record<string, string> = {
	sheetWidth: 'larghezza',
	sheetHeight: 'altezza',
	frames: 'fotogrammi',
	rows: 'righe',
	columns: 'colonne',
	gapX: 'spazioX',
	gapY: 'spazioY',
	boxes: 'riquadri',
	order: 'ordine',
	crisp: 'nitido',
	railHeight: 'alto',
	railWidth: 'largo'
};
const KEYS_FROM_STORED = Object.fromEntries(Object.entries(STORED_KEYS).map(([k, v]) => [v, k]));

export function encode(s: Spritesheet): string {
	const stored: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(s)) stored[STORED_KEYS[k] ?? k] = v;
	return PREFIX + JSON.stringify(stored);
}

/** Themes saved before the free zone described a grid. */
interface Legacy {
	columns?: number;
	rows?: number;
	row?: number;
	start?: number;
}

/** Reads a parade entry; `null` when it is not a valid spritesheet. */
export function decode(item: string): Spritesheet | null {
	if (!item.startsWith(PREFIX)) return null;
	try {
		const stored = JSON.parse(item.slice(PREFIX.length)) as Record<string, unknown>;
		const read: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(stored)) read[KEYS_FROM_STORED[k] ?? k] = v;
		// The old grid's own keys.
		if (stored.riga !== undefined) read.row = stored.riga;
		if (stored.inizio !== undefined) read.start = stored.inizio;
		const s = read as Partial<Spritesheet> & Legacy;
		if (!s.src || !(s.sheetWidth! > 0) || !(s.sheetHeight! > 0)) return null;
		let { x, y, w, h, frames } = s;
		if (w === undefined && s.columns !== undefined) {
			// Old grid: the sequence becomes the equivalent zone.
			const fw = s.sheetWidth! / Math.max(1, s.columns);
			const fh = s.sheetHeight! / Math.max(1, s.rows ?? 1);
			const start = s.start ?? 0;
			frames = frames ?? s.columns - start;
			x = start * fw;
			y = (s.row ?? 0) * fh;
			w = frames * fw;
			h = fh;
		}
		return normalize({
			src: s.src,
			sheetWidth: s.sheetWidth!,
			sheetHeight: s.sheetHeight!,
			x: x ?? 0,
			y: y ?? 0,
			w: w ?? s.sheetWidth!,
			h: h ?? s.sheetHeight!,
			frames: frames ?? 1,
			...(s.w !== undefined ? { rows: s.rows, columns: s.columns, gapX: s.gapX, gapY: s.gapY, boxes: s.boxes } : {}),
			order: s.order,
			fps: s.fps ?? 8,
			crisp: s.crisp ?? true,
			railHeight: s.railHeight,
			railWidth: s.railWidth
		});
	} catch {
		return null;
	}
}

/** A finite number or the fallback value. */
function number(v: unknown, fallback: number): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Brings the zone back inside the image, at whole pixels and at least one
 * pixel large; frames are at least one and no more than the zone's pixels.
 */
export function normalize(s: Spritesheet): Spritesheet {
	const W = s.sheetWidth;
	const H = s.sheetHeight;
	const x = Math.min(Math.max(Math.round(number(s.x, 0)), 0), W - 1);
	const y = Math.min(Math.max(Math.round(number(s.y, 0)), 0), H - 1);
	const w = Math.min(Math.max(Math.round(number(s.w, W)), 1), W - x);
	const h = Math.min(Math.max(Math.round(number(s.h, H)), 1), H - y);
	const rows = Math.min(Math.max(Math.round(number(s.rows, 1)), 1), h);
	const boxes = Array.isArray(s.boxes) ? s.boxes.slice(0, MAX_BOXES).map((r) => inside(r, W, H)) : [];
	const wanted = Math.max(Math.round(number(s.frames, 1)), 1);
	const columns = rows > 1 ? Math.min(Math.max(Math.round(number(s.columns, Math.ceil(wanted / rows))), 1), w) : 0;
	const frames = boxes.length > 0 ? boxes.length : Math.min(wanted, rows > 1 ? columns * rows : w);
	const gapX = measure(s.gapX, 0, w);
	const gapY = measure(s.gapY, 0, h);
	// Only the frames that still exist stay; an empty order is no use.
	const order = Array.isArray(s.order) ? s.order.filter((k) => Number.isInteger(k) && k >= 0 && k < frames).slice(0, 64) : [];
	const railHeight = measure(s.railHeight, RAIL_HEIGHT_MIN, RAIL_HEIGHT_MAX);
	const railWidth = measure(s.railWidth, RAIL_WIDTH_MIN, RAIL_WIDTH_MAX);
	const { order: _o, railHeight: _a, railWidth: _l, rows: _r, columns: _c, gapX: _sx, gapY: _sy, boxes: _q, ...rest } = s;
	return {
		...rest,
		...(rows > 1 ? { rows, columns } : {}),
		...(gapX ? { gapX } : {}),
		...(gapY ? { gapY } : {}),
		...(boxes.length > 0 ? { boxes } : {}),
		...(railHeight !== undefined ? { railHeight } : {}),
		...(railWidth !== undefined ? { railWidth } : {}),
		x,
		y,
		w,
		h,
		frames,
		...(order.length > 0 ? { order } : {}),
		fps: Math.min(Math.max(number(s.fps, 8), 1), 30)
	};
}

/** A box at whole pixels, at least one pixel large, inside the image. */
function inside(r: Partial<FrameBox>, W: number, H: number): FrameBox {
	const x = Math.min(Math.max(Math.round(number(r.x, 0)), 0), W - 1);
	const y = Math.min(Math.max(Math.round(number(r.y, 0)), 0), H - 1);
	return {
		x,
		y,
		w: Math.min(Math.max(Math.round(number(r.w, 1)), 1), W - x),
		h: Math.min(Math.max(Math.round(number(r.h, 1)), 1), H - y)
	};
}

/**
 * The grid cells as boxes: the starting point for hand-made frames, to
 * touch up one by one.
 */
export function gridBoxes(s: Spritesheet): FrameBox[] {
	const side = frameSize(s);
	const step = frameStep(s);
	return Array.from({ length: Math.min(s.frames, MAX_BOXES) }, (_, k) => {
		const c = cell(s, k);
		return inside({ x: s.x + c.column * step.x, y: s.y + c.row * step.y, w: side.width, h: side.height }, s.sheetWidth, s.sheetHeight);
	});
}

/** A size in whole pixels within the limits; `undefined` when missing. */
function measure(v: unknown, min: number, max: number): number | undefined {
	if (v === undefined || v === null) return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : undefined;
}

/** Columns and rows the zone is split into. */
export function grid(s: Spritesheet): { columns: number; rows: number } {
	const rows = s.rows ?? 1;
	return rows > 1 ? { columns: s.columns ?? Math.ceil(s.frames / rows), rows } : { columns: s.frames, rows: 1 };
}

/** Column and row of frame `k`, from 0. */
export function cell(s: Spritesheet, k: number): { column: number; row: number } {
	const { columns } = grid(s);
	return { column: k % columns, row: Math.floor(k / columns) };
}

/** How large a frame is on the rail, in pixels. */
export function railSize(s: Spritesheet): { width: number; height: number } {
	const height = s.railHeight ?? RAIL_HEIGHT;
	const side = frameSize(s);
	return { width: s.railWidth ?? (side.width / side.height) * height, height };
}

/** The frames in the order they show, from 0. */
export function sequence(s: Spritesheet): number[] {
	return s.order?.length ? s.order : Array.from({ length: s.frames }, (_, k) => k);
}

/**
 * The order written by the user, counting from 1: "2, 1, 3, 1" or "2 1 3 1".
 * Numbers outside the frames and words are ignored.
 */
export function parseOrder(text: string, frames: number): number[] {
	return (text.match(/\d+/g) ?? []).map((t) => Number(t) - 1).filter((k) => k >= 0 && k < frames);
}

export function formatOrder(s: Spritesheet): string {
	return sequence(s)
		.map((k) => k + 1)
		.join(', ');
}

/** The classic step: the first frame (still) between each of the others. */
export function alternateWithFirst(frames: number): number[] {
	return Array.from({ length: frames - 1 }, (_, k) => [k + 1, 0]).flat();
}

/** Forward to the last and back, without repeating the ends. */
export function pingPong(frames: number): number[] {
	const forward = Array.from({ length: frames }, (_, k) => k);
	return [...forward, ...forward.slice(1, -1).reverse()];
}

/**
 * The animation name for a sequence. CSS cannot show frames in any order
 * with `steps()`: each sequence has its own keyframes, one per frame, added
 * to the page the first time they are needed. Sizes come from the element's
 * variables, so the same animation works on the rail and in the preview.
 */
export function animation(seq: number[], columns = Infinity): string {
	// In a grid the same number is another cell: columns go into the name.
	const name = Number.isFinite(columns) ? `sprite-g${columns}-${seq.join('-')}` : `sprite-${seq.join('-')}`;
	if (typeof document === 'undefined' || registered.has(name)) return name;
	registered.add(name);
	const step = (k: number) =>
		Number.isFinite(columns)
			? `background-position:calc(var(--x) - var(--step) * ${k % columns}) calc(var(--y) - var(--step-y) * ${Math.floor(k / columns)})`
			: `background-position:calc(var(--x) - var(--step) * ${k}) var(--y)`;
	const stops = seq.map((k, i) => `${((i / seq.length) * 100).toFixed(4)}%{${step(k)}}`);
	const el = document.createElement('style');
	el.dataset.sprite = name;
	el.textContent = `@keyframes ${name}{${stops.join('')}100%{${step(seq[seq.length - 1])}}}`;
	document.head.appendChild(el);
	return name;
}
const registered = new Set<string>();

/**
 * The animation of hand-made frames: each stop says where the box is on
 * the sheet and how large, multiplied by the element's scale (`--sx`,
 * `--sy`), so the same animation serves preview and rail.
 */
export function boxAnimation(boxes: FrameBox[], seq: number[]): string {
	const text = JSON.stringify([boxes.map((r) => [r.x, r.y, r.w, r.h]), seq]);
	let h = 5381;
	for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
	const name = `sprite-r${h.toString(36)}`;
	if (typeof document === 'undefined' || registered.has(name)) return name;
	registered.add(name);
	const stop = (k: number) => {
		const r = boxes[k];
		return (
			`background-position:calc(var(--sx) * ${-r.x}px) calc(var(--sy) * ${-r.y}px);` +
			`width:calc(var(--sx) * ${r.w}px);height:calc(var(--sy) * ${r.h}px)`
		);
	};
	const stops = seq.map((k, i) => `${((i / seq.length) * 100).toFixed(4)}%{${stop(k)}}`);
	const el = document.createElement('style');
	el.dataset.sprite = name;
	el.textContent = `@keyframes ${name}{${stops.join('')}100%{${stop(seq[seq.length - 1])}}}`;
	document.head.appendChild(el);
	return name;
}

/**
 * First guess for an image just loaded. A horizontal strip with square
 * frames is the most common case: the squares are counted. Otherwise it
 * starts from a single frame and the user corrects it.
 */
export function guess(src: string, sheetWidth: number, sheetHeight: number): Spritesheet {
	const squares = Math.round(sheetWidth / sheetHeight);
	const strip = sheetWidth > sheetHeight && Math.abs(sheetWidth / sheetHeight - squares) < 0.05;
	return {
		src,
		sheetWidth,
		sheetHeight,
		x: 0,
		y: 0,
		w: sheetWidth,
		h: sheetHeight,
		frames: strip ? squares : 1,
		fps: 8,
		crisp: true
	};
}

/**
 * Side of a frame in pixels of the original image: in the grid without the
 * gaps between cells; with hand-made frames, the largest.
 */
export function frameSize(s: Spritesheet): { width: number; height: number } {
	if (s.boxes?.length) {
		return {
			width: Math.max(...s.boxes.map((r) => r.w)),
			height: Math.max(...s.boxes.map((r) => r.h))
		};
	}
	const { columns, rows } = grid(s);
	const gx = s.gapX ?? 0;
	const gy = s.gapY ?? 0;
	return {
		width: Math.max(1, (s.w - (columns - 1) * gx) / columns),
		height: Math.max(1, (s.h - (rows - 1) * gy) / rows)
	};
}

/** How far the sheet moves from one cell to the next: side plus gap. */
export function frameStep(s: Spritesheet): { x: number; y: number } {
	const side = frameSize(s);
	return { x: side.width + (s.gapX ?? 0), y: side.height + (s.gapY ?? 0) };
}

/** A new zone on the sheet, brought back inside the image. */
export function withZone(s: Spritesheet, x: number, y: number, w: number, h: number): Spritesheet {
	return normalize({ ...s, x, y, w, h });
}

export interface Drawing {
	/** Size of the frame on screen. */
	width: number;
	height: number;
	/** Size of the whole image on screen, for `background-size`. */
	sheetWidth: number;
	sheetHeight: number;
	/** Background offset to show the first frame. */
	x: number;
	y: number;
	/** How far the background slides in one animation round. */
	travel: number;
	/** How far the background slides from one cell to the next, gap included. */
	stepX: number;
	stepY: number;
	/** Screen pixels for each sheet pixel. */
	scaleX: number;
	scaleY: number;
	/** Duration of one round, in seconds. */
	duration: number;
	steps: number;
}

/**
 * Sizes to draw the spritesheet: as it is on the rail, or small at height
 * `height` (the preview) with the same proportions. Width and height can
 * scale differently: the sprite stretches.
 */
export function drawing(s: Spritesheet, height?: number): Drawing {
	const rail = railSize(s);
	const factor = height === undefined ? 1 : height / rail.height;
	const width = rail.width * factor;
	const h = rail.height * factor;
	const side = frameSize(s);
	const scaleX = width / side.width;
	const scaleY = h / side.height;
	return {
		width,
		height: h,
		sheetWidth: s.sheetWidth * scaleX,
		sheetHeight: s.sheetHeight * scaleY,
		x: -s.x * scaleX,
		y: -s.y * scaleY,
		travel: s.w * scaleX,
		stepX: frameStep(s).x * scaleX,
		stepY: frameStep(s).y * scaleY,
		scaleX,
		scaleY,
		duration: sequence(s).length / s.fps,
		steps: sequence(s).length
	};
}

/** The inline style for the element that shows the sprite. */
export function style(s: Spritesheet, src: string, height?: number): string {
	const d = drawing(s, height);
	// Inside url("…") backslashes and quotes are special CSS characters: an
	// unprotected Windows path would become a broken address.
	const safe = src.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	if (s.boxes?.length) {
		// Hand-made frames: each step also changes width and height.
		const seq = sequence(s);
		const first = s.boxes[seq[0]];
		return [
			`width:${first.w * d.scaleX}px`,
			`height:${first.h * d.scaleY}px`,
			`background-image:url("${safe}")`,
			`background-size:${d.sheetWidth}px ${d.sheetHeight}px`,
			`background-position:${-first.x * d.scaleX}px ${-first.y * d.scaleY}px`,
			`--sx:${d.scaleX}`,
			`--sy:${d.scaleY}`,
			`animation-name:${boxAnimation(s.boxes, seq)}`,
			`animation-duration:${d.duration}s`,
			`animation-timing-function:step-end`,
			`image-rendering:${s.crisp ? 'pixelated' : 'auto'}`
		].join(';');
	}
	return [
		`width:${d.width}px`,
		`height:${d.height}px`,
		`background-image:url("${safe}")`,
		`background-size:${d.sheetWidth}px ${d.sheetHeight}px`,
		`background-position:${d.x}px ${d.y}px`,
		`--x:${d.x}px`,
		`--end:${d.x - d.travel}px`,
		`--y:${d.y}px`,
		`--step:${d.stepX}px`,
		`--step-y:${d.stepY}px`,
		`animation-name:${animation(sequence(s), (s.rows ?? 1) > 1 ? grid(s).columns : Infinity)}`,
		`animation-duration:${d.duration}s`,
		// Each frame stays still until the next, without sliding.
		`animation-timing-function:step-end`,
		`image-rendering:${s.crisp ? 'pixelated' : 'auto'}`
	].join(';');
}

/** The sides being dragged on a box. */
export interface DraggedSides {
	n: boolean;
	s: boolean;
	e: boolean;
	w: boolean;
}

/** The smallest offset, within `threshold`, that brings a value onto one of the targets. */
function smallestOffset(values: number[], targets: number[], threshold: number): number {
	let best = 0;
	let distance = threshold + 1;
	for (const v of values) {
		for (const b of targets) {
			const d = b - v;
			if (Math.abs(d) <= threshold && Math.abs(d) < distance) {
				best = d;
				distance = Math.abs(d);
			}
		}
	}
	return distance <= threshold ? best : 0;
}

/**
 * Snaps a hand-made frame to the edges of the others when it passes near
 * them, like the magnetic guides of drawing programs: put in a row, frames
 * stay aligned to the pixel.
 *
 * Moving, the whole box slides so one of its sides touches or lines up
 * with a nearby side; dragging sides, only the dragged side snaps.
 * `threshold` is in sheet pixels.
 */
export function snapBox(r: FrameBox, others: FrameBox[], threshold: number, sides?: DraggedSides): FrameBox {
	const xs = others.flatMap((a) => [a.x, a.x + a.w]);
	const ys = others.flatMap((a) => [a.y, a.y + a.h]);
	if (!sides) {
		const dx = smallestOffset([r.x, r.x + r.w], xs, threshold);
		const dy = smallestOffset([r.y, r.y + r.h], ys, threshold);
		return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
	}
	let left = r.x;
	let right = r.x + r.w;
	let top = r.y;
	let bottom = r.y + r.h;
	if (sides.w) left += smallestOffset([left], xs, threshold);
	if (sides.e) right += smallestOffset([right], xs, threshold);
	if (sides.n) top += smallestOffset([top], ys, threshold);
	if (sides.s) bottom += smallestOffset([bottom], ys, threshold);
	// Snapping must never flip or cancel the box.
	if (right - left < 1 || bottom - top < 1) return r;
	return { x: left, y: top, w: right - left, h: bottom - top };
}
