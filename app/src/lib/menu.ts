import { t } from './i18n';
import { canHaveVersions } from './versions';
import type { Entry, SortKey, SortSpec } from './ipc';
import { isArchive, isExecutable, nameOf, locationName } from './locations';
import { SYSTEM_ROOT, WINDOWS_ONLY, ON_LINUX } from './platform';
import type { GroupMode } from './grouping';
import { SIZES, type View } from './view';
import type { AccentId } from './themes';
import { FOLDER_COLORS, type ColorId } from './stores/colors.svelte';
import { MEDIA_COLUMNS, type MediaKey } from './media';
import { categoryFor } from './icons';

export type MenuAction =
	| 'open'
	| 'openNewTab'
	| 'openNewWindow'
	| 'pin'
	| 'unpin'
	| 'quickAccessUp'
	| 'quickAccessDown'
	| 'openWith'
	| 'openFileLocation'
	| 'runAsAdmin'
	| 'rename'
	| 'copy'
	| 'cut'
	| 'paste'
	| 'trash'
	| 'deletePermanently'
	| 'copyPath'
	| 'revealInExplorer'
	| 'terminal'
	| 'integratedTerminal'
	| 'edit'
	| 'duplicates'
	| 'compare'
	| 'space'
	| 'cleanup'
	| 'compareFiles'
	| 'compareFileOtherPane'
	| 'rules'
	| 'newVault'
	| 'addToVault'
	| 'deleteFromVault'
	| 'lockVault'
	| 'checksum'
	| 'rotateRight'
	| 'rotateLeft'
	| 'convertImages'
	| 'extractHere'
	| 'extractTo'
	| 'setStartPage'
	| 'startupFolder'
	| 'session'
	| `start:${'pc' | 'c' | 'last' | 'current'}`
	| 'newFolder'
	| 'favorite'
	| 'compress'
	| 'extract'
	| 'properties'
	| 'moreOptions'
	| 'undo'
	| 'refresh'
	| 'restore'
	| 'emptyTrash'
	| 'versions'
	| 'protectVersions'
	| 'unprotectVersions'
	| 'folderColor'
	| 'newMenu'
	| `send:${string}`
	| 'share'
	| 'stopSharing'
	| 'download'
	| `new:${string}`
	| `color:${ColorId}`
	| 'noColor'
	// Sort
	| `sort:${SortKey}`
	| 'ascending'
	| 'descending'
	| `group:${GroupMode}`
	// View
	| `view:${View}`
	| `side:${number}`
	| 'compact'
	// Media columns
	| `media:${MediaKey}`
	| 'mediaAuto'
	// Workspaces
	| `workspace:${string}`
	| 'workspaceNew'
	| 'workspaceRename'
	| 'workspaceDelete'
	| 'workspaceLeave'
	// Appearance
	| `theme:${string}`
	| 'accent'
	| 'introAnimation'
	| `pause:${number}`
	| 'themeEditor'
	| `accent:${AccentId}`
	| 'columnType'
	| 'columnSize'
	| 'columnDate'
	| 'extensions'
	| 'hidden'
	| 'preview';

export interface MenuItem {
	action: MenuAction;
	label: string;
	shortcut?: string;
	/** Separator before this item. */
	separator?: boolean;
	danger?: boolean;
	/** Check item: present = it can be turned on and off. */
	checked?: boolean;
	/** Section title shown above the item, like «Raggruppa per». */
	section?: string;
	/**
	 * Name for screen readers when the label alone is ambiguous: «Tipo»
	 * under «Raggruppa per» is not the sorting «Tipo».
	 */
	accessibleName?: string;
	/** A row of colours to pick from in place of a single item. */
	palette?: Array<{
		action: MenuAction;
		name: string;
		color: string | null;
		active: boolean;
		/** The swatch that opens the colour picker. */
		custom?: boolean;
	}>;
}

/** Where the user is: each location has its own operations. */
export type MenuLocation = 'normal' | 'trash' | 'pc' | 'network' | 'lan' | 'archive' | 'server';

