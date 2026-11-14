import { describe, expect, it } from 'vitest';
import type { Drive } from './ipc';
import { dueReminder, QUIET } from './disk-reminder';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const drive = (path: string, free: number, kind: Drive['kind'] = 'fixed'): Drive => ({ label: path, path, free, total: 100, kind });

describe('dueReminder', () => {
	it('picks a fixed drive under the threshold', () => {
		expect(dueReminder([drive('D:\\', 50), drive('C:\\', 7)], 10, {}, {}, NOW)?.drive.path).toBe('C:\\');
		expect(dueReminder([drive('E:\\', 2, 'removable')], 10, {}, {}, NOW)).toBeNull();
		expect(dueReminder([drive('C:\\', 7)], 0, {}, {}, NOW)).toBeNull();
	});

	it('reminds once a day and keeps quiet after «Non ora»', () => {
		const c = [drive('C:\\', 7)];
		expect(dueReminder(c, 10, { 'c:\\': { shown: NOW - 3600_000 } }, {}, NOW)).toBeNull();
		expect(dueReminder(c, 10, { 'c:\\': { shown: NOW - 2 * DAY } }, {}, NOW)).not.toBeNull();
		expect(dueReminder(c, 10, { 'c:\\': { quietUntil: NOW + QUIET } }, {}, NOW)).toBeNull();
	});

	it('quotes the last cleanup only while recent', () => {
		const c = [drive('C:\\', 7)];
		expect(dueReminder(c, 10, {}, { 'c:\\': { bytes: 82, at: NOW - DAY } }, NOW)?.found).toBe(82);
		expect(dueReminder(c, 10, {}, { 'c:\\': { bytes: 82, at: NOW - 30 * DAY } }, NOW)?.found).toBeUndefined();
	});
});
