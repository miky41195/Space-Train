/**
 * How a parade entry moves on the rail.
 *
 * - `walk`: travels along with the others, left to right (as it always
 *   was, and as it is without instructions).
 * - `still`: stays at one point of the rail and animates on the spot, for
 *   example a fight in progress.
 * - `cross`: starts from a point and goes alone to the end, for example an
 *   energy wave thrown by a still character.
 *
 * Still and cross can show only during a pass, with their own timings, or
 * stay on `loop`: always on stage, and whoever crosses starts again
 * forever, with a chosen pause between one round and the next.
 *
 * In the parade the motion precedes the entry: `mov:{json}|img:C:\…` or
 * `mov:{json}|sprite:{…}`. Entries without the prefix walk.
 */

export type MotionKind = 'walk' | 'still' | 'cross';
export type Direction = 'right' | 'left';

export interface Motion {
	kind: MotionKind;
	/** Where it stands (still) or where it starts (cross): 0 left edge, 100 right. */
	position: number;
	/** Seconds before showing: from the start of the pass, or from opening if looping. */
	delay: number;
	/**
	 * Seconds: how long it stays on stage (still) or how long it takes to
	 * arrive (cross). Still and looping has none: it always stays.
	 */
	duration: number;
	/** Always on stage, outside the passes; whoever crosses starts again forever. */
	loop: boolean;
	/** Seconds of waiting between one round and the next of a looping cross. */
	pause: number;
	/** Where whoever crosses goes. */
	direction: Direction;
	/** Drawn mirrored, facing the other way. */
	mirror: boolean;
	/** Pixels above the rail: a wave at hand height, a bird in flight. */
	height: number;
}

const EXTRA = { loop: false, pause: 0, direction: 'right' as Direction, mirror: false, height: 0 };

export const WALK: Motion = { kind: 'walk', position: 0, delay: 0, duration: 0, ...EXTRA };

/**
 * The values to start from when choosing a kind of motion: looping, as a
 * sprite is usually animated. Entries saved earlier, without `loop`, stay
 * tied to the passes.
 */
export function defaultMotion(kind: MotionKind): Motion {
	if (kind === 'still') return { kind, position: 50, delay: 0, duration: 8, ...EXTRA, loop: true };
	if (kind === 'cross') return { kind, position: 0, delay: 0, duration: 4, ...EXTRA, loop: true };
	return WALK;
}

const PREFIX = 'mov:';
const SEPARATOR = '}|';

function clamp(n: unknown, min: number, max: number, fallback: number): number {
	const v = Number(n);
	return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** Brings the numbers back within sensible limits. */
export function normalizeMotion(m: Partial<Motion>): Motion {
	const kind: MotionKind = m.kind === 'still' || m.kind === 'cross' ? m.kind : 'walk';
	if (kind === 'walk') return WALK;
	const base = defaultMotion(kind);
	return {
		kind,
		position: Math.round(clamp(m.position, 0, 100, base.position)),
		delay: clamp(m.delay, 0, 60, base.delay),
		duration: clamp(m.duration, 0.5, 120, base.duration),
		loop: m.loop === true,
		pause: clamp(m.pause, 0, 120, 0),
		direction: m.direction === 'left' ? 'left' : 'right',
		mirror: m.mirror === true,
		height: Math.round(clamp(m.height, 0, 200, 0))
	};
}

// The motion is saved inside themes with the names earlier versions wrote.
const STORED_KEYS: Record<keyof Motion, string> = {
	kind: 'tipo',
	position: 'posizione',
	delay: 'ritardo',
	duration: 'durata',
	loop: 'continuo',
	pause: 'pausa',
	direction: 'verso',
	mirror: 'specchia',
	height: 'altezza'
};
const STORED_KINDS: Record<MotionKind, string> = { walk: 'cammina', still: 'fermo', cross: 'attraversa' };
const STORED_DIRECTIONS: Record<Direction, string> = { right: 'destra', left: 'sinistra' };
const back = (map: Record<string, string>, v: unknown) => Object.keys(map).find((k) => map[k] === v);

function fromStored(stored: Record<string, unknown>): Partial<Motion> {
	const m: Record<string, unknown> = {};
	for (const [key, name] of Object.entries(STORED_KEYS)) if (stored[name] !== undefined) m[key] = stored[name];
	m.kind = back(STORED_KINDS, stored.tipo);
	m.direction = back(STORED_DIRECTIONS, stored.verso);
	return m as Partial<Motion>;
}

function toStored(m: Motion): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, name] of Object.entries(STORED_KEYS)) out[name] = m[key as keyof Motion];
	out.tipo = STORED_KINDS[m.kind];
	out.verso = STORED_DIRECTIONS[m.direction];
	return out;
}

/** Splits a parade entry into its motion and what it shows. */
export function readMotion(item: string): { motion: Motion; item: string } {
	if (!item.startsWith(PREFIX)) return { motion: WALK, item };
	const end = item.indexOf(SEPARATOR);
	if (end === -1) return { motion: WALK, item };
	try {
		const stored = JSON.parse(item.slice(PREFIX.length, end + 1)) as Record<string, unknown>;
		return { motion: normalizeMotion(fromStored(stored)), item: item.slice(end + SEPARATOR.length) };
	} catch {
		return { motion: WALK, item: item.slice(end + SEPARATOR.length) };
	}
}

/** The parade entry with its motion; whoever walks stays without a prefix. */
export function withMotion(item: string, m: Partial<Motion>): string {
	const n = normalizeMotion(m);
	if (n.kind === 'walk') return item;
	return `${PREFIX}${JSON.stringify(toStored(n))}|${item}`;
}

/**
 * Seconds from the start of the pass to when the entry has left the stage.
 * Whoever walks goes with the convoy, whoever loops is not part of passes.
 */
export function offStageAt(m: Motion): number {
	return m.kind === 'walk' || m.loop ? 0 : m.delay + m.duration;
}

/**
 * The animation keyframes of a looping cross: the journey takes the first
 * part of the round, the pause the rest, hidden. In CSS because the
 * proportion changes entry by entry.
 */
export function loopKeyframes(name: string, m: Motion): string {
	const round = m.duration + m.pause;
	const arrival = Math.min(100, (m.duration / round) * 100);
	const start = 'translateX(calc(var(--from) * (100cqw - 100%) / 100))';
	const far = m.direction === 'left' ? 'translateX(calc(-100% - 20px))' : 'translateX(calc(100cqw + 20px))';
	const end = arrival < 100 ? `${(arrival + 0.01).toFixed(3)}%,100%{visibility:hidden;transform:${far}}` : '';
	return `@keyframes ${name}{0%{visibility:visible;transform:${start}}${arrival.toFixed(3)}%{visibility:visible;transform:${far}}${end}}`;
}
