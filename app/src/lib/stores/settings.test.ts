import { describe, it, expect } from 'vitest';
import { SettingsStore } from './settings.svelte';

function storage(initial: Record<string, string> = {}) {
	const data = { ...initial };
	return {
		data,
		getItem: (k: string) => data[k] ?? null,
		setItem: (k: string, v: string) => {
			data[k] = v;
		}
	};
}

describe('SettingsStore', () => {
	it('starts from the defaults', () => {
		const i = new SettingsStore(storage());
		expect(i.view).toBe('details');
		expect(i.grouping).toBe('none');
		expect(i.theme).toBe('spazio');
		expect(i.extensions).toBe(true);
		expect(i.preview).toBe(false);
		expect(i.columns).toEqual({ size: true, date: true, type: false });
	});

	it('every change survives a restart', () => {
		const a = storage();
		const i = new SettingsStore(a);
		i.setView('icons', 180);
		i.set('theme', 'chiaro');
		i.rememberSort('C:\\Foto', { key: 'modified', ascending: false });
		i.set('grouping', 'date');
		i.set('preview', true);
		i.toggleColumn('type');

		const after = new SettingsStore(a);
		expect(after.view).toBe('icons');
		expect(after.side).toBe(180);
		expect(after.theme).toBe('chiaro');
		expect(after.sortFor('c:\\foto')).toEqual({ key: 'modified', ascending: false });
		expect(after.grouping).toBe('date');
		expect(after.preview).toBe(true);
		expect(after.columns.type).toBe(true);
	});

	it('corrupt preferences do not block startup', () => {
		const i = new SettingsStore(storage({ 'space-train.impostazioni': '{rotto' }));
		expect(i.view).toBe('details');
	});

	it('views of earlier versions translate into the new ones', () => {
		const grid = new SettingsStore(storage({ 'space-train.impostazioni': '{"vista":"griglia"}' }));
		expect([grid.view, grid.side]).toEqual(['icons', 96]);
		const small = new SettingsStore(storage({ 'space-train.impostazioni': '{"vista":"piccole"}' }));
		expect([small.view, small.side]).toEqual(['icons', 24]);
	});

	it('the icon side stays between 16 and 256', () => {
		const i = new SettingsStore(storage());
		i.setView('icons', 999);
		expect(i.side).toBe(256);
		i.setView('icons', 2);
		expect(i.side).toBe(16);
	});

	it('reads the settings saved by version 0.9 and writes them back in the same form', () => {
		// Exactly what 0.9 wrote, trimmed to the fields whose names or values changed in memory.
		const saved = {
			vista: 'riquadri',
			lato: 64,
			compatta: true,
			colonne: { dimensione: false, data: true, tipo: true },
			raggruppa: 'dimensione',
			estensioni: false,
			anteprima: true,
			tema: 'kawaii',
			accento: 'personalizzato',
			ordinamenti: { 'c:\\foto': { key: 'size', ascending: true } },
			recenti: true,
			giorniRecenti: 7,
			animazioneAvvio: true,
			pausaTreno: -1,
			coloreAccento: '#123456',
			temiPersonali: [{ id: 'p1', nome: 'Mio', chiaro: true, gruppo: 'personale', variabili: { '--errore-testo': '#f00' }, forme: { angolo: 'tacca' } }],
			paginaIniziale: '::ultima',
			sessione: true,
			cartelleAvvio: ['C:\\Lavoro'],
			cartelleProgetti: ['D:\\Progetti'],
			sogliaDisco: 15,
			dimensioneCartelle: 'richiesta',
			confermaCestino: false,
			unClic: true,
			git: false,
			chiusuraCassaforte: 30,
			scorciatoie: { doppioPannello: ['Ctrl+Maiusc+O'] }
		};
		const a = storage({ 'space-train.impostazioni': JSON.stringify(saved) });
		const s = new SettingsStore(a);
		expect([s.view, s.grouping, s.folderSizes, s.singleClick, s.vaultAutoLock]).toEqual(['tiles', 'size', 'onRequest', true, 30]);
		expect(s.columns).toEqual({ size: false, date: true, type: true });
		expect(s.personalThemes[0]).toMatchObject({ name: 'Mio', light: true, variables: { '--error-text': '#f00' }, shapes: { corner: 'notch' } });
		expect(s.shortcuts).toEqual({ dualPane: ['Ctrl+Maiusc+O'] });
		expect([s.startPage, s.projectFolders, s.diskThreshold]).toEqual(['::ultima', ['D:\\Progetti'], 15]);

		s.set('trainPause', -1);
		expect(JSON.parse(a.data['space-train.impostazioni'])).toEqual({ ...saved, folderChanges: true }); // the only key added after 0.9
	});
});