export interface MenuContext {
	/** Items selected at the moment of the right click. Empty = click on empty space. */
	selection: readonly Entry[];
	/** True when the clipboard holds something to paste. */
	clipboardFull: boolean;
	/** True when all the selected items are already in the favourites zone. */
	alreadyFavorite?: boolean;
	location?: MenuLocation;
	/** The list shows search results from the subfolders. */
	search?: boolean;
	/** What Ctrl+Z would undo, if there is anything to undo. */
	undoable?: string | null;
	/** The archive view is a vault: items can be added and deleted. */
	vault?: boolean;
	/** Common colour of the selected folders, if they have one. */
	currentColor?: ColorId | null;
	/** Name the user gave each colour label. */
	labelName?: (id: ColorId) => string;
	/** Other PCs with Space Train on the local network, that can be sent to. */
	peers?: ReadonlyArray<{ id: string; name: string }>;
	/** The open folder is the one this PC shares on the local network. */
	sharedHere?: boolean;
	/** Path of the folder shared on the local network, if there is one. */
	shared?: string | null;
	/**
	 * The folder the menu refers to (selected or, on the background, the
	 * open one) is in Quick access.
	 */
	pinned?: boolean;
	/**
	 * The folder the menu refers to is already the start page: the item to
	 * choose it does not show.
	 */
	isStartPage?: boolean;
	/** The menu's folder always opens at startup, in a tab of its own. */
	atStartup?: boolean;
	/** Folder of the other pane when the dual pane is open: «Confronta» uses it. */
	otherPane?: string | null;
	/** The menu's folder is protected: every change of its files leaves a version. */
	protectedFolder?: boolean;
}

function protectItem(on: boolean): MenuItem {
	return on
		? { action: 'unprotectVersions', label: t('Togli la protezione delle versioni') }
		: { action: 'protectVersions', label: t('Proteggi le versioni dei file') };
}

/**
 * Context menu items for a given context.
 *
 * Items that cannot run do not show, instead of showing disabled: a menu
 * of five items all active reads faster than one of nine with four grey.
 */
function compareItem(other: string | null): MenuItem {
	return {
		action: 'compare',
		label: other ? t('Confronta con «{0}»', [locationName(other)]) : t('Confronta con un’altra cartella…')
	};
}

export function menuItems(c: MenuContext, linux = ON_LINUX): MenuItem[] {
	const items = itemsForLocation(c);
	return linux ? items.filter((v) => !WINDOWS_ONLY.has(v.action)) : items;
}

function itemsForLocation(c: MenuContext): MenuItem[] {
	const location = c.location ?? 'normal';
	if (location === 'trash') return trashItems(c);
	if (location === 'archive') return archiveItems(c);
	if (location === 'pc' || location === 'network') return virtualItems(c, location);
	if (location === 'lan') return lanItems(c);
	if (location === 'server') return serverItems(c);
	return c.selection.length === 0 ? backgroundItems(c) : selectionItems(c);
}

function backgroundItems({
	clipboardFull,
	undoable,
	search,
	sharedHere = false,
	pinned = false,
	isStartPage = false,
	atStartup = false,
	otherPane = null,
	protectedFolder = false
}: MenuContext): MenuItem[] {
	const items: MenuItem[] = [];
	if (!search) {
		items.push({ action: 'newMenu', label: t('Nuovo…') });
		items.push({ action: 'newFolder', label: t('Nuova cartella'), shortcut: 'Ctrl+Maiusc+N' });
		if (clipboardFull) {
			items.push({ action: 'paste', label: t('Incolla'), shortcut: 'Ctrl+V', separator: true });
		}
	}
	if (undoable) {
		items.push({
			action: 'undo',
			label: t('Annulla {0}', [undoable]),
			shortcut: 'Ctrl+Z',
			separator: true
		});
	}
	items.push({ action: 'refresh', label: t('Aggiorna'), shortcut: 'F5', separator: true });
	if (!search) {
		items.push(
			pinned
				? { action: 'unpin', label: t('Togli dalla barra laterale'), separator: true }
				: { action: 'pin', label: t('Fissa nella barra laterale'), separator: true }
		);
		items.push(
			sharedHere
				? { action: 'stopSharing', label: t('Smetti di condividere in rete locale') }
				: { action: 'share', label: t('Condividi questa cartella in rete locale') }
		);
		if (!isStartPage) items.push({ action: 'setStartPage', label: t('Imposta come pagina iniziale') });
		items.push(startupItem(atStartup));
		items.push({ action: 'duplicates', label: t('Trova duplicati qui'), separator: true });
		items.push(compareItem(otherPane));
		items.push({ action: 'space', label: t('Analizza spazio') });
		items.push({ action: 'rules', label: t('Regole automatiche…') });
		items.push(protectItem(protectedFolder));
		items.push({ action: 'terminal', label: t('Apri nel terminale') });
		items.push({ action: 'integratedTerminal', label: t('Apri nel terminale integrato') });
		items.push({ action: 'moreOptions', label: t('Altre opzioni di Windows'), separator: true });
		items.push({ action: 'properties', label: t('Proprietà'), shortcut: 'Alt+Invio' });
	}
	return items;
}

