import { describe, it, expect } from 'vitest';
import { alignPlan, compareZones } from './confronto';
import type { Entry } from './ipc';

function e(path: string, modified = 0): Entry {
	return { name: path.split('\\').pop()!, path, kind: 'file', size: 1, modified, hidden: false };
}

const c = {
	altro: 'E:\\Backup',
	contenuto: false,
	inCorso: false,
	onlyHere: 2,
	onlyThere: 1,
	different: [
		{ here: e('C:\\Foto\\a.txt'), there: e('E:\\Backup\\a.txt'), newerHere: true },
		{ here: e('C:\\Foto\\sub\\b.txt'), there: e('E:\\Backup\\sub\\b.txt'), newerHere: false }
	]
};
const risultati = [
	e('C:\\Foto\\nuova.jpg'),
	e('C:\\Foto\\sub\\deep'),
	c.different[0].here,
	c.different[1].here,
	e('E:\\Backup\\vecchia.png')
];

describe('folder comparison', () => {
	it('names the zones after the other folder and drops empty ones', () => {
		expect(compareZones(c).map((z) => [z.etichetta, z.quante])).toEqual([
			['Mancano in Backup', 2],
			['Diversi', 2],
			['Mancano qui', 1]
		]);
		expect(compareZones({ ...c, onlyThere: 0, different: [] })).toHaveLength(1);
	});

	it('towards the other folder: missing items and newer copies, each in its relative folder', () => {
		expect(alignPlan(c, risultati, 'C:\\Foto', 'la')).toEqual([
			{ dest: 'E:\\Backup', sources: ['C:\\Foto\\nuova.jpg', 'C:\\Foto\\a.txt'] },
			{ dest: 'E:\\Backup\\sub', sources: ['C:\\Foto\\sub\\deep'] }
		]);
	});

	it('towards this folder: what is only there and the copies newer there', () => {
		expect(alignPlan(c, risultati, 'C:\\Foto', 'qui')).toEqual([
			{ dest: 'C:\\Foto', sources: ['E:\\Backup\\vecchia.png'] },
			{ dest: 'C:\\Foto\\sub', sources: ['E:\\Backup\\sub\\b.txt'] }
		]);
	});

	it('keeps the separator on a drive root', () => {
		const root = { ...c, altro: 'E:\\', onlyHere: 1, different: [], onlyThere: 0 };
		expect(alignPlan(root, [e('C:\\Foto\\x.txt')], 'C:\\Foto', 'la')).toEqual([{ dest: 'E:\\', sources: ['C:\\Foto\\x.txt'] }]);
	});
});
