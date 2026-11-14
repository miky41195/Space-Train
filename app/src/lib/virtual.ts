/** Fixed row height: the visible index is arithmetic, not measurement. */
export const ROW_HEIGHT = 32;

/** Extra rows above and below the window, to cover fast scrolling. */
export const OVERSCAN = 8;

export interface Range {
	start: number;
	count: number;
	padTop: number;
	totalHeight: number;
}

/** Side of the cell in the grid view, thumbnail plus caption. */
export const CELL_WIDTH = 116;
export const CELL_HEIGHT = 124;

export interface GridRange extends Range {
	/** Cells per row: depends on the available width. */
	columns: number;
}

/**
 * Like `visibleRange`, but for a grid.
 *
 * It returns indices of **items**, not of rows: whoever draws slices the
 * list as in the column view and needs to know nothing of the grid.
 */
export function visibleGridRange(scrollTop: number, viewportHeight: number, viewportWidth: number, total: number): GridRange {
	const columns = Math.max(1, Math.floor(viewportWidth / CELL_WIDTH));

	if (total === 0) {
		return { start: 0, count: 0, padTop: 0, totalHeight: 0, columns };
	}

	const totalRows = Math.ceil(total / columns);
	const firstRow = Math.floor(scrollTop / CELL_HEIGHT);
	const startRow = Math.max(0, firstRow - GRID_OVERSCAN);
	const visibleRows = Math.ceil(viewportHeight / CELL_HEIGHT) + GRID_OVERSCAN * 2;

	const start = startRow * columns;
	const count = Math.min(visibleRows * columns, total - start);

	return {
		start,
		count,
		padTop: startRow * CELL_HEIGHT,
		totalHeight: totalRows * CELL_HEIGHT,
		columns
	};
}

/** Cells are taller than rows: fewer rows of margin are enough. */
const GRID_OVERSCAN = 2;

export function visibleRange(scrollTop: number, viewportHeight: number, total: number): Range {
	if (total === 0) {
		return { start: 0, count: 0, padTop: 0, totalHeight: 0 };
	}

	const firstVisible = Math.floor(scrollTop / ROW_HEIGHT);
	const start = Math.max(0, firstVisible - OVERSCAN);
	const window = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
	const count = Math.min(window, total - start);

	return {
		start,
		count,
		padTop: start * ROW_HEIGHT,
		totalHeight: total * ROW_HEIGHT
	};
}

/** Height of the header that opens each zone when the folder is divided. */
export const ZONE_HEADER = 28;

export interface VirtualZone {
	/** Global index of the zone's first item. */
	start: number;
	count: number;
	/** Distance in pixels of the header from the top of the spacer. */
	top: number;
	/** Distance in pixels of the first row of items. */
	body: number;
	rows: number;
}

export interface ZoneLayout {
	zones: VirtualZone[];
	totalHeight: number;
}

/**
 * Stacks the zones one below the other, each with its header.
 *
 * Rows stay at a fixed pitch within each zone: an item's position is still
 * arithmetic, only with an offset per zone. With a single zone and a zero
 * header the result matches the undivided list.
 */
export function layoutZones(counts: readonly number[], columns: number, rowHeight: number, header: number): ZoneLayout {
	let y = 0;
	let start = 0;

	const zones = counts.map((count) => {
		const rows = Math.ceil(count / columns);
		const zone = { start, count, top: y, body: y + header, rows };
		y += header + rows * rowHeight;
		start += count;
		return zone;
	});

	return { zones, totalHeight: y };
}

export interface ZoneWindow {
	/** Global index of the first item to draw. */
	start: number;
	count: number;
	/** Where the first drawn row goes, from the top of the spacer. */
	top: number;
}

/** The items of a zone that fall in the visible window, plus the margin. */
export function zoneWindow(
	zone: VirtualZone,
	scrollTop: number,
	viewHeight: number,
	columns: number,
	rowHeight: number,
	margin: number
): ZoneWindow {
	const relative = scrollTop - zone.body;
	const first = Math.max(0, Math.floor(relative / rowHeight) - margin);
	const last = Math.min(zone.rows, Math.ceil((relative + viewHeight) / rowHeight) + margin);

	if (last <= first) return { start: zone.start, count: 0, top: zone.body };

	const start = first * columns;
	return {
		start: zone.start + start,
		count: Math.min((last - first) * columns, zone.count - start),
		top: zone.body + first * rowHeight
	};
}

/** Top in pixels of the row holding the item of global index `i`. */
export function itemTop(zones: readonly VirtualZone[], i: number, columns: number, rowHeight: number): number {
	const zone = zones.find((z) => i < z.start + z.count) ?? zones[zones.length - 1];
	if (!zone) return 0;
	return zone.body + Math.floor((i - zone.start) / columns) * rowHeight;
}

/** Cells per row in the grid, never fewer than one. */
export function gridColumns(width: number, cell = CELL_WIDTH): number {
	return Math.max(1, Math.floor(width / cell));
}
