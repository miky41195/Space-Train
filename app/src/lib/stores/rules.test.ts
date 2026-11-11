import { describe, it, expect, vi } from 'vitest';
import type { Entry, Esito, TransferOpts } from '../ipc';
import type { Rule } from '../rules';
import { RulesStore, type RuleDeps } from './rules.svelte';
import type { IdColore } from './colori.svelte';

const NOW = Date.UTC(2026, 10, 11, 12);
const DAY = 86_400_000;

function storage() {
	const data: Record<string, string> = {};
	return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

/** A tiny disk: folder → files. */
function setup(files: Record<string, Entry[]>) {
	const labels = new Map<string, IdColore>();
	const moved: TransferOpts[] = [];
	const trashed: string[] = [];
	const deps: RuleDeps = {
		backend: {
			listDir: async (path) => ({ path, entries: files[path] ?? [] }),
			transfer: async (opts) => {
				moved.push(opts);
				const src = opts.sources[0];
				const name = src.split('\\').pop()!;
				const from = Object.keys(files).find((k) => files[k].some((e) => e.path === src))!;
				const dest = `${opts.dest}\\${name}`;
				if ((files[opts.dest] ?? []).some((e) => e.path === dest)) return { copiati: 0, saltati: 1, annullato: false, coppie: [] } satisfies Esito;
				const entry = files[from].find((e) => e.path === src)!;
				if (opts.mode === 'move') files[from] = files[from].filter((e) => e.path !== src);
				files[opts.dest] = [...(files[opts.dest] ?? []), { ...entry, path: dest }];
				return { copiati: 1, saltati: 0, annullato: false, coppie: [[src, dest]] };
			},
			moveToTrash: async (paths) => void trashed.push(...paths),
			navigate: async (p) => p.split('\\').slice(0, -1).join('\\'),
			renameEntry: async (p) => p,
			trashRestoreOriginals: async () => {},
			imageRotate: async () => {}
		},
		labelOf: (p) => labels.get(p),
		setLabel: (paths, c) => paths.forEach((p) => (c ? labels.set(p, c) : labels.delete(p))),
		labelName: (id) => id
	};
	return { deps, labels, moved, trashed, files };
}

const file = (folder: string, name: string, extra: Partial<Entry> = {}): Entry => ({
	name,
	path: `${folder}\\${name}`,
	kind: 'file',
	size: 10,
	modified: NOW,
	hidden: false,
	...extra
});

const pdfRule: Rule = {
	id: 'r1',
	folder: 'C:\\Download',
	when: 'arrival',
	if: { type: 'ext', exts: ['pdf'] },
	then: { type: 'move', dest: 'C:\\PDF' },
	enabled: true
};

describe('RulesStore', () => {
	it('moves a new PDF once it stops changing, logs it, and the log undoes it', async () => {
		const t = setup({ 'C:\\Download': [file('C:\\Download', 'vecchio.pdf')], 'C:\\PDF': [] });
		const s = new RulesStore(t.deps, storage());
		s.saveFolder('C:\\Download', [pdfRule]);

		await s.tick(NOW);
		t.files['C:\\Download'].push(file('C:\\Download', 'fattura.pdf'), file('C:\\Download', 'note.txt'));
		await s.tick(NOW);
		expect(t.moved).toHaveLength(0);
		await s.tick(NOW);
		expect(t.moved.map((m) => m.sources[0])).toEqual(['C:\\Download\\fattura.pdf']);
		expect(t.files['C:\\Download'].map((e) => e.name)).toEqual(['vecchio.pdf', 'note.txt']);
		expect(s.log[0].text).toBe('fattura.pdf spostato in PDF');

		await s.undo(s.log[0].id);
		expect(t.files['C:\\Download'].map((e) => e.name)).toContain('fattura.pdf');
		expect(s.log[0].undone).toBe(true);
	});

	it('a daily rule runs once a day on every matching file', async () => {
		const old = file('C:\\Download', 'setup.exe', { modified: NOW - 40 * DAY });
		const t = setup({ 'C:\\Download': [old, file('C:\\Download', 'nuovo.exe')] });
		const s = new RulesStore(t.deps, storage());
		s.saveFolder('C:\\Download', [
			{ ...pdfRule, id: 'd', when: 'daily', if: { type: 'olderThan', days: 30 }, then: { type: 'trash' } }
		]);
		await s.tick(NOW);
		await s.tick(NOW + 60_000);
		expect(t.trashed).toEqual(['C:\\Download\\setup.exe']);
		await s.tick(NOW + DAY);
		expect(t.trashed).toHaveLength(2);
	});

	it('never overwrites: a name already at the destination is skipped and logged', async () => {
		const t = setup({ 'C:\\Download': [], 'C:\\PDF': [file('C:\\PDF', 'a.pdf')] });
		const s = new RulesStore(t.deps, storage());
		s.saveFolder('C:\\Download', [pdfRule]);
		await s.tick(NOW);
		t.files['C:\\Download'].push(file('C:\\Download', 'a.pdf'));
		await s.tick(NOW);
		await s.tick(NOW);
		expect(s.log[0].failed).toBe(true);
		expect(s.log[0].text).toMatch(/esiste già/);
		expect(t.files['C:\\Download']).toHaveLength(1);
	});

	it('labels, and invalid rules are not saved', async () => {
		const t = setup({ 'C:\\Foto': [] });
		const s = new RulesStore(t.deps, storage());
		s.saveFolder('C:\\Foto', [
			{ ...pdfRule, id: 'l', folder: 'C:\\Foto', if: { type: 'category', category: 'image' }, then: { type: 'label', color: 'verde' } },
			{ ...pdfRule, id: 'bad', folder: 'C:\\Foto', if: { type: 'any' }, then: { type: 'trash' } }
		]);
		expect(s.forFolder('C:\\foto').map((r) => r.id)).toEqual(['l']);
		await s.tick(NOW);
		t.files['C:\\Foto'].push(file('C:\\Foto', 'a.jpg'));
		await s.tick(NOW);
		await s.tick(NOW);
		expect(t.labels.get('C:\\Foto\\a.jpg')).toBe('verde');
		await s.undo(s.log[0].id);
		expect(t.labels.has('C:\\Foto\\a.jpg')).toBe(false);
	});

	it('rules survive a restart', () => {
		const st = storage();
		const t = setup({});
		new RulesStore(t.deps, st).saveFolder('C:\\Download', [pdfRule]);
		expect(new RulesStore(t.deps, st).hasRules('c:\\download')).toBe(true);
	});

	it('a tick already running is not started twice', async () => {
		const t = setup({ 'C:\\Download': [] });
		const list = vi.spyOn(t.deps.backend, 'listDir');
		const s = new RulesStore(t.deps, storage());
		s.saveFolder('C:\\Download', [pdfRule]);
		await Promise.all([s.tick(NOW), s.tick(NOW)]);
		expect(list).toHaveBeenCalledTimes(1);
	});
});
