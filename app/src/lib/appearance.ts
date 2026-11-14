import { convertFileSrc } from '@tauri-apps/api/core';
import { FIGURES, figureSvg } from './figures';
import { decode, railSize, style } from './spritesheet';

/** How a parade entry is drawn: a built-in figure, a user image or a spritesheet. */
export type Appearance =
	| { kind: 'image'; src: string }
	| { kind: 'sprite'; style: string; height: number }
	| { kind: 'figure'; svg: string };

/** `item` without its motion: figure id, `img:<path>` or `sprite:<json>`. Unknown = null. */
export function appearanceOf(item: string): Appearance | null {
	if (item.startsWith('img:')) return { kind: 'image', src: convertFileSrc(item.slice(4)) };
	const sheet = decode(item);
	if (sheet) return { kind: 'sprite', style: style(sheet, convertFileSrc(sheet.src)), height: railSize(sheet).height };
	return FIGURES[item] ? { kind: 'figure', svg: figureSvg(FIGURES[item]) } : null;
}
