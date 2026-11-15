import { describe, expect, it } from 'vitest';
import { canHaveVersions, protectedFolderOf, versionWhen } from './versions';

describe('previous versions', () => {
	const now = new Date(2026, 10, 15, 12, 0).getTime();

	it('names the day like a person would', () => {
		expect(versionWhen(new Date(2026, 10, 15, 10, 31).getTime(), now)).toBe('Oggi, 10:31');
		expect(versionWhen(new Date(2026, 10, 14, 17, 5).getTime(), now)).toBe('Ieri, 17:05');
		expect(versionWhen(new Date(2026, 10, 9, 8, 12).getTime(), now)).toBe('9 novembre, 08:12');
		expect(versionWhen(new Date(2025, 0, 2, 8, 0).getTime(), now)).toBe('2 gennaio 2025, 08:00');
	});

	it('finds the protected folder a file is in', () => {
		expect(protectedFolderOf('C:\\Docs\\Lavoro\\a.txt', ['D:\\Foto', 'c:\\docs'])).toBe('c:\\docs');
		expect(protectedFolderOf('C:\\Documenti\\a.txt', ['C:\\Docs'])).toBeNull();
	});

	it('only real files have versions', () => {
		expect(canHaveVersions('C:\\Docs\\a.txt')).toBe(true);
		expect(canHaveVersions('\\\\nas\\share\\a.txt')).toBe(true);
		expect(canHaveVersions('::server\\x\\a.txt')).toBe(false);
	});
});
