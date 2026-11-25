import { describe, it, expect } from 'vitest';
import {
	THEMES,
	variablesFor,
	withAlpha,
	themeById,
	accentColor,
	variablesFrom,
	textOnAccent,
	FONTS,
	BASE_SHAPES,
	textScale,
	titleScale,
	shapeVariables,
	skyVariables,
	categoryOf,
	CATEGORIES,
	folderStyleOf,
	themeFromStored,
	themeToStored,
	type Shapes
} from './themes';
import { FIGURES, PARADES, figureSvg, figurePattern, figureSize } from './figures';

describe('themes', () => {
	it('every theme defines the same colour variables, so none is left from the previous theme', () => {
		const keys = Object.keys(THEMES[0].variables).sort();
		for (const t of THEMES) expect(Object.keys(t.variables).sort(), t.id).toEqual(keys);
	});

	it('ids are unique', () => {
		const ids = THEMES.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('the theme accent applies when no other is chosen', () => {
		const ocean = themeById('oceano');
		expect(accentColor(ocean, 'tema', '#000000')).toBe(ocean.variables['--plasma']);
	});

	it('a chosen accent replaces the theme one, selection tint included', () => {
		const v = variablesFor(themeById('spazio'), accentColor(themeById('spazio'), 'verde', '#000000'));
		expect(v['--accent']).toBe('#22c55e');
		expect(v['--accent-soft']).toBe('rgba(34, 197, 94, 0.26)');
	});

	it('the highlight color leaves the folders in the theme color', () => {
		const v = variablesFor(themeById('spazio'), '#22c55e');
		expect(v['--folder']).toBe('#8b5cf6');
	});

	it('the custom accent uses the colour the user picked', () => {
		expect(accentColor(themeById('spazio'), 'personalizzato', '#123456')).toBe('#123456');
	});

	it('an unknown theme falls back to the default; personal ones are found', () => {
		expect(themeById('missing').id).toBe('spazio');
		const mine = { ...themeById('notte'), id: 'personale-1', group: 'personal' as const };
		expect(themeById('personale-1', [mine])).toBe(mine);
	});

	it('turns a hex colour into a transparency', () => {
		expect(withAlpha('#ff0080', 0.5)).toBe('rgba(255, 0, 128, 0.5)');
	});

	it('derived colours follow a light or dark background', () => {
		const t = { void: '#fff', hull: '#ffffff', rail: '#ccc', current: '#00f', plasma: '#f00', signal: '#ff0', text: '#000', dim: '#666' };
		expect(variablesFrom(t, true)['--border']).toContain('rgba(0, 0, 0');
		expect(variablesFrom(t, false)['--border']).toContain('rgba(255, 255, 255');
	});
});

describe('world themes', () => {
	const worlds = THEMES.filter((t) => t.group === 'world');

	it('the requested worlds are there: anime, pokémon, cats, kawaii, seasons and holidays', () => {
		expect(worlds.map((t) => t.id)).toEqual(
			expect.arrayContaining([
				'anime', 'pokemon', 'gatti', 'kawaii',
				'primavera', 'estate', 'autunno', 'inverno',
				'natale', 'capodanno', 'sanvalentino', 'carnevale', 'pasqua', 'halloween'
			])
		);
	});

	it('every world has its characters, its background and its shapes', () => {
		for (const t of worlds) {
			expect(t.parade?.length, t.id).toBeGreaterThan(0);
			for (const f of t.parade!) expect(FIGURES[f], `${t.id}: ${f}`).toBeDefined();
			expect(FIGURES[t.pattern!], t.id).toBeDefined();
			expect(t.shapes, t.id).toBeDefined();
		}
	});

	it('kawaii is rounder than space', () => {
		const kawaii = variablesFor(themeById('kawaii'), '#ff7ab8');
		const space = variablesFor(themeById('spazio'), '#8b5cf6');
		expect(parseInt(kawaii['--radius'])).toBeGreaterThan(parseInt(space['--radius']));
		expect(kawaii['--font-display']).toContain('Comic Sans');
	});

	it('the decorative background is an embedded SVG, missing in colour-only themes', () => {
		expect(variablesFor(themeById('inverno'), '#3b82f6')['--pattern']).toMatch(/^url\("data:image\/svg\+xml,/);
		expect(variablesFor(themeById('spazio'), '#8b5cf6')['--pattern']).toBe('none');
	});
});

describe('figures', () => {
	it('every letter used in the drawings has a colour in its palette', () => {
		for (const [id, f] of Object.entries(FIGURES)) {
			const letters = new Set(f.grid.join('').replace(/\./g, ''));
			for (const l of letters) expect(f.colors[l], `${id}: letter «${l}» without a colour`).toBeDefined();
		}
	});

	it('parades name only existing figures', () => {
		for (const [world, figures] of Object.entries(PARADES)) {
			for (const f of figures) expect(FIGURES[f], `${world}: ${f}`).toBeDefined();
		}
	});

	it('no figure is taller than the rail', () => {
		// The line is 40px tall and figures are drawn at scale 2.
		for (const [id, f] of Object.entries(FIGURES)) expect(figureSize(f).height * 2, id).toBeLessThanOrEqual(30);
	});

	it('the SVG has the two frames of the step', () => {
		const svg = figureSvg(FIGURES.gattoNero);
		expect(svg).toContain('class="step-a"');
		expect(svg).toContain('class="step-b"');
		expect(svg).toContain('#2b2b35');
	});

	it('the background pattern is almost transparent', () => {
		expect(decodeURIComponent(figurePattern(FIGURES.zucca, 0.07))).toContain('opacity="0.07"');
	});
});

describe('fonts', () => {
	it('every theme uses fonts listed in the editor', () => {
		const values = FONTS.map((c) => c.value as string);
		for (const t of THEMES) {
			const f = { ...BASE_SHAPES, ...t.shapes };
			expect(values, `${t.id}: text`).toContain(f.font);
			expect(values, `${t.id}: titles`).toContain(f.titleFont);
		}
	});

	it('the text size in pixels becomes a scale for all the text', () => {
		const t = THEMES[0];
		expect(variablesFor(t, '#8b5cf6')['--text-scale']).toBe('1');
		const big = { ...t, shapes: { size: 26 } };
		expect(textScale(big)).toBe(24 / 13);
		expect(textScale({ ...t, shapes: { size: 2 } })).toBe(9 / 13);
		expect(textScale({ ...t, shapes: { size: Number.NaN } })).toBe(1);
	});

	it('titles have a scale of their own, which without a value follows the text', () => {
		const t = THEMES[0];
		expect(variablesFor(t, '#8b5cf6')['--title-scale']).toBe('1');
		expect(titleScale({ ...t, shapes: { size: 26 } })).toBe(24 / 13);
		const different = { ...t, shapes: { size: 13, titleSize: 18 } };
		expect(titleScale(different)).toBe(18 / 13);
		expect(textScale(different)).toBe(1);
		expect(titleScale({ ...t, shapes: { titleSize: 40 } })).toBe(24 / 13);
	});
});

describe('shapes', () => {
	const space = THEMES[0];

	it('a theme without new shapes stays as it was: radii, no clipping, roof tabs', () => {
		const v = variablesFor(space, '#8b5cf6');
		expect(v['--radius']).toBe('12px');
		expect(v['--radius-sm']).toBe('8px');
		expect(v['--shape']).toBe('none');
		expect(v['--mask-sm']).toBe('none');
		expect(v['--tab-radius']).toBe('8px 8px 0 0');
		expect(v['--frame']).toBe('1px solid var(--border)');
		expect(v['--focus-offset']).toBe('2px');
	});

	it('with bevelled corners the radius becomes the size of the cut', () => {
		const v = shapeVariables({ ...BASE_SHAPES, corner: 'bevel', radiusSmall: 5 });
		expect(v['--radius-sm']).toBe('0px');
		expect(v['--shape-sm']).toContain('polygon(5px 0');
		expect(v['--focus-offset']).toBe('-2px');
	});

	it('with pills the controls become capsules', () => {
		expect(shapeVariables({ ...BASE_SHAPES, corner: 'pill' })['--radius-sm']).toBe('999px');
	});

	it('an unknown value in a saved theme falls back to the base one', () => {
		const odd = { ...BASE_SHAPES, corner: 'exploded', tab: '"><script>' } as unknown as Shapes;
		const v = shapeVariables(odd);
		expect(v['--shape']).toBe('none');
		expect(v['--tab-shape']).toBe('none');
	});

	it('stars only in the dark; the other skies on light themes too', () => {
		const light = THEMES.find((t) => t.light)!;
		expect(skyVariables('stars', light)['--stars']).toBe('none');
		expect(skyVariables('contours', light)['--stars']).toContain('data:image/svg+xml');
		expect(skyVariables('grid', space)['--sky-size']).toBe('16px 16px');
		expect(skyVariables('none', space)['--stars']).toBe('none');
	});

	it('the new worlds have parade and pattern made of existing figures', () => {
		for (const id of ['cianografia', 'abisso', 'atlante', 'orient']) {
			const t = THEMES.find((x) => x.id === id)!;
			expect(t, id).toBeDefined();
			for (const f of [...(t.parade ?? []), t.pattern!]) expect(FIGURES[f], `${id}: ${f}`).toBeDefined();
		}
	});
});

describe('categories', () => {
	it('every built-in theme falls in a category, and the gallery ones count right', () => {
		const count = (c: string) => THEMES.filter((t) => categoryOf(t) === c).length;
		expect(count('dark')).toBe(9);
		expect(count('light')).toBe(3);
		expect(count('seasons')).toBe(4);
		expect(count('holidays')).toBe(6);
		expect(count('worlds')).toBe(8);
		expect(THEMES.every((t) => CATEGORIES.some((c) => c.id === categoryOf(t)))).toBe(true);
	});

	it('personal themes are among yours', () => {
		expect(categoryOf({ ...THEMES[0], id: 'mine', group: 'personal' })).toBe('yours');
	});
});

describe('folderStyleOf', () => {
	const of = (id: string) => folderStyleOf(themeById(id));

	it('gives each kind of theme its folder', () => {
		expect(of('spazio')).toBe('pixel');
		expect(of('orient')).toBe('wagon');
		expect(of('cianografia')).toBe('outline');
		expect(of('abisso')).toBe('pixel');
		expect(of('notte')).toBe('flat');
		expect(of('natale')).toBe('pixel');
	});

	it('honours the editor choice and keeps Windows icons for the user themes by default', () => {
		const base = themeById('spazio');
		expect(folderStyleOf({ ...base, group: 'personal', shapes: {} })).toBe('windows');
		expect(folderStyleOf({ ...base, shapes: { folder: 'outline' } })).toBe('outline');
		expect(folderStyleOf({ ...base, shapes: { folder: 'nonsense' as never } })).toBe('pixel');
	});
});

describe('saved personal themes', () => {
	// A personal theme exactly as version 0.9 and earlier saved it.
	const saved = {
		id: 'personale-1',
		nome: 'Il mio tema',
		chiaro: false,
		gruppo: 'personale',
		variabili: { '--void': '#000000', '--errore-testo': '#ff0000' },
		forme: { raggio: 6, raggioPiccolo: 3, carattere: 'X', carattereTitoli: 'Y', dimensione: 14, dimensioneTitoli: 18, angolo: 'smusso', scheda: 'arco', cielo: 'bolle', cornice: 'doppia', folder: 'outline' },
		corteo: ['gattoNero', 'mov:{"tipo":"fermo"}|zucca'],
		motivo: 'zucca',
		animazioni: { avvio: 'personalizzata', figura: 'img:C:\\a.png', moto: 'centro', durata: 2, cartella: 'vagoni' }
	};

	it('reads the saved names into the English model', () => {
		const t = themeFromStored(saved)!;
		expect(t).toMatchObject({ id: 'personale-1', name: 'Il mio tema', light: false, group: 'personal', pattern: 'zucca' });
		expect(t.variables).toEqual({ '--void': '#000000', '--error-text': '#ff0000' });
		expect(t.shapes).toEqual({ radius: 6, radiusSmall: 3, font: 'X', titleFont: 'Y', size: 14, titleSize: 18, corner: 'bevel', tab: 'arch', sky: 'bubbles', frame: 'double', folder: 'outline' });
		// Parade entries keep their own saved syntax: motion and spritesheet modules read it.
		expect(t.parade).toEqual(saved.corteo);
		expect(t.animations).toEqual({ intro: 'custom', figure: 'img:C:\\a.png', motion: 'center', duration: 2, folder: 'wagons' });
	});

	it('writes back exactly what was read', () => {
		expect(themeToStored(themeFromStored(saved)!)).toEqual(saved);
	});

	it('ignores what is not a theme', () => {
		expect(themeFromStored(null)).toBeNull();
		expect(themeFromStored({ nome: 'senza id' })).toBeNull();
	});
});

describe('text over the accent', () => {
	it('by itself picks whichever reads better, and the choice wins', () => {
		expect(textOnAccent('#7cf5ff')).toBe('#0c0a13');
		expect(textOnAccent('#1d4ed8')).toBe('#ffffff');
		expect(textOnAccent('#7cf5ff', 'light')).toBe('#ffffff');
		expect(textOnAccent('#7cf5ff', '#ffe8a3')).toBe('#ffe8a3');
	});

	it('travels with a saved personal theme, and nonsense is dropped', () => {
		const base = { id: 'x', nome: 'X', chiaro: false, gruppo: 'personale', variabili: {} };
		expect(themeFromStored({ ...base, accentText: 'dark' })!.accentText).toBe('dark');
		expect(themeFromStored({ ...base, accentText: 'red;}' })!.accentText).toBeUndefined();
	});
});
