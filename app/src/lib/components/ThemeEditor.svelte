<script lang="ts">
	import { t } from '../i18n';
	import type { Backend } from '../ipc';
	import {
		THEMES,
		FONTS,
		BASE_SHAPES,
		TEXT_SIZE_MIN,
		TEXT_SIZE_MAX,
		CORNERS,
		TAB_SHAPES,
		SKIES,
		FRAMES,
		FOLDER_STYLES,
		folderStyleOf,
		variablesFrom,
		themeById,
		type Theme,
		type PersonalTheme,
		type Corner,
		type TabShape,
		type Sky,
		type Frame
	} from '../themes';
	import { FIGURES, figureSvg } from '../figures';
	import { INTRO_ANIMATIONS, FOLDER_ANIMATIONS, INTRO_MOTIONS, animationsOf, type Animations } from '../animations';
	import type { FolderStyle } from '../icons';
	import { nameOf } from '../locations';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import {
		encode,
		decode,
		guess,
		alternateWithFirst,
		pingPong,
		frameSize,
		parseOrder,
		railSize,
		grid,
		gridBoxes,
		RAIL_HEIGHT_MIN,
		RAIL_HEIGHT_MAX,
		RAIL_WIDTH_MIN,
		RAIL_WIDTH_MAX,
		normalize,
		formatOrder,
		style,
		withZone,
		drawing,
		type Spritesheet
	} from '../spritesheet';
	import FramePicker from './FramePicker.svelte';
	import { draggable } from '../draggable';
	import {
		WALK,
		withMotion,
		readMotion,
		defaultMotion,
		normalizeMotion,
		type Motion,
		type MotionKind
	} from '../motion';
	import { backgroundColor, pixelColor, fromHex, toHex, removeBackground } from '../transparency';
	import { readPixels, writePng } from '../pixel';
	import Icon from './Icon.svelte';

	let {
		inWindow = false,
		currentTheme,
		personal,
		backend,
		onpreview,
		onsave,
		ondelete,
		onclose
	}: {
		/**
		 * In a window of its own: it fills it and moves like a Windows
		 * window, even outside the app. Without, it is a box above the app.
		 */
		inWindow?: boolean;
		/** The theme in use: if it is one of yours it is edited, otherwise it is the starting point. */
		currentTheme: Theme;
		personal: readonly PersonalTheme[];
		backend: Backend;
		/** The theme as it is now, to show it live on the app. */
		onpreview: (t: PersonalTheme) => void;
		onsave: (t: PersonalTheme) => void;
		ondelete: (id: string) => void;
		onclose: () => void;
	} = $props();

	/**
	 * The colours the editor lets you choose, with their name for the user.
	 * «Sfondo» is `--hull`: it is the colour of the list, sidebar and header,
	 * that is, what you see. `--void` is only behind and in the fields.
	 */
	const COLORS = [
		['hull', '--hull', t('Sfondo')],
		['void', '--void', t('Campi di testo e bordi')],
		['text', '--text', t('Testo')],
		['dim', '--text-dim', t('Testo secondario')],
		['plasma', '--plasma', t('Evidenziazione')],
		['current', '--current', t('Luci e binario acceso')],
		['signal', '--signal', t('Preferiti e segnali')],
		['rail', '--rail-metal', t('Binario spento')]
	] as const;

	type ColorKey = (typeof COLORS)[number][0];

	// The initial state is read once on opening: the editor must not
	// start over if the theme in use changes while editing.
	// svelte-ignore state_referenced_locally
	const editing = currentTheme.group === 'personal' ? currentTheme : null;

	let id = $state(editing?.id ?? `personale-${Date.now()}`);
	let name = $state(editing?.name ?? t('Il mio tema'));
	let light = $state(false);
	let palette = $state<Record<ColorKey, string>>({} as Record<ColorKey, string>);
	let radius = $state(BASE_SHAPES.radius);
	let radiusSmall = $state(BASE_SHAPES.radiusSmall);
	let font = $state(BASE_SHAPES.font);
	let titleFont = $state(BASE_SHAPES.titleFont);
	let size = $state(BASE_SHAPES.size);
	let titleSize = $state(BASE_SHAPES.size);
	let corner = $state<Corner>(BASE_SHAPES.corner);
	let tab = $state<TabShape>(BASE_SHAPES.tab);
	let sky = $state<Sky>(BASE_SHAPES.sky);
	let frame = $state<Frame>(BASE_SHAPES.frame);
	let folder = $state<FolderStyle>('windows');
	let paradeKind = $state<'train' | 'figures' | 'images'>('train');
	let figures = $state<string[]>([]);
	let images = $state<string[]>([]);
	/** How each image moves on the rail, in the same order as `images`. */
	let motions = $state<Motion[]>([]);
	let pattern = $state('');
	let animations = $state<Animations>(animationsOf(undefined));
	let loading = $state(false);
	let error = $state<string | null>(null);

	/** How to remove each image's background; without a colour it is read from the corners. */
	type BackgroundOpts = { tolerance: number; edgesOnly: boolean; color?: string };
	let backgroundOpts = $state<Record<number, BackgroundOpts>>({});
	/** Image without background → the original it was made from. */
	let originals = $state<Record<string, string>>({});
	/** The image being worked on, and the one with the eyedropper on. */
	let processing = $state<number | null>(null);
	let eyedropper = $state<number | null>(null);
	let backgroundResult = $state<string | null>(null);

	/** The number typed in the field, rounded and brought back within limits. */
	function validPixels(typed: string): number {
		const n = Math.round(Number(typed));
		return Number.isFinite(n) ? Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, n)) : BASE_SHAPES.size;
	}

	/** Copies into the editor everything that defines `t`: colours, shapes, parade. */
	function startFrom(t: Theme) {
		light = t.light;
		palette = Object.fromEntries(
			COLORS.map(([k, v]) => [k, only6(t.variables[v] ?? '#888888')])
		) as Record<ColorKey, string>;
		radius = t.shapes?.radius ?? BASE_SHAPES.radius;
		radiusSmall = t.shapes?.radiusSmall ?? BASE_SHAPES.radiusSmall;
		font = t.shapes?.font ?? BASE_SHAPES.font;
		titleFont = t.shapes?.titleFont ?? BASE_SHAPES.titleFont;
		size = t.shapes?.size ?? BASE_SHAPES.size;
		titleSize = t.shapes?.titleSize ?? size;
		corner = t.shapes?.corner ?? BASE_SHAPES.corner;
		tab = t.shapes?.tab ?? BASE_SHAPES.tab;
		sky = t.shapes?.sky ?? BASE_SHAPES.sky;
		frame = t.shapes?.frame ?? BASE_SHAPES.frame;
		folder = folderStyleOf(t);
		const items = t.parade ?? [];
		const read = items.map((v) => readMotion(v));
		const mine = read.filter((l) => isMine(l.item));
		images = mine.map((l) => l.item);
		motions = mine.map((l) => l.motion);
		figures = items.filter((v) => !isMine(readMotion(v).item));
		paradeKind = images.length > 0 ? 'images' : figures.length > 0 ? 'figures' : 'train';
		pattern = t.pattern ?? '';
		animations = animationsOf(t.animations);
	}

	/** Changes an image's motion; picking a kind starts again from its values. */
	function setMotion(i: number, partial: Partial<Motion>) {
		const current = motions[i] ?? WALK;
		const updated =
			partial.kind && partial.kind !== current.kind
				? defaultMotion(partial.kind)
				: normalizeMotion({ ...current, ...partial });
		motions = motions.map((m, j) => (j === i ? updated : m));
	}

	/** The full round of whoever crosses in a loop: travel plus pause. */
	function roundOf(m: Motion): string {
		const s = m.duration + m.pause;
		return t('{0} s', [Number.isInteger(s) ? s : s.toFixed(1)]);
	}

	const MOTION_KINDS: Array<[MotionKind, string]> = [
		['walk', t('Cammina con gli altri')],
		['still', t('Resta fermo in un punto')],
		['cross', t('Attraversa da solo fino in fondo')]
	];

	/** The colour picker always wants `#rrggbb`. */
	function only6(c: string): string {
		return /^#[0-9a-f]{6}$/i.test(c) ? c : '#888888';
	}

	// svelte-ignore state_referenced_locally
	startFrom(currentTheme);

	let theme = $derived<PersonalTheme>({
		id,
		name: name.trim() || t('Il mio tema'),
		light,
		group: 'personal',
		variables: variablesFrom(palette, light),
		shapes: { radius, radiusSmall, font, titleFont, size, titleSize, corner, tab, sky, frame, folder },
		parade:
			paradeKind === 'train'
				? undefined
				: paradeKind === 'figures'
					? figures
					: images.map((v, i) => withMotion(v, motions[i] ?? WALK)),
		pattern: pattern || undefined,
		animations: { ...animations, figure: animations.figure || undefined }
	});

	/** The startup figure: the theme's own images first, then the built-in figures. */
	function imageName(v: string): string {
		return v.startsWith('img:') ? nameOf(v.slice(4)) : nameOf(decode(v)?.src ?? v);
	}

	// Live preview: the app changes while you choose.
	$effect(() => {
		onpreview(theme);
	});

	/** A parade item that comes from a file of the user. */
	function isMine(v: string): boolean {
		return v.startsWith('img:') || v.startsWith('sprite:');
	}

	function pathOf(v: string): string {
		return decode(v)?.src ?? v.slice(4);
	}

	/**
	 * The image's real size, to tell whether it is a spritesheet and
	 * how big a frame is. If they cannot be read (odd
	 * format) the image stays a plain image.
	 */
	async function measure(path: string): Promise<{ w: number; h: number } | null> {
		try {
			const img = new Image();
			img.src = convertFileSrc(path);
			await Promise.race([img.decode(), new Promise((_, fail) => setTimeout(fail, 3000))]);
			return img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null;
		} catch {
			return null;
		}
	}

	/** From plain image to spritesheet and back. */
	async function toggleSprite(i: number) {
		const v = images[i];
		const sheet = decode(v);
		if (sheet) {
			images[i] = `img:${sheet.src}`;
			return;
		}
		const path = v.slice(4);
		const d = await measure(path);
		if (!d) {
			error = t('Non riesco a leggere le dimensioni di questa immagine.');
			return;
		}
		images[i] = encode(guess(path, d.w, d.h));
	}

	function updateSprite<K extends keyof Spritesheet>(i: number, field: K, value: Spritesheet[K]) {
		const sheet = decode(images[i]);
		if (!sheet) return;
		// Zone and frames are checked again against the image.
		images[i] = encode(normalize({ ...sheet, [field]: value }));
	}

	/** The order typed by hand: the field then shows the one that will really be used. */
	function orderField(i: number, input: HTMLInputElement) {
		const sheet = decode(images[i]);
		if (!sheet) return;
		updateSprite(i, 'order', parseOrder(input.value, sheet.frames));
		input.value = formatOrder(decode(images[i])!);
	}

	/**
	 * Columns, rows and frames of the grid in the zone. Changing the
	 * grid uses all the cells; frames can then be removed
	 * from the end, for an incomplete last row.
	 */
	function gridField(i: number, field: 'columns' | 'rows' | 'frames', value: number) {
		const sheet = decode(images[i]);
		if (!sheet || !(value >= 1)) return;
		const g = { ...grid(sheet), [field === 'frames' ? '_' : field]: Math.round(value) };
		const frames = field === 'frames' ? Math.round(value) : g.columns * g.rows;
		// With a single row the columns are the frames themselves.
		const updated =
			g.rows > 1
				? { ...sheet, rows: g.rows, columns: g.columns, frames }
				: { ...sheet, rows: undefined, columns: undefined, frames };
		images[i] = encode(normalize(updated));
	}

	function updateZone(i: number, x: number, y: number, w: number, h: number) {
		const sheet = decode(images[i]);
		if (sheet) images[i] = encode(withZone(sheet, x, y, w, h));
	}

	/**
	 * A zone field typed by hand. If the value goes outside the image it is
	 * brought back within limits, and the field shows the real one, not the typed one.
	 */
	function backgroundOf(i: number): BackgroundOpts {
		return backgroundOpts[i] ?? { tolerance: 24, edgesOnly: false };
	}

	function setBackground(i: number, changes: Partial<BackgroundOpts>) {
		backgroundOpts = { ...backgroundOpts, [i]: { ...backgroundOf(i), ...changes } };
	}

	/** The same parade item, with another image. */
	function withImage(item: string, path: string): string {
		const sheet = decode(item);
		return sheet ? encode({ ...sheet, src: path }) : `img:${path}`;
	}

	/**
	 * Removes the background always starting from the original: redoing it with another
	 * tolerance does not pile up the cuts. The result is a new PNG in the
	 * themes folder; the original stays there, so it can be restored.
	 */
	async function removeBackgroundOf(i: number) {
		const path = pathOf(images[i]);
		const source = originals[path] ?? path;
		const o = backgroundOf(i);
		processing = i;
		error = null;
		backgroundResult = null;
		try {
			const img = await readPixels(await backend.readThemeImage(source));
			const color = o.color ? fromHex(o.color) : backgroundColor(img);
			if (!color) {
				error = t('Lo sfondo di questa immagine è già trasparente.');
				return;
			}
			const removed = removeBackground(img, { color, tolerance: o.tolerance, edgesOnly: o.edgesOnly });
			const base = (nameOf(source) || 'immagine').replace(/\.[^.]+$/, '');
			const saved = await backend.saveThemeImage(`${base}-trasparente.png`, await writePng(img));
			originals = { ...originals, [saved]: source };
			images[i] = withImage(images[i], saved);
			backgroundResult = removed > 0 ? t('Sfondo tolto: {0} pixel ora trasparenti.', [removed]) : t('Nessun pixel di quel colore.');
		} catch (e) {
			error = t('Non riesco a togliere lo sfondo: {0}', [e instanceof Error ? e.message : String(e)]);
		} finally {
			processing = null;
		}
	}

	function restoreOriginal(i: number) {
		const original = originals[pathOf(images[i])];
		if (original) images[i] = withImage(images[i], original);
		backgroundResult = null;
	}

	/** Eyedropper: the background colour is that of the pixel clicked on the sheet. */
	async function pickColor(i: number, x: number, y: number) {
		eyedropper = null;
		const path = pathOf(images[i]);
		try {
			const img = await readPixels(await backend.readThemeImage(originals[path] ?? path));
			setBackground(i, { color: toHex(pixelColor(img, x, y)) });
		} catch (e) {
			error = t('Non riesco a leggere il colore: {0}', [e instanceof Error ? e.message : String(e)]);
		}
	}

	function zoneField(i: number, field: 'x' | 'y' | 'w' | 'h', input: HTMLInputElement) {
		updateSprite(i, field, Number(input.value));
		const sheet = decode(images[i]);
		if (sheet) input.value = String(sheet[field]);
	}

	function toggleFigure(f: string) {
		figures = figures.includes(f) ? figures.filter((x) => x !== f) : [...figures, f].slice(0, 6);
	}

	/** The chosen images are copied into the app's data folder. */
	async function addImages(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = [...(input.files ?? [])];
		if (file.length === 0) return;
		loading = true;
		error = null;
		try {
			for (const f of file) {
				const base64 = await readBase64(f);
				const path = await backend.saveThemeImage(f.name, base64);
				// A strip of square frames becomes a spritesheet
				// at once; everything else starts as a plain image.
				const d = await measure(path);
				const proposal = d ? guess(path, d.w, d.h) : null;
				const item = proposal && proposal.frames > 1 ? encode(proposal) : `img:${path}`;
				images = [...images, item].slice(0, 8);
				motions = [...motions, WALK].slice(0, 8);
			}
			paradeKind = 'images';
		} catch {
			error = t('Non è stato possibile salvare l’immagine.');
		} finally {
			loading = false;
			input.value = '';
		}
	}

	function readBase64(f: File): Promise<string> {
		return new Promise((ok, fail) => {
			const r = new FileReader();
			r.onload = () => ok(String(r.result).split(',')[1] ?? '');
			r.onerror = () => fail(r.error);
			r.readAsDataURL(f);
		});
	}

	let all = $derived([...THEMES, ...personal]);

	/** The box is moved by hand only inside the app: Windows takes care of the window. */
	function makeDraggable(node: HTMLElement, active: boolean) {
		return active ? draggable(node) : undefined;
	}
