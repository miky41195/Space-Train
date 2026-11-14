/**
 * Line diff of two texts for the side-by-side file comparison.
 *
 * Myers' O(ND) algorithm: fast when the files are mostly the same, which
 * is the usual case (two versions of one file).
 */

export type Op = { kind: 'same' | 'removed' | 'added'; line: string };

/** Past this many edits the files are «too different»: the diff gives up. */
const MAX_D = 4000;

/** The edit script from `a` to `b`, or null when they differ too much. */
export function diffLines(a: string[], b: string[]): Op[] | null {
	const n = a.length;
	const m = b.length;
	const max = Math.min(n + m, MAX_D);
	const off = max + 1;
	let v = new Int32Array(2 * max + 3);
	const traces: Int32Array[] = [];
	for (let d = 0; d <= max; d++) {
		traces.push(v.slice());
		const nv = v.slice();
		for (let k = -d; k <= d; k += 2) {
			let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) x++, y++;
			nv[off + k] = x;
			if (x >= n && y >= m) return backtrack(traces, d, a, b, off);
		}
		v = nv;
	}
	return null;
}

function backtrack(traces: Int32Array[], dEnd: number, a: string[], b: string[], off: number): Op[] {
	const ops: Op[] = [];
	let x = a.length;
	let y = b.length;
	for (let d = dEnd; d > 0; d--) {
		const v = traces[d];
		const k = x - y;
		const down = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]);
		const kBefore = down ? k + 1 : k - 1;
		const xBefore = v[off + kBefore];
		const yBefore = xBefore - kBefore;
		while (x > xBefore && y > yBefore) ops.push({ kind: 'same', line: a[--x] }), y--;
		if (down) ops.push({ kind: 'added', line: b[--y] });
		else ops.push({ kind: 'removed', line: a[--x] });
	}
	while (x > 0 && y > 0) ops.push({ kind: 'same', line: a[--x] }), y--;
	return ops.reverse();
}

export interface Side {
	n: number;
	text: string;
}
/** One row of the side-by-side view. */
export type Row =
	| { kind: 'same' | 'removed' | 'added' | 'changed'; left?: Side; right?: Side }
	| { kind: 'gap'; count: number };

/** Unchanged lines kept around each change; longer unchanged runs fold. */
const CONTEXT = 3;

/** Side-by-side rows: removed and added lines pair up as changed rows; long unchanged runs fold. */
export function sideBySide(ops: Op[]): Row[] {
	const full: Row[] = [];
	let na = 0;
	let nb = 0;
	for (let i = 0; i < ops.length; ) {
		if (ops[i].kind === 'same') {
			full.push({ kind: 'same', left: { n: ++na, text: ops[i].line }, right: { n: ++nb, text: ops[i].line } });
			i++;
			continue;
		}
		const removed: string[] = [];
		const added: string[] = [];
		while (i < ops.length && ops[i].kind !== 'same') {
			(ops[i].kind === 'removed' ? removed : added).push(ops[i].line);
			i++;
		}
		for (let j = 0; j < Math.max(removed.length, added.length); j++) {
			const left = j < removed.length ? { n: ++na, text: removed[j] } : undefined;
			const right = j < added.length ? { n: ++nb, text: added[j] } : undefined;
			full.push({ kind: left && right ? 'changed' : left ? 'removed' : 'added', left, right });
		}
	}
	// Fold unchanged runs, keeping CONTEXT lines next to each change.
	const out: Row[] = [];
	for (let i = 0; i < full.length; ) {
		if (full[i].kind !== 'same') {
			out.push(full[i++]);
			continue;
		}
		let j = i;
		while (j < full.length && full[j].kind === 'same') j++;
		const head = i === 0 ? 0 : CONTEXT;
		const tail = j === full.length ? 0 : CONTEXT;
		if (j - i > head + tail + 1) {
			out.push(...full.slice(i, i + head), { kind: 'gap', count: j - i - head - tail }, ...full.slice(j - tail, j));
		} else out.push(...full.slice(i, j));
		i = j;
	}
	return out;
}

/** The part of a changed line that differs, between the common start and end. */
export function changedPart(line: string, other: string): [string, string, string] {
	let a = 0;
	while (a < line.length && a < other.length && line[a] === other[a]) a++;
	let b = 0;
	while (b < line.length - a && b < other.length - a && line[line.length - 1 - b] === other[other.length - 1 - b]) b++;
	return [line.slice(0, a), line.slice(a, line.length - b), line.slice(line.length - b)];
}