/** Text kinds quick editing opens; a small file with no known extension is tried too (Rust refuses what is not UTF-8 text). */
const TEXT_CATEGORIES = ['code', 'markup', 'style', 'data', 'text', 'config'];
const NOT_TEXT = ['rtf', 'db'];
export function isEditableText(e: Pick<Entry, 'name' | 'size' | 'path' | 'kind'>): boolean {
	// Only files on a disk or a network share: not inside archives, servers or other PCs.
	if (e.kind !== 'file' || e.path.includes('::') || !/^([a-z]:[\\/]|\\\\|\/)/i.test(e.path)) return false;
	const cat = categoryFor(e.name);
	if (cat === 'plain') return e.size < 1024 * 1024;
	return TEXT_CATEGORIES.includes(cat) && !NOT_TEXT.includes(e.name.split('.').pop()!.toLowerCase());
}

/** Formats the Rust image tools can read and write back. */
const EDITABLE_IMAGES = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
export function isEditableImage(name: string): boolean {
	return EDITABLE_IMAGES.includes(name.split('.').pop()?.toLowerCase() ?? '');
}

function selectionItems({
	selection,
	clipboardFull,
	alreadyFavorite = false,
	search = false,
	currentColor = null,
	labelName,
	peers = [],
	shared = null,
	pinned = false,
	isStartPage = false,
	atStartup = false,
	otherPane = null,
	protectedFolder = false
}: MenuContext): MenuItem[] {
	const items: MenuItem[] = [];
	const count = selection.length;
	const single = count === 1 ? selection[0] : null;

	// Opening makes sense on a single item: opening twenty files together is
	// almost always an accident, not an intention.
	if (single) {
		items.push({ action: 'open', label: t('Apri'), shortcut: 'Invio' });
		if (single.kind === 'dir') {
			items.push({ action: 'openNewTab', label: t('Apri in una nuova scheda') });
			items.push({ action: 'openNewWindow', label: t('Apri in una nuova finestra') });
			items.push(pinned ? { action: 'unpin', label: t('Togli dalla barra laterale') } : { action: 'pin', label: t('Fissa nella barra laterale') });
			if (!isStartPage) items.push({ action: 'setStartPage', label: t('Imposta come pagina iniziale') });
			items.push(startupItem(atStartup));
			items.push({ action: 'terminal', label: t('Apri nel terminale') });
			items.push({ action: 'integratedTerminal', label: t('Apri nel terminale integrato') });
			items.push({ action: 'duplicates', label: t('Trova duplicati qui') });
			items.push(compareItem(otherPane));
			items.push({ action: 'space', label: t('Analizza spazio') });
			items.push({ action: 'rules', label: t('Regole automatiche…') });
			items.push(protectItem(protectedFolder));
		} else {
			if (isEditableText(single)) items.push({ action: 'edit', label: t('Modifica') });
			items.push({ action: 'openWith', label: t('Apri con…') });
			items.push({ action: 'checksum', label: t('Somma di controllo…') });
			if (canHaveVersions(single.path)) items.push({ action: 'versions', label: t('Versioni precedenti…') });
			if (otherPane) items.push({ action: 'compareFileOtherPane', label: t('Confronta con lo stesso file nell’altro pannello') });
			if (isExecutable(single.name)) {
				items.push({ action: 'runAsAdmin', label: t('Esegui come amministratore') });
			}
		}
		if (search) items.push({ action: 'openFileLocation', label: t('Apri percorso file') });
	}

	items.push({ action: 'copy', label: t('Copia'), shortcut: 'Ctrl+C', separator: true });
	items.push({ action: 'cut', label: t('Taglia'), shortcut: 'Ctrl+X' });

	if (clipboardFull && !search) {
		items.push({ action: 'paste', label: t('Incolla'), shortcut: 'Ctrl+V' });
	}

	if (single) {
		items.push({ action: 'rename', label: t('Rinomina'), shortcut: 'F2', separator: true });
	} else if (!search) {
		// Several items in one folder: the batch rename dialog.
		items.push({ action: 'rename', label: t('Rinomina…'), shortcut: 'F2', separator: true });
	}

	// Favourites belong to the open folder: among the results of a search
	// the items come from different folders and it would make no sense.
	if (!search) {
		items.push({
			action: 'favorite',
			label: alreadyFavorite ? t('Rimuovi dai preferiti') : t('Aggiungi ai preferiti'),
			shortcut: 'Ctrl+D',
			// With a single item the group is already opened by Rename.
			separator: count > 1
		});
	}

	// Folders change colour, files get a coloured label: same palette for both.
	items.push(folderPalette(currentColor, labelName));

	items.push({
		action: 'copyPath',
		label: count === 1 ? t('Copia percorso') : t('Copia percorsi'),
		separator: count > 1 && search
	});

	if (single) {
		items.push({ action: 'revealInExplorer', label: t('Mostra in Esplora risorse') });
	}
	if (count === 2 && selection.every((e) => e.kind === 'file')) {
		items.push({ action: 'compareFiles', label: t('Confronta i due file') });
	}

	if (selection.every((e) => e.kind === 'file' && isEditableImage(e.name))) {
		items.push({ action: 'rotateRight', label: t('Ruota a destra'), separator: true });
		items.push({ action: 'rotateLeft', label: t('Ruota a sinistra') });
		items.push({ action: 'convertImages', label: t('Converti e ridimensiona…') });
	}

	if (!search) {
		items.push({ action: 'compress', label: t('Comprimi in file ZIP'), separator: true });
	}

	// One send per PC found on the local network: whoever receives must accept.
	peers.forEach((p, i) => {
		items.push({ action: `send:${p.id}` as MenuAction, label: t('Invia a {0}', [p.name]), separator: i === 0 });
	});
	if (single?.kind === 'dir') {
		const alreadyShared = shared !== null && shared.toLowerCase() === single.path.toLowerCase();
		items.push(
			alreadyShared
				? { action: 'stopSharing', label: t('Smetti di condividere in rete locale'), separator: peers.length === 0 }
				: { action: 'share', label: t('Condividi in rete locale'), separator: peers.length === 0 }
		);
	}
	if (single && isArchive(single.name)) {
		items.push({ action: 'extract', label: t('Estrai tutto'), separator: search });
	}

	items.push({
		action: 'trash',
		label: count === 1 ? t('Sposta nel Cestino') : t('Sposta {0} elementi nel Cestino', [count]),
		shortcut: 'Canc',
		separator: true,
		danger: true
	});
	items.push({
		action: 'deletePermanently',
		label: t('Elimina definitivamente'),
		shortcut: 'Maiusc+Canc',
		danger: true
	});

	items.push({ action: 'moreOptions', label: t('Altre opzioni di Windows'), separator: true });
	items.push({ action: 'properties', label: t('Proprietà'), shortcut: 'Alt+Invio' });

	return items;
}

