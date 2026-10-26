import { describe, it, expect } from 'vitest';
import { fuzzyMatch, filterEntries } from './fuzzy';

describe('fuzzyMatch', () => {
	it('trova una sottostringa contigua', () => {
		const m = fuzzyMatch('cargo', 'Cargo.toml');
		expect(m).not.toBeNull();
		expect(m!.positions).toEqual([0, 1, 2, 3, 4]);
	});

	it('trova una sottosequenza con buchi', () => {
		const m = fuzzyMatch('crgo', 'Cargo.toml');
		expect(m).not.toBeNull();
		expect(m!.positions).toEqual([0, 2, 3, 4]);
	});

	it('ignora le maiuscole', () => {
		expect(fuzzyMatch('CARGO', 'cargo.toml')).not.toBeNull();
		expect(fuzzyMatch('cargo', 'CARGO.TOML')).not.toBeNull();
	});

	it('restituisce null quando i caratteri non ci sono', () => {
		expect(fuzzyMatch('xyz', 'Cargo.toml')).toBeNull();
	});

	it('restituisce null quando i caratteri ci sono ma nell ordine sbagliato', () => {
		expect(fuzzyMatch('ograc', 'Cargo')).toBeNull();
	});

	it('una query vuota corrisponde a tutto senza evidenziare niente', () => {
		const m = fuzzyMatch('', 'qualsiasi.txt');
		expect(m).not.toBeNull();
		expect(m!.positions).toEqual([]);
	});

	it('premia il match contiguo rispetto a quello sparso', () => {
		const contiguo = fuzzyMatch('abc', 'abc.txt')!;
		const sparso = fuzzyMatch('abc', 'a_b_c.txt')!;
		expect(contiguo.score).toBeGreaterThan(sparso.score);
	});

	it('premia il match a inizio parola', () => {
		const inizioParola = fuzzyMatch('mt', 'main.ts')!;
		const dentroParola = fuzzyMatch('mt', 'formatter')!;
		expect(inizioParola.score).toBeGreaterThan(dentroParola.score);
	});

	it('premia il prefisso rispetto al match a metà nome', () => {
		const prefisso = fuzzyMatch('log', 'logger.ts')!;
		const interno = fuzzyMatch('log', 'catalogo.ts')!;
		expect(prefisso.score).toBeGreaterThan(interno.score);
	});

	it('il nome identico alla query prende il punteggio più alto', () => {
		const identico = fuzzyMatch('readme', 'readme')!;
		const parziale = fuzzyMatch('readme', 'readme.md')!;
		expect(identico.score).toBeGreaterThan(parziale.score);
	});

	it('riconosce l inizio parola su maiuscola in camelCase', () => {
		const m = fuzzyMatch('fb', 'fooBar.ts')!;
		expect(m.positions).toEqual([0, 3]);
	});
});

describe('filterEntries', () => {
	const voci = [
		{ name: 'Cargo.toml' },
		{ name: 'catalogo.ts' },
		{ name: 'README.md' },
		{ name: 'src' }
	];

	it('una query vuota restituisce tutto nell ordine originale', () => {
		const r = filterEntries(voci, '');
		expect(r.map((x) => x.item.name)).toEqual([
			'Cargo.toml',
			'catalogo.ts',
			'README.md',
			'src'
		]);
	});

	it('scarta le voci che non corrispondono', () => {
		const r = filterEntries(voci, 'md');
		expect(r.map((x) => x.item.name)).toEqual(['README.md']);
	});

	it('ordina per punteggio decrescente', () => {
		const r = filterEntries(voci, 'ca');
		expect(r[0].item.name).toBe('Cargo.toml');
		expect(r.map((x) => x.item.name)).toContain('catalogo.ts');
	});

	it('restituisce le posizioni da evidenziare per ogni voce', () => {
		const r = filterEntries(voci, 'car');
		expect(r[0].positions).toEqual([0, 1, 2]);
	});

	it('nessun risultato quando niente corrisponde', () => {
		expect(filterEntries(voci, 'zzzz')).toEqual([]);
	});
});
