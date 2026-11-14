import { describe, it, expect } from 'vitest';
import { layout } from './grouping';
import type { Entry } from './ipc';

function item(name: string, kind: Entry['kind'] = 'file', modified: number | null = 0): Entry {
	return { name, path: `C:\\${name}`, kind, size: 1, modified, hidden: false };
}

const names = (v: Entry[]) => v.map((e) => e.name);

describe('layout', () => {
	const items = [item('Foto', 'dir'), item('a.txt'), item('b.jpg'), item('c.zip')];

	it('without favourites or groups the list is not divided', () => {
		const r = layout(items, new Set(), 'none');
		expect(r.zones).toEqual([]);
		expect(names(r.items)).toEqual(['Foto', 'a.txt', 'b.jpg', 'c.zip']);
	});

	it('favourites make the first zone', () => {
		const r = layout(items, new Set(['c.zip']), 'none');
		expect(r.zones).toEqual([
			{ label: 'Preferiti', count: 1, tone: 'favorites' },
			{ label: 'Comuni', count: 3 }
		]);
		expect(names(r.items)[0]).toBe('c.zip');
	});

	it('by type: groups in a fixed order, only the non-empty ones', () => {
		const r = layout(items, new Set(), 'type');
		expect(r.zones.map((z) => z.label)).toEqual(['Cartelle', 'Documenti', 'Immagini', 'Archivi']);
		expect(names(r.items)).toEqual(['Foto', 'a.txt', 'b.jpg', 'c.zip']);
	});

	it('favourites and groups together: favourites stay on top and out of the groups', () => {
		const r = layout(items, new Set(['b.jpg']), 'type');
		expect(r.zones.map((z) => z.label)).toEqual(['Preferiti', 'Cartelle', 'Documenti', 'Archivi']);
		expect(r.zones.reduce((n, z) => n + z.count, 0)).toBe(items.length);
	});

	it('by date: today, yesterday, older and undated', () => {
		const now = new Date(2026, 9, 25, 15, 0).getTime();
		const day = 24 * 60 * 60 * 1000;
		const r = layout(
			[
				item('today', 'file', now - 1000),
				item('yesterday', 'file', now - day),
				item('old', 'file', now - 400 * day),
				item('unknown', 'file', null)
			],
			new Set(),
			'date',
			now
		);
		expect(r.zones.map((z) => z.label)).toEqual(['Oggi', 'Ieri', 'Più di un anno fa', 'Senza data']);
	});

	it('by name: initial ranges as in Explorer', () => {
		const r = layout([item('alfa'), item('zeta'), item('3d'), item('Mario')], new Set(), 'name');
		expect(r.zones.map((z) => z.label)).toEqual(['0–9', 'A–H', 'I–P', 'Q–Z']);
	});

	it('by size: Explorer ranges, folders apart', () => {
		const big = { ...item('film.mkv'), size: 2 * 1024 ** 3 };
		const empty = { ...item('vuoto.txt'), size: 0 };
		const r = layout([big, empty, item('Foto', 'dir')], new Set(), 'size');
		expect(r.zones.map((z) => z.label)).toEqual(['Cartelle', 'Vuoto', 'Enorme (1–4 GB)']);
	});

	it('recent items rise to the top, newest first, even above favourites', () => {
		const now = 1_000_000_000_000;
		const day = 24 * 60 * 60 * 1000;
		const items = [
			item('old', 'file', now - 100 * day),
			item('yesterday', 'file', now - day),
			item('today', 'file', now - 1000),
			item('favourite', 'file', now - 50 * day)
		];
		const r = layout(items, new Set(['favourite', 'today']), 'none', now, now - 7 * day);

		expect(r.zones).toEqual([
			{ label: 'Modificati di recente', count: 2, tone: 'recent' },
			{ label: 'Preferiti', count: 1, tone: 'favorites' },
			{ label: 'Comuni', count: 1 }
		]);
		// «today» is a favourite too: it shows once only, among the recent ones.
		expect(r.items.map((e) => e.name)).toEqual(['today', 'yesterday', 'favourite', 'old']);
	});

	it('the recent zone is there even when empty', () => {
		const r = layout([item('a', 'file', 0)], new Set(), 'none', 10, 5);
		expect(r.zones).toEqual([
			{ label: 'Modificati di recente', count: 0, tone: 'recent' },
			{ label: 'Tutti gli altri', count: 1 }
		]);
	});
});