/** In the folder another PC shares you read and copy, you do not change it. */
function lanItems({ selection }: MenuContext): MenuItem[] {
	if (selection.length === 0) {
		return [{ action: 'refresh', label: t('Aggiorna'), shortcut: 'F5' }];
	}
	const single = selection.length === 1 ? selection[0] : null;
	const items: MenuItem[] = [];
	if (single) items.push({ action: 'open', label: t('Apri'), shortcut: 'Invio' });
	items.push({ action: 'copy', label: t('Copia'), shortcut: 'Ctrl+C', separator: single !== null });
	items.push({ action: 'download', label: t('Scarica nella cartella Ricevuti') });
	return items;
}

/** A folder on a remote server: open, copy out, paste in, rename, new folder, delete for good. */
function serverItems({ selection, clipboardFull = false }: MenuContext): MenuItem[] {
	if (selection.length === 0) {
		const items: MenuItem[] = [];
		if (clipboardFull) items.push({ action: 'paste', label: t('Incolla (carica sul server)'), shortcut: 'Ctrl+V' });
		items.push({ action: 'newFolder', label: t('Nuova cartella'), shortcut: 'Ctrl+Maiusc+N' });
		items.push({ action: 'refresh', label: t('Aggiorna'), shortcut: 'F5', separator: true });
		return items;
	}
	const items: MenuItem[] = [{ action: 'open', label: t('Apri'), shortcut: 'Invio' }];
	items.push({ action: 'copy', label: t('Copia'), shortcut: 'Ctrl+C', separator: true });
	items.push({ action: 'download', label: t('Scarica nella cartella Ricevuti') });
	if (selection.length === 1) items.push({ action: 'rename', label: t('Rinomina…'), shortcut: 'F2', separator: true });
	items.push({ action: 'deletePermanently', label: t('Elimina dal server'), shortcut: 'Canc', danger: true, separator: selection.length !== 1 });
	items.push({ action: 'copyPath', label: t('Copia percorso'), separator: true });
	return items;
}

