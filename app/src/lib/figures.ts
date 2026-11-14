/**
 * Pixel-art characters for the themes: they travel on the rail in place of
 * the train. All original, in the same style as the convoy.
 *
 * Each figure is a grid of characters: `.` is transparent, every other
 * letter is a colour of its palette. It faces right, the way it walks. The
 * step makes itself: in the second frame the last row (the legs) slides by
 * one pixel.
 */

export interface Figure {
	name: string;
	colors: Record<string, string>;
	grid: string[];
}

const F = (name: string, colors: Record<string, string>, grid: string[]): Figure => ({
	name,
	colors,
	grid
});

// ── Cats ─────────────────────────────────────────────────────────────

const cat = (name: string, o: string, d: string, k: string, w: string, p: string) =>
	F(name, { o, d, k, w, p }, [
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

// ── Figures ──────────────────────────────────────────────────────────

// Figure ids are saved in themes: they stay as they are.
export const FIGURES: Record<string, Figure> = {
	gattoArancio: cat('Gatto rosso', '#f59e0b', '#d97706', '#1f2937', '#fff7ed', '#f472b6'),
	gattoNero: cat('Gatto nero', '#2b2b35', '#1c1c24', '#a3e635', '#3a3a46', '#f472b6'),
	gattoBianco: cat('Gatto bianco', '#f5f5f4', '#e7e5e4', '#60a5fa', '#ffffff', '#fda4af'),
	gattoGrigio: cat('Gatto grigio', '#9ca3af', '#6b7280', '#facc15', '#e5e7eb', '#f9a8d4'),

	// ── Pocket creatures (original) ──
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

	// ── Chibi anime (original) ──
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

	// ── Spring ──
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

	// ── Summer ──
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

	// ── Autumn ──
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

	// ── Winter ──
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

	// ── Christmas ──
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

	// ── New Year ──
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

	// ── Valentine's Day ──
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

	// ── Carnival ──
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

	// ── Easter ──
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

	// ── Cianografia: technical drawing tools ──
	trenoFilo: F('Treno in fil di ferro', { w: '#e6f6ff', d: '#5db8ff', y: '#ffd36b' }, [
		'.ww...........',
		'.ww...wwwwwww.',
		'wwwwwww.....w.',
		'w.....w.dd..wy',
		'w.....w.dd..w.',
		'wwwwwwwwwwwwww',
		'.w..w.....w..w',
		'.d..d.....d..d'
	]),
	compasso: F('Compasso', { w: '#e6f6ff', d: '#5db8ff', y: '#ffd36b' }, [
		'....d....',
		'...ddd...',
		'....w....',
		'...w.w...',
		'...w.w...',
		'..w...w..',
		'..w...w..',
		'.w.....w.',
		'.d.....y.'
	]),
	squadra: F('Squadra', { w: '#e6f6ff', d: '#5db8ff' }, [
		'w.........',
		'ww........',
		'w.w.......',
		'w..w......',
		'w.d.w.....',
		'w.dd.w....',
		'w.....w...',
		'wwwwwwww..',
		'.d.d.d.d..'
	]),

	// ── Abisso: creatures of the sea floor ──
	medusa: F('Medusa', { b: '#52ffd6', l: '#c9fff1', p: '#ff8ade' }, [
		'...bbbbb...',
		'..bbllbbb..',
		'.bbllbbbbb.',
		'.bbbbbbbbb.',
		'.pbpbpbpbp.',
		'.p.b.p.b.p.',
		'.b.p.b.p.b.',
		'.p...p...p.'
	]),
	pesceLanterna: F('Pesce lanterna', { b: '#2fb4ff', n: '#0e5f86', y: '#fff3a0', k: '#02121b', w: '#dcf6f3' }, [
		'...........yy.',
		'.....nnnn.y...',
		'n..nbbbbbn....',
		'nn.bbbbbkbb...',
		'nnbbbbbbbbbw..',
		'nn.bbbbbbwbw..',
		'n..nbbbbbbn...',
		'.....nnnn.....'
	]),
	cavalluccio: F('Cavalluccio marino', { s: '#ff8ade', d: '#c2589e', k: '#02121b' }, [
		'....ssss..',
		'...sskss..',
		'...ssssss.',
		'....ss....',
		'...sss....',
		'..dsss....',
		'..dss.....',
		'...ss.....',
		'....ss.s..',
		'.....sss..'
	]),

	// ── Atlante: travels on paper ──
	aeroplanino: F('Aeroplanino di carta', { w: '#ffffff', g: '#9fb5ab', k: '#17283a' }, [
		'k.............',
		'wwk...........',
		'.wwwwk........',
		'..wwwwwwwk....',
		'...wwwwwwwwwwk',
		'..ggggggggk...',
		'.ggggk........',
		'ggk...........'
	]),
	mongolfiera: F('Mongolfiera', { o: '#c27a1a', b: '#0f6a8c', w: '#f7faf6', r: '#17283a', k: '#7a4a1e' }, [
		'...oooo...',
		'..obwbwo..',
		'.obwbwbwo.',
		'.obwbwbwo.',
		'..obwbwo..',
		'...obwo...',
		'...r..r...',
		'...kkkk...',
		'...kkkk...'
	]),
	faro: F('Faro', { y: '#ffd36b', k: '#17283a', w: '#f7faf6', r: '#b4432f' }, [
		'..yyy..',
		'.kkkkk.',
		'..www..',
		'..rrr..',
		'..www..',
		'.rrrrr.',
		'.wwwww.',
		'.rrrrr.',
		'kkkkkkk'
	]),

	// ── Orient Express: the luxury train ──
	locoOro: F('Locomotiva a vapore', { v: '#2e6a50', g: '#cfa24a', d: '#f6dc96', f: '#cfc8b4', k: '#0c1512' }, [
		'......fff.........',
		'........fff.......',
		'..........gg......',
		'vvvv......vv......',
		'vdgv.vvvvvvvvvv...',
		'vvvvvgggggggggvv..',
		'vvvvvvvvvvvvvvvvg.',
		'vvvvvvvvvvvvvvvvgg',
		'.gg..gg....gg.....'
	]),
	carrozzaOro: F('Carrozza letto', { b: '#7a4a22', g: '#cfa24a', d: '#f6dc96', k: '#0c1512' }, [
		'.gggggggggggggggg.',
		'gbbbbbbbbbbbbbbbbg',
		'gbddbbddbbddbbddbg',
		'gbddbbddbbddbbddbg',
		'gbbbbbbbbbbbbbbbbg',
		'gggggggggggggggggg',
		'..gg..gg....gg..gg'
	]),

	// ── Train (for the editor: the original convoy is chosen apart) ──
	vagone: F('Vagoncino', { p: '#8b5cf6', c: '#7cf5ff', k: '#1e1b4b', g: '#4b5563' }, [
		'pppppppppppp',
		'pccpccpccpcp',
		'pppppppppppp',
		'.kk......kk.'
	])
};

/** The characters of each world, in the order they travel. */
export const PARADES: Record<string, string[]> = {
	// The one leading is the last: the parade moves to the right.
	cianografia: ['compasso', 'squadra', 'compasso', 'trenoFilo'],
	abisso: ['medusa', 'cavalluccio', 'medusa', 'pesceLanterna'],
	atlante: ['mongolfiera', 'faro', 'mongolfiera', 'aeroplanino'],
	orient: ['carrozzaOro', 'carrozzaOro', 'carrozzaOro', 'locoOro'],
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

/** Rectangles of one row, joining neighbouring pixels of the same colour. */
function row(text: string, y: number, colors: Record<string, string>): string {
	let out = '';
	let x = 0;
	while (x < text.length) {
		const c = text[x];
		let end = x + 1;
		while (end < text.length && text[end] === c) end++;
		const color = colors[c];
		if (c !== '.' && color) out += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}"/>`;
		x = end;
	}
	return out;
}

export function figureSize(f: Figure): { width: number; height: number } {
	return { width: Math.max(...f.grid.map((r) => r.length)), height: f.grid.length };
}

/**
 * SVG of the figure with the two frames of the step. The page alternates
 * them with a CSS animation (classes `step-a` and `step-b`).
 */
export function figureSvg(f: Figure, scale = 2): string {
	const { width, height } = figureSize(f);
	const body = f.grid.slice(0, -1).map((r, y) => row(r, y, f.colors)).join('');
	const legs = f.grid[f.grid.length - 1];
	const a = row(legs, height - 1, f.colors);
	// Second frame: legs shifted by one pixel, the step.
	const b = row('.' + legs.slice(0, -1), height - 1, f.colors);
	return (
		`<svg viewBox="0 0 ${width} ${height}" width="${width * scale}" height="${height * scale}" shape-rendering="crispEdges" aria-hidden="true">` +
		body +
		`<g class="step-a">${a}</g><g class="step-b">${b}</g></svg>`
	);
}

/**
 * Tile for the list's decorative background: the figure small and almost
 * transparent, repeated. Returns a value for `background-image`.
 */
export function figurePattern(f: Figure, opacity = 0.07): string {
	const { width, height } = figureSize(f);
	const body = f.grid.map((r, y) => row(r, y, f.colors)).join('');
	const side = 96;
	const s = 2;
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">` +
		`<g opacity="${opacity}" shape-rendering="crispEdges" transform="translate(${(side - width * s) / 2} ${(side - height * s) / 2}) scale(${s})">${body}</g></svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
