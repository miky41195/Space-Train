/**
 * Folder growth: every weighed folder is remembered, and the next time it
 * is weighed the difference shows. The baseline is the latest measure from
 * an earlier day, so weighing twice in an hour still shows growth since
 * yesterday (or since the last day it was looked at).
 */

const DAY = 24 * 60 * 60 * 1000;
/** Past this many folders the oldest are forgotten. */
const MAX = 5000;

export interface Measure {
	bytes: number;
	at: number;
}
export interface History {
	/** Latest measure from an earlier day: what growth is counted from. */
	base?: Measure;
	last: Measure;
}
export type Measures = Record<string, History>;

export interface Growth {
	delta: number;
	/** When the baseline was measured, ms. */
	since: number;
	/** Share of today's size that is new (0…1). */
	share: number;
}

/** Records a measure; returns the updated record set and the growth, if a baseline exists. */
export function record(measures: Measures, path: string, bytes: number, now: number): { measures: Measures; growth: Growth | null } {
	const key = path.toLowerCase();
	const before = measures[key];
	const base = before && now - before.last.at >= DAY ? before.last : before?.base;
	const history: History = { base, last: { bytes, at: now } };
	let next: Measures = { ...measures, [key]: history };
	const keys = Object.keys(next);
	if (keys.length > MAX) {
		keys.sort((a, b) => next[a].last.at - next[b].last.at);
		next = Object.fromEntries(keys.slice(keys.length - MAX).map((k) => [k, next[k]]));
	}
	const growth = base ? { delta: bytes - base.bytes, since: base.at, share: bytes > 0 ? Math.max(0, bytes - base.bytes) / bytes : 0 } : null;
	return { measures: next, growth };
}

/** «+7,9 GB», «−1,3 GB», «=» for less than a megabyte either way. */
export function growthText(delta: number, bytes: (n: number) => string): string {
	if (Math.abs(delta) < 1_000_000) return '=';
	return `${delta > 0 ? '+' : '−'}${bytes(Math.abs(delta))}`;
}
