/**
 * Personaggi in pixel art per i temi: sfilano sul binario al posto del
 * treno. Tutti originali, nello stesso stile del convoglio.
 *
 * Ogni figura è una griglia di caratteri: `.` è trasparente, ogni altra
 * lettera è un colore della sua tavolozza. Guarda a destra, nel verso in
 * cui cammina. Il passo si genera da solo: nel secondo fotogramma l'ultima
 * riga (le zampe) scivola di un pixel.
 */

export interface Figura {
	nome: string;
	colori: Record<string, string>;
	griglia: string[];
}

const F = (nome: string, colori: Record<string, string>, griglia: string[]): Figura => ({
	nome,
	colori,
	griglia
});

// ── Gatti ────────────────────────────────────────────────────────────

const gatto = (nome: string, o: string, d: string, k: string, w: string, p: string) =>
	F(nome, { o, d, k, w, p }, [
		'..........o..o',
		'..........oooo',
		'o.........okok',
		'o.........owpw',
		'.o..ooooooooo.',
		'..ooodoodooo..',
		'..oooooooooo..',
		'..o.o....o.o..',
		'..w.w....w.w..'
	]);

// ── Figure ───────────────────────────────────────────────────────────

export const FIGURE: Record<string, Figura> = {
	gattoArancio: gatto('Gatto rosso', '#f59e0b', '#d97706', '#1f2937', '#fff7ed', '#f472b6'),
	gattoNero: gatto('Gatto nero', '#2b2b35', '#1c1c24', '#a3e635', '#3a3a46', '#f472b6'),
	gattoBianco: gatto('Gatto bianco', '#f5f5f4', '#e7e5e4', '#60a5fa', '#ffffff', '#fda4af'),
	gattoGrigio: gatto('Gatto grigio', '#9ca3af', '#6b7280', '#facc15', '#e5e7eb', '#f9a8d4'),

	// ── Creature tascabili (originali) ──
	fiammello: F('Fiammello', { r: '#f97316', y: '#fde68a', k: '#1f2937', f: '#ef4444', g: '#facc15' }, [
		'..g...........',
		'.gfg....rrrr..',
		'.gfg...rrrrrr.',
		'..f...rrrrkrr.',
		'..r...rrrrrrr.',
		'...rrrrryyyrr.',
		'....rrryyyyr..',
		'....rrrrrrr...',
		'....r.r..r.r..'
	]),
	goccino: F('Goccino', { b: '#38bdf8', l: '#bae6fd', k: '#0f172a', s: '#0ea5e9' }, [
		'.........b....',
		'........bbb...',
		'.......bbbbb..',
		'......bbbbkbb.',
		'.ss...bbbbbbb.',
		'.ssbbbbllllbb.',
		'..sbbbbllllb..',
		'...bbbbbbbb...',
		'...b.b..b.b...'
	]),
	germoglio: F('Germoglio', { g: '#22c55e', d: '#15803d', l: '#86efac', k: '#052e16', p: '#f472b6' }, [
		'.........dld..',
		'........dlld..',
		'.........d....',
		'.......ggggg..',
		'......ggggkgg.',
		'.....gggggggg.',
		'..gggggllllgg.',
		'...ggggllllg..',
		'...g.g...g.g..'
	]),
	scintilla: F('Scintilla', { y: '#fde047', o: '#f59e0b', k: '#1c1917', w: '#fefce8', b: '#7c3aed' }, [
		'o...........y.',
		'oo.........yy.',
		'.oo.....yyyyy.',
		'..o....yyykyy.',
		'..oo..yyyyyyb.',
		'...oyyyywwyy..',
		'....yyywwwy...',
		'....yyyyyyy...',
		'....y.y..y.y..'
	]),

	// ── Anime chibi (originali) ──
	ragazzaRosa: F('Ragazza dai capelli rosa', { h: '#f472b6', d: '#db2777', s: '#fde4cf', k: '#1e1b4b', u: '#1e3a8a', r: '#ef4444', w: '#ffffff' }, [
		'...rhhhhr.',
		'..hhhhhhh.',
		'.hhhhhhhhh',
		'.hhsssssh.',
		'.hhskssks.',
		'.dhsssssd.',
		'..d.sss.d.',
		'...wwrww..',
		'...uuuuu..',
		'...uuuuu..',
		'....s.s...',
		'....k.k...'
	]),
	ragazzoPunte: F('Ragazzo dai capelli a punta', { h: '#1f2937', s: '#fde4cf', k: '#0f172a', o: '#f97316', b: '#1d4ed8', w: '#ffffff' }, [
		'.h.h.h....',
		'.hhhhhh.h.',
		'hhhhhhhhh.',
		'.hhsssssh.',
		'.hhskssks.',
		'..hsssss..',
		'....sss...',
		'...ooooo..',
		'...owoow..',
		'...bbbbb..',
		'...b...b..',
		'...k...k..'
	]),
	maghetta: F('Maghetta', { h: '#a78bfa', s: '#fde4cf', k: '#1e1b4b', p: '#ec4899', w: '#fdf4ff', y: '#facc15', b: '#78350f' }, [
		'...hhhhh..y',
		'..hhhhhhhyy',
		'..hsssssh.b',
		'..hskssksbb',
		'..hsssssh.b',
		'...psssp..b',
		'..ppwwwpp.b',
		'..ppppppp..',
		'.ppppppppp.',
		'....s..s...',
		'....p..p...'
	]),
	ninja: F('Ninja', { n: '#312e81', s: '#fde4cf', k: '#0f172a', r: '#dc2626', g: '#64748b' }, [
		'...nnnnn...',
		'..nnnnnnn..',
		'..nnnnnnnrr',
		'..nskssksn.',
		'..nnnnnnn..',
		'...nnnnn...',
		'..nnrrrnn..',
		'..nnnnnnng.',
		'...nnnnn.g.',
		'...n...n...',
		'...k...k...'
	]),

	// ── Kawaii ──
	mochi: F('Mochi', { p: '#fbcfe8', d: '#f9a8d4', k: '#3f3f46', r: '#fb7185' }, [
		'...pppppp...',
		'..pppppppp..',
		'.pppppppppp.',
		'.ppkppppkpp.',
		'.prppkkpprp.',
		'.pppppppppp.',
		'..dddddddd..',
		'...d....d...'
	]),
	onigiri: F('Onigiri', { w: '#fafafa', n: '#1e293b', k: '#27272a', r: '#fb7185' }, [
		'.....ww.....',
		'....wwww....',
		'...wwwwww...',
		'..wwkwwkww..',
		'..wrwkkwrw..',
		'.wwnnnnnnww.',
		'.wwnnnnnnww.',
		'wwwnnnnnnwww',
		'.w........w.'
	]),
	boba: F('Tè con le perle', { c: '#e7c9a9', s: '#f472b6', t: '#d6d3d1', k: '#3f3f46', b: '#44403c', r: '#fb7185' }, [
		'.......s.',
		'......s..',
		'.ttttsttt',
		'..ccccccc.',
		'..ckcccck.',
		'..crckkcr.',
		'..ccccccc.',
		'..cbcbcbc.',
		'..ccccccc.',
		'...c...c..'
	]),
	stellina: F('Stellina', { y: '#fde047', o: '#facc15', k: '#3f3f46', r: '#fb7185' }, [
		'.....y.....',
		'....yyy....',
		'yyyyyyyyyyy',
		'.yykyyykyy.',
		'..yryyyry..',
		'..yyykyyy..',
		'.yyyy.yyyy.',
		'.yy.....yy.'
	]),

	// ── Primavera ──
	farfalla: F('Farfalla', { a: '#f472b6', b: '#a78bfa', k: '#1f2937', y: '#fde047' }, [
		'aa......bb',
		'aaa.k..bbb',
		'aaay.kybbb',
		'.aa.kk.bb.',
		'.bb.kk.aa.',
		'bbb.kk.aaa',
		'.bb....aa.'
	]),
	ape: F('Ape', { y: '#facc15', k: '#1c1917', w: '#e0f2fe' }, [
		'....ww.ww..',
		'....wwwww..',
		'..ykykyky..',
		'.yykykykyk.',
		'.yykykykyy.',
		'..ykykyky..',
		'...k...k...'
	]),
	coccinella: F('Coccinella', { r: '#ef4444', k: '#1c1917', w: '#ffffff' }, [
		'....rrrr.k.',
		'..rrkrrrrkk',
		'.rrrrrkrrkw',
		'.rkrrrrrrkk',
		'.rrrrkrrrk.',
		'..rrrrrrr..',
		'..k.k.k.k..'
	]),
	coniglio: F('Coniglietto', { w: '#f5f5f4', p: '#f9a8d4', k: '#1f2937', g: '#d6d3d1' }, [
		'.........w.w',
		'.........wpw',
		'.........wpw',
		'........wwww',
		'.w.....wwkww',
		'ww.wwwwwwwpw',
		'.wwwwwwwwww.',
		'..wwwwwwww..',
		'..g.g..g.g..'
	]),

	// ── Estate ──
	granchio: F('Granchio', { r: '#ef4444', d: '#b91c1c', k: '#1c1917', w: '#ffffff' }, [
		'rr........rr',
		'r.r......r.r',
		'.r..w..w..r.',
		'.r..k..k..r.',
		'..rrrrrrrr..',
		'.rrrrrrrrrr.',
		'..rddddddr..',
		'.r.r.r.r.r.r'
	]),
	gelato: F('Gelato', { p: '#f9a8d4', m: '#a7f3d0', c: '#d97706', y: '#fbbf24', k: '#3f3f46', r: '#e11d48' }, [
		'....r....',
		'...ppp...',
		'..ppppp..',
		'..mmmmm..',
		'.mkmmmkm.',
		'.mmmkmmm.',
		'..ccccc..',
		'..cycyc..',
		'...ccc...',
		'...c.c...'
	]),
	tartaruga: F('Tartaruga', { g: '#16a34a', d: '#166534', l: '#84cc16', k: '#052e16' }, [
		'....dddd.....',
		'...ddlldd....',
		'..ddllllddll.',
		'..dlldlldllkl',
		'.dddddddddll.',
		'..l.l..l.l...'
	]),
	sole: F('Sole', { y: '#fde047', o: '#f59e0b', k: '#78350f', r: '#fb7185' }, [
		'o...o...o',
		'.o.yyy.o.',
		'..yyyyy..',
		'oyykyykyo',
		'.yryyyry.',
		'..yykyy..',
		'.o.yyy.o.',
		'o...o...o'
	]),

	// ── Autunno ──
	riccio: F('Riccio', { b: '#78350f', s: '#a16207', f: '#fde4cf', k: '#1c1917' }, [
		'..b.b.b.b....',
		'.bbbbbbbbb...',
		'bsbsbsbsbbf..',
		'bbbbbbbbbffkf',
		'bsbsbsbsbfffk',
		'.bbbbbbbbbff.',
		'..f.f..f.f...'
	]),
	scoiattolo: F('Scoiattolo', { o: '#c2410c', l: '#fdba74', k: '#1c1917', g: '#a16207' }, [
		'oo........o.',
		'ooo......ooo',
		'ooo.....ookl',
		'.oo.....oooo',
		'..oo..ooooo.',
		'...ooooolo..',
		'....oooolg..',
		'....o.o..o..'
	]),
	fungo: F('Fungo', { r: '#dc2626', w: '#fafaf9', b: '#e7e5e4', k: '#292524' }, [
		'...rrrrr...',
		'..rrwrrwr..',
		'.rwrrrrrwr.',
		'rrrrrwrrrrr',
		'...bbbbb...',
		'...bkbkb...',
		'...bbbbb...',
		'...b...b...'
	]),
	foglia: F('Foglia', { o: '#ea580c', y: '#f59e0b', b: '#78350f', k: '#431407' }, [
		'......o....',
		'....ooyo...',
		'..ooyyyoo..',
		'.oyykyykyo.',
		'.oyyyyyyyo.',
		'..ooybyoo..',
		'....obo....',
		'.....b.....',
		'....b.b....'
	]),

	// ── Inverno ──
	pinguino: F('Pinguino', { n: '#1e293b', w: '#f8fafc', o: '#f97316', k: '#0f172a' }, [
		'...nnnn...',
		'..nnnnnn..',
		'..nwkwwn..',
		'..nwwwwoo.',
		'.nnwwwwnn.',
		'.nnwwwwnn.',
		'..nwwwwn..',
		'..nnnnnn..',
		'...o..o...'
	]),
	pupazzo: F('Pupazzo di neve', { w: '#f8fafc', k: '#1e293b', o: '#f97316', r: '#dc2626', b: '#78350f' }, [
		'...kkk...',
		'..kkkkk..',
		'..wwwww..',
		'..wkwkw..',
		'..wwwoo..',
		'.rrrrrr..',
		'.wwwkwww.',
		'bwwwwwwwb',
		'.wwwkwww.',
		'..w...w..'
	]),
	orsoPolare: F('Orso polare', { w: '#f1f5f9', g: '#cbd5e1', k: '#0f172a' }, [
		'.........w.w.',
		'........wwwww',
		'........wwkww',
		'.wwwwwwwwwwwk',
		'wwwwwwwwwwww.',
		'wwwgwwwwgwww.',
		'.ww.ww..ww.ww'
	]),

	// ── Natale ──
	renna: F('Renna', { b: '#92400e', l: '#d6a46b', k: '#1c1917', r: '#ef4444', a: '#a16207' }, [
		'.........a.a.',
		'.........aaa.',
		'..........bb.',
		'.........bbkb',
		'b........bbbr',
		'.bbbbbbbbbb..',
		'.bbllllbbb...',
		'.b.b...b.b...'
	]),
	slitta: F('Slitta', { r: '#dc2626', d: '#991b1b', y: '#facc15', s: '#fde4cf', w: '#f8fafc', k: '#1c1917', g: '#16a34a' }, [
		'......rrr.....',
		'.....rrrrw....',
		'.....sskss....',
		'.....wwwww....',
		'.gg..rrrrr....',
		'gggrrrrrrrrrr.',
		'.rrrrrrrrrrr..',
		'..dddddddddd..',
		'.y..........y.',
		'yyyyyyyyyyyyy.'
	]),
	regalo: F('Regalo', { g: '#16a34a', y: '#facc15', r: '#dc2626' }, [
		'...r.r...',
		'....r....',
		'ggggyggggg',
		'ggggyggggg',
		'yyyyyyyyyy',
		'ggggyggggg',
		'ggggyggggg',
		'.g......g.'
	]),

	// ── Capodanno ──
	razzo: F('Razzo', { r: '#ef4444', w: '#f8fafc', b: '#3b82f6', y: '#facc15', o: '#f97316' }, [
		'.....r',
		'....rr',
		'...wwr',
		'..wbw.',
		'.www..',
		'oww...',
		'yo....',
		'o.....'
	]),
	bottiglia: F('Spumante', { g: '#15803d', y: '#facc15', w: '#fef9c3', k: '#1c1917' }, [
		'...yyy...',
		'...ggg...',
		'...ggg...',
		'..ggggg..',
		'.ggwwwgg.',
		'.gwkwkwg.',
		'.ggwwwgg.',
		'.ggggggg.',
		'..g...g..'
	]),
	orologio: F('Orologio di mezzanotte', { y: '#facc15', w: '#fefce8', k: '#1c1917', r: '#ef4444' }, [
		'..yyyyy..',
		'.ywwkwwy.',
		'ywwwkwwwy',
		'ywwwkwwwy',
		'ywwwwwwwy',
		'.ywwwwwy.',
		'..yyyyy..',
		'..y...y..'
	]),

	// ── San Valentino ──
	cuore: F('Cuoricino', { r: '#ef4444', p: '#fda4af', k: '#3f0d12', w: '#fff1f2' }, [
		'.rr...rr.',
		'rrrr.rrrr',
		'rwrrrrrrr',
		'rrkrrrkrr',
		'.rprkrpr.',
		'..rrrrr..',
		'...rrr...',
		'...k.k...'
	]),
	lettera: F('Lettera d’amore', { w: '#fff1f2', p: '#fbcfe8', r: '#e11d48', k: '#3f3f46' }, [
		'wwwwwwwwww',
		'wpwwwwwwpw',
		'wwppwwppww',
		'wwwwrrwwww',
		'wwwrrrrwww',
		'wwwwrrwwww',
		'wwwwwwwwww',
		'.k......k.'
	]),

	// ── Carnevale ──
	maschera: F('Maschera', { v: '#7c3aed', y: '#facc15', p: '#ec4899', k: '#1e1b4b' }, [
		'y........y',
		'.y.vvvv.y.',
		'..vvvvvv..',
		'.vvkvvkvv.',
		'.vkkvvkkv.',
		'..vvvvvv..',
		'...pppp...',
		'...p..p...'
	]),
	giullare: F('Giullare', { r: '#dc2626', g: '#16a34a', y: '#facc15', s: '#fde4cf', k: '#1c1917' }, [
		'y.......y',
		'rr.....gg',
		'.rrr.ggg.',
		'..sssss..',
		'..skssk..',
		'..sssss..',
		'.rrryggg.',
		'.rrryggg.',
		'..r...g..',
		'..k...k..'
	]),

	// ── Pasqua ──
	pulcino: F('Pulcino', { y: '#fde047', o: '#f97316', k: '#1c1917' }, [
		'....yyy..',
		'...yyyyy.',
		'...yykyoo',
		'.yyyyyyy.',
		'yyyyyyyy.',
		'.yyyyyy..',
		'..o..o...'
	]),
	uovo: F('Uovo decorato', { a: '#a5f3fc', p: '#f9a8d4', y: '#fde68a', k: '#3f3f46' }, [
		'...aaa...',
		'..aaaaa..',
		'.ppppppp.',
		'.pkpppkp.',
		'yyyyyyyyy',
		'.aaaaaaa.',
		'..aaaaa..',
		'..a...a..'
	]),

	// ── Halloween ──
	zucca: F('Zucca', { o: '#f97316', d: '#c2410c', g: '#15803d', k: '#1c1917' }, [
		'.....g....',
		'....gg....',
		'.ooodoooo.',
		'oodkooodko',
		'oooookoooo',
		'odkkkkkkdo',
		'.oodooodo.',
		'..o....o..'
	]),
	fantasma: F('Fantasmino', { w: '#f8fafc', g: '#cbd5e1', k: '#1e293b' }, [
		'...wwww...',
		'..wwwwww..',
		'.wwkwwkww.',
		'.wwwwwwww.',
		'.wwwkkwww.',
		'.wwwwwwww.',
		'.wgwwgwwg.',
		'.w.w.w.w..'
	]),
	pipistrello: F('Pipistrello', { n: '#3b0764', p: '#a855f7', y: '#fde047' }, [
		'n....n....n',
		'nn..nnn..nn',
		'nnnnnyny.nn',
		'.nnnnnnnnn.',
		'..nn.n.nn..',
		'.....n.....'
	]),

	// ── Treno (per l'editor: il convoglio originale si sceglie a parte) ──
	vagone: F('Vagoncino', { p: '#8b5cf6', c: '#7cf5ff', k: '#1e1b4b', g: '#4b5563' }, [
		'pppppppppppp',
		'pccpccpccpcp',
		'pppppppppppp',
		'.kk......kk.'
	])
};

