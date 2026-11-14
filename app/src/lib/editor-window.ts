/**
 * The theme editor in a window of its own.
 *
 * The editor window does not touch the settings: it tells the window that
 * opened it what happens (preview, save, delete) and that one does the
 * rest, as when the editor lived inside it. It closes by itself; Rust
 * announces the closing, so it arrives with Alt+F4 too.
 */
import type { PersonalTheme } from './themes';

/** Name of the event, the same as the window label in Rust. */
export const EDITOR_EVENT = 'theme-editor';

export type EditorMessage =
	| { kind: 'preview'; theme: PersonalTheme }
	| { kind: 'save'; theme: PersonalTheme }
	| { kind: 'delete'; id: string }
	| { kind: 'close' };

/** The window to notify, if this page is the theme editor. */
export function windowToNotify(): string | null {
	const from = (window as unknown as { __SPACE_TRAIN_EDITOR?: unknown }).__SPACE_TRAIN_EDITOR;
	return typeof from === 'string' && from ? from : null;
}
