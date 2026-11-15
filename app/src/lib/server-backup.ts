import { t } from './i18n';
import type { ServerBackup } from './ipc';

const DAY = 24 * 60 * 60 * 1000;

function when(ms: number, now: number): string {
	const d = new Date(ms);
	const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	if (ms >= today.getTime()) return t('oggi alle {0}', [time]);
	if (ms >= today.getTime() - DAY) return t('ieri alle {0}', [time]);
	return t('il {0} alle {1}', [d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }), time]);
}

/** The line under the backup route: how the last one went. */
export function backupStatus(b: ServerBackup, now = Date.now()): string {
	if (!b.attempted) return t('Il primo backup parte entro un minuto dal salvataggio.');
	const failed = b.last == null || b.attempted > b.last;
	if (failed) {
		const why = (b.outcome ?? t('errore sconosciuto')).replace(/\.$/, '');
		return t('Ultimo tentativo {0} non riuscito: {1}. Riprova fra 10 minuti.', [when(b.attempted, now), why]);
	}
	const what = sentText(b.outcome ?? '');
	return t('Ultimo backup {0}: {1}.', [when(b.last!, now), what]);
}

/** «3 file» as the backup answers it, said as a result. */
export function sentText(outcome: string): string {
	if (outcome === 'già allineata') return t('nessun file cambiato');
	return outcome === '1 file' ? t('1 file mandato') : t('{0} mandati', [outcome]);
}
