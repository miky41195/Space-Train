/**
 * Folder growth: every weighed folder is remembered, and the next time it
 * is weighed the difference shows. The baseline is the latest measure from
 * an earlier day, so weighing twice in an hour still shows growth since
 * yesterday (or since the last day it was looked at).
 */

const GIORNO = 24 * 60 * 60 * 1000;
/** Past this many folders the oldest are forgotten. */
const MASSIMO = 5000;

export interface Misura {
	bytes: number;
	at: number;
}
export interface Storia {
	/** Latest measure from an earlier day: what growth is counted from. */
	base?: Misura;
	ultima: Misura;
}
export type Misure = Record<string, Storia>;

export interface Crescita {
	delta: number;
	/** When the baseline was measured, ms. */
	dal: number;
	/** Share of today's size that is new (0…1). */
	parte: number;
}

/** Records a measure; returns the updated record set and the growth, if a baseline exists. */
export function registra(misure: Misure, path: string, bytes: number, adesso: number): { misure: Misure; crescita: Crescita | null } {
	const chiave = path.toLowerCase();
	const prima = misure[chiave];
	const base = prima && adesso - prima.ultima.at >= GIORNO ? prima.ultima : prima?.base;
	const storia: Storia = { base, ultima: { bytes, at: adesso } };
	let nuove: Misure = { ...misure, [chiave]: storia };
	const chiavi = Object.keys(nuove);
	if (chiavi.length > MASSIMO) {
		chiavi.sort((a, b) => nuove[a].ultima.at - nuove[b].ultima.at);
		nuove = Object.fromEntries(chiavi.slice(chiavi.length - MASSIMO).map((k) => [k, nuove[k]]));
	}
	const crescita = base ? { delta: bytes - base.bytes, dal: base.at, parte: bytes > 0 ? Math.max(0, bytes - base.bytes) / bytes : 0 } : null;
	return { misure: nuove, crescita };
}

/** «+7,9 GB», «−1,3 GB», «=» for less than a megabyte either way. */
export function testoCrescita(delta: number, byte: (n: number) => string): string {
	if (Math.abs(delta) < 1_000_000) return '=';
	return `${delta > 0 ? '+' : '−'}${byte(Math.abs(delta))}`;
}
