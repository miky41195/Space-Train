import { t } from '../i18n';
import type { Entry } from '../ipc';
import type { KeyValueStore } from './favorites.svelte';
import { onChangeOf } from './sync';

const KEY = 'space-train.actions';

export type ActionMode = 'terminal' | 'background';

/** A command of the user's, run on the selected files. */
export interface CustomAction {
	id: string;
	name: string;
	/** Template with {file}, {files}, {cartella}, {nome}: expanded and quoted in Rust. */
	command: string;
	mode: ActionMode;
	/** Lowercase, without dot; empty = any item. */
	extensions: string[];
	enabled: boolean;
	/** Key combination, written as the settings show it. */
	keys: string | null;
}

/** Examples, off until the user turns them on. */
function presets(): CustomAction[] {
	const base = { enabled: false, keys: null };
	return [
		{ ...base, id: 'vscode', name: t('Apri in VS Code'), command: 'code {files}', mode: 'background', extensions: [] },
		{
			...base,
			id: 'video',
			name: t('Comprimi video'),
			command: 'ffmpeg -i {file} -vcodec libx265 -crf 28 {cartella}/{nome}-piccolo.mp4',
			mode: 'terminal',
			extensions: ['mp4', 'mkv', 'mov']
		},
		{ ...base, id: 'scp', name: t('Carica su un server (scp)'), command: 'scp {files} utente@server:', mode: 'terminal', extensions: [] }
	];
}

/** «MP4, .mkv mov» → ['mp4', 'mkv', 'mov']. */
export function parseExtensions(text: string): string[] {
	return [...new Set(text.toLowerCase().split(/[\s,;]+/).map((x) => x.replace(/^\*?\./, '')).filter(Boolean))];
}

function valid(x: unknown): CustomAction | null {
	if (!x || typeof x !== 'object') return null;
	const a = x as Record<string, unknown>;
	if (typeof a.id !== 'string' || typeof a.name !== 'string' || typeof a.command !== 'string') return null;
	return {
		id: a.id,
		name: a.name,
		command: a.command,
		mode: a.mode === 'terminal' ? 'terminal' : 'background',
		extensions: Array.isArray(a.extensions) ? a.extensions.filter((e): e is string => typeof e === 'string') : [],
		enabled: a.enabled === true,
		keys: typeof a.keys === 'string' ? a.keys : null
	};
}

export class ActionsStore {
	items = $state<CustomAction[]>([]);

	constructor(private storage: KeyValueStore | null = defaultStorage()) {
		this.#read(storage?.getItem(KEY) ?? null);
		onChangeOf(KEY, (v) => this.#read(v));
	}

	#read(raw: string | null): void {
		try {
			const v: unknown = raw ? JSON.parse(raw) : null;
			this.items = Array.isArray(v) ? v.map(valid).filter((a): a is CustomAction => a !== null) : presets();
		} catch {
			this.items = presets();
		}
	}

	/** Enabled actions whose filter every selected item passes. */
	fitting(selection: readonly Entry[]): CustomAction[] {
		if (selection.length === 0) return [];
		return this.items.filter(
			(a) =>
				a.enabled &&
				a.command.trim() !== '' &&
				(a.extensions.length === 0 ||
					selection.every((e) => e.kind !== 'dir' && a.extensions.includes(e.name.split('.').pop()?.toLowerCase() ?? '')))
		);
	}

	/** Adds it, or replaces the one with the same id. */
	save(a: CustomAction): void {
		this.#write(this.items.some((x) => x.id === a.id) ? this.items.map((x) => (x.id === a.id ? a : x)) : [...this.items, a]);
	}

	remove(id: string): void {
		this.#write(this.items.filter((a) => a.id !== id));
	}

	#write(items: CustomAction[]): void {
		this.items = items;
		try {
			this.storage?.setItem(KEY, JSON.stringify(items));
		} catch {
			// Storage refused: the actions last for this session.
		}
	}
}

function defaultStorage(): KeyValueStore | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
