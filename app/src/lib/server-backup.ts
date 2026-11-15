import type { ServerBackup } from './ipc';

const DAY = 24 * 60 * 60 * 1000;

function when(ms: number, now: number): string {
	const d = new Date(ms);
	const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	if (ms >= today.getTime()) return `oggi alle ${time}`;
	if (ms >= today.getTime() - DAY) return `ieri alle ${time}`;
	return `il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} alle ${time}`;
}

/** The line under the backup route: how the last one went. */
export function backupStatus(b: ServerBackup, now = Date.now()): string {
	if (!b.attempted) return 'Il primo backup parte entro un minuto dal salvataggio.';
	const failed = b.last == null || b.attempted > b.last;
	if (failed) {
		const why = (b.outcome ?? 'errore sconosciuto').replace(/\.$/, '');
		return `Ultimo tentativo ${when(b.attempted, now)} non riuscito: ${why}. Riprova fra 10 minuti.`;
	}
	const what = sentText(b.outcome ?? '');
	return `Ultimo backup ${when(b.last!, now)}: ${what}.`;
}

/** «3 file» as the backup answers it, said as a result. */
export function sentText(outcome: string): string {
	if (outcome === 'già allineata') return 'nessun file cambiato';
	return outcome === '1 file' ? '1 file mandato' : `${outcome} mandati`;
}
