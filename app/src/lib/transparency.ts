/**
 * Removing the background from a spritesheet: pixels of the background
 * colour become transparent. It works on an image's RGBA bytes, without DOM.
 */

export interface Pixel {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export type Color = [number, number, number];

export interface BackgroundOptions {
	color: Color;
	/** How far each channel may stray from the background colour, 0–255. */
	tolerance: number;
	/**
	 * Only the background connected to the image's edges: pixels of the same
	 * colour closed inside the character (white eyes on a white background)
	 * stay.
	 */
	edgesOnly: boolean;
}

export function pixelColor(img: Pixel, x: number, y: number): Color {
	const i = (Math.floor(y) * img.width + Math.floor(x)) * 4;
	return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/**
 * The background colour, read from the four corners: the one that repeats
 * most wins (a character can touch one corner, not all). `null` when the
 * corners are already transparent.
 */
export function backgroundColor(img: Pixel): Color | null {
	const { width: w, height: h } = img;
	const corners = [
		[0, 0],
		[w - 1, 0],
		[0, h - 1],
		[w - 1, h - 1]
	].filter(([x, y]) => img.data[(y * w + x) * 4 + 3] > 0);
	if (corners.length === 0) return null;
	const count = new Map<string, number>();
	for (const [x, y] of corners) {
		const k = pixelColor(img, x, y).join(',');
		count.set(k, (count.get(k) ?? 0) + 1);
	}
	const [best] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
	return best.split(',').map(Number) as Color;
}

/** Makes the background transparent, in place. Returns how many pixels it removed. */
export function removeBackground(img: Pixel, { color, tolerance, edgesOnly }: BackgroundOptions): number {
	const { data, width: w, height: h } = img;
	const [r, g, b] = color;
	const similar = (p: number) =>
		data[p * 4 + 3] > 0 &&
		Math.abs(data[p * 4] - r) <= tolerance &&
		Math.abs(data[p * 4 + 1] - g) <= tolerance &&
		Math.abs(data[p * 4 + 2] - b) <= tolerance;
	let removed = 0;
	const remove = (p: number) => {
		data[p * 4 + 3] = 0;
		removed++;
	};

	if (!edgesOnly) {
		for (let p = 0; p < w * h; p++) if (similar(p)) remove(p);
		return removed;
	}

	// Flood fill from the edges: it spreads only between neighbouring pixels of the same colour.
	const seen = new Uint8Array(w * h);
	const queue: number[] = [];
	const visit = (p: number) => {
		if (!seen[p] && similar(p)) {
			seen[p] = 1;
			queue.push(p);
		}
	};
	for (let x = 0; x < w; x++) {
		visit(x);
		visit((h - 1) * w + x);
	}
	for (let y = 0; y < h; y++) {
		visit(y * w);
		visit(y * w + w - 1);
	}
	while (queue.length > 0) {
		const p = queue.pop()!;
		remove(p);
		const x = p % w;
		if (x > 0) visit(p - 1);
		if (x < w - 1) visit(p + 1);
		if (p >= w) visit(p - w);
		if (p < w * (h - 1)) visit(p + w);
	}
	return removed;
}

/** `#rrggbb` for the colour picker. */
export function toHex([r, g, b]: Color): string {
	return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Color {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
