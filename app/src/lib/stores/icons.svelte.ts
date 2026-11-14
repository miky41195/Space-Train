import { SvelteMap } from 'svelte/reactivity';
import type { Backend, Entry } from '../ipc';
import { iconKey, wantsThumbnail } from '../icons';

/**
 * Cap on the thumbnails kept in memory. Each is a base64 PNG of a few
 * tens of KB: without a limit, scrolling a folder of photos would swell
 * memory without ever giving it back.
 */
const THUMBNAIL_CAP = 400;

/**
 * How many thumbnails are extracted at the same time.
 *
 * Behind them there is a single STA thread that reads and decodes the
 * files: raising this number does not make it faster, it only lengthens
 * the queue.
 */
const MAX_PARALLEL = 3;

export class IconsStore {
	/** Type icons: a few dozen, no need to limit them. */
	#icons = new SvelteMap<string, string>();
	/** Thumbnails by path, in insertion order so the oldest can be evicted. */
	#thumbnails = new SvelteMap<string, string>();

	/** Requests already started, so the same thing is never asked twice. */
	#inProgress = new Set<string>();

	/** Thumbnails still to extract, in priority order. */
	#queue: Entry[] = [];
	#active = 0;
	#side = 64;

	constructor(private backend: Backend) {}

	/**
	 * Icon already in cache, or `null`. It does **not** start any loading.
	 *
	 * Reading is pure on purpose: rendering a row must not create work,
	 * otherwise every redraw queues requests again. Asking is `request`'s job.
	 */
	icon(entry: Entry, large = false): string | null {
		return this.#icons.get(iconKey(entry, large)) ?? null;
	}

	/** Thumbnail already in cache, or `null`. It does not start any loading. */
	thumbnail(entry: Entry): string | null {
		return this.#thumbnails.get(entry.path) ?? null;
	}

	/** The side each cached thumbnail was extracted at. */
	#thumbnailSides = new Map<string, number>();

	/**
	 * True when the item must be (re)requested at `side`: missing, or
	 * extracted too small. Enlarging the icons, a 64-pixel thumbnail
	 * stretched to 256 would look grainy.
	 */
	#needs(e: Entry, side: number, all: boolean): boolean {
		if (!all && !wantsThumbnail(e)) return false;
		if (this.#inProgress.has(`t:${e.path}`)) return false;
		const had = this.#thumbnailSides.get(e.path);
		return had === undefined || side > had * 1.25;
	}

	/**
	 * Declares which items are visible now.
	 *
	 * The queue is **replaced**, not extended: what left the screen no
	 * longer needs extracting. Without this, a fast scroll leaves behind
	 * hundreds of requests for rows nobody looks at any more, and the few
	 * useful ones wait their turn behind the useless ones.
	 */
	request(entries: Entry[], side = 64, all = false): void {
		this.#side = side;

		// Type icons are few and do not read the disk: they are asked for
		// at once, without going through the queue.
		for (const e of entries) {
			const key = iconKey(e, false);
			if (!this.#icons.has(key) && !this.#inProgress.has(key)) {
				this.#loadIcon(e, key, false);
			}
		}

		// `all`: at the large sizes folders and programs are asked of the
		// Shell too, which returns their real icon at that side instead of
		// the 32-pixel type icon enlarged.
		this.#queue = entries.filter((e) => this.#needs(e, side, all));

		this.#pump();
	}

	#pump(): void {
		while (this.#active < MAX_PARALLEL && this.#queue.length > 0) {
			const next = this.#queue.shift();
			if (next) this.#loadThumbnail(next, this.#side);
		}
	}

	async #loadIcon(entry: Entry, key: string, large: boolean): Promise<void> {
		if (this.#inProgress.has(key)) return;
		this.#inProgress.add(key);

		const i = entry.name.lastIndexOf('.');
		const ext = entry.kind === 'dir' ? '' : i > 0 ? entry.name.slice(i + 1) : '';

		try {
			const url = await this.backend.iconForExtension(ext, entry.kind === 'dir', large);
			// An empty answer is cached all the same: without it, every
			// redraw would retry forever an extension that has no icon.
			this.#icons.set(key, url ?? '');
		} catch {
			this.#icons.set(key, '');
		} finally {
			this.#inProgress.delete(key);
		}
	}

	async #loadThumbnail(entry: Entry, side: number): Promise<void> {
		const key = `t:${entry.path}`;
		if (this.#inProgress.has(key)) return;
		this.#inProgress.add(key);
		this.#active += 1;

		try {
			const url = await this.backend.thumbnail(entry.path, side);
			this.#evict();
			// An empty answer keeps the image that was there: a smaller
			// thumbnail is better than none.
			if (url || !this.#thumbnails.get(entry.path)) this.#thumbnails.set(entry.path, url ?? '');
			this.#thumbnailSides.set(entry.path, side);
		} catch {
			this.#thumbnails.set(entry.path, '');
		} finally {
			this.#inProgress.delete(key);
			this.#active -= 1;
			this.#pump();
		}
	}

	/** Throws away the oldest: SvelteMap keeps insertion order. */
	#evict(): void {
		while (this.#thumbnails.size >= THUMBNAIL_CAP) {
			const oldest = this.#thumbnails.keys().next();
			if (oldest.done) return;
			this.#thumbnails.delete(oldest.value);
			this.#thumbnailSides.delete(oldest.value);
		}
	}

	/** Number of thumbnails in memory. For tests. */
	get thumbnailsInMemory(): number {
		return this.#thumbnails.size;
	}

	/** Extractions in flight right now. For tests. */
	get inFlight(): number {
		return this.#active;
	}
}
