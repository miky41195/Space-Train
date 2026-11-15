<script lang="ts">
	import { t } from '../i18n';
	import {
		snapBox,
		cell,
		frameSize,
		frameStep,
		MAX_BOXES,
		type DraggedSides,
		type FrameBox,
		type Spritesheet
	} from '../spritesheet';

	/** On-screen distance, in pixels, within which an edge snaps to a neighbour. */
	const SNAP = 6;

	let {
		sheet,
		src,
		name,
		onzone,
		onboxes,
		eyedropper = false,
		onpoint
	}: {
		sheet: Spritesheet;
		/** Address of the image, already ready for the WebView. */
		src: string;
		/** File name, for the accessible names. */
		name: string;
		/** Chosen zone, in image pixels: whoever receives it brings it back within limits. */
		onzone: (x: number, y: number, w: number, h: number) => void;
		/** Hand-made frames: the new list after every gesture. */
		onboxes?: (boxes: FrameBox[]) => void;
		/** With the eyedropper a click picks a pixel instead of touching the zone. */
		eyedropper?: boolean;
		onpoint?: (x: number, y: number) => void;
	} = $props();

	const ZOOM = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];

	/**
	 * Initial zoom: the whole sheet fits in the frame, but a tiny sheet is
	 * enlarged so that the zone is comfortable to grab.
	 */
	// svelte-ignore state_referenced_locally
	let zoom = $state(Math.min(16, Math.max(0.1, 520 / sheet.sheetWidth)));

	type Sides = { n: boolean; s: boolean; e: boolean; w: boolean };
	type Zone = { x: number; y: number; w: number; h: number };

	/**
	 * Mouse gesture in progress, with the starting point in image pixels.
	 * `new`: a zone is drawn from scratch. `move`: the whole zone is dragged.
	 * `edge`: one or two sides are pulled. `index` says which hand-made frame
	 * is touched; without it, it is the grid zone.
	 */
	let gesture = $state<
		| { mode: 'new'; px: number; py: number; index?: number }
		| { mode: 'move'; px: number; py: number; from: Zone; index?: number }
		| { mode: 'edge'; px: number; py: number; from: Zone; sides: Sides; index?: number }
		| null
	>(null);

	/** Hand-made frames: the list, and the one being edited. */
	let boxes = $derived(sheet.boxes ?? []);
	let byHand = $derived(boxes.length > 0);
	let chosen = $state(0);
	let chosenValid = $derived(Math.min(chosen, Math.max(0, boxes.length - 1)));

	/**
	 * Sends the touched rectangle to whoever saves it: the zone, or a hand-made frame.
	 *
	 * The edges are rounded, not position and size separately: pulling only
	 * the left side, rounding x and width each on its own could move the
	 * right side by a pixel too, and frames placed side by side no longer
	 * matched.
	 */
	function emit(index: number | undefined, x0: number, y0: number, w0: number, h0: number) {
		const x = Math.round(x0);
		const y = Math.round(y0);
		const w = Math.max(1, Math.round(x0 + w0) - x);
		const h = Math.max(1, Math.round(y0 + h0) - y);
		updateGuides(index, { x, y, w, h });
		if (index === undefined) {
			onzone(x, y, w, h);
			return;
		}
		const list = [...boxes];
		list[index] = { x, y, w, h };
		onboxes?.(list);
	}

	/**
	 * The guide lines: where an edge of the moving frame matches that of
	 * another, as in drawing programs. They show only during the gesture.
	 */
	let guides = $state<{ x: number[]; y: number[] }>({ x: [], y: [] });

	function updateGuides(index: number | undefined, r: FrameBox) {
		if (index === undefined) {
			guides = { x: [], y: [] };
			return;
		}
		const others = boxes.filter((_, k) => k !== index);
		const xs = new Set(others.flatMap((a) => [a.x, a.x + a.w]));
		const ys = new Set(others.flatMap((a) => [a.y, a.y + a.h]));
		guides = {
			x: [r.x, r.x + r.w].filter((v) => xs.has(v)),
			y: [r.y, r.y + r.h].filter((v) => ys.has(v))
		};
	}

	function removeChosen() {
		if (boxes.length <= 1) return;
		onboxes?.(boxes.filter((_, k) => k !== chosenValid));
		chosen = Math.max(0, chosenValid - 1);
	}
	let sheetEl = $state<HTMLDivElement | null>(null);

	/** The point under the mouse, in image pixels. */
	function point(e: PointerEvent): { px: number; py: number } {
		const r = sheetEl!.getBoundingClientRect();
		return { px: (e.clientX - r.left) / zoom, py: (e.clientY - r.top) / zoom };
	}

	function press(e: PointerEvent) {
		if (e.button !== 0) return;
		// No text selection or focus (see `onmousedown`): they would scroll
		// the editor, and the sheet would jump under the mouse.
		e.preventDefault();
		const { px, py } = point(e);
		if (eyedropper) {
			onpoint?.(Math.min(sheet.sheetWidth - 1, px), Math.min(sheet.sheetHeight - 1, py));
			return;
		}
		const touched = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');
		let handle = touched?.dataset.handle;
		// With hand-made frames a box is touched: clicking another one picks it.
		let index: number | undefined;
		if (byHand) {
			const k = touched?.closest<HTMLElement>('[data-index]')?.dataset.index;
			if (k !== undefined) {
				index = Number(k);
				if (index !== chosenValid) handle = 'move';
				chosen = index;
			}
		}
		const r = index === undefined ? sheet : boxes[index];
		const from = { x: r.x, y: r.y, w: r.w, h: r.h };
		// A zone as big as the sheet cannot be moved: inside it a new zone is
		// drawn, otherwise there would be no way to do so.
		if (!byHand && handle === 'move' && from.w >= sheet.sheetWidth && from.h >= sheet.sheetHeight) handle = undefined;
		sheetEl?.setPointerCapture?.(e.pointerId);
		if (handle === 'move') gesture = { mode: 'move', px, py, from, index };
		else if (handle) {
			const sides = { n: handle.includes('n'), s: handle.includes('s'), e: handle.includes('e'), w: handle.includes('w') };
			gesture = { mode: 'edge', px, py, from, sides, index };
		} else if (byHand) {
			// In empty space a new frame is drawn, at the end of the list.
			if (boxes.length >= MAX_BOXES) return;
			const added = boxes.length;
			chosen = added;
			gesture = { mode: 'new', px, py, index: added };
			emit(added, Math.floor(px), Math.floor(py), 1, 1);
		} else {
			gesture = { mode: 'new', px, py };
			onzone(Math.floor(px), Math.floor(py), 1, 1);
		}
	}

	function move(e: PointerEvent) {
		if (!gesture) return;
		const { px, py } = point(e);
		const W = sheet.sheetWidth;
		const H = sheet.sheetHeight;
		// With hand-made frames the edges snap to the neighbours';
		// holding Alt lets it move freely, to the pixel.
		const index = gesture.index;
		const snap = (r: FrameBox, sides?: DraggedSides) =>
			index === undefined || e.altKey
				? r
				: snapBox(r, boxes.filter((_, k) => k !== index), SNAP / zoom, sides);
		if (gesture.mode === 'new') {
			const x = Math.max(0, Math.min(gesture.px, px));
			const y = Math.max(0, Math.min(gesture.py, py));
			// A new frame snaps on all sides: also at the point drawing
			// started from.
			const r = snap(
				{ x, y, w: Math.min(W, Math.max(gesture.px, px)) - x, h: Math.min(H, Math.max(gesture.py, py)) - y },
				{ n: true, s: true, e: true, w: true }
			);
			emit(index, r.x, r.y, Math.min(W - r.x, r.w), Math.min(H - r.y, r.h));
			return;
		}
		const dx = px - gesture.px;
		const dy = py - gesture.py;
		const { x, y, w, h } = gesture.from;
		if (gesture.mode === 'move') {
			// Same size, without leaving the sheet.
			const r = snap({ x: Math.min(W - w, Math.max(0, x + dx)), y: Math.min(H - h, Math.max(0, y + dy)), w, h });
			emit(index, Math.min(W - w, Math.max(0, r.x)), Math.min(H - h, Math.max(0, r.y)), w, h);
			return;
		}
		// Every pulled side stops at the sheet edge and one pixel from the opposite side.
		let left = x;
		let right = x + w;
		let top = y;
		let bottom = y + h;
		if (gesture.sides.w) left = Math.min(right - 1, Math.max(0, x + dx));
		if (gesture.sides.e) right = Math.max(left + 1, Math.min(W, x + w + dx));
		if (gesture.sides.n) top = Math.min(bottom - 1, Math.max(0, y + dy));
		if (gesture.sides.s) bottom = Math.max(top + 1, Math.min(H, y + h + dy));
		const r = snap({ x: left, y: top, w: right - left, h: bottom - top }, gesture.sides);
		emit(index, Math.max(0, r.x), Math.max(0, r.y), Math.min(W - Math.max(0, r.x), r.w), Math.min(H - Math.max(0, r.y), r.h));
	}

	function release() {
		gesture = null;
		guides = { x: [], y: [] };
	}

	function changeZoom(direction: 1 | -1) {
		const next = direction > 0 ? ZOOM.find((z) => z > zoom + 0.001) : [...ZOOM].reverse().find((z) => z < zoom - 0.001);
		if (next) zoom = next;
	}

	/** Ctrl + wheel zooms, as in drawing programs. */
	function wheel(e: WheelEvent) {
		if (!e.ctrlKey) return;
		e.preventDefault();
		changeZoom(e.deltaY < 0 ? 1 : -1);
	}

	const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
	const NAMES: Record<(typeof HANDLES)[number], string> = {
		n: t('Bordo superiore'),
		s: t('Bordo inferiore'),
		e: t('Bordo destro'),
		w: t('Bordo sinistro'),
		ne: t('Angolo in alto a destra'),
		nw: t('Angolo in alto a sinistra'),
		se: t('Angolo in basso a destra'),
		sw: t('Angolo in basso a sinistra')
	};
