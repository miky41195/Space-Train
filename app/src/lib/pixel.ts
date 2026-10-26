/**
 * Da PNG in base64 ai pixel e ritorno, col canvas della WebView. Separato
 * da `trasparenza.ts` perché ha bisogno del browser: nei test si sostituisce.
 */
import type { Pixel } from './trasparenza';

export async function leggiPixel(base64: string): Promise<Pixel> {
	const byte = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	const bitmap = await createImageBitmap(new Blob([byte]));
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function scriviPng(img: Pixel): Promise<string> {
	const canvas = document.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	canvas.getContext('2d')!.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
	const blob = await new Promise<Blob>((ok, ko) =>
		canvas.toBlob((b) => (b ? ok(b) : ko(new Error('PNG non creato'))), 'image/png')
	);
	const byte = new Uint8Array(await blob.arrayBuffer());
	let testo = '';
	for (let i = 0; i < byte.length; i += 0x8000) testo += String.fromCharCode(...byte.subarray(i, i + 0x8000));
	return btoa(testo);
}
