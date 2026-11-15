import { t } from './i18n';
import type { Version, VersionReason } from './ipc';
import { isInside } from './locations';

/** What made Space Train keep each version, as the list says it. */
export const REASON_TEXT: Record<VersionReason, string> = {
	overwritten: t('Prima della sovrascrittura'),
	edited: t('Prima del salvataggio nell\'editor'),
	restored: t('Prima del ripristino di una versione'),
	changed: t('Modificata'),
	protected: t('Quando la cartella è stata protetta')
};

const DAY = 24 * 60 * 60 * 1000;

/** «Oggi, 10:31», «Ieri, 17:05», «9 novembre, 08:12», with the year only when it is not this one. */
export function versionWhen(ms: number, now = Date.now()): string {
	const d = new Date(ms);
	const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	if (ms >= today.getTime()) return t('Oggi, {0}', [time]);
	if (ms >= today.getTime() - DAY) return t('Ieri, {0}', [time]);
	const sameYear = d.getFullYear() === today.getFullYear();
	const date = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
	return t('{0}, {1}', [date, time]);
}

/** The protected folder `path` sits in, if any. */
export function protectedFolderOf(path: string, protectedFolders: readonly string[]): string | null {
	return protectedFolders.find((f) => isInside(path, f)) ?? null;
}

/** Only files on a disk or a network share have versions. */
export function canHaveVersions(path: string): boolean {
	return !path.includes('::') && /^([a-z]:[\\/]|\\\\|\/)/i.test(path);
}
