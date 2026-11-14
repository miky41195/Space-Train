export type ClipboardMode = 'copy' | 'cut';

/**
 * The application's own clipboard.
 *
 * It does not touch the Windows clipboard: pasting into File Explorer or
 * another app will not work. That would need registering the CF_HDROP
 * format through OLE, a project of its own.
 */
export class ClipboardStore {
	paths = $state<string[]>([]);
	mode = $state<ClipboardMode | null>(null);

	get empty(): boolean {
		return this.paths.length === 0 || this.mode === null;
	}

	copy(paths: string[]): void {
		this.#set(paths, 'copy');
	}

	cut(paths: string[]): void {
		this.#set(paths, 'cut');
	}

	clear(): void {
		this.paths = [];
		this.mode = null;
	}

	/** True when the path was cut: the interface shows it faded. */
	isCut(path: string): boolean {
		return this.mode === 'cut' && this.paths.includes(path);
	}

	#set(paths: string[], mode: ClipboardMode): void {
		if (paths.length === 0) {
			this.clear();
			return;
		}
		this.paths = [...paths];
		this.mode = mode;
	}
}
