import { describe, it, expect } from 'vitest';
import { backgroundColor, pixelColor, removeBackground, toHex, fromHex, type Pixel } from './transparency';

/**
 * Image from a grid of letters: `.` white background, `r` red, `w` white
 * inside the character, `q` almost white, `_` transparent.
 */
function image(rows: string[]): Pixel {
	const colors: Record<string, number[]> = {
		'.': [255, 255, 255, 255],
		w: [255, 255, 255, 255],
		r: [200, 30, 30, 255],
		q: [240, 245, 250, 255],
		_: [0, 0, 0, 0]
	};
	const width = rows[0].length;
	const data = new Uint8ClampedArray(rows.flatMap((r) => [...r].flatMap((c) => colors[c])));
	return { data, width, height: rows.length };
}

const transparent = (img: Pixel) =>
	Array.from({ length: img.height }, (_, y) =>
		Array.from({ length: img.width }, (_, x) => (img.data[(y * img.width + x) * 4 + 3] === 0 ? '_' : '#')).join('')
	);

describe('removing the background', () => {
	it('the background colour is read from the corners, even when the character touches one', () => {
		expect(backgroundColor(image(['r..', '...', '...']))).toEqual([255, 255, 255]);
		expect(backgroundColor(image(['_r_', '___']))).toBeNull();
	});

	it('the whole background becomes transparent, the character stays', () => {
		const img = image(['.....', '.rrr.', '.rwr.', '.rrr.', '.....']);
		const removed = removeBackground(img, { color: [255, 255, 255], tolerance: 0, edgesOnly: false });
		// The white closed inside the character too: same colour.
		expect(removed).toBe(17);
		expect(transparent(img)).toEqual(['_____', '_###_', '_#_#_', '_###_', '_____']);
	});

	it('only the background touching the edges: the white inside the character stays', () => {
		const img = image(['.....', '.rrr.', '.rwr.', '.rrr.', '.....']);
		expect(removeBackground(img, { color: [255, 255, 255], tolerance: 0, edgesOnly: true })).toBe(16);
		expect(transparent(img)).toEqual(['_____', '_###_', '_###_', '_###_', '_____']);
	});

	it('tolerance also takes nearby colours, like blurred edges', () => {
		const narrow = image(['.q.', 'qrq']);
		removeBackground(narrow, { color: [255, 255, 255], tolerance: 4, edgesOnly: false });
		expect(transparent(narrow)).toEqual(['_#_', '###']);
		const wide = image(['.q.', 'qrq']);
		removeBackground(wide, { color: [255, 255, 255], tolerance: 16, edgesOnly: false });
		expect(transparent(wide)).toEqual(['___', '_#_']);
	});

	it('pixels already transparent are not counted', () => {
		const img = image(['_._']);
		expect(removeBackground(img, { color: [0, 0, 0], tolerance: 255, edgesOnly: true })).toBe(1);
	});

	it('colours to and from #rrggbb, and the colour of a pixel', () => {
		expect(toHex([255, 16, 0])).toBe('#ff1000');
		expect(fromHex('#ff1000')).toEqual([255, 16, 0]);
		expect(pixelColor(image(['.r']), 1.7, 0.2)).toEqual([200, 30, 30]);
	});
});
