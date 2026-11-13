/**
 * Line diff of two texts for the side-by-side file comparison.
 *
 * Myers' O(ND) algorithm: fast when the files are mostly the same, which
 * is the usual case (two versions of one file).
 */

export type Op = { tipo: 'uguale' | 'tolta' | 'aggiunta'; riga: string };

/** Past this many edits the files are «too different»: the diff gives up. */
const MAX_D = 4000;

/** The edit script from `a` to `b`, or null when they differ too much. */
export function diffRighe(a: string[], b: string[]): Op[] | null {
	const n = a.length;
	const m = b.length;
	const max = Math.min(n + m, MAX_D);
	const off = max + 1;
	let v = new Int32Array(2 * max + 3);
	const tracce: Int32Array[] = [];
	for (let d = 0; d <= max; d++) {
		tracce.push(v.slice());
		const nv = v.slice();
		for (let k = -d; k <= d; k += 2) {
			let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) x++, y++;
			nv[off + k] = x;
			if (x >= n && y >= m) return indietro(tracce, d, a, b, off);
		}
		v = nv;
	}
	return null;
}

function indietro(tracce: Int32Array[], dFine: number, a: string[], b: string[], off: number): Op[] {
	const ops: Op[] = [];
	let x = a.length;
	let y = b.length;
	for (let d = dFine; d > 0; d--) {
		const v = tracce[d];
		const k = x - y;
		const giu = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]);
		const kPrima = giu ? k + 1 : k - 1;
		const xPrima = v[off + kPrima];
		const yPrima = xPrima - kPrima;
		while (x > xPrima && y > yPrima) ops.push({ tipo: 'uguale', riga: a[--x] }), y--;
		if (giu) ops.push({ tipo: 'aggiunta', riga: b[--y] });
		else ops.push({ tipo: 'tolta', riga: a[--x] });
	}
	while (x > 0 && y > 0) ops.push({ tipo: 'uguale', riga: a[--x] }), y--;
	return ops.reverse();
}

export interface Lato {
	n: number;
	testo: string;
}
/** One row of the side-by-side view. */
export type Riga =
	| { tipo: 'uguale' | 'tolta' | 'aggiunta' | 'cambiata'; sx?: Lato; dx?: Lato }
	| { tipo: 'salto'; quante: number };

/** Unchanged lines kept around each change; longer unchanged runs fold. */
const CONTESTO = 3;

/** Side-by-side rows: removed and added lines pair up as changed rows; long unchanged runs fold. */
export function righeAffiancate(ops: Op[]): Riga[] {
	const piene: Riga[] = [];
	let na = 0;
	let nb = 0;
	for (let i = 0; i < ops.length; ) {
		if (ops[i].tipo === 'uguale') {
			piene.push({ tipo: 'uguale', sx: { n: ++na, testo: ops[i].riga }, dx: { n: ++nb, testo: ops[i].riga } });
			i++;
			continue;
		}
		const tolte: string[] = [];
		const aggiunte: string[] = [];
		while (i < ops.length && ops[i].tipo !== 'uguale') {
			(ops[i].tipo === 'tolta' ? tolte : aggiunte).push(ops[i].riga);
			i++;
		}
		for (let j = 0; j < Math.max(tolte.length, aggiunte.length); j++) {
			const sx = j < tolte.length ? { n: ++na, testo: tolte[j] } : undefined;
			const dx = j < aggiunte.length ? { n: ++nb, testo: aggiunte[j] } : undefined;
			piene.push({ tipo: sx && dx ? 'cambiata' : sx ? 'tolta' : 'aggiunta', sx, dx });
		}
	}
	// Fold unchanged runs, keeping CONTESTO lines next to each change.
	const out: Riga[] = [];
	for (let i = 0; i < piene.length; ) {
		if (piene[i].tipo !== 'uguale') {
			out.push(piene[i++]);
			continue;
		}
		let j = i;
		while (j < piene.length && piene[j].tipo === 'uguale') j++;
		const testa = i === 0 ? 0 : CONTESTO;
		const coda = j === piene.length ? 0 : CONTESTO;
		if (j - i > testa + coda + 1) {
			out.push(...piene.slice(i, i + testa), { tipo: 'salto', quante: j - i - testa - coda }, ...piene.slice(j - coda, j));
		} else out.push(...piene.slice(i, j));
		i = j;
	}
	return out;
}

/** The part of a changed line that differs, between the common start and end. */
export function parteCambiata(questa: string, altra: string): [string, string, string] {
	let a = 0;
	while (a < questa.length && a < altra.length && questa[a] === altra[a]) a++;
	let b = 0;
	while (b < questa.length - a && b < altra.length - a && questa[questa.length - 1 - b] === altra[altra.length - 1 - b]) b++;
	return [questa.slice(0, a), questa.slice(a, questa.length - b), questa.slice(questa.length - b)];
}