</script>

<div class="backdrop" class:full={inWindow} role="presentation">
	<div class="window" class:full={inWindow} role="dialog" aria-modal="true" aria-label={t('Editor dei temi')}
		use:makeDraggable={!inWindow}>
		<!-- In a window Windows moves the header: even outside the app. -->
		<header title={t('Trascina per spostare l\'editor e vedere il tema dietro')} data-tauri-drag-region={inWindow || undefined}>
			<h2 data-tauri-drag-region={inWindow || undefined}>{editing ? t('Modifica tema') : t('Nuovo tema')}</h2>
			<button class="close" onclick={onclose} aria-label={t('Chiudi l\'editor')}><Icon name="close" /></button>
		</header>

		<div class="body">
			<section>
				<label class="row">
					<span>{t('Nome')}</span>
					<input type="text" bind:value={name} maxlength="40" aria-label={t('Nome del tema')} />
				</label>
				<label class="row">
					<span>{t('Parti da')}</span>
					<select
						aria-label={t('Parti da un tema')}
						onchange={(e) => startFrom(themeById(e.currentTarget.value, personal))}
					>
						<option value="" selected disabled>{t('Scegli un tema…')}</option>
						{#each all as t (t.id)}
							<option value={t.id}>{t.name}</option>
						{/each}
					</select>
				</label>
				<label class="row">
					<span>{t('Fondo chiaro')}</span>
					<input type="checkbox" bind:checked={light} aria-label={t('Fondo chiaro')} />
				</label>
			</section>

			<section>
				<h3>{t('Colori')}</h3>
				<div class="colors">
					{#each COLORS as [k, , label] (k)}
						<!-- Not a label: it would take up the whole column and a click
						     anywhere in the row would open the picker. It opens only
						     from the little square. -->
						<div class="color">
							<input type="color" bind:value={palette[k]} aria-label={label} />
							<span aria-hidden="true">{label}</span>
						</div>
					{/each}
				</div>
			</section>

			<section>
				<h3>{t('Forme')}</h3>
				<label class="row">
					<span>{t('Arrotondamento finestre')}</span>
					<input type="range" min="0" max="28" bind:value={radius} aria-label={t('Arrotondamento finestre')} />
					<output>{radius}px</output>
				</label>
				<label class="row">
					<span>{t('Arrotondamento righe e pulsanti')}</span>
					<input type="range" min="0" max="20" bind:value={radiusSmall} aria-label={t('Arrotondamento righe')} />
					<output>{radiusSmall}px</output>
				</label>
				<label class="row">
					<span>{t('Angoli')}</span>
					<select bind:value={corner} aria-label={t('Angoli')}>
						{#each CORNERS as a (a.value)}
							<option value={a.value}>{a.name}</option>
						{/each}
					</select>
				</label>
				<label class="row">
					<span>{t('Schede')}</span>
					<select bind:value={tab} aria-label={t('Schede')}>
						{#each TAB_SHAPES as s (s.value)}
							<option value={s.value}>{s.name}</option>
						{/each}
					</select>
				</label>
				<label class="row">
					<span>{t('Cielo')}</span>
					<select bind:value={sky} aria-label={t('Cielo')}>
						{#each SKIES as c (c.value)}
							<option value={c.value}>{c.name}</option>
						{/each}
					</select>
				</label>
				<label class="row">
					<span>{t('Cornice della finestra')}</span>
					<select bind:value={frame} aria-label={t('Cornice della finestra')}>
						{#each FRAMES as c (c.value)}
							<option value={c.value}>{c.name}</option>
						{/each}
					</select>
				</label>
				<label class="row">
					<span>{t('Cartelle')}</span>
					<select bind:value={folder} aria-label={t('Cartelle')}>
						{#each FOLDER_STYLES as f (f.value)}
							<option value={f.value}>{f.name}</option>
						{/each}
					</select>
				</label>
				<label class="row">
					<span>{t('Dimensione del testo')}</span>
					<input type="range" min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} bind:value={size}
						aria-label={t('Dimensione del testo')} />
					<input class="pixel" type="number" min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} value={size}
						aria-label={t('Dimensione del testo in pixel')}
						onchange={(e) => {
							size = validPixels(e.currentTarget.value);
							e.currentTarget.value = String(size);
						}} />
					<span class="unit">{t('px')}</span>
				</label>
				<label class="row">
					<span>{t('Carattere del testo')}</span>
					<select bind:value={font} aria-label={t('Carattere del testo')}>
						{#each FONTS as c (c.value)}
							<option value={c.value}>{c.name}</option>
						{/each}
					</select>
				</label>
				<label class="row">
					<span>{t('Carattere dei titoli')}</span>
					<select bind:value={titleFont} aria-label={t('Carattere dei titoli')}>
						{#each FONTS as c (c.value)}
							<option value={c.value}>{c.name}</option>
						{/each}
					</select>
				</label>
				<label class="row">
					<span>{t('Dimensione dei titoli')}</span>
					<input type="range" min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} bind:value={titleSize}
						aria-label={t('Dimensione dei titoli')} />
					<input class="pixel" type="number" min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} value={titleSize}
						aria-label={t('Dimensione dei titoli in pixel')}
						onchange={(e) => {
							titleSize = validPixels(e.currentTarget.value);
							e.currentTarget.value = String(titleSize);
						}} />
					<span class="unit">{t('px')}</span>
				</label>
			</section>

			<section>
				<h3>{t('Sul binario passa…')}</h3>
				<div class="choice" role="radiogroup" aria-label={t('Chi passa sul binario')}>
					<label><input type="radio" bind:group={paradeKind} value="train" /> {t('Il treno')}</label>
					<label><input type="radio" bind:group={paradeKind} value="figures" /> {t('Personaggi inclusi')}</label>
					<label><input type="radio" bind:group={paradeKind} value="images" /> {t('Le mie immagini')}</label>
				</div>

				{#if paradeKind === 'figures'}
					<p class="note">{t('Scegli fino a 6 personaggi: sfilano nell’ordine in cui li selezioni.')}</p>
					<div class="figures">
						{#each Object.entries(FIGURES) as [fid, f] (fid)}
							<button
								class="figure"
								class:chosen={figures.includes(fid)}
								aria-pressed={figures.includes(fid)}
								title={f.name}
								aria-label={f.name}
								onclick={() => toggleFigure(fid)}
							>
								{@html figureSvg(f, 2)}
								{#if figures.includes(fid)}<span class="order">{figures.indexOf(fid) + 1}</span>{/if}
							</button>
						{/each}
					</div>
				{:else if paradeKind === 'images'}
					<p class="note"> {t('PNG, GIF animate o WebP, meglio con lo sfondo trasparente. Anche spritesheet: una striscia o una griglia di fotogrammi, che l’app fa scorrere mentre il personaggio cammina. Le immagini vengono copiate nell’app: puoi spostare o cancellare gli originali.')} </p>
					<label class="upload">
						<input
							type="file"
							accept="image/png,image/gif,image/webp,image/jpeg"
							multiple
							onchange={addImages}
							aria-label={t('Aggiungi immagini')}
						/>
						{loading ? t('Copia in corso…') : t('Aggiungi immagini…')}
					</label>
					<ul class="images">
						{#each images as item, i (i)}
							{@const sheet = decode(item)}
							{@const o = backgroundOf(i)}
							{@const m = motions[i] ?? WALK}
							{@const name = nameOf(pathOf(item))}
							<li>
								<div class="head">
									<span class="file-name">{name}</span>
									<label class="sprite-toggle">
										<input
											type="checkbox"
											checked={sheet !== null}
											onchange={() => toggleSprite(i)}
											aria-label={t('Spritesheet {0}', [name])}
										/> {t('Spritesheet')} </label>
									<button
										onclick={() => {
											images = images.filter((_, j) => j !== i);
											motions = motions.filter((_, j) => j !== i);
										}}
										aria-label={t('Togli {0}', [name])}><Icon name="close" /></button
									>
								</div>
								<div class="background-tools">
									<button
										class="remove-background"
										disabled={processing !== null}
										onclick={() => removeBackgroundOf(i)}
										>{processing === i ? t('Elaboro…') : t('Togli lo sfondo')}</button
									>
									<label title={t('Quanto un colore può essere diverso dallo sfondo ed essere tolto lo stesso')}> {t('Tolleranza')} <input type="range" min="0" max="128" value={o.tolerance}
											aria-label={t('Tolleranza dello sfondo di {0}', [name])}
											oninput={(e) => setBackground(i, { tolerance: Number(e.currentTarget.value) })} />
									</label>
									<label title={t('Sfondo da togliere')}>
										<input type="color" value={o.color ?? '#ffffff'}
											aria-label={t('Colore dello sfondo di {0}', [name])}
											oninput={(e) => setBackground(i, { color: e.currentTarget.value })} />
										{o.color ? o.color : t('dagli angoli')}
									</label>
									{#if o.color}
										<button class="small" onclick={() => setBackground(i, { color: undefined })}
											title={t('Leggi il colore dello sfondo dagli angoli dell\'immagine')}>{t('Automatico')}</button>
									{/if}
									{#if sheet}
										<button class="small" aria-pressed={eyedropper === i}
											onclick={() => (eyedropper = eyedropper === i ? null : i)}
											title={t('Clicca sul foglio per scegliere il colore dello sfondo')}>{t('Contagocce')}</button>
									{/if}
									<label>
										<input type="checkbox" checked={o.edgesOnly}
											aria-label={t('Solo lo sfondo che tocca i bordi di {0}', [name])}
											onchange={(e) => setBackground(i, { edgesOnly: e.currentTarget.checked })} /> {t('Solo quello che tocca i bordi')} </label>
									{#if originals[pathOf(item)]}
										<button class="small" onclick={() => restoreOriginal(i)}>{t('Ripristina originale')}</button>
									{/if}
								</div>
								<div class="motion">
									<label> {t('Movimento')} <select value={m.kind} aria-label={t('Movimento di {0}', [name])}
											onchange={(e) => setMotion(i, { kind: e.currentTarget.value as MotionKind })}>
											{#each MOTION_KINDS as [kind, label] (kind)}
												<option value={kind}>{label}</option>
											{/each}
										</select>
									</label>
									{#if m.kind !== 'walk'}
										<label title={t('Sempre: resta in scena senza durata, e chi attraversa riparte all\'infinito. Col passaggio: compare solo quando passa il corteo.')}> {t('Quando')} <select value={m.loop ? 'always' : 'pass'} aria-label={t('Quando compare {0}', [name])}
												onchange={(e) => setMotion(i, { loop: e.currentTarget.value === 'always' })}>
												<option value="always">{t('Sempre, in loop')}</option>
												<option value="pass">{t('Col passaggio del corteo')}</option>
											</select>
										</label>
										{#if m.kind === 'cross'}
											<label title={t('Verso quale bordo va')}> {t('Verso')} <select value={m.direction} aria-label={t('Verso di {0}', [name])}
													onchange={(e) => setMotion(i, { direction: e.currentTarget.value as 'right' | 'left' })}>
													<option value="right">{t('Destra')}</option>
													<option value="left">{t('Sinistra')}</option>
												</select>
											</label>
										{/if}
										<label title={m.kind === 'still' ? t('Dove sta sul binario') : t('Da dove parte: poi va fino al bordo')}>
											{m.kind === 'still' ? t('Posizione') : t('Parte da')}
											<input type="range" min="0" max="100" value={m.position}
												aria-label={t('{0} di {1}', [m.kind === 'still' ? t('Posizione') : t('Partenza'), name])}
												oninput={(e) => setMotion(i, { position: Number(e.currentTarget.value) })} />
											{m.position}%
										</label>
										<label title={t('Pixel sopra il binario: per esempio un\'onda all\'altezza delle mani')}> {t('Altezza')} <input type="range" min="0" max="200" value={m.height}
												aria-label={t('Altezza di {0}', [name])}
												oninput={(e) => setMotion(i, { height: Number(e.currentTarget.value) })} />
											{m.height} px
										</label>
										<label title={t('Disegnato allo specchio, rivolto dall\'altra parte')}>
											<input type="checkbox" checked={m.mirror} aria-label={t('Specchia {0}', [name])}
												onchange={(e) => setMotion(i, { mirror: e.currentTarget.checked })} /> {t('Specchia')} </label>
										<label title={m.loop ? t('Secondi dall\'apertura prima della prima comparsa: sfasa più voci fra loro') : t('Secondi dall\'inizio del passaggio prima di comparire')}>
											{m.loop ? t('Prima volta dopo') : t('Dopo')}
											<input type="number" min="0" max="60" step="0.1" value={m.delay}
												aria-label={t('Ritardo di {0}', [name])}
												onchange={(e) => setMotion(i, { delay: Number(e.currentTarget.value) })} />
											s
										</label>
										{#if !(m.loop && m.kind === 'still')}
											<label title={m.kind === 'still' ? t('Quanto resta in scena') : t('Quanto ci mette ad arrivare in fondo: meno secondi, più veloce')}>
												{m.kind === 'still' ? t('Per') : t('In')}
												<input type="number" min="0.5" max="120" step="0.1" value={m.duration}
													aria-label={t('Durata di {0}', [name])}
													onchange={(e) => setMotion(i, { duration: Number(e.currentTarget.value) })} />
												s
											</label>
										{/if}
										{#if m.loop && m.kind === 'cross'}
											<label title={t('Attesa fra un lancio e l\'altro: con viaggio + pausa uguali al ciclo dello spritesheet, l\'onda parte sempre allo stesso gesto')}> {t('Pausa')} <input type="number" min="0" max="120" step="0.1" value={m.pause}
													aria-label={t('Pausa di {0}', [name])}
													onchange={(e) => setMotion(i, { pause: Number(e.currentTarget.value) })} />
												s
											</label>
											<span title={t('Ogni quanto riparte')}>{t('giro {0}', [roundOf(m)])}</span>
										{/if}
									{/if}
								</div>
								{#if sheet}
									{@const d = drawing(sheet, 48)}
									<div class="sheet">
										<!-- Preview: the character walks here as on the rail. -->
										<!-- Frame as big as the largest frame: with
										     hand-made frames the size changes at every step, and without a
										     frame the whole row moved along with the preview. -->
										<span class="preview-frame" style:width="{d.width}px" style:height="{d.height}px">
											<span
												class="preview-sprite"
												style={style(sheet, convertFileSrc(sheet.src), 48)}
												aria-label={t('Anteprima di {0}', [name])}
											></span>
										</span>
										<div class="fields">
												<label class="by-hand-field">
													<input type="checkbox" checked={!!sheet.boxes}
														aria-label={t('Fotogrammi a mano di {0}', [name])}
														onchange={(e) =>
															updateSprite(i, 'boxes', e.currentTarget.checked ? gridBoxes(sheet) : undefined)} /> {t('Fotogrammi a mano, anche di misure diverse (un colpo, un\'onda di energia)')} </label>
												{#if sheet.boxes}
													<p class="snap-help">{t('Vicino a un altro fotogramma i bordi si agganciano: tieni Alt per muoverlo libero.')}</p>
												{/if}
												{#if !sheet.boxes}
												<label>
													X
													<input type="number" min="0" max={sheet.sheetWidth - 1} value={sheet.x}
														aria-label={t('X della zona di {0}', [name])}
														onchange={(e) => zoneField(i, 'x', e.currentTarget)} />
												</label>
												<label>
													Y
													<input type="number" min="0" max={sheet.sheetHeight - 1} value={sheet.y}
														aria-label={t('Y della zona di {0}', [name])}
														onchange={(e) => zoneField(i, 'y', e.currentTarget)} />
												</label>
												<label> {t('Larghezza')} <input type="number" min="1" max={sheet.sheetWidth} value={sheet.w}
														aria-label={t('Larghezza della zona di {0}', [name])}
														onchange={(e) => zoneField(i, 'w', e.currentTarget)} />
												</label>
												<label> {t('Altezza')} <input type="number" min="1" max={sheet.sheetHeight} value={sheet.h}
														aria-label={t('Altezza della zona di {0}', [name])}
														onchange={(e) => zoneField(i, 'h', e.currentTarget)} />
												</label>
												<label> {t('Colonne')} <input type="number" min="1" max={sheet.w} value={grid(sheet).columns}
														aria-label={t('Colonne della griglia di {0}', [name])}
														oninput={(e) => gridField(i, 'columns', Number(e.currentTarget.value))} />
												</label>
												<label> {t('Righe')} <input type="number" min="1" max={sheet.h} value={grid(sheet).rows}
														aria-label={t('Righe della griglia di {0}', [name])}
														oninput={(e) => gridField(i, 'rows', Number(e.currentTarget.value))} />
												</label>
												<label> {t('Fotogrammi')} <input type="number" min="1" max={grid(sheet).rows > 1 ? grid(sheet).columns * grid(sheet).rows : sheet.w}
														value={sheet.frames}
														aria-label={t('Fotogrammi di {0}', [name])}
														oninput={(e) => gridField(i, 'frames', Number(e.currentTarget.value))} />
												</label>
												<label title={t('Spazio vuoto fra una colonna e l\'altra, in pixel del foglio')}> {t('Spazio orizzontale')} <input type="number" min="0" max={sheet.w} value={sheet.gapX ?? 0}
														aria-label={t('Spazio orizzontale fra i fotogrammi di {0}', [name])}
														oninput={(e) => updateSprite(i, 'gapX', Number(e.currentTarget.value))} />
												</label>
												<label title={t('Spazio vuoto fra una riga e l\'altra, in pixel del foglio')}> {t('Spazio verticale')} <input type="number" min="0" max={sheet.h} value={sheet.gapY ?? 0}
														aria-label={t('Spazio verticale fra i fotogrammi di {0}', [name])}
														oninput={(e) => updateSprite(i, 'gapY', Number(e.currentTarget.value))} />
												</label>
												{:else}
												<p class="by-hand-note"> {t('{0} fotogrammi. Sul foglio clicca un fotogramma per spostarlo o ridimensionarlo; trascina nello spazio vuoto per aggiungerne uno. Sul binario i piedi restano sulla linea anche quando il fotogramma si allarga.', [sheet.frames])} </p>
												{/if}
												<label class="order-field"> {t('Ordine')} <input type="text" value={formatOrder(sheet)}
														aria-label={t('Ordine dei fotogrammi di {0}', [name])}
														placeholder={t('es. 2, 1, 3, 1')}
														onchange={(e) => orderField(i, e.currentTarget)} />
												</label>
												<div class="preset">
														<button type="button" disabled={sheet.frames < 3}
															title={t('Il primo fotogramma (fermo) tra ognuno degli altri: 2, 1, 3, 1…')}
															onclick={() => updateSprite(i, 'order', alternateWithFirst(sheet.frames))}
															>{t('Fermo tra i passi')}</button>
														<button type="button" disabled={sheet.frames < 3}
															title={t('Avanti e indietro: 1, 2, 3, 2…')}
															onclick={() => updateSprite(i, 'order', pingPong(sheet.frames))}
															>{t('Avanti e indietro')}</button>
														<button type="button"
															title={t('Tutti di fila: 1, 2, 3…')}
															onclick={() => updateSprite(i, 'order', [])}
															>{t('Di fila')}</button>
												</div>
												<label> {t('Velocità (fps)')} <input type="number" min="1" max="30" value={sheet.fps}
														aria-label={t('Velocità di {0}', [name])}
														oninput={(e) => updateSprite(i, 'fps', Number(e.currentTarget.value))} />
												</label>
												<label class="crisp-check">
													<input type="checkbox" checked={sheet.crisp}
														aria-label={t('Pixel nitidi per {0}', [name])}
														onchange={(e) => updateSprite(i, 'crisp', e.currentTarget.checked)} /> {t('Pixel art nitida')} </label>
												<span class="frame-size">
													Fotogramma {+frameSize(sheet).width.toFixed(1)}×{+frameSize(sheet).height.toFixed(1)} px
												</span>
												<div class="rail-field">
													<span class="rail-title">{t('Sul binario')}</span>
													<label> {t('Altezza')} <input type="range" min={RAIL_HEIGHT_MIN} max={RAIL_HEIGHT_MAX} value={railSize(sheet).height}
															aria-label={t('Altezza sul binario di {0}', [name])}
															oninput={(e) => updateSprite(i, 'railHeight', Number(e.currentTarget.value))} />
														<input type="number" min={RAIL_HEIGHT_MIN} max={RAIL_HEIGHT_MAX} value={railSize(sheet).height}
															aria-label={t('Altezza in pixel sul binario di {0}', [name])}
															onchange={(e) => updateSprite(i, 'railHeight', Number(e.currentTarget.value))} /> {t('px')} </label>
													<label> {t('Larghezza')} <input type="number" min={RAIL_WIDTH_MIN} max={RAIL_WIDTH_MAX}
															value={Math.round(railSize(sheet).width)}
															disabled={sheet.railWidth === undefined}
															aria-label={t('Larghezza sul binario di {0}', [name])}
															onchange={(e) => updateSprite(i, 'railWidth', Number(e.currentTarget.value))} /> {t('px')} </label>
													<label>
														<input type="checkbox" checked={sheet.railWidth === undefined}
															aria-label={t('Larghezza proporzionale di {0}', [name])}
															onchange={(e) =>
																updateSprite(i, 'railWidth', e.currentTarget.checked ? undefined : Math.round(railSize(sheet).width))} /> {t('Proporzionale')} </label>
												</div>
											</div>
										</div>
										<FramePicker
											{sheet}
											src={convertFileSrc(sheet.src)}
											{name}
											onzone={(x, y, w, h) => updateZone(i, x, y, w, h)}
											onboxes={(list) => updateSprite(i, 'boxes', list)}
											eyedropper={eyedropper === i}
											onpoint={(x, y) => pickColor(i, x, y)}
										/>
								{/if}
							</li>
						{/each}
					</ul>
					{#if backgroundResult}<p class="note" role="status">{backgroundResult}</p>{/if}
					{#if error}<p class="error">{error}</p>{/if}
				{/if}
			</section>

			<section>
				<h3>{t('Animazioni')}</h3>
				<label class="row">
					<span>{t('All’avvio')}</span>
					<select bind:value={animations.intro} aria-label={t('Animazione all’avvio')}>
						{#each INTRO_ANIMATIONS as a (a.value)}
							<option value={a.value}>{a.name}</option>
						{/each}
					</select>
				</label>
				{#if animations.intro === 'custom'}
					<label class="row">
						<span>{t('Chi passa')}</span>
						<select bind:value={animations.figure} aria-label={t('Chi passa all’avvio')}>
							<option value={undefined}>{t('Il treno')}</option>
							{#each images as v (v)}
								<option value={v}>{imageName(v)}</option>
							{/each}
							{#each Object.entries(FIGURES) as [fid, f] (fid)}
								<option value={fid}>{f.name}</option>
							{/each}
						</select>
					</label>
					<label class="row">
						<span>{t('Movimento')}</span>
						<select bind:value={animations.motion} aria-label={t('Movimento all’avvio')}>
							{#each INTRO_MOTIONS as m (m.value)}
								<option value={m.value}>{m.name}</option>
							{/each}
						</select>
					</label>
					<label class="row">
						<span>{t('Durata')}</span>
						<input type="range" min="0.5" max="3" step="0.25" bind:value={animations.duration} aria-label={t('Durata dell’animazione all’avvio')} />
						<output>{animations.duration.toLocaleString('it-IT')} s</output>
					</label>
				{/if}
				<label class="row">
					<span>{t('Aprendo una cartella')}</span>
					<select bind:value={animations.folder} aria-label={t('Animazione aprendo una cartella')}>
						{#each FOLDER_ANIMATIONS as a (a.value)}
							<option value={a.value}>{a.name}</option>
						{/each}
					</select>
				</label>
				<p class="note">{t('L’animazione all’avvio parte se è accesa in Impostazioni; con «riduci movimento» di Windows non parte nessuna.')}</p>
			</section>

			<section>
				<h3>{t('Sfondo decorativo')}</h3>
				<select bind:value={pattern} aria-label={t('Sfondo decorativo')}>
					<option value="">{t('Nessuno')}</option>
					{#each Object.entries(FIGURES) as [fid, f] (fid)}
						<option value={fid}>{f.name}</option>
					{/each}
				</select>
			</section>
		</div>

		<footer>
			{#if editing}
				<button class="danger" onclick={() => ondelete(id)}>{t('Elimina tema')}</button>
			{/if}
			<span class="spacer"></span>
			<button onclick={onclose}>{t('Annulla')}</button>
			<button class="primary" onclick={() => onsave(theme)}>{t('Salva tema')}</button>
		</footer>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
	}
	.window {
		display: flex;
		flex-direction: column;
		width: 620px;
		max-width: calc(100vw - 32px);
		max-height: calc(100vh - 48px);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
	}
	.backdrop.full {
		display: block;
		background: transparent;
	}
	.window.full {
		width: 100%;
		height: 100vh;
		max-width: none;
		max-height: none;
		box-shadow: none;
		overflow: hidden;
	}
	.window.full .body {
		flex: 1;
	}
	header,
	footer {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 14px 18px;
	}
	header {
		border-bottom: 1px solid var(--border);
		cursor: grab;
		user-select: none;
	}
	.window:global(.being-moved) header {
		cursor: grabbing;
	}
	footer {
		border-top: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		flex: 1;
		font-family: var(--font-display);
		font-size: calc(17px * var(--title-scale, var(--text-scale, 1)));
	}
	h3 {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-size: calc(12px * var(--title-scale, var(--text-scale, 1)));
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	.body {
		overflow-y: auto;
		padding: 6px 18px 12px;
	}
	section {
		padding: 12px 0;
		border-bottom: 1px solid var(--border);
	}
	section:last-child {
		border-bottom: none;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 6px 0;
	}
	.row > span {
		width: 200px;
		flex-shrink: 0;
		color: var(--text-dim);
	}
	.row input[type='text'],
	.row select,
	section > select {
		flex: 1;
		height: 30px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.row input[type='range'] {
		flex: 1;
		accent-color: var(--accent);
	}
	.row input.pixel {
		width: 56px;
		height: 28px;
		padding: 0 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.row > span.unit {
		width: auto;
	}
	output {
		width: 40px;
		text-align: right;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	.colors {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px 16px;
	}
	.color {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.color input {
		width: 34px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: none;
	}
	.choice {
		display: flex;
		gap: 16px;
		margin-bottom: 8px;
	}
	.note {
		margin: 6px 0;
		color: var(--text-dim);
		font-size: calc(12px * var(--text-scale, 1));
	}
	.figures {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
		gap: 6px;
	}
	.figure {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 44px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		cursor: default;
	}
	.figure :global(.step-b) {
		display: none;
	}
	.figure.chosen {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.order {
		position: absolute;
		top: 2px;
		right: 4px;
		font-size: calc(10px * var(--text-scale, 1));
		font-weight: 700;
		color: var(--accent);
	}
	.upload {
		display: inline-flex;
		align-items: center;
		height: 30px;
		padding: 0 12px;
		border: 1px dashed var(--text-dim);
		border-radius: var(--radius-sm);
		cursor: default;
	}
	.upload input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.images {
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
	}
	.images li {
		padding: 6px 0;
		border-bottom: 1px solid var(--border);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.file-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sprite-toggle,
	.crisp-check {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-dim);
	}
	.sheet {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 8px;
	}
	/* Checkered box: you can see where the sprite is transparent. */
	.motion {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		margin: 6px 0;
		font-size: calc(12px * var(--text-scale, 1));
		color: var(--text-dim);
	}
	.motion label {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.motion input[type='number'] {
		width: 56px;
	}
	.motion input[type='range'] {
		width: 110px;
	}
	.preview-frame {
		flex-shrink: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		overflow: hidden;
		background-color: var(--bg);
		border-radius: 6px;
		outline: 1px solid var(--border);
	}
	.preview-sprite {
		flex-shrink: 0;
		display: block;
		background-repeat: no-repeat;
		animation-name: preview-frames;
		animation-iteration-count: infinite;
	}
	@keyframes preview-frames {
		from {
			background-position: var(--x) var(--y);
		}
		to {
			background-position: var(--end) var(--y);
		}
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px 12px;
		flex: 1;
	}
	.fields label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: calc(11px * var(--text-scale, 1));
		color: var(--text-dim);
	}
	.fields input[type='number'] {
		height: 26px;
		padding: 0 6px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--text-scale, 1));
	}
	.fields .by-hand-field,
	.by-hand-note {
		grid-column: 1 / -1;
	}
	.fields .by-hand-field {
		flex-direction: row;
		align-items: center;
		gap: 6px;
		color: var(--text);
	}
	.snap-help {
		flex-basis: 100%;
		margin: 0;
		color: var(--text-dim);
		font-size: calc(11px * var(--text-scale, 1));
	}
	.by-hand-note {
		margin: 0;
		font-size: calc(11px * var(--text-scale, 1));
		color: var(--text-dim);
	}
	.fields .order-field {
		grid-column: 1 / -1;
	}
	.fields .order-field input {
		height: 26px;
		padding: 0 6px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--text-scale, 1));
	}
	.rail-field {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 16px;
		padding-top: 6px;
		border-top: 1px solid var(--border);
	}
	.rail-title {
		font-size: calc(11px * var(--text-scale, 1));
		font-weight: 600;
		color: var(--text);
	}
	.fields .rail-field label {
		flex-direction: row;
		align-items: center;
		gap: 6px;
	}
	.fields .rail-field input[type='number'] {
		width: 64px;
	}
	.fields .rail-field input[type='range'] {
		width: 120px;
	}
	.fields .rail-field input:disabled {
		opacity: 0.5;
	}
	.preset {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.preset button {
		flex: none;
		white-space: nowrap;
		padding: 3px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: calc(11px * var(--text-scale, 1));
		cursor: default;
	}
	.preset button:disabled {
		opacity: 0.45;
	}
	.frame-size {
		align-self: end;
		padding-bottom: 5px;
		white-space: nowrap;
		font-size: calc(11px * var(--text-scale, 1));
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	.fields .crisp-check {
		flex-direction: row;
		align-self: end;
	}
	.error {
		color: var(--error-text);
	}
	.spacer {
		flex: 1;
	}
	button {
		height: 32px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
	}
	.close {
		width: 30px;
		padding: 0;
		border: none;
		font-size: calc(18px * var(--text-scale, 1));
	}
	.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	.primary:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
	.danger:hover {
		background: rgba(196, 43, 28, 0.2);
		color: var(--error-text);
	}
	.background-tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
		margin: 6px 0;
		font-size: calc(12px * var(--text-scale, 1));
		color: var(--text-dim);
	}
	.background-tools label {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.background-tools input[type='color'] {
		width: 26px;
		height: 22px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: none;
	}
	.background-tools button {
		height: 26px;
		padding: 0 10px;
		white-space: nowrap;
		font-size: calc(12px * var(--text-scale, 1));
	}
	.background-tools button[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}
	.images .head button {
		height: 24px;
		width: 24px;
		padding: 0;
		border: none;
	}
</style>
