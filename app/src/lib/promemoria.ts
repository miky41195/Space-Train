import type { Drive } from './ipc';

const GIORNO = 24 * 60 * 60 * 1000;
/** «Non ora» keeps a drive quiet this long. */
export const SILENZIO = 7 * GIORNO;
/** A cleanup total older than this is not quoted: it may no longer be true. */
const PULIZIA_VALIDA = 7 * GIORNO;

/** Per drive (lowercase): last time the reminder showed, and quiet until when. */
export type StatoPromemoria = Record<string, { visto?: number; zitto?: number }>;
/** Per drive (lowercase): what the last cleanup found, and when. */
export type UltimaPulizia = Record<string, { byte: number; at: number }>;

export interface Promemoria {
	drive: Drive;
	/** Free share, 0…1. */
	quota: number;
	/** Bytes the last cleanup found, when recent. */
	trovati?: number;
}

/**
 * The fixed drive that needs a reminder, if any: under `soglia` percent
 * free, not reminded today, not silenced. `soglia` 0 = off.
 */
export function daRicordare(
	drives: Drive[],
	soglia: number,
	stato: StatoPromemoria,
	pulizie: UltimaPulizia,
	adesso: number
): Promemoria | null {
	if (soglia <= 0) return null;
	for (const d of drives) {
		if (d.tipo !== 'fisso' || d.libero === null || !d.totale) continue;
		const quota = d.libero / d.totale;
		const s = stato[d.path.toLowerCase()] ?? {};
		if (quota * 100 >= soglia || (s.zitto ?? 0) > adesso || adesso - (s.visto ?? 0) < GIORNO) continue;
		const p = pulizie[d.path.toLowerCase()];
		return { drive: d, quota, trovati: p && adesso - p.at < PULIZIA_VALIDA ? p.byte : undefined };
	}
	return null;
}
