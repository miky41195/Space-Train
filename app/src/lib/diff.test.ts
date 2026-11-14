import { describe, expect, it } from 'vitest';
import { diffLines, changedPart, sideBySide } from './diff';

const apply = (ops: NonNullable<ReturnType<typeof diffLines>>) => ({
	a: ops.filter((o) => o.kind !== 'added').map((o) => o.line),
	b: ops.filter((o) => o.kind !== 'removed').map((o) => o.line)
});

describe('diffLines', () => {
	it('rebuilds both sides and keeps unchanged lines', () => {
		const a = ['{', '"tema": "spazio",', '"lato": 96,', '"git": false', '}'];
		const b = ['{', '"tema": "spazio",', '"lato": 128,', '"git": true,', '"sessione": true', '}'];
		const ops = diffLines(a, b)!;
		expect(apply(ops)).toEqual({ a, b });
		expect(ops.filter((o) => o.kind === 'same').map((o) => o.line)).toEqual(['{', '"tema": "spazio",', '}']);
	});

	it('handles empty sides and many random cases', () => {
		expect(diffLines([], ['x'])).toEqual([{ kind: 'added', line: 'x' }]);
		expect(diffLines(['x'], [])).toEqual([{ kind: 'removed', line: 'x' }]);
		for (let t = 0; t < 200; t++) {
			const r = () => Array.from({ length: Math.floor(Math.random() * 12) }, () => 'abc'[Math.floor(Math.random() * 3)]);
			const a = r();
			const b = r();
			expect(apply(diffLines(a, b)!)).toEqual({ a, b });
		}
	});
});

describe('sideBySide', () => {
	it('pairs changes and folds long unchanged runs', () => {
		const a = Array.from({ length: 20 }, (_, i) => `r${i}`);
		const b = [...a];
		b[10] = 'X';
		const rows = sideBySide(diffLines(a, b)!);
		expect(rows[0]).toEqual({ kind: 'gap', count: 7 });
		expect(rows.find((r) => r.kind === 'changed')).toEqual({ kind: 'changed', left: { n: 11, text: 'r10' }, right: { n: 11, text: 'X' } });
		expect(rows.at(-1)).toEqual({ kind: 'gap', count: 6 });
	});

	it('lights the changed middle of a line', () => {
		expect(changedPart('"lato": 96,', '"lato": 128,')).toEqual(['"lato": ', '96', ',']);
	});
});
