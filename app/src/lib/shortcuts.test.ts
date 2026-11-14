import { describe, it, expect } from 'vitest';
import { keyAction, SHORTCUT_GROUPS } from './shortcuts';

describe('keyAction', () => {
	it.each([
		[{ key: 'c', ctrlKey: true }, 'copy'],
		[{ key: 'X', ctrlKey: true }, 'cut'],
		[{ key: 'v', ctrlKey: true }, 'paste'],
		[{ key: 'z', ctrlKey: true }, 'undo'],
		[{ key: 'd', ctrlKey: true }, 'favorite'],
		[{ key: 'N', ctrlKey: true, shiftKey: true }, 'newFolder'],
		[{ key: 'Delete' }, 'trash'],
		[{ key: 'Delete', shiftKey: true }, 'deletePermanently'],
		[{ key: 'F2' }, 'rename'],
		[{ key: 'F5' }, 'reload'],
		[{ key: 'r', ctrlKey: true }, 'reload'],
		[{ key: 'l', ctrlKey: true }, 'address'],
		[{ key: 'd', altKey: true }, 'address'],
		[{ key: 'F4' }, 'address'],
		[{ key: 't', ctrlKey: true }, 'newTab'],
		[{ key: 'n', ctrlKey: true }, 'newWindow'],
		[{ key: 'w', ctrlKey: true }, 'closeTab'],
		[{ key: 'Tab', ctrlKey: true }, 'nextTab'],
		[{ key: 'Tab', ctrlKey: true, shiftKey: true }, 'previousTab'],
		[{ key: 'Backspace' }, 'back'],
		[{ key: 'ArrowLeft', altKey: true }, 'back'],
		[{ key: 'ArrowRight', altKey: true }, 'forward'],
		[{ key: 'ArrowUp', altKey: true }, 'up'],
		[{ key: 'Enter', altKey: true }, 'properties'],
		[{ key: 'p', altKey: true }, 'preview'],
		[{ key: 'F3' }, 'search'],
		[{ key: 'f', ctrlKey: true }, 'search']
	])('%o → %s', (input, expected) => {
		expect(keyAction(input)).toBe(expected);
	});

	it('Ctrl+number goes to the tab in that position', () => {
		expect(keyAction({ key: '1', ctrlKey: true })).toEqual({ tab: 0 });
		expect(keyAction({ key: '9', ctrlKey: true })).toEqual({ tab: 8 });
	});

	it('plain keys and arrows stay with the page', () => {
		expect(keyAction({ key: 'a' })).toBeNull();
		expect(keyAction({ key: 'ArrowDown' })).toBeNull();
		expect(keyAction({ key: 'Enter' })).toBeNull();
		expect(keyAction({ key: 'c', ctrlKey: true, altKey: true })).toBeNull();
	});

	it('Ctrl+Shift+1…8 pick the view, Italian keyboard included', () => {
		expect(keyAction({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true })).toEqual({ view: 0 });
		expect(keyAction({ key: '(', code: 'Digit8', ctrlKey: true, shiftKey: true })).toEqual({ view: 7 });
	});
});

describe('SHORTCUT_GROUPS', () => {
	const NAMES: Record<string, string> = {
		Canc: 'Delete',
		Invio: 'Enter',
		'←': 'ArrowLeft',
		'→': 'ArrowRight',
		'↑': 'ArrowUp',
		'↓': 'ArrowDown',
		PagGiù: 'PageDown',
		PagSu: 'PageUp'
	};

	function parse(shown: string) {
		const parts = shown.split('+');
		const key = parts.pop()!;
		return {
			key: NAMES[key] ?? key,
			ctrlKey: parts.includes('Ctrl'),
			shiftKey: parts.includes('Maiusc'),
			altKey: parts.includes('Alt')
		};
	}

	const listed = SHORTCUT_GROUPS.flatMap((g) => g.items).filter((i) => i.action);

	it.each(listed.flatMap((i) => i.keys.map((k) => [k, i.action] as const)))('%s does %s', (shown, action) => {
		expect(keyAction(parse(shown))).toEqual(action);
	});
});
