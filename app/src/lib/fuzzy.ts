export interface Match {
	score: number;
	/** Indices of the name's characters that match the query. */
	positions: number[];
}

/** The character continues the chain started by the previous one. */
const CHAIN_BONUS = 16;
/** The character opens a word: after a separator or on a camelCase capital. */
const WORD_START_BONUS = 10;
/** The match starts from the name's first character. */
const FIRST_CHAR_BONUS = 8;
/** The name matches the query exactly. */
const EXACT_BONUS = 50;

const GAP_PENALTY = 1;
/** Past this threshold gaps make it no worse: a long name is not a mistake. */
const MAX_GAP_PENALTY = 20;

const SEPARATORS = new Set(['_', '-', '.', ' ', '(', ')', '[', ']']);

function wordStart(target: string, i: number): boolean {
	if (i === 0) return true;

	const prev = target[i - 1];
	if (SEPARATORS.has(prev)) return true;

	// camelCase: lowercase followed by uppercase.
	const cur = target[i];
	const prevLower = prev === prev.toLowerCase() && prev !== prev.toUpperCase();
	const curUpper = cur === cur.toUpperCase() && cur !== cur.toLowerCase();
	return prevLower && curUpper;
}

/**
 * Looks for `query` inside `target` as a subsequence, from the first useful
 * character.
 *
 * The scan is greedy: it always takes the first available occurrence
 * instead of exploring every combination. For file names — short and with
 * clear separators — it gives the same result as an exhaustive search at a
 * fraction of the cost, and stays under a millisecond over thousands of items.
 *
 * Returns `null` when the characters are not there, or not in the right order.
 */
export function fuzzyMatch(query: string, target: string): Match | null {
	if (query === '') return { score: 0, positions: [] };

	const q = query.toLowerCase();
	const t = target.toLowerCase();

	const positions: number[] = [];
	let score = 0;
	let from = 0;
	let skipped = 0;
	let previous = -2;

	for (const char of q) {
		const found = t.indexOf(char, from);
		if (found === -1) return null;

		skipped += found - from;

		if (found === previous + 1) score += CHAIN_BONUS;
		if (wordStart(target, found)) score += WORD_START_BONUS;
		if (found === 0) score += FIRST_CHAR_BONUS;

		positions.push(found);
		previous = found;
		from = found + 1;
	}

	score -= Math.min(skipped * GAP_PENALTY, MAX_GAP_PENALTY);
	if (t === q) score += EXACT_BONUS;

	return { score, positions };
}

export interface FilterResult<T> {
	item: T;
	positions: number[];
}

/**
 * Filters and reorders by relevance. With equal scores the shorter name
 * wins: between two equivalent matches, the one that «fills» the query best.
 *
 * With an empty query it returns everything in the original order — that
 * is the one Rust decided, folders first.
 */
export function filterEntries<T extends { name: string }>(entries: T[], query: string): FilterResult<T>[] {
	if (query.trim() === '') {
		return entries.map((item) => ({ item, positions: [] }));
	}

	const found: Array<FilterResult<T> & { score: number }> = [];

	for (const item of entries) {
		const m = fuzzyMatch(query, item.name);
		if (m !== null) {
			found.push({ item, positions: m.positions, score: m.score });
		}
	}

	found.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length);

	return found.map(({ item, positions }) => ({ item, positions }));
}
