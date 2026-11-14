import { describe, it, expect } from 'vitest';
import { filterCriteria, describeSearch, filtersActive, filtersFromStored, filtersToStored, NO_FILTERS } from './filters';

describe('smart folder filters', () => {
	const now = new Date(2026, 10, 11, 15, 30);

	it('no filters, no criteria', () => {
		expect(filtersActive(NO_FILTERS)).toBe(false);
		expect(filterCriteria(NO_FILTERS, now)).toEqual({});
	});

	it('type, size and date become extensions, a minimum size and a time window', () => {
		const c = filterCriteria({ type: 'videos', size: '1gb', date: 'today' }, now);
		expect(c.extensions).toContain('mp4');
		expect(c.extensions).not.toContain('jpg');
		expect(c.minSize).toBe(1024 ** 3);
		expect(c.modifiedAfter).toBe(new Date(2026, 10, 11).getTime());
		expect(filterCriteria({ type: null, size: null, date: 'year' }, now).modifiedBefore).toBeLessThan(now.getTime());
	});

	it('names a search from its text and filters', () => {
		expect(describeSearch('', { type: 'videos', size: '1gb', date: null })).toBe('Video oltre 1 GB');
		expect(describeSearch('fattura', { type: null, size: null, date: '7' })).toBe('«fattura» modificati negli ultimi 7 giorni');
		expect(describeSearch('', { type: null, size: '100mb', date: null })).toBe('File oltre 100 MB');
	});

	it('reads and writes the filters as earlier versions saved them', () => {
		const saved = { tipo: 'immagini', peso: '100mb', data: 'anno' };
		const f = filtersFromStored(saved);
		expect(f).toEqual({ type: 'images', size: '100mb', date: 'year' });
		expect(filtersToStored(f)).toEqual(saved);
		expect(filtersFromStored({ tipo: 'boh' })).toEqual(NO_FILTERS);
	});
});