/** I personaggi di ogni mondo, nell'ordine in cui sfilano. */
export const CORTEI: Record<string, string[]> = {
	anime: ['ragazzaRosa', 'ragazzoPunte', 'maghetta', 'ninja'],
	pokemon: ['scintilla', 'fiammello', 'goccino', 'germoglio'],
	gatti: ['gattoArancio', 'gattoNero', 'gattoBianco', 'gattoGrigio'],
	kawaii: ['mochi', 'onigiri', 'boba', 'stellina'],
	primavera: ['coniglio', 'farfalla', 'ape', 'coccinella'],
	estate: ['granchio', 'tartaruga', 'gelato', 'sole'],
	autunno: ['riccio', 'scoiattolo', 'fungo', 'foglia'],
	inverno: ['pinguino', 'pupazzo', 'orsoPolare', 'pinguino'],
	natale: ['renna', 'renna', 'slitta', 'regalo'],
	capodanno: ['razzo', 'bottiglia', 'orologio', 'razzo'],
	sanvalentino: ['cuore', 'lettera', 'cuore', 'cuore'],
	carnevale: ['giullare', 'maschera', 'giullare', 'maschera'],
	pasqua: ['coniglio', 'pulcino', 'uovo', 'pulcino'],
	halloween: ['zucca', 'fantasma', 'pipistrello', 'gattoNero']
};