function trashItems({ selection }: MenuContext): MenuItem[] {
	if (selection.length === 0) {
		return [
			{ action: 'refresh', label: t('Aggiorna'), shortcut: 'F5' },
			{ action: 'emptyTrash', label: t('Svuota Cestino'), separator: true, danger: true }
		];
	}
	return [
		{
			action: 'restore',
			label: selection.length === 1 ? t('Ripristina') : t('Ripristina {0} elementi', [selection.length])
		},
		{
			action: 'deletePermanently',
			label: t('Elimina definitivamente'),
			shortcut: 'Canc',
			separator: true,
			danger: true
		}
	];
}

/** Inside an archive opened like a folder: open and extract, nothing that writes into it. A vault also takes files in. */
function archiveItems({ selection, vault = false, clipboardFull = false }: MenuContext): MenuItem[] {
	if (vault) return vaultItems(selection, clipboardFull);
	const items: MenuItem[] = [];
	if (selection.length === 1) items.push({ action: 'open', label: t('Apri'), shortcut: 'Invio' });
	const what = selection.length === 0 ? 'tutto' : selection.length === 1 ? '' : t('{0} elementi', [selection.length]);
	items.push({ action: 'extractHere', label: `Estrai ${what} accanto all’archivio`.replace('  ', ' '), separator: items.length > 0 });
	items.push({ action: 'extractTo', label: `Estrai ${what} in…`.replace('  ', ' ') });
	return items;
}

function virtualItems({ selection, isStartPage = false }: MenuContext, location: 'pc' | 'network'): MenuItem[] {
	if (selection.length !== 1) {
		const items: MenuItem[] = [{ action: 'refresh', label: t('Aggiorna'), shortcut: 'F5' }];
		if (location === 'pc' && selection.length === 0 && !isStartPage) {
			items.push({ action: 'start:pc', label: t('Imposta come pagina iniziale'), separator: true });
		}
		return items;
	}
	const items: MenuItem[] = [
		{ action: 'open', label: t('Apri'), shortcut: 'Invio' },
		{ action: 'openNewTab', label: t('Apri in una nuova scheda') },
		{ action: 'copyPath', label: t('Copia percorso'), separator: true }
	];
	if (location === 'pc') {
		if (selection[0].kind === 'dir') {
			items.push({ action: 'space', label: t('Analizza spazio') });
			// Only drives carry their size: a known folder in This PC is not a drive.
			if (selection[0].total != null) items.push({ action: 'cleanup', label: t('Pulizia disco…') });
		}
		items.push({ action: 'moreOptions', label: t('Altre opzioni di Windows'), separator: true });
		items.push({ action: 'properties', label: t('Proprietà'), shortcut: 'Alt+Invio' });
	}
	return items;
}

