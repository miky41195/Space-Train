import { describe, it, expect } from 'vitest';
import {
	menuItems,
	viewItems,
	sortItems,
	newItems,
	quickAccessItems,
	sidebarItems,
	placeMenu,
	isEditableText,
	isConvertibleImage
} from './menu';
import type { Entry } from './ipc';

function items(count: number): Entry[] {
	return Array.from({ length: count }, (_, i) => ({
		name: `f${i}.txt`,
		path: `C:\\f${i}.txt`,
		kind: 'file' as const,
		size: 1,
		modified: 1,
		hidden: false
	}));
}

const actions = (c: Parameters<typeof menuItems>[0]) => menuItems(c).map((v) => v.action);

describe('menuItems', () => {
	it('on empty space offers to create, refresh and the folder properties', () => {
		expect(actions({ selection: [], clipboardFull: false })).toEqual([
			'newMenu',
			'newFolder',
			'refresh',
			'pin',
			'share',
			'setStartPage',
			'startupFolder',
			'duplicates',
			'compare',
			'space',
			'rules',
			'protectVersions',
			'terminal',
			'integratedTerminal',
			'moreOptions',
			'properties'
		]);
	});

	it('a folder is pinned for startup and unpinned from the same place', () => {
		const v = (atStartup: boolean) =>
			menuItems({ selection: [], clipboardFull: false, atStartup }).find((x) => x.action === 'startupFolder')?.label;
		expect(v(false)).toBe('Apri sempre all’avvio');
		expect(v(true)).toBe('Non aprire più all’avvio');
	});

	it('the folder that is already the start page does not offer it again', () => {
		expect(actions({ selection: [], clipboardFull: false, isStartPage: true })).not.toContain('setStartPage');
		const folder = [{ ...items(1)[0], name: 'Foto', kind: 'dir' as const }];
		expect(actions({ selection: folder, clipboardFull: false })).toEqual(
			expect.arrayContaining(['setStartPage', 'terminal'])
		);
		expect(actions({ selection: items(1), clipboardFull: false })).not.toContain('terminal');
		expect(actions({ selection: [], clipboardFull: false, location: 'pc' })).toContain('start:pc');
	});

	it('on empty space with a full clipboard also offers to paste', () => {
		expect(actions({ selection: [], clipboardFull: true })).toContain('paste');
	});

	it('on empty space offers to undo the last operation, saying which', () => {
		const v = menuItems({ selection: [], clipboardFull: false, undoable: 'rinomina di «a.txt»' });
		expect(v.find((x) => x.action === 'undo')?.label).toBe('Annulla rinomina di «a.txt»');
	});

	it('on a file offers open with, compress and delete permanently', () => {
		const a = actions({ selection: items(1), clipboardFull: false });
		expect(a).toEqual(
			expect.arrayContaining(['openWith', 'compress', 'deletePermanently', 'moreOptions', 'properties'])
		);
		expect(a).not.toContain('openNewTab');
		expect(a).not.toContain('extract');
	});

	it('on Linux leaves out what only the Windows Shell can do', () => {
		const a = menuItems({ selection: items(1), clipboardFull: false }, true).map((v) => v.action);
		for (const only of ['openWith', 'moreOptions', 'properties', 'revealInExplorer']) {
			expect(a).not.toContain(only);
		}
		expect(a).toEqual(expect.arrayContaining(['open', 'compress', 'trash']));
	});

	it('on a folder offers to open it in a new tab', () => {
		const folder = [{ ...items(1)[0], name: 'Foto', kind: 'dir' as const }];
		const a = actions({ selection: folder, clipboardFull: false });
		expect(a).toContain('openNewTab');
		expect(a).not.toContain('openWith');
	});

	it('on a zip offers to extract it, on an exe to run it as administrator', () => {
		const zip = [{ ...items(1)[0], name: 'a.zip' }];
		const exe = [{ ...items(1)[0], name: 'setup.exe' }];
		expect(actions({ selection: zip, clipboardFull: false })).toContain('extract');
		expect(actions({ selection: exe, clipboardFull: false })).toContain('runAsAdmin');
	});

	it('among search results offers the location and not the favourites', () => {
		const a = actions({ selection: items(1), clipboardFull: true, search: true });
		expect(a).toContain('openFileLocation');
		expect(a).not.toContain('favorite');
		expect(a).not.toContain('paste');
	});

	it('in the Recycle Bin items are restored or deleted for good', () => {
		expect(actions({ selection: items(2), clipboardFull: true, location: 'trash' })).toEqual([
			'restore',
			'deletePermanently'
		]);
		expect(actions({ selection: [], clipboardFull: false, location: 'trash' })).toEqual([
			'refresh',
			'emptyTrash'
		]);
	});

	it('in This PC a drive opens or shows its properties', () => {
		const drive = [{ ...items(1)[0], name: 'C:', kind: 'dir' as const }];
		const a = actions({ selection: drive, clipboardFull: false, location: 'pc' });
		expect(a).toContain('open');
		expect(a).toContain('properties');
		expect(a).not.toContain('trash');
	});

	it('on a single item offers open and rename', () => {
		const a = actions({ selection: items(1), clipboardFull: false });

		expect(a).toContain('open');
		expect(a).toContain('rename');
		expect(a).toContain('revealInExplorer');
	});

	it('on several items does not offer open, and rename opens the batch rename', () => {
		const a = actions({ selection: items(3), clipboardFull: false });

		// Opening twenty files together is almost always an accident.
		expect(a).not.toContain('open');
		expect(a).not.toContain('revealInExplorer');
		expect(a).toContain('rename');
		// Search results come from different folders: no batch rename there.
		expect(actions({ selection: items(3), clipboardFull: false, search: true })).not.toContain('rename');
	});

	it('the favourites item says whether it adds or removes', () => {
		const label = (alreadyFavorite: boolean) =>
			menuItems({ selection: items(1), clipboardFull: false, alreadyFavorite }).find(
				(v) => v.action === 'favorite'
			)?.label;

		expect(label(false)).toBe('Aggiungi ai preferiti');
		expect(label(true)).toBe('Rimuovi dai preferiti');
	});

	it('on empty space does not offer favourites', () => {
		expect(actions({ selection: [], clipboardFull: false })).not.toContain('favorite');
	});

	it('paste shows only with a full clipboard', () => {
		expect(actions({ selection: items(1), clipboardFull: false })).not.toContain('paste');
		expect(actions({ selection: items(1), clipboardFull: true })).toContain('paste');
	});

	it('the trash label says how many items go', () => {
		const one = menuItems({ selection: items(1), clipboardFull: false }).find(
			(v) => v.action === 'trash'
		);
		const three = menuItems({ selection: items(3), clipboardFull: false }).find(
			(v) => v.action === 'trash'
		);

		expect(one?.label).toBe('Sposta nel Cestino');
		expect(three?.label).toBe('Sposta 3 elementi nel Cestino');
	});

	it('trash is marked as dangerous', () => {
		const trashItem = menuItems({ selection: items(1), clipboardFull: false }).find(
			(v) => v.action === 'trash'
		);
		expect(trashItem?.danger).toBe(true);
	});

	it('copy path agrees with the number', () => {
		const one = menuItems({ selection: items(1), clipboardFull: false }).find(
			(v) => v.action === 'copyPath'
		);
		const two = menuItems({ selection: items(2), clipboardFull: false }).find(
			(v) => v.action === 'copyPath'
		);

		expect(one?.label).toBe('Copia percorso');
		expect(two?.label).toBe('Copia percorsi');
	});
});

