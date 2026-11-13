import { describe, expect, it } from 'vitest';
import { diffRighe, parteCambiata, righeAffiancate } from './diff';

const applica = (ops: NonNullable<ReturnType<typeof diffRighe>>) => ({
	a: ops.filter((o) => o.tipo !== 'aggiunta').map((o) => o.riga),
	b: ops.filter((o) => o.tipo !== 'tolta').map((o) => o.riga)
});

describe('diffRighe', () => {
	it('rebuilds both sides and keeps unchanged lines', () => {
		const a = ['{', '"tema": "spazio",', '"lato": 96,', '"git": false', '}'];
		const b = ['{', '"tema": "spazio",', '"lato": 128,', '"git": true,', '"sessione": true', '}'];
		const ops = diffRighe(a, b)!;
		expect(applica(ops)).toEqual({ a, b });
		expect(ops.filter((o) => o.tipo === 'uguale').map((o) => o.riga)).toEqual(['{', '"tema": "spazio",', '}']);
	});

	it('handles empty sides and many random cases', () => {
		expect(diffRighe([], ['x'])).toEqual([{ tipo: 'aggiunta', riga: 'x' }]);
		expect(diffRighe(['x'], [])).toEqual([{ tipo: 'tolta', riga: 'x' }]);
		for (let t = 0; t < 200; t++) {
			const r = () => Array.from({ length: Math.floor(Math.random() * 12) }, () => 'abc'[Math.floor(Math.random() * 3)]);
			const a = r();
			const b = r();
			expect(applica(diffRighe(a, b)!)).toEqual({ a, b });
		}
	});
});

describe('righeAffiancate', () => {
	it('pairs changes and folds long unchanged runs', () => {
		const a = Array.from({ length: 20 }, (_, i) => `r${i}`);
		const b = [...a];
		b[10] = 'X';
		const righe = righeAffiancate(diffRighe(a, b)!);
		expect(righe[0]).toEqual({ tipo: 'salto', quante: 7 });
		expect(righe.find((r) => r.tipo === 'cambiata')).toEqual({ tipo: 'cambiata', sx: { n: 11, testo: 'r10' }, dx: { n: 11, testo: 'X' } });
		expect(righe.at(-1)).toEqual({ tipo: 'salto', quante: 6 });
	});

	it('lights the changed middle of a line', () => {
		expect(parteCambiata('"lato": 96,', '"lato": 128,')).toEqual(['"lato": ', '96', ',']);
	});
});
