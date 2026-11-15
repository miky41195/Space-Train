import { t } from './i18n';
/**
 * From base64 PNG to pixels and back, with the WebView's canvas. Apart from
 * `transparency.ts` because it needs the browser: tests replace it.
 */
import type { Pixel } from './transparency';

export async function readPixels(base64: string): Promise<Pixel> {
	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	const bitmap = await createImageBitmap(new Blob([bytes]));
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function writePng(img: Pixel): Promise<string> {
	const canvas = document.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	canvas.getContext('2d')!.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
	const blob = await new Promise<Blob>((ok, ko) =>
		canvas.toBlob((b) => (b ? ok(b) : ko(new Error(t('PNG non creato')))), 'image/png')
	);
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let text = '';
	for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(text);
}