describe('isConvertibleImage', () => {
	it('takes HEIC through the Windows codecs, never on Linux', () => {
		expect(isConvertibleImage('IMG_1.HEIC', false)).toBe(true);
		expect(isConvertibleImage('IMG_1.heic', true)).toBe(false);
		expect(isConvertibleImage('a.png', true)).toBe(true);
		expect(isConvertibleImage('a.txt', false)).toBe(false);
	});
});

describe('placeMenu', () => {
	const menu = { width: 200, height: 300 };
	const window = { width: 1000, height: 700 };

	it('in the middle it stays where it was asked', () => {
		expect(placeMenu(400, 200, menu, window)).toEqual({ x: 400, y: 200 });
	});

	it('near the right edge it comes back inside the window', () => {
		const { x } = placeMenu(950, 200, menu, window);
		expect(x + menu.width).toBeLessThanOrEqual(window.width);
	});

	it('near the bottom edge it comes back inside the window', () => {
		const { y } = placeMenu(400, 690, menu, window);
		expect(y + menu.height).toBeLessThanOrEqual(window.height);
	});

	it('never ends up at negative coordinates', () => {
		const p = placeMenu(0, 0, menu, window);
		expect(p.x).toBeGreaterThanOrEqual(0);
		expect(p.y).toBeGreaterThanOrEqual(0);
	});

	it('a menu taller than the window stays anchored at the top all the same', () => {
		const huge = { width: 200, height: 900 };
		const p = placeMenu(400, 300, huge, window);
		expect(p.y).toBe(8);
	});
});

