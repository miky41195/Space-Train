import { t } from '../i18n';
import type { Backend } from '../ipc';
import { nameOf } from '../locations';

/**
 * Operations that Ctrl+Z can undo.
 *
 * Each carries what it takes to undo it: the actual arrival paths, not the
 * expected ones, because a conflict may have numbered them.
 */
export type Operation =
	| { kind: 'rename'; from: string; to: string }
	/** Every single rename of a batch, temporary names included, in the order run. */
	| { kind: 'batchRename'; steps: Array<[string, string]> }
	| { kind: 'move'; pairs: Array<[string, string]> }
	/** Items the operation created: copies, new folders, archives. */
	| { kind: 'create'; paths: string[]; description: string }
	| { kind: 'trash'; originals: string[] }
	/** Images turned a quarter: undone by turning them back. */
	| { kind: 'rotate'; paths: string[]; clockwise: boolean };

const MAX = 50;

export class UndoStore {
	stack = $state<Operation[]>([]);

	constructor(private backend: Backend) {}

	get empty(): boolean {
		return this.stack.length === 0;
	}

	record(op: Operation): void {
		// An operation that touched nothing does not go on the stack: undoing
		// it would seem to do nothing, and the user would press again.
		if (op.kind === 'move' && op.pairs.length === 0) return;
		if (op.kind === 'create' && op.paths.length === 0) return;
		// Servers have no Recycle Bin: undoing a creation there would delete for good.
		if (op.kind === 'create' && op.paths.some((p) => p.startsWith('::server'))) return;
		if (op.kind === 'trash' && op.originals.length === 0) return;
		if (op.kind === 'batchRename' && op.steps.length === 0) return;
		if (op.kind === 'rotate' && op.paths.length === 0) return;

		this.stack = [...this.stack, op].slice(-MAX);
	}

	/** What the next Ctrl+Z would undo, for the notice. */
	next(): string | null {
		const op = this.stack[this.stack.length - 1];
		return op ? describeOperation(op) : null;
	}

	/**
	 * Undoes the last operation. Returns the description of what was
	 * undone, or `null` when there was nothing.
	 *
	 * If it fails the operation stays off the stack: trying again would give
	 * the same error, and repeating it forever blocks the earlier ones.
	 */
	async undo(): Promise<string | null> {
		const op = this.stack[this.stack.length - 1];
		if (!op) return null;
		this.stack = this.stack.slice(0, -1);

		switch (op.kind) {
			case 'rename':
				await this.backend.renameEntry(op.to, nameOf(op.from));
				break;
			case 'batchRename':
				for (const [from, to] of [...op.steps].reverse()) await this.backend.renameEntry(to, nameOf(from));
				break;
			case 'create':
				// To the Recycle Bin, not deleted: undo must never be able to
				// destroy anything, not even what the app has just created.
				await this.backend.moveToTrash(op.paths);
				break;
			case 'trash':
				await this.backend.trashRestoreOriginals(op.originals);
				break;
			case 'rotate':
				await this.backend.imageRotate(op.paths, !op.clockwise);
				break;
			case 'move':
				for (const [source, arrival] of [...op.pairs].reverse()) {
					const parent = await this.backend.navigate(source, 'up');
					const outcome = await this.backend.transfer({
						opId: 0,
						sources: [arrival],
						dest: parent,
						mode: 'move',
						policy: 'skip',
						onProgress: () => {}
					});
					if (outcome.skipped > 0) {
						throw { kind: 'io', message: t('«{0}» esiste già nella posizione originale.', [nameOf(source)]) };
					}
					// With a conflict the item had arrived numbered: going
					// home it takes its own name back.
					const back = outcome.pairs[0]?.[1];
					if (back && nameOf(back) !== nameOf(source)) {
						await this.backend.renameEntry(back, nameOf(source));
					}
				}
				break;
		}
		return describeOperation(op);
	}
}

export function describeOperation(op: Operation): string {
	const items = (n: number) => (n === 1 ? t('1 elemento') : t('{0} elementi', [n]));
	switch (op.kind) {
		case 'rename':
			return t('rinomina di «{0}»', [nameOf(op.to)]);
		case 'batchRename':
			return t('rinomina di {0}', [items(new Set(op.steps.map(([from]) => from)).size)]);
		case 'move':
			return t('spostamento di {0}', [items(op.pairs.length)]);
		case 'create':
			return op.description;
		case 'trash':
			return t('eliminazione di {0}', [items(op.originals.length)]);
		case 'rotate':
			return t('rotazione di {0}', [op.paths.length === 1 ? t('«{0}»', [nameOf(op.paths[0])]) : items(op.paths.length)]);
	}
}
