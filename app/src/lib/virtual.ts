/** Altezza riga fissa: l'indice visibile è aritmetica, non misurazione. */
export const ROW_HEIGHT = 32;

/** Righe extra sopra e sotto la finestra, per coprire lo scroll rapido. */
export const OVERSCAN = 8;

export interface Range {
	start: number;
	count: number;
	padTop: number;
	totalHeight: number;
}

/** Lato della cella nella vista a griglia, miniatura più didascalia. */
export const CELL_WIDTH = 116;
export const CELL_HEIGHT = 124;

export interface GridRange extends Range {
	/** Celle per riga: dipende dalla larghezza disponibile. */
	columns: number;
}

/**
 * Come `visibleRange`, ma per una griglia.
 *
 * Restituisce indici di **elementi**, non di righe: chi disegna affetta la
 * lista come nella vista a colonna e non deve sapere nulla della griglia.
 */
export function visibleGridRange(
	scrollTop: number,
	viewportHeight: number,
	viewportWidth: number,
	total: number
): GridRange {
	const columns = Math.max(1, Math.floor(viewportWidth / CELL_WIDTH));

	if (total === 0) {
		return { start: 0, count: 0, padTop: 0, totalHeight: 0, columns };
	}

	const righeTotali = Math.ceil(total / columns);
	const primaRiga = Math.floor(scrollTop / CELL_HEIGHT);
	const rigaInizio = Math.max(0, primaRiga - OVERSCAN_GRIGLIA);
	const righeVisibili = Math.ceil(viewportHeight / CELL_HEIGHT) + OVERSCAN_GRIGLIA * 2;

	const start = rigaInizio * columns;
	const count = Math.min(righeVisibili * columns, total - start);

	return {
		start,
		count,
		padTop: rigaInizio * CELL_HEIGHT,
		totalHeight: righeTotali * CELL_HEIGHT,
		columns
	};
}

/** Le celle sono più alte delle righe: bastano meno file di margine. */
const OVERSCAN_GRIGLIA = 2;

export function visibleRange(
	scrollTop: number,
	viewportHeight: number,
	total: number
): Range {
	if (total === 0) {
		return { start: 0, count: 0, padTop: 0, totalHeight: 0 };
	}

	const primaVisibile = Math.floor(scrollTop / ROW_HEIGHT);
	const start = Math.max(0, primaVisibile - OVERSCAN);
	const finestra = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
	const count = Math.min(finestra, total - start);

	return {
		start,
		count,
		padTop: start * ROW_HEIGHT,
		totalHeight: total * ROW_HEIGHT
	};
}

/** Altezza della testata che apre ogni zona quando la cartella è divisa. */
export const ZONA_TESTATA = 28;

export interface Zona {
	/** Indice globale della prima voce della zona. */
	inizio: number;
	quante: number;
	/** Distanza in pixel della testata dalla cima dello spaziatore. */
	alto: number;
	/** Distanza in pixel della prima riga di voci. */
	corpo: number;
	righe: number;
}

export interface Impaginato {
	zone: Zona[];
	altezzaTotale: number;
}

/**
 * Impila le zone una sotto l'altra, ognuna con la sua testata.
 *
 * Le righe restano a passo fisso dentro ogni zona: la posizione di una
 * voce è ancora aritmetica, solo con uno scarto per zona. Con una zona
 * sola e testata zero il risultato coincide con la lista non divisa.
 */
export function impaginaZone(
	conteggi: readonly number[],
	colonne: number,
	altezzaRiga: number,
	testata: number
): Impaginato {
	let y = 0;
	let inizio = 0;

	const zone = conteggi.map((quante) => {
		const righe = Math.ceil(quante / colonne);
		const zona = { inizio, quante, alto: y, corpo: y + testata, righe };
		y += testata + righe * altezzaRiga;
		inizio += quante;
		return zona;
	});

	return { zone, altezzaTotale: y };
}

export interface FinestraZona {
	/** Indice globale della prima voce da disegnare. */
	start: number;
	count: number;
	/** Dove va posata la prima riga disegnata, dalla cima dello spaziatore. */
	top: number;
}

/** Le voci di una zona che cadono nella finestra visibile, più il margine. */
export function finestraZona(
	zona: Zona,
	scrollTop: number,
	altezzaVista: number,
	colonne: number,
	altezzaRiga: number,
	margine: number
): FinestraZona {
	const relativo = scrollTop - zona.corpo;
	const prima = Math.max(0, Math.floor(relativo / altezzaRiga) - margine);
	const ultima = Math.min(zona.righe, Math.ceil((relativo + altezzaVista) / altezzaRiga) + margine);

	if (ultima <= prima) return { start: zona.inizio, count: 0, top: zona.corpo };

	const start = prima * colonne;
	return {
		start: zona.inizio + start,
		count: Math.min((ultima - prima) * colonne, zona.quante - start),
		top: zona.corpo + prima * altezzaRiga
	};
}

/** Cima in pixel della riga che contiene la voce di indice globale `i`. */
export function cimaVoce(
	zone: readonly Zona[],
	i: number,
	colonne: number,
	altezzaRiga: number
): number {
	const zona = zone.find((z) => i < z.inizio + z.quante) ?? zone[zone.length - 1];
	if (!zona) return 0;
	return zona.corpo + Math.floor((i - zona.inizio) / colonne) * altezzaRiga;
}

/** Celle per riga nella griglia, mai meno di una. */
export function colonneGriglia(larghezza: number, cella = CELL_WIDTH): number {
	return Math.max(1, Math.floor(larghezza / cella));
}