describe('viewItems', () => {
	it('checks the size, the view and the active options', () => {
		const v = viewItems({
			view: 'icons',
			side: 128,
			compact: true,
			columns: { type: true, size: false, date: true },
			extensions: false,
			hidden: true,
			preview: false
		});
		const checked = v.filter((x) => x.checked).map((x) => x.action);
		expect(checked).toEqual(['side:128', 'compact', 'columnType', 'columnDate', 'hidden', 'start:c']);
	});

	it('checks the start page, even a folder chosen with the menu', () => {
		const base = {
			view: 'details' as const,
			side: 96,
			compact: false,
			columns: { type: false, size: true, date: true },
			extensions: true,
			hidden: false,
			preview: false
		};
		const checked = (startPage: string) =>
			viewItems({ ...base, startPage }).filter((x) => x.action.startsWith('start:') && x.checked);
		expect(checked('::pc').map((x) => x.action)).toEqual(['start:pc']);
		expect(checked('::ultima').map((x) => x.action)).toEqual(['start:last']);
		expect(checked('D:\\Progetti\\').map((x) => x.label)).toEqual(['Progetti']);
	});

	it('lists the eight Explorer views', () => {
		const v = viewItems({
			view: 'details',
			side: 96,
			compact: false,
			columns: { type: false, size: true, date: true },
			extensions: true,
			hidden: false,
			preview: false
		});
		expect(v.slice(0, 8).map((x) => x.label)).toEqual([
			'Icone molto grandi',
			'Icone grandi',
			'Icone medie',
			'Icone piccole',
			'Elenco',
			'Dettagli',
			'Riquadri',
			'Contenuto'
		]);
	});
});

describe('sortItems', () => {
	it('checks column, direction and grouping', () => {
		const v = sortItems({ key: 'modified', ascending: false }, 'type');
		expect(v.filter((x) => x.checked).map((x) => x.action)).toEqual([
			'sort:modified',
			'descending',
			'group:type'
		]);
		expect(v.find((x) => x.section)?.section).toBe('Raggruppa per');
	});
});

describe('folder colour', () => {
	it('the palette is offered for files (colour label) and folders, with the current colour marked', () => {
		const file = items(1);
		const folder = [{ ...items(1)[0], kind: 'dir' as const }];
		expect(actions({ selection: file, clipboardFull: false })).toContain('folderColor');
		const v = menuItems({ selection: folder, clipboardFull: false, currentColor: 'verde' });
		const palette = v.find((x) => x.action === 'folderColor')?.palette ?? [];
		expect(palette.find((c) => c.active)?.action).toBe('color:verde');
		expect(palette[0].action).toBe('noColor');
	});
});

