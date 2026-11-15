import { describe, expect, it } from 'vitest';
import { backupStatus } from './server-backup';

describe('server backup status', () => {
	const now = new Date(2026, 10, 15, 12, 0).getTime();
	const base = { folder: 'C:\\Documenti', target: 'Documenti' };

	it('says when the first one starts', () => {
		expect(backupStatus(base, now)).toContain('entro un minuto');
	});

	it('tells the last success, with nothing changed or the count', () => {
		const at = new Date(2026, 10, 14, 22, 14).getTime();
		expect(backupStatus({ ...base, last: at, attempted: at, outcome: '3 file' }, now)).toBe('Ultimo backup ieri alle 22:14: 3 file mandati.');
		expect(backupStatus({ ...base, last: at, attempted: at, outcome: 'già allineata' }, now)).toContain('nessun file cambiato');
	});

	it('a failure after the last success shows the error', () => {
		const ok = new Date(2026, 10, 10, 9, 0).getTime();
		const tried = new Date(2026, 10, 15, 11, 30).getTime();
		const line = backupStatus({ ...base, last: ok, attempted: tried, outcome: 'Il server chiede la password.' }, now);
		expect(line).toBe('Ultimo tentativo oggi alle 11:30 non riuscito: Il server chiede la password. Riprova fra 10 minuti.');
	});
});
