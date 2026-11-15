import { t } from './i18n';
import { fuzzyMatch } from './fuzzy';

export type CommandKind = 'action' | 'folder' | 'search' | 'theme' | 'setting';

export const KIND_LABELS: Record<CommandKind, string> = {
	action: 'Azione',
	folder: t('Cartella'),
	search: t('Ricerca'),
	theme: t('Tema'),
	setting: t('Impostaz.')
};

/** One line of the command palette. */
export interface Command {
	kind: CommandKind;
	name: string;
	/** Second, dimmer text: a path, the current state of a setting. */
	detail?: string;
	/** The shortcut that does the same, shown at the right. */
	keys?: string;
	run: () => void;
}

export interface PaletteMatch {
	command: Command;
	/** Characters of `name` to highlight. */
	positions: number[];
}

/**
 * The commands matching `text`, best first; with no text, the first ones
 * in the order given (actions first). Ties keep the given order.
 */
export function filterCommands(commands: Command[], text: string, max = 12): PaletteMatch[] {
	const q = text.trim();
	if (q === '') return commands.slice(0, max).map((command) => ({ command, positions: [] }));
	return commands
		.map((command, i) => ({ command, i, m: fuzzyMatch(q, command.name) }))
		.filter((x) => x.m !== null)
		.sort((a, b) => b.m!.score - a.m!.score || a.i - b.i)
		.slice(0, max)
		.map((x) => ({ command: x.command, positions: x.m!.positions }));
}
