import { describe, it, expect } from 'vitest';
import {
	acceleratore,
	assegna,
	azioneConPersonalizzate,
	combinazione,
	predefiniti,
	ripristina,
	tastiDi,
	verifica,
	type AzioneSemplice
} from './scorciatoie-personali';
import { SHORTCUT_GROUPS } from './scorciatoie';

const TUTTE = [
	...new Set(SHORTCUT_GROUPS.flatMap((g) => g.items).map((i) => i.action).filter((a): a is AzioneSemplice => typeof a === 'string'))
];

describe('custom shortcuts', () => {
	it('writes a key press like the settings list', () => {
		expect(combinazione({ key: 'D', code: 'KeyD', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Maiusc+D');
		expect(combinazione({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Maiusc+1');
		expect(combinazione({ key: 'ArrowLeft', altKey: true })).toBe('Alt+←');
		expect(combinazione({ key: 'Delete', shiftKey: true })).toBe('Maiusc+Canc');
		expect(combinazione({ key: 'Shift', shiftKey: true })).toBeNull();
	});

	it('every default combination written in the list reads back the same', () => {
		for (const a of TUTTE) for (const k of predefiniti(a)) expect(k).not.toMatch(/\s/);
		expect(predefiniti('doppioPannello')).toEqual(['Ctrl+Maiusc+D']);
	});

	it('a moved action answers its new keys and no longer its old ones', () => {
		const p = assegna({}, 'doppioPannello', 'Ctrl+Maiusc+O', []);
		expect(azioneConPersonalizzate({ key: 'O', code: 'KeyO', ctrlKey: true, shiftKey: true }, p)).toBe('doppioPannello');
		expect(azioneConPersonalizzate({ key: 'D', code: 'KeyD', ctrlKey: true, shiftKey: true }, p)).toBeNull();
		expect(azioneConPersonalizzate({ key: 'c', code: 'KeyC', ctrlKey: true }, p)).toBe('copia');
		expect(tastiDi('doppioPannello', ripristina(p, 'doppioPannello'))).toEqual(['Ctrl+Maiusc+D']);
	});

	it('warns about a combination another action uses and takes it away on confirm', () => {
		const v = verifica('Ctrl+D', 'doppioPannello', {}, TUTTE);
		expect(v.rifiuto).toBeUndefined();
		expect(v.daTogliere).toEqual(['preferito']);
		expect(v.avvisi[0]).toContain('«Aggiungi ai preferiti»');
		const p = assegna({}, 'doppioPannello', 'Ctrl+D', v.daTogliere);
		expect(tastiDi('preferito', p)).toEqual([]);
		expect(azioneConPersonalizzate({ key: 'd', code: 'KeyD', ctrlKey: true }, p)).toBe('doppioPannello');
	});

	it('refuses keys Windows keeps, plain letters and the basic keys; warns on Windows conventions', () => {
		expect(verifica('Alt+Tab', 'copia', {}, TUTTE).rifiuto).toContain('riservata da Windows');
		expect(verifica('Win+L', 'copia', {}, TUTTE).rifiuto).toContain('blocca il PC');
		expect(verifica('Q', 'copia', {}, TUTTE).rifiuto).toContain('aggiungi Ctrl');
		expect(verifica('Invio', 'copia', {}, TUTTE).rifiuto).toContain('non si può cambiare');
		expect(verifica('Alt+F4', 'copia', {}, TUTTE).avvisi[0]).toContain('chiude la finestra');
		expect(verifica('F7', 'copia', {}, TUTTE)).toEqual({ avvisi: [], daTogliere: [] });
	});

	it('translates to the registration syntax', () => {
		expect(acceleratore('Ctrl+Maiusc+D')).toBe('ctrl+shift+KeyD');
		expect(acceleratore('Alt+←')).toBe('alt+ArrowLeft');
		expect(acceleratore('Win+5')).toBe('super+Digit5');
		expect(acceleratore('Ctrl+,')).toBeNull();
	});
});