/** Inside an open vault: extract, add the copied files, delete for good, lock. */
function vaultItems(selection: MenuContext['selection'], clipboardFull: boolean): MenuItem[] {
	const items: MenuItem[] = [];
	if (selection.length === 1) items.push({ action: 'open', label: t('Apri'), shortcut: 'Invio' });
	const what = selection.length === 0 ? 'tutto' : selection.length === 1 ? '' : t('{0} elementi', [selection.length]);
	items.push({ action: 'extractTo', label: `Estrai ${what} in…`.replace('  ', ' '), separator: items.length > 0 });
	if (clipboardFull) items.push({ action: 'addToVault', label: t('Metti qui i file copiati'), shortcut: 'Ctrl+V' });
	if (selection.length > 0) {
		items.push({ action: 'deleteFromVault', label: t('Elimina dalla cassaforte'), shortcut: 'Canc', danger: true, separator: true });
	}
	items.push({ action: 'lockVault', label: t('Chiudi la cassaforte'), separator: true });
	return items;
}

/** The «Colore cartella» palette, with the current colour marked. */
export function folderPalette(
	current: ColorId | null,
	labelName: (id: ColorId) => string = (id) => FOLDER_COLORS.find((c) => c.id === id)?.name ?? id
): MenuItem {
	return {
		action: 'folderColor',
		label: t('Colore'),
		separator: true,
		palette: [
			{ action: 'noColor', name: t('Nessun colore'), color: null, active: current === null },
			...FOLDER_COLORS.map((c) => ({
				action: `color:${c.id}` as MenuAction,
				name: labelName(c.id),
				color: c.hex,
				active: current === c.id
			}))
		]
	};
}

/**
 * Explorer's «Nuovo» menu: first the folder, then the file types the
 * installed programs registered in Windows.
 */
export function newItems(types: ReadonlyArray<{ ext: string; name: string }>): MenuItem[] {
	return [
		{ action: 'newFolder', label: t('Cartella'), shortcut: 'Ctrl+Maiusc+N' },
		{ action: 'newVault', label: t('Cassaforte…') },
		...types.map((t, i) => ({
			action: `new:${t.ext}` as MenuAction,
			label: t.name,
			separator: i === 0
		}))
	];
}

/** The menu of a Quick access folder in the sidebar. */
export function quickAccessItems(first: boolean, last: boolean): MenuItem[] {
	const items: MenuItem[] = [
		{ action: 'openNewTab', label: t('Apri in una nuova scheda') },
		{ action: 'openNewWindow', label: t('Apri in una nuova finestra') }
	];
	if (!first) items.push({ action: 'quickAccessUp', label: t('Sposta su'), separator: true });
	if (!last) items.push({ action: 'quickAccessDown', label: t('Sposta giù'), separator: first });
	items.push({ action: 'unpin', label: t('Togli dalla barra laterale'), separator: true });
	return items;
}

/** What a sidebar stop opens: a virtual place, the Recycle Bin, a Windows folder or a drive. */
export type SidebarKind = 'place' | 'trash' | 'folder' | 'drive';

/** The menu of any other sidebar stop. */
export function sidebarItems(kind: SidebarKind, linux = ON_LINUX): MenuItem[] {
	const items: MenuItem[] = [
		{ action: 'openNewTab', label: t('Apri in una nuova scheda') },
		{ action: 'openNewWindow', label: t('Apri in una nuova finestra') }
	];
	if (kind === 'trash') items.push({ action: 'emptyTrash', label: t('Svuota Cestino'), separator: true, danger: true });
	if (kind === 'folder' || kind === 'drive') items.push({ action: 'space', label: t('Analizza spazio'), separator: true });
	if (kind === 'drive') items.push({ action: 'cleanup', label: t('Pulizia disco…') });
	if ((kind === 'folder' || kind === 'drive') && !linux) items.push({ action: 'properties', label: t('Proprietà') });
	return items;
}

