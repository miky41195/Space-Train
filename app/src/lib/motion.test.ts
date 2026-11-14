import { describe, it, expect } from 'vitest';
import { withMotion, readMotion, offStageAt, defaultMotion, WALK } from './motion';

describe('motion of parade entries', () => {
	it('the usual entries walk and stay written as they were', () => {
		expect(readMotion('img:C:\\gatto.gif')).toEqual({ motion: WALK, item: 'img:C:\\gatto.gif' });
		expect(withMotion('img:C:\\gatto.gif', WALK)).toBe('img:C:\\gatto.gif');
	});

	it('still and cross make the full round, even in front of a spritesheet', () => {
		const sprite = 'sprite:{"src":"C:\\\\onda.png","larghezza":64}';
		const m = {
			kind: 'cross' as const,
			position: 10,
			delay: 1.5,
			duration: 3,
			loop: true,
			pause: 2,
			direction: 'left' as const,
			mirror: true,
			height: 20
		};
		const written = withMotion(sprite, m);
		expect(written.startsWith('mov:')).toBe(true);
		expect(readMotion(written)).toEqual({ motion: m, item: sprite });
	});

	it('writes the motion with the names earlier versions saved', () => {
		const written = withMotion('img:x', { ...defaultMotion('cross'), direction: 'left' });
		const saved = JSON.parse(written.slice('mov:'.length, written.indexOf('}|') + 1));
		expect(saved).toEqual({ tipo: 'attraversa', posizione: 0, ritardo: 0, durata: 4, continuo: true, pausa: 0, verso: 'sinistra', specchia: false, altezza: 0 });
	});

	it('out-of-range numbers go back within the limits', () => {
		const written = withMotion('img:x', { kind: 'still', position: 180, delay: -3, duration: 0, pause: -1, height: 999 });
		expect(readMotion(written).motion).toMatchObject({
			kind: 'still',
			position: 100,
			delay: 0,
			duration: 0.5,
			pause: 0,
			height: 200
		});
	});

	it('entries saved earlier stay tied to the passes; new ones start looping', () => {
		const old = 'mov:{"tipo":"attraversa","posizione":0,"ritardo":0,"durata":4}|img:x';
		expect(readMotion(old).motion).toMatchObject({ kind: 'cross', loop: false, direction: 'right', mirror: false });
		expect(defaultMotion('cross').loop).toBe(true);
		expect(defaultMotion('still').loop).toBe(true);
	});

	it('a looping entry does not lengthen the passes', () => {
		expect(offStageAt({ ...defaultMotion('still'), loop: true })).toBe(0);
	});

	it('a broken prefix does not lose the entry', () => {
		expect(readMotion('mov:{rotto}|img:x').item).toBe('img:x');
		expect(readMotion('mov:senza-fine').motion.kind).toBe('walk');
	});

	it('how long it stays on stage', () => {
		expect(offStageAt({ ...defaultMotion('still'), loop: false, delay: 2, duration: 8 })).toBe(10);
		expect(offStageAt(WALK)).toBe(0);
		expect(defaultMotion('cross').position).toBe(0);
	});
});
