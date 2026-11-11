import type { Entry, MediaProps } from './ipc';
import { categoryFor } from './icons';

/** Photo, video and music columns of the details view. */
export type MediaKey = 'taken' | 'duration' | 'pixels' | 'artist' | 'album' | 'camera';

export const MEDIA_COLUMNS: ReadonlyArray<{ key: MediaKey; label: string; width: string; right: boolean }> = [
	{ key: 'taken', label: 'Scattata il', width: '140px', right: true },
	{ key: 'duration', label: 'Durata', width: '80px', right: true },
	{ key: 'pixels', label: 'Dimensioni', width: '110px', right: true },
	{ key: 'artist', label: 'Artista', width: '150px', right: false },
	{ key: 'album', label: 'Album', width: '150px', right: false },
	{ key: 'camera', label: 'Fotocamera', width: '140px', right: false }
];

const BY_KIND: Record<'image' | 'video' | 'audio', MediaKey[]> = {
	image: ['taken', 'pixels'],
	video: ['duration', 'pixels'],
	audio: ['artist', 'album', 'duration']
};

/** File kinds whose details are worth asking Windows for. */
export function isMedia(e: Entry): boolean {
	if (e.kind !== 'file') return false;
	const c = categoryFor(e.name);
	return c === 'image' || c === 'video' || c === 'audio';
}

/**
 * Columns a folder gets on its own: when most of its files (at least
 * three, and 60%) are photos, videos or music, the matching set.
 */
export function autoMediaColumns(entries: readonly Entry[]): MediaKey[] {
	const counts = { image: 0, video: 0, audio: 0 };
	let files = 0;
	for (const e of entries) {
		if (e.kind !== 'file') continue;
		files++;
		const c = categoryFor(e.name);
		if (c === 'image' || c === 'video' || c === 'audio') counts[c]++;
	}
	const [best, n] = (Object.entries(counts) as Array<[keyof typeof counts, number]>).sort((a, b) => b[1] - a[1])[0];
	return n >= 3 && n / files >= 0.6 ? [...BY_KIND[best]] : [];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Every detail worth a line in the preview pane, labelled. */
export function mediaLines(p: MediaProps | null | undefined): Array<[string, string]> {
	if (!p) return [];
	const out: Array<[string, string]> = [];
	if (p.taken !== undefined) out.push(['Scattata il', formatMedia('taken', p)]);
	if (p.camera) out.push(['Fotocamera', p.camera]);
	if (p.width && p.height) out.push(['Dimensioni', `${p.width}×${p.height} px`]);
	if (p.duration !== undefined) out.push(['Durata', formatDuration(p.duration)]);
	if (p.artist) out.push(['Artista', p.artist]);
	if (p.album) out.push(['Album', p.album]);
	if (p.year) out.push(['Anno', String(p.year)]);
	const quality = [
		p.bitrate ? `${Math.round(p.bitrate / 1000)} kbps` : '',
		p.sampleRate ? `${(p.sampleRate / 1000).toLocaleString('it-IT')} kHz` : ''
	].filter(Boolean);
	if (quality.length) out.push(['Qualità', quality.join(' · ')]);
	return out;
}

export function formatDuration(seconds: number): string {
	const s = Math.round(seconds);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Text of one media cell; empty when the file has no such detail. */
export function formatMedia(key: MediaKey, p: MediaProps | null | undefined): string {
	if (!p) return '';
	switch (key) {
		case 'taken': {
			if (p.taken === undefined) return '';
			const d = new Date(p.taken);
			return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
		}
		case 'duration':
			return p.duration === undefined ? '' : formatDuration(p.duration);
		case 'pixels':
			return p.width && p.height ? `${p.width}×${p.height}` : '';
		case 'artist':
			return p.artist ?? '';
		case 'album':
			return p.album ?? '';
		case 'camera':
			return p.camera ?? '';
	}
}

function sortValue(key: MediaKey, p: MediaProps | null | undefined): number | string | undefined {
	if (!p) return undefined;
	switch (key) {
		case 'taken':
			return p.taken;
		case 'duration':
			return p.duration;
		case 'pixels':
			return p.width && p.height ? p.width * p.height : undefined;
		default:
			return formatMedia(key, p) || undefined;
	}
}

/**
 * Sorts by a media column: folders first, as with every other column;
 * files without the detail always last, whatever the direction.
 */
export function sortByMedia(
	entries: readonly Entry[],
	key: MediaKey,
	ascending: boolean,
	propsOf: (e: Entry) => MediaProps | null | undefined
): Entry[] {
	const coll = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });
	return [...entries].sort((a, b) => {
		const da = a.kind === 'dir' ? 0 : 1;
		const db = b.kind === 'dir' ? 0 : 1;
		if (da !== db) return da - db;
		const va = sortValue(key, propsOf(a));
		const vb = sortValue(key, propsOf(b));
		if (va === undefined || vb === undefined) {
			if (va !== vb) return va === undefined ? 1 : -1;
			return coll.compare(a.name, b.name);
		}
		const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : coll.compare(String(va), String(vb));
		return (ascending ? c : -c) || coll.compare(a.name, b.name);
	});
}