const SORT_KEYS: Array<{ key: SortKey; name: string }> = [
	{ key: 'name', name: t('Nome') },
	{ key: 'modified', name: t('Data di modifica') },
	{ key: 'kind', name: t('Tipo') },
	{ key: 'size', name: t('Dimensione') }
];

const GROUP_MODES: Array<{ mode: GroupMode; name: string }> = [
	{ mode: 'none', name: t('Nessuno') },
	{ mode: 'name', name: t('Nome') },
	{ mode: 'date', name: t('Data di modifica') },
	{ mode: 'type', name: t('Tipo') },
	{ mode: 'size', name: t('Dimensione') }
];

/** Explorer's «Ordina» menu: column, direction and grouping. */
export function sortItems(sort: SortSpec, grouping: GroupMode): MenuItem[] {
	return [
		...SORT_KEYS.map((c) => ({
			action: `sort:${c.key}` as MenuAction,
			label: c.name,
			checked: sort.key === c.key
		})),
		{ action: 'ascending', label: t('Crescente'), checked: sort.ascending, separator: true },
		{ action: 'descending', label: t('Decrescente'), checked: !sort.ascending },
		...GROUP_MODES.map((g, i) => ({
			action: `group:${g.mode}` as MenuAction,
			label: g.name,
			checked: grouping === g.mode,
			accessibleName: g.mode === 'none' ? t('Nessun raggruppamento') : t('Raggruppa per {0}', [g.name.toLowerCase()]),
			separator: i === 0,
			section: i === 0 ? t('Raggruppa per') : undefined
		}))
	];
}

export interface ViewMenuState {
	view: View;
	side: number;
	compact: boolean;
	columns: { type: boolean; size: boolean; date: boolean };
	extensions: boolean;
	hidden: boolean;
	preview: boolean;
	/** The chosen start page: `::pc`, `::ultima` or the path of a folder. */
	startPage?: string;
	/** The tabs of last time reopen at startup. */
	session?: boolean;
}

/** The default start page: the system disk, as before the choice. */
export const DEFAULT_START_PAGE = SYSTEM_ROOT;
/** Special start page: resumes the last folder opened. The value is saved: it stays as it is. */
export const LAST_FOLDER_START_PAGE = '::ultima';

/** Pinning a folder so it opens at every startup, or stopping. */
function startupItem(atStartup: boolean): MenuItem {
	return atStartup
		? { action: 'startupFolder', label: t('Non aprire più all’avvio') }
		: { action: 'startupFolder', label: t('Apri sempre all’avvio') };
}

/** The start pages to choose from in the «Visualizza» menu. */
export function startPageItems(startPage: string = DEFAULT_START_PAGE, session = false): MenuItem[] {
	const choices: Array<[MenuAction, string, string]> = [
		['start:pc', t('Questo PC'), '::pc'],
		['start:c', ON_LINUX ? t('File system (/)') : t('Disco locale (C:)'), DEFAULT_START_PAGE],
		['start:last', t('Ultima cartella aperta'), LAST_FOLDER_START_PAGE]
	];
	const items: MenuItem[] = choices.map(([action, label, value]) => ({
		action,
		label,
		checked: startPage.toLowerCase() === value.toLowerCase()
	}));
	// A folder chosen with the context menu shows with its name.
	if (!choices.some(([, , v]) => v.toLowerCase() === startPage.toLowerCase())) {
		const name = nameOf(startPage) || startPage;
		items.push({ action: 'start:current', label: name, checked: true, accessibleName: startPage });
	}
	items.push({ action: 'session', label: t('Riprendi le schede della volta scorsa'), checked: session });
	return items.map((v, i) => (i === 0 ? { ...v, separator: true, section: t('All’apertura') } : v));
}

