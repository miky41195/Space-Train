/**
 * Posizioni che non sono cartelle del disco, e piccole letture sui path
 * che servono solo a mostrare: la composizione dei path resta in Rust.
 */

export const QUESTO_PC = '::pc';
export const RETE = '::rete';
export const CESTINO = '::cestino';
/** I PC con Space Train trovati in rete locale. */
export const RETE_LOCALE = '::lan';
/** Gli amici su Space Train, ovunque siano. */
export const AMICI = '::amici';
/**
 * Non è una posizione: è lo spazio libero fra le schede, dove rilasciare
 * una cartella la apre in una scheda nuova.
 */
export const NUOVA_SCHEDA = '::nuova-scheda';

const NOMI_VIRTUALI: Record<string, string> = {
	[QUESTO_PC]: 'Questo PC',
	[RETE]: 'Rete',
	[CESTINO]: 'Cestino',
	[RETE_LOCALE]: 'Rete locale',
	[AMICI]: 'Amici'
};

/**
 * Vero per ciò che sta su un altro PC: la Rete locale, gli Amici e tutto ciò
 * che vi si sfoglia dentro. Si apre, si copia e si trascina allo stesso modo.
 */
export function eReteLocale(path: string): boolean {
	return [RETE_LOCALE, AMICI].some((r) => path === r || path.startsWith(r + '\\'));
}

/**
 * I nomi degli amici per codice: il path porta il codice, lungo e
 * illeggibile, le briciole e le schede mostrano il nome.
 */
let nomiAmici: Record<string, string> = {};

export function impostaNomiAmici(nomi: Record<string, string>) {
	nomiAmici = nomi;
}

export function eVirtuale(path: string): boolean {
	return path.startsWith('::');
}

export interface Briciola {
	nome: string;
	path: string;
}

/**
 * I tratti del percorso, ciascuno con la cartella in cui porta.
 *
 * Un disco parte da «Questo PC», un path di rete da «Rete»: come in Esplora,
 * la catena arriva sempre fino a una radice cliccabile.
 */
export function briciole(path: string): Briciola[] {
	for (const radice of [RETE_LOCALE, AMICI]) {
		if (!path.startsWith(radice + '\\')) continue;
		const parti = path.slice(radice.length + 1).split('\\').filter(Boolean);
		const out: Briciola[] = [{ nome: NOMI_VIRTUALI[radice], path: radice }];
		let corrente = radice;
		parti.forEach((p, i) => {
			corrente = `${corrente}\\${p}`;
			const nome = radice === AMICI && i === 0 ? (nomiAmici[p] ?? 'Amico') : p;
			out.push({ nome, path: corrente });
		});
		return out;
	}
	if (eVirtuale(path)) {
		return [{ nome: NOMI_VIRTUALI[path] ?? path, path }];
	}

	if (path.startsWith('\\\\')) {
		const parti = path.slice(2).split('\\').filter(Boolean);
		const out: Briciola[] = [{ nome: 'Rete', path: RETE }];
		let corrente = '\\\\';
		parti.forEach((p, i) => {
			corrente = i === 0 ? `\\\\${p}` : `${corrente}\\${p}`;
			out.push({ nome: p, path: corrente });
		});
		return out;
	}

	const parti = path.split(/[\\/]/).filter(Boolean);
	if (parti.length === 0) return [{ nome: path, path }];

	const out: Briciola[] = [{ nome: 'Questo PC', path: QUESTO_PC }];
	let corrente = '';
	parti.forEach((p, i) => {
		corrente = i === 0 ? `${p}\\` : corrente.endsWith('\\') ? corrente + p : `${corrente}\\${p}`;
		out.push({ nome: p, path: corrente });
	});
	return out;
}

/** Nome breve della posizione, per il titolo del tab. */
export function nomePosizione(path: string): string {
	const b = briciole(path);
	return b[b.length - 1]?.nome ?? path;
}

/** Ultimo tratto del path: il nome dell'elemento. */
export function nomeDi(path: string): string {
	const i = path.replace(/[\\/]+$/, '').search(/[^\\/]+$/);
	return i === -1 ? path : path.slice(i).replace(/[\\/]+$/, '');
}

/** La cartella che contiene `path`, solo per mostrarla. */
export function cartellaDi(path: string): string {
	const i = path.lastIndexOf('\\');
	if (i <= 0) return path;
	const g = path.slice(0, i);
	return g.endsWith(':') ? `${g}\\` : g;
}

/**
 * Il volume su cui sta un path: la lettera di unità o `\\server\condivisione`.
 * Decide se trascinare sposta (stesso volume) o copia, come in Esplora.
 */
export function volume(path: string): string {
	if (path.startsWith('\\\\')) {
		return path.split('\\').slice(0, 4).join('\\').toLowerCase();
	}
	return path.slice(0, 2).toLowerCase();
}

export function stessoVolume(a: string, b: string): boolean {
	return volume(a) === volume(b);
}

export function estensione(nome: string): string {
	const i = nome.lastIndexOf('.');
	return i > 0 ? nome.slice(i + 1).toLowerCase() : '';
}

/** Il nome senza estensione, come lo mostra Esplora con le estensioni nascoste. */
export function senzaEstensione(nome: string): string {
	const i = nome.lastIndexOf('.');
	return i > 0 ? nome.slice(0, i) : nome;
}

export function eZip(nome: string): boolean {
	return estensione(nome) === 'zip';
}

const ESEGUIBILI = new Set(['exe', 'msi', 'bat', 'cmd', 'com']);

/** Elementi che ha senso avviare come amministratore. */
export function eEseguibile(nome: string): boolean {
	return ESEGUIBILI.has(estensione(nome));
}

/** Due path indicano lo stesso elemento: Windows ignora le maiuscole. */
export function stessoPath(a: string, b: string): boolean {
	return a.replace(/\\+$/, '').toLowerCase() === b.replace(/\\+$/, '').toLowerCase();
}

/** Byte in forma leggibile. */
export function byte(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
	if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
	if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(1)} GB`;
	return `${(n / 1024 ** 4).toFixed(2)} TB`;
}
