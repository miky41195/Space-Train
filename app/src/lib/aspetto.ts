import { convertFileSrc } from '@tauri-apps/api/core';
import { FIGURE, svgFigura } from './figure';
import { decodifica, misuraBinario, stile } from './spritesheet';

/** How a corteo entry is drawn: a built-in figure, a user image or a spritesheet. */
export type Aspetto =
	| { tipo: 'immagine'; src: string }
	| { tipo: 'sprite'; stile: string; alto: number }
	| { tipo: 'figura'; svg: string };

/** `voce` without its movement: figure id, `img:<path>` or `sprite:<json>`. Unknown = null. */
export function aspettoDi(voce: string): Aspetto | null {
	if (voce.startsWith('img:')) return { tipo: 'immagine', src: convertFileSrc(voce.slice(4)) };
	const foglio = decodifica(voce);
	if (foglio) return { tipo: 'sprite', stile: stile(foglio, convertFileSrc(foglio.src)), alto: misuraBinario(foglio).altezza };
	return FIGURE[voce] ? { tipo: 'figura', svg: svgFigura(FIGURE[voce]) } : null;
}
