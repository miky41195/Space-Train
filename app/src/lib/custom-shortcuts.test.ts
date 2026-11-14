import { describe, it, expect } from 'vitest';
import {
	accelerator,
	assign,
	actionWithCustom,
	check,
	combination,
	customFromStored,
	customToStored,
	defaultKeys,
	keysOf,
	restore,
	type SimpleAction
} from './custom-shortcuts';
import { SHORTCUT_GROUPS } from './shortcuts';

const ALL = [
	...new Set(SHORTCUT_GROUPS.flatMap((g) => g.items).map((i) => i.action).filter((a): a is SimpleAction => typeof a === 'string'))
];

describe('custom shortcuts', () => {
	it('writes a key press like the settings list', () => {
		expect(combination({ key: 'D', code: 'KeyD', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Maiusc+D');
		expect(combination({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Maiusc+1');
		expect(combination({ key: 'ArrowLeft', altKey: true })).toBe('Alt+←');
		expect(combination({ key: 'Delete', shiftKey: true })).toBe('Maiusc+Canc');
		expect(combination({ key: 'Shift', shiftKey: true })).toBeNull();
	});

	it('every default combination written in the list reads back the same', () => {
		for (const a of ALL) for (const k of defaultKeys(a)) expect(k).not.toMatch(/\s/);
		expect(defaultKeys('dualPane')).toEqual(['Ctrl+Maiusc+D']);
	});

	it('a moved action answers its new keys and no longer its old ones', () => {
		const p = assign({}, 'dualPane', 'Ctrl+Maiusc+O', []);
		expect(actionWithCustom({ key: 'O', code: 'KeyO', ctrlKey: true, shiftKey: true }, p)).toBe('dualPane');
		expect(actionWithCustom({ key: 'D', code: 'KeyD', ctrlKey: true, shiftKey: true }, p)).toBeNull();
		expect(actionWithCustom({ key: 'c', code: 'KeyC', ctrlKey: true }, p)).toBe('copy');
		expect(keysOf('dualPane', restore(p, 'dualPane'))).toEqual(['Ctrl+Maiusc+D']);
	});

	it('warns about a combination another action uses and takes it away on confirm', () => {
		const v = check('Ctrl+D', 'dualPane', {}, ALL);
		expect(v.refusal).toBeUndefined();
		expect(v.toRemove).toEqual(['favorite']);
		expect(v.warnings[0]).toContain('«Aggiungi ai preferiti»');
		const p = assign({}, 'dualPane', 'Ctrl+D', v.toRemove);
		expect(keysOf('favorite', p)).toEqual([]);
		expect(actionWithCustom({ key: 'd', code: 'KeyD', ctrlKey: true }, p)).toBe('dualPane');
	});

	it('refuses keys Windows keeps, plain letters and the basic keys; warns on Windows conventions', () => {
		expect(check('Alt+Tab', 'copy', {}, ALL).refusal).toContain('riservata da Windows');
		expect(check('Win+L', 'copy', {}, ALL).refusal).toContain('blocca il PC');
		expect(check('Q', 'copy', {}, ALL).refusal).toContain('aggiungi Ctrl');
		expect(check('Invio', 'copy', {}, ALL).refusal).toContain('non si può cambiare');
		expect(check('Alt+F4', 'copy', {}, ALL).warnings[0]).toContain('chiude la finestra');
		expect(check('F7', 'copy', {}, ALL)).toEqual({ warnings: [], toRemove: [] });
	});

	it('translates to the registration syntax', () => {
		expect(accelerator('Ctrl+Maiusc+D')).toBe('ctrl+shift+KeyD');
		expect(accelerator('Alt+←')).toBe('alt+ArrowLeft');
		expect(accelerator('Win+5')).toBe('super+Digit5');
		expect(accelerator('Ctrl+,')).toBeNull();
	});

	it('keeps the saved action ids of earlier versions', () => {
		const stored = { doppioPannello: ['Ctrl+Maiusc+O'], preferito: [], sconosciuta: ['F9'] };
		const custom = customFromStored(stored);
		expect(custom).toEqual({ dualPane: ['Ctrl+Maiusc+O'], favorite: [] });
		expect(customToStored(custom)).toEqual({ doppioPannello: ['Ctrl+Maiusc+O'], preferito: [] });
		// Every action that can be customised has a saved id.
		for (const a of ALL) expect(Object.keys(customToStored({ [a]: ['F9'] }))).toHaveLength(1);
	});
});
