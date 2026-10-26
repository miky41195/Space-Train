import { describe, it, expect } from 'vitest';
import { coloreSfondo, colorePixel, togliSfondo, esadecimale, daEsadecimale, type Pixel } from './trasparenza';

/**
 * Immagine da una griglia di lettere: `.` sfondo bianco, `r` rosso,
 * `w` bianco dentro il personaggio, `q` quasi bianco, `_` trasparente.
 */
function immagine(righe: string[]): Pixel {
	const colori: Record<string, number[]> = {
		'.': [255, 255, 255, 255],
		w: [255, 255, 255, 255],
		r: [200, 30, 30, 255],
		q: [240, 245, 250, 255],
		_: [0, 0, 0, 0]
	};
	const width = righe[0].length;
	const data = new Uint8ClampedArray(righe.flatMap((r) => [...r].flatMap((c) => colori[c])));
	return { data, width, height: righe.length };
}

const trasparenti = (img: Pixel) =>
	Array.from({ length: img.height }, (_, y) =>
		Array.from({ length: img.width }, (_, x) => (img.data[(y * img.width + x) * 4 + 3] === 0 ? '_' : '#')).join('')
	);

describe('togliere lo sfondo', () => {
	it('il colore dello sfondo si legge dagli angoli, anche se il personaggio ne tocca uno', () => {
		expect(coloreSfondo(immagine(['r..', '...', '...']))).toEqual([255, 255, 255]);
		expect(coloreSfondo(immagine(['_r_', '___']))).toBeNull();
	});

	it('tutto lo sfondo diventa trasparente, il personaggio resta', () => {
		const img = immagine(['.....', '.rrr.', '.rwr.', '.rrr.', '.....']);
		const tolti = togliSfondo(img, { colore: [255, 255, 255], tolleranza: 0, soloBordi: false });
		// Anche il bianco chiuso dentro il personaggio: stesso colore.
		expect(tolti).toBe(17);
		expect(trasparenti(img)).toEqual(['_____', '_###_', '_#_#_', '_###_', '_____']);
	});

	it('solo lo sfondo che tocca i bordi: il bianco dentro il personaggio resta', () => {
		const img = immagine(['.....', '.rrr.', '.rwr.', '.rrr.', '.....']);
		expect(togliSfondo(img, { colore: [255, 255, 255], tolleranza: 0, soloBordi: true })).toBe(16);
		expect(trasparenti(img)).toEqual(['_____', '_###_', '_###_', '_###_', '_____']);
	});

	it('la tolleranza prende anche i colori vicini, come i bordi sfumati', () => {
		const stretta = immagine(['.q.', 'qrq']);
		togliSfondo(stretta, { colore: [255, 255, 255], tolleranza: 4, soloBordi: false });
		expect(trasparenti(stretta)).toEqual(['_#_', '###']);
		const larga = immagine(['.q.', 'qrq']);
		togliSfondo(larga, { colore: [255, 255, 255], tolleranza: 16, soloBordi: false });
		expect(trasparenti(larga)).toEqual(['___', '_#_']);
	});

	it('i pixel già trasparenti non si contano', () => {
		const img = immagine(['_._']);
		expect(togliSfondo(img, { colore: [0, 0, 0], tolleranza: 255, soloBordi: true })).toBe(1);
	});

	it('colori da e verso #rrggbb, e il colore di un pixel', () => {
		expect(esadecimale([255, 16, 0])).toBe('#ff1000');
		expect(daEsadecimale('#ff1000')).toEqual([255, 16, 0]);
		expect(colorePixel(immagine(['.r']), 1.7, 0.2)).toEqual([200, 30, 30]);
	});
});
