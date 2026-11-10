import { describe, it, expect } from 'vitest';
import { criteriFiltri, descriviRicerca, filtriAttivi, NESSUN_FILTRO } from './filtri';

describe('smart folder filters', () => {
	const ora = new Date(2026, 10, 11, 15, 30);

	it('no filters, no criteria', () => {
		expect(filtriAttivi(NESSUN_FILTRO)).toBe(false);
		expect(criteriFiltri(NESSUN_FILTRO, ora)).toEqual({});
	});

	it('type, size and date become extensions, a minimum size and a time window', () => {
		const c = criteriFiltri({ tipo: 'video', peso: '1gb', data: 'oggi' }, ora);
		expect(c.extensions).toContain('mp4');
		expect(c.extensions).not.toContain('jpg');
		expect(c.minSize).toBe(1024 ** 3);
		expect(c.modifiedAfter).toBe(new Date(2026, 10, 11).getTime());
		expect(criteriFiltri({ tipo: null, peso: null, data: 'anno' }, ora).modifiedBefore).toBeLessThan(ora.getTime());
	});

	it('names a search from its text and filters', () => {
		expect(descriviRicerca('', { tipo: 'video', peso: '1gb', data: null })).toBe('Video oltre 1 GB');
		expect(descriviRicerca('fattura', { tipo: null, peso: null, data: '7' })).toBe('«fattura» modificati negli ultimi 7 giorni');
		expect(descriviRicerca('', { tipo: null, peso: '100mb', data: null })).toBe('File oltre 100 MB');
	});
});