describe('newItems', () => {
	it('first the folder, then the Windows file types', () => {
		const v = newItems([
			{ ext: '.txt', name: 'Documento di testo' },
			{ ext: '.docx', name: 'Documento di Microsoft Word' }
		]);
		expect(v.map((x) => x.action)).toEqual(['newFolder', 'newVault', 'new:.txt', 'new:.docx']);
		expect(v[2].separator).toBe(true);
	});
});

describe('local network in the menu', () => {
	const peers = [
		{ id: 'PC2-ab12', name: 'PC2' },
		{ id: 'PC3-cd34', name: 'PC3' }
	];

	it('offers one send per PC found', () => {
		const a = actions({ selection: items(1), clipboardFull: false, peers });
		expect(a).toContain('send:PC2-ab12');
		expect(a).toContain('send:PC3-cd34');
	});

	it('a folder is shared or stops being shared', () => {
		const folder = [{ ...items(1)[0], path: 'C:\\Foto', kind: 'dir' as const }];
		expect(actions({ selection: folder, clipboardFull: false })).toContain('share');
		expect(actions({ selection: folder, clipboardFull: false, shared: 'c:\\foto' })).toContain(
			'stopSharing'
		);
	});

	it('in the folder of another PC you only read and copy', () => {
		expect(actions({ selection: items(1), clipboardFull: true, location: 'lan' })).toEqual([
			'open',
			'copy',
			'download'
		]);
	});
});

describe('Quick access in the menu', () => {
	it('a folder is pinned or removed, a file is not', () => {
		const folder = [{ ...items(1)[0], kind: 'dir' as const }];
		expect(actions({ selection: folder, clipboardFull: false })).toContain('pin');
		expect(actions({ selection: folder, clipboardFull: false, pinned: true })).toContain('unpin');
		expect(actions({ selection: items(1), clipboardFull: false })).not.toContain('pin');
	});

	it('the sidebar menu does not offer to move past the edges', () => {
		const act = (v: ReturnType<typeof quickAccessItems>) => v.map((x) => x.action);
		expect(act(quickAccessItems(true, false))).not.toContain('quickAccessUp');
		expect(act(quickAccessItems(false, true))).not.toContain('quickAccessDown');
		expect(act(quickAccessItems(true, true))).toEqual(['openNewTab', 'openNewWindow', 'unpin']);
	});

	it('every other sidebar stop opens elsewhere; drives also clean up', () => {
		const act = (v: ReturnType<typeof sidebarItems>) => v.map((x) => x.action);
		expect(act(sidebarItems('place', false))).toEqual(['openNewTab', 'openNewWindow']);
		expect(act(sidebarItems('trash', false))).toEqual(['openNewTab', 'openNewWindow', 'emptyTrash']);
		expect(act(sidebarItems('folder', false))).toEqual(['openNewTab', 'openNewWindow', 'space', 'properties']);
		expect(act(sidebarItems('drive', false))).toEqual(['openNewTab', 'openNewWindow', 'space', 'cleanup', 'properties']);
		expect(act(sidebarItems('drive', true))).not.toContain('properties');
	});
});

describe('quick text editing', () => {
	const file = (name: string, path = 'C:\\Dati\\' + name, size = 100) => ({ name, path, size, kind: 'file' as const });

	it('offers «Modifica» for text files on a disk, not for programs, documents or virtual places', () => {
		expect(isEditableText(file('note.txt'))).toBe(true);
		expect(isEditableText(file('config.json'))).toBe(true);
		expect(isEditableText(file('.gitignore'))).toBe(true);
		expect(isEditableText(file('a.md', '\\\\server\\share\\a.md'))).toBe(true);
		expect(isEditableText(file('setup.exe'))).toBe(false);
		expect(isEditableText(file('lettera.rtf'))).toBe(false);
		expect(isEditableText(file('grande', 'C:\\Dati\\grande', 5_000_000))).toBe(false);
		expect(isEditableText(file('a.txt', 'C:\\Dati\\x.zip::a.txt'))).toBe(false);
		expect(isEditableText(file('a.txt', 'sftp://casa/a.txt'))).toBe(false);
		expect(isEditableText({ ...file('cartella'), kind: 'dir' })).toBe(false);
	});
});
