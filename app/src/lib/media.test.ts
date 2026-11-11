import { describe, it, expect } from 'vitest';
import type { Entry, MediaProps } from './ipc';
import { autoMediaColumns, formatDuration, formatMedia, sortByMedia } from './media';

const file = (name: string): Entry => ({ name, path: `C:\\${name}`, kind: 'file', size: 1, modified: 0, hidden: false });
const dir = (name: string): Entry => ({ ...file(name), kind: 'dir' });

describe('autoMediaColumns', () => {
	it('picks the set of the kind that fills most of the folder', () => {
		expect(autoMediaColumns(['a.jpg', 'b.png', 'c.gif', 'd.txt'].map(file))).toEqual(['taken', 'pixels']);
		expect(autoMediaColumns(['1.mp3', '2.flac', '3.mp3'].map(file))).toEqual(['artist', 'album', 'duration']);
	});

	it('stays off for mixed or tiny folders, and folders do not count', () => {
		expect(autoMediaColumns(['a.jpg', 'b.jpg', 'c.txt', 'd.txt'].map(file))).toEqual([]);
		expect(autoMediaColumns(['a.jpg', 'b.jpg'].map(file))).toEqual([]);
		expect(autoMediaColumns([...['a.mp4', 'b.mkv', 'c.mov'].map(file), ...['x', 'y', 'z', 'w'].map(dir)])).toEqual([
			'duration',
			'pixels'
		]);
		expect(autoMediaColumns([])).toEqual([]);
	});
});

describe('formatMedia', () => {
	it('formats durations, sizes and missing values', () => {
		expect(formatDuration(277)).toBe('4:37');
		expect(formatDuration(3725)).toBe('1:02:05');
		expect(formatMedia('pixels', { width: 4032, height: 3024 })).toBe('4032×3024');
		expect(formatMedia('pixels', { width: 4032 })).toBe('');
		expect(formatMedia('artist', null)).toBe('');
	});
});

describe('sortByMedia', () => {
	it('folders first, missing values last in both directions', () => {
		const props: Record<string, MediaProps> = { 'a.mp3': { duration: 200 }, 'b.mp3': { duration: 100 } };
		const entries = [file('c.mp3'), file('a.mp3'), dir('Z'), file('b.mp3')];
		const of = (e: Entry) => props[e.name];
		expect(sortByMedia(entries, 'duration', true, of).map((e) => e.name)).toEqual(['Z', 'b.mp3', 'a.mp3', 'c.mp3']);
		expect(sortByMedia(entries, 'duration', false, of).map((e) => e.name)).toEqual(['Z', 'a.mp3', 'b.mp3', 'c.mp3']);
	});
});
