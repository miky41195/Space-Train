import { describe, it, expect } from 'vitest';
import { ClipboardStore } from './clipboard.svelte';

describe('ClipboardStore', () => {
	it('nasce vuoto', () => {
		const c = new ClipboardStore();
		expect(c.vuoto).toBe(true);
		expect(c.mode).toBeNull();
	});

	it('copiare registra i path in modalità copia', () => {
		const c = new ClipboardStore();
		c.copy(['C:\\a.txt', 'C:\\b.txt']);

		expect(c.mode).toBe('copy');
		expect(c.paths).toEqual(['C:\\a.txt', 'C:\\b.txt']);
		expect(c.vuoto).toBe(false);
	});

	it('tagliare registra i path in modalità taglia', () => {
		const c = new ClipboardStore();
		c.cut(['C:\\a.txt']);

		expect(c.mode).toBe('cut');
		expect(c.tagliato('C:\\a.txt')).toBe(true);
	});

	it('un elemento copiato non risulta tagliato', () => {
		const c = new ClipboardStore();
		c.copy(['C:\\a.txt']);

		expect(c.tagliato('C:\\a.txt')).toBe(false);
	});

	it('una nuova copia sostituisce la precedente', () => {
		const c = new ClipboardStore();
		c.copy(['C:\\a.txt']);
		c.cut(['C:\\b.txt']);

		expect(c.mode).toBe('cut');
		expect(c.paths).toEqual(['C:\\b.txt']);
	});

	it('svuotare azzera modalità e path', () => {
		const c = new ClipboardStore();
		c.copy(['C:\\a.txt']);
		c.clear();

		expect(c.vuoto).toBe(true);
		expect(c.paths).toEqual([]);
		expect(c.mode).toBeNull();
	});

	it('copiare una lista vuota lascia gli appunti vuoti', () => {
		const c = new ClipboardStore();
		c.copy([]);

		expect(c.vuoto).toBe(true);
	});

	it('copia i path invece di tenere il riferimento all array', () => {
		const c = new ClipboardStore();
		const originale = ['C:\\a.txt'];
		c.copy(originale);
		originale.push('C:\\intruso.txt');

		expect(c.paths).toEqual(['C:\\a.txt']);
	});
});
