import type { Drive } from './ipc';

const DAY = 24 * 60 * 60 * 1000;
/** «Non ora» keeps a drive quiet this long. */
export const QUIET = 7 * DAY;
/** A cleanup total older than this is not quoted: it may no longer be true. */
const CLEANUP_VALID = 7 * DAY;

/** Per drive (lowercase): last time the reminder showed, and quiet until when. */
export type ReminderState = Record<string, { shown?: number; quietUntil?: number }>;
/** Per drive (lowercase): what the last cleanup found, and when. */
export type LastCleanup = Record<string, { bytes: number; at: number }>;

export interface Reminder {
	drive: Drive;
	/** Free share, 0…1. */
	share: number;
	/** Bytes the last cleanup found, when recent. */
	found?: number;
}

/**
 * The fixed drive that needs a reminder, if any: under `threshold` percent
 * free, not reminded today, not silenced. `threshold` 0 = off.
 */
export function dueReminder(
	drives: Drive[],
	threshold: number,
	state: ReminderState,
	cleanups: LastCleanup,
	now: number
): Reminder | null {
	if (threshold <= 0) return null;
	for (const d of drives) {
		if (d.kind !== 'fixed' || d.free === null || !d.total) continue;
		const share = d.free / d.total;
		const s = state[d.path.toLowerCase()] ?? {};
		if (share * 100 >= threshold || (s.quietUntil ?? 0) > now || now - (s.shown ?? 0) < DAY) continue;
		const c = cleanups[d.path.toLowerCase()];
		return { drive: d, share, found: c && now - c.at < CLEANUP_VALID ? c.bytes : undefined };
	}
	return null;
}