/** Rettangoli di una riga, unendo i pixel vicini dello stesso colore. */
function riga(testo: string, y: number, colori: Record<string, string>): string {
	let out = '';
	let x = 0;
	while (x < testo.length) {
		const c = testo[x];
		let fine = x + 1;
		while (fine < testo.length && testo[fine] === c) fine++;
		const colore = colori[c];
		if (c !== '.' && colore) out += `<rect x="${x}" y="${y}" width="${fine - x}" height="1" fill="${colore}"/>`;
		x = fine;
	}
	return out;
}

export function misuraFigura(f: Figura): { larghezza: number; altezza: number } {
	return { larghezza: Math.max(...f.griglia.map((r) => r.length)), altezza: f.griglia.length };
}

/**
 * SVG della figura con i due fotogrammi del passo. La pagina li alterna
 * con un'animazione CSS (classi `passo-a` e `passo-b`).
 */
export function svgFigura(f: Figura, scala = 2): string {
	const { larghezza, altezza } = misuraFigura(f);
	const corpo = f.griglia.slice(0, -1).map((r, y) => riga(r, y, f.colori)).join('');
	const zampe = f.griglia[f.griglia.length - 1];
	const a = riga(zampe, altezza - 1, f.colori);
	// Secondo fotogramma: zampe spostate di un pixel, il passo.
	const b = riga('.' + zampe.slice(0, -1), altezza - 1, f.colori);
	return (
		`<svg viewBox="0 0 ${larghezza} ${altezza}" width="${larghezza * scala}" height="${altezza * scala}" shape-rendering="crispEdges" aria-hidden="true">` +
		corpo +
		`<g class="passo-a">${a}</g><g class="passo-b">${b}</g></svg>`
	);
}

/**
 * Tassello per lo sfondo decorativo della lista: la figura piccola e quasi
 * trasparente, ripetuta. Restituisce un valore per `background-image`.
 */
export function motivoFigura(f: Figura, opacita = 0.07): string {
	const { larghezza, altezza } = misuraFigura(f);
	const corpo = f.griglia.map((r, y) => riga(r, y, f.colori)).join('');
	const lato = 96;
	const s = 2;
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${lato}" height="${lato}" viewBox="0 0 ${lato} ${lato}">` +
		`<g opacity="${opacita}" shape-rendering="crispEdges" transform="translate(${(lato - larghezza * s) / 2} ${(lato - altezza * s) / 2}) scale(${s})">${corpo}</g></svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