/** Explorer's «Visualizza» menu: views, icon sizes, options. */
export function viewItems(s: ViewMenuState): MenuItem[] {
	const size = (side: number) => s.view === 'icons' && s.side === side;
	return [
		...SIZES.map((t) => ({
			action: `side:${t.side}` as MenuAction,
			label: t.name,
			checked: size(t.side)
		})),
		{ action: 'view:list', label: t('Elenco'), checked: s.view === 'list' },
		{ action: 'view:details', label: t('Dettagli'), checked: s.view === 'details' },
		{ action: 'view:tiles', label: t('Riquadri'), checked: s.view === 'tiles' },
		{ action: 'view:content', label: t('Contenuto'), checked: s.view === 'content' },
		{ action: 'compact', label: t('Visualizzazione compatta'), checked: s.compact, separator: true },
		...columnItems(s.columns).map((v, i) => (i === 0 ? { ...v, separator: true, section: t('Colonne dei dettagli') } : v)),
		{
			action: 'preview',
			label: t('Riquadro di anteprima'),
			checked: s.preview,
			shortcut: 'Alt+P',
			separator: true,
			section: t('Mostra')
		},
		{ action: 'extensions', label: t('Estensioni dei nomi file'), checked: s.extensions },
		{ action: 'hidden', label: t('Elementi nascosti'), checked: s.hidden },
		...startPageItems(s.startPage, s.session)
	];
}

/** The columns menu, opened also with the right click on the headers. */
export function columnItems(
	c: ViewMenuState['columns'],
	media: { shown: readonly MediaKey[]; chosen: boolean } | null = null
): MenuItem[] {
	const items: MenuItem[] = [
		{ action: 'columnType', label: t('Tipo'), checked: c.type },
		{ action: 'columnSize', label: t('Dimensione'), checked: c.size },
		{ action: 'columnDate', label: t('Data di modifica'), checked: c.date }
	];
	if (!media) return items;
	MEDIA_COLUMNS.forEach((m, i) =>
		items.push({
			action: `media:${m.key}` as MenuAction,
			label: m.label,
			checked: media.shown.includes(m.key),
			section: i === 0 ? t('Foto, video e musica') : undefined,
			separator: i === 0
		})
	);
	if (media.chosen) items.push({ action: 'mediaAuto', label: t('Colonne automatiche per questa cartella'), separator: true });
	return items;
}

/** The pauses between one pass and the next that can be chosen, in seconds. */
export const TRAIN_PAUSES: ReadonlyArray<[number, string]> = [
	[0, t('Di continuo')],
	[15, t('Ogni 15 secondi')],
	[30, t('Ogni 30 secondi')],
	[60, t('Ogni minuto')],
	[120, t('Ogni 2 minuti')],
	[300, t('Ogni 5 minuti')],
	[600, t('Ogni 10 minuti')],
	[-1, t('Solo durante i trasferimenti')]
];

/**
 * Position of the menu so it stays inside the window.
 *
 * Opening it near the right or bottom edge, a menu placed at the pointer
 * would end up off screen and become unreachable.
 */
export function placeMenu(
	x: number,
	y: number,
	menu: { width: number; height: number },
	window: { width: number; height: number },
	margin = 8
): { x: number; y: number } {
	const maxX = window.width - menu.width - margin;
	const maxY = window.height - menu.height - margin;

	return {
		x: Math.max(margin, Math.min(x, maxX)),
		y: Math.max(margin, Math.min(y, maxY))
	};
}

/** The workspace menu: every area (the current one ticked), then save, rename, delete. */
export function workspaceItems(areas: ReadonlyArray<{ name: string; tabs: readonly string[] }>, current: string | null): MenuItem[] {
	const items: MenuItem[] = areas.map((a) => ({
		action: `workspace:${a.name}` as MenuAction,
		label: a.name,
		shortcut: a.tabs.length === 1 ? t('1 scheda') : t('{0} schede', [a.tabs.length]),
		checked: a.name === current
	}));
	items.push({ action: 'workspaceNew', label: t('Salva come nuova area…'), separator: items.length > 0 });
	if (current !== null) {
		items.push({ action: 'workspaceRename', label: t('Rinomina «{0}»…', [current]) });
		items.push({ action: 'workspaceLeave', label: t('Esci dall’area'), accessibleName: t('Esci dall’area {0}', [current]) });
		items.push({ action: 'workspaceDelete', label: t('Elimina «{0}»', [current]), danger: true, separator: true });
	}
	return items;
}
