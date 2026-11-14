/**
 * Automatic updates from the GitHub releases.
 *
 * Checked at startup and then at intervals; an update found downloads
 * quietly, and only once it is ready the user is asked to restart. The
 * user has nothing to do beyond that click; if they postpone, it is
 * offered again the next time the app opens.
 */

/** What we need of an update: a subset of the plugin's `Update`. */
export interface Update {
	version: string;
	body?: string;
	download(): Promise<void>;
	install(): Promise<void>;
}

export interface UpdateSource {
	/** The available update, or `null` when the app is already up to date. */
	check(): Promise<Update | null>;
	relaunch(): Promise<void>;
}

export type UpdateState = 'idle' | 'downloading' | 'ready' | 'installing';

/** How often to check again, for whoever keeps the app open for days. */
export const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export class UpdatesStore {
	state = $state<UpdateState>('idle');
	/** The version ready to install. */
	version = $state<string | null>(null);
	/** The user said «Più tardi»: the bar disappears until the restart. */
	postponed = $state(false);

	#ready: Update | null = null;

	constructor(private source: UpdateSource) {}

	/**
	 * Checks and downloads. An error (no network, GitHub not answering) is
	 * not shown: it tries again at the next check, and meanwhile the app works.
	 */
	async check(): Promise<void> {
		if (this.state !== 'idle') return;
		try {
			const found = await this.source.check();
			if (!found) return;
			this.state = 'downloading';
			await found.download();
			this.#ready = found;
			this.version = found.version;
			this.state = 'ready';
		} catch {
			this.state = 'idle';
		}
	}

	/** Installs and restarts. On Windows the installer closes the app itself. */
	async install(): Promise<void> {
		if (!this.#ready || this.state !== 'ready') return;
		this.state = 'installing';
		try {
			await this.#ready.install();
			await this.source.relaunch();
		} catch {
			this.state = 'ready';
			throw new Error('Aggiornamento non installato: riprova più tardi.');
		}
	}

	postpone(): void {
		this.postponed = true;
	}

	/** Whether to show the bar: something is ready and the user has not postponed it. */
	get visible(): boolean {
		return (this.state === 'ready' || this.state === 'installing') && !this.postponed;
	}
}

/** The real source: Tauri's updater plugin and the process relaunch. */
export const tauriSource: UpdateSource = {
	async check() {
		const { check } = await import('@tauri-apps/plugin-updater');
		const update = await check();
		if (!update) return null;
		return {
			version: update.version,
			body: update.body,
			download: () => update.download(),
			install: () => update.install()
		};
	},
	async relaunch() {
		const { relaunch } = await import('@tauri-apps/plugin-process');
		await relaunch();
	}
};