</script>

<div class="picker">
	<div class="bar">
		{#if byHand}
			{@const r = boxes[chosenValid]}
			<span class="help">{t('Clicca un fotogramma per modificarlo, disegnane uno nuovo nello spazio vuoto')}</span>
			<span class="choice">n. {chosenValid + 1}: {r.w}×{r.h} px da {r.x},{r.y}</span>
			<button class="text" disabled={boxes.length <= 1} onclick={removeChosen}
				aria-label={t('Togli il fotogramma {0} di {1}', [chosenValid + 1, name])}>{t('Togli')}</button>
		{:else}
			<span class="help">{t('Disegna la zona dei fotogrammi, tira bordi e angoli o spostala')}</span>
			<span class="choice">{sheet.w}×{sheet.h} px da {sheet.x},{sheet.y}</span>
		{/if}
		<button onclick={() => changeZoom(-1)} aria-label={t('Riduci lo zoom di {0}', [name])}>−</button>
		<span class="zoom">{Math.round(zoom * 100)}%</span>
		<button onclick={() => changeZoom(1)} aria-label={t('Aumenta lo zoom di {0}', [name])}>+</button>
	</div>

	<div class="sheet-window" onwheel={wheel}>
		<div
			class="sheet"
			class:eyedropper
			bind:this={sheetEl}
			role="grid"
			tabindex="-1"
			aria-label={t('Foglio di {0}', [name])}
			style:width="{sheet.sheetWidth * zoom}px"
			style:height="{sheet.sheetHeight * zoom}px"
			style:background-image={`url("${src.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`}
			style:image-rendering={sheet.crisp ? 'pixelated' : 'auto'}
			onpointerdown={press}
			onmousedown={(e) => e.preventDefault()}
			onpointermove={move}
			onpointerup={release}
			onpointercancel={release}
		>
			{#if byHand}
				<!-- Hand-made frames: each its own box, the chosen one with the handles. -->
				{#each boxes as r, k (k)}
					<div
						class="box"
						class:chosen={k === chosenValid}
						data-index={k}
						data-handle="move"
						aria-label={t('Fotogramma {0} di {1}', [k + 1, name])}
						style:left="{r.x * zoom}px"
						style:top="{r.y * zoom}px"
						style:width="{r.w * zoom}px"
						style:height="{r.h * zoom}px"
					>
						<span class="number">{k + 1}</span>
						{#if k === chosenValid}
							{#each HANDLES as m (m)}
								<span class="handle {m}" data-handle={m} aria-label={t('{0} del fotogramma di {1}', [NAMES[m], name])}></span>
							{/each}
						{/if}
					</div>
				{/each}
				{#each guides.x as gx (`x${gx}`)}
					<span class="guide vertical" style:left="{gx * zoom}px"></span>
				{/each}
				{#each guides.y as gy (`y${gy}`)}
					<span class="guide horizontal" style:top="{gy * zoom}px"></span>
				{/each}
			{:else}
				<!-- The chosen zone, divided into its frames. -->
				<div
					class="zone"
					class:active={gesture !== null}
					data-handle="move"
					aria-label={t('Zona di {0}', [name])}
					style:left="{sheet.x * zoom}px"
					style:top="{sheet.y * zoom}px"
					style:width="{sheet.w * zoom}px"
					style:height="{sheet.h * zoom}px"
				>
					<!-- Every cell with its number: left to right and then row by
					     row, the order they are shown in. Between the cells, the chosen gap. -->
					{#each { length: Math.min(sheet.frames, 256) }, k (k)}
						{@const c = cell(sheet, k)}
						<span
							class="cell"
							style:left="{c.column * frameStep(sheet).x * zoom}px"
							style:top="{c.row * frameStep(sheet).y * zoom}px"
							style:width="{frameSize(sheet).width * zoom}px"
							style:height="{frameSize(sheet).height * zoom}px"
						><span class="number">{k + 1}</span></span>
					{/each}
					{#each HANDLES as m (m)}
						<span class="handle {m}" data-handle={m} aria-label={t('{0} della zona di {1}', [NAMES[m], name])}></span>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.picker {
		margin-top: 8px;
	}
	/* The snapping guide lines, above the whole sheet. */
	.guide {
		position: absolute;
		pointer-events: none;
		z-index: 3;
		background: var(--signal);
	}
	.guide.vertical {
		top: 0;
		bottom: 0;
		width: 1px;
	}
	.guide.horizontal {
		left: 0;
		right: 0;
		height: 1px;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
		font-size: calc(12px * var(--text-scale, 1));
	}
	/* Texts on a single line: if they wrapped while dragging, the sheet
	   would move under the mouse. */
	.help {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
	}
	.choice {
		white-space: nowrap;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}
	.zoom {
		width: 44px;
		text-align: center;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	.bar button {
		width: 26px;
		height: 26px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	/* Large sheets scroll inside the frame instead of stretching the editor. */
	.sheet-window {
		max-height: 320px;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: 6px;
		/* Checkerboard: you can see where the sprite is transparent. */
		background:
			repeating-conic-gradient(rgba(127, 127, 127, 0.18) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px,
			var(--bg);
	}
	.sheet {
		position: relative;
		/* Room for the handles when the zone touches the sheet edge. */
		margin: 8px;
		background-size: 100% 100%;
		background-repeat: no-repeat;
		cursor: crosshair;
		touch-action: none;
		user-select: none;
	}
	/* With the eyedropper the zone cannot be grabbed: the click reaches the sheet. */
	.sheet.eyedropper {
		cursor: copy;
	}
	.sheet.eyedropper .zone {
		pointer-events: none;
	}
	.zone {
		position: absolute;
		z-index: 1;
		cursor: move;
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 0 3px rgba(0, 0, 0, 0.5);
	}
	.zone.active {
		background-color: color-mix(in srgb, var(--accent) 18%, transparent);
	}
	/* A grid cell: its outline shows, and the gap between the cells. */
	.cell {
		position: absolute;
		pointer-events: none;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent);
	}
	.box {
		position: absolute;
		z-index: 1;
		cursor: pointer;
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent),
			0 0 0 2px rgba(0, 0, 0, 0.4);
	}
	.box.chosen {
		z-index: 2;
		cursor: move;
		background-color: color-mix(in srgb, var(--accent) 14%, transparent);
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 0 3px rgba(0, 0, 0, 0.5);
	}
	.sheet.eyedropper .box {
		pointer-events: none;
	}
	.bar button.text {
		width: auto;
		padding: 0 10px;
	}
	.bar button:disabled {
		opacity: 0.45;
	}
	.number {
		position: absolute;
		top: 2px;
		left: 0;
		padding: 0 3px;
		margin-left: 2px;
		border-radius: 3px;
		background: var(--accent);
		color: var(--bg);
		font-size: calc(10px * var(--text-scale, 1));
		font-weight: 600;
		line-height: 14px;
		pointer-events: none;
	}
	.handle {
		position: absolute;
		width: 10px;
		height: 10px;
		margin: -5px 0 0 -5px;
		border-radius: 2px;
		background: var(--accent);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
	}
	.handle.n,
	.handle.s {
		left: 50%;
		cursor: ns-resize;
	}
	.handle.e,
	.handle.w {
		top: 50%;
		cursor: ew-resize;
	}
	.handle.n,
	.handle.ne,
	.handle.nw {
		top: 0;
	}
	.handle.s,
	.handle.se,
	.handle.sw {
		top: 100%;
	}
	.handle.w,
	.handle.nw,
	.handle.sw {
		left: 0;
	}
	.handle.e,
	.handle.ne,
	.handle.se {
		left: 100%;
	}
	.handle.ne,
	.handle.sw {
		cursor: nesw-resize;
	}
	.handle.nw,
	.handle.se {
		cursor: nwse-resize;
	}
</style>
