import { describe, it, expect } from 'vitest';
import { filterCommands, type Command } from './palette';

const c = (kind: Command['kind'], name: string): Command => ({ kind, name, run: () => {} });
const commands = [c('action', 'Copia'), c('action', 'Doppio pannello'), c('folder', 'Download'), c('setting', 'Clic doppio per aprire')];

describe('command palette', () => {
	it('with no text lists the first commands in order', () => {
		expect(filterCommands(commands, '', 2).map((t) => t.command.name)).toEqual(['Copia', 'Doppio pannello']);
	});

	it('finds by fuzzy match, best first, with the letters to highlight', () => {
		const t = filterCommands(commands, 'dopp');
		expect(t[0].command.name).toBe('Doppio pannello');
		expect(t[0].positions).toEqual([0, 1, 2, 3]);
		expect(filterCommands(commands, 'zzz')).toEqual([]);
	});
});
