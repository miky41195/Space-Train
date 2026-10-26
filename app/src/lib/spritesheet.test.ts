import { describe, it, expect } from 'vitest';
import {
	codifica,
	decodifica,
	indovina,
	disegno,
	stile,
	latoFotogramma,
	zona,
	sequenza,
	leggiOrdine,
	scriviOrdine,
	alternaConPrimo,
	avantiIndietro,
	normalizza,
	misuraBinario,
	griglia,
	cella,
	passoFotogramma,
	riquadriDellaGriglia
} from './spritesheet';

describe('spritesheet', () => {
	it('una striscia di fotogrammi quadrati si riconosce da sola', () => {
		const s = indovina('C:\\gatto.png', 256, 32);
		expect(s.fotogrammi).toBe(8);
		expect([s.x, s.y, s.w, s.h]).toEqual([0, 0, 256, 32]);
	});

	it('un immagine non a striscia parte da un fotogramma solo', () => {
		expect(indovina('C:\\a.png', 100, 70).fotogrammi).toBe(1);
		expect(indovina('C:\\a.png', 64, 64).fotogrammi).toBe(1);
	});

	it('va e torna dal corteo senza perdere niente', () => {
		const s = { ...indovina('C:\\x.png', 128, 128), x: 10, y: 20, w: 90, h: 37, fotogrammi: 3, fps: 12 };
		expect(decodifica(codifica(s))).toEqual(s);
	});

	it('la zona resta dentro l immagine, a pixel interi', () => {
		const s = indovina('C:\\x.png', 100, 50);
		expect(zona(s, -20, -5, 500, 500)).toMatchObject({ x: 0, y: 0, w: 100, h: 50 });
		expect(zona(s, 90.4, 40.6, 30, 30)).toMatchObject({ x: 90, y: 41, w: 10, h: 9 });
		expect(zona(s, 10, 10, 0, -3)).toMatchObject({ w: 1, h: 1 });
		// Non più fotogrammi dei pixel della zona.
		expect(decodifica(codifica({ ...zona(s, 0, 0, 4, 4), fotogrammi: 99 }))!.fotogrammi).toBe(4);
	});

	it('valori sballati vengono riportati entro i limiti', () => {
		const s = decodifica('sprite:' + JSON.stringify({ src: 'a', larghezza: 64, altezza: 64, fotogrammi: 0, fps: 999 }))!;
		expect(s.fotogrammi).toBe(1);
		expect(s.fps).toBe(30);
		expect([s.w, s.h]).toEqual([64, 64]);
		expect(decodifica('sprite:{rotto')).toBeNull();
		expect(decodifica('img:C:\\a.png')).toBeNull();
	});

	it('i temi salvati a griglia diventano la zona equivalente', () => {
		const vecchio = { src: 'a', larghezza: 512, altezza: 256, colonne: 8, righe: 4, riga: 2, inizio: 3, fotogrammi: 3, fps: 8, nitido: true };
		expect(decodifica('sprite:' + JSON.stringify(vecchio))).toMatchObject({ x: 192, y: 128, w: 192, h: 64, fotogrammi: 3 });
		const senzaInizio = { src: 'a', larghezza: 256, altezza: 32, colonne: 8, righe: 1, riga: 0, fotogrammi: 8 };
		expect(decodifica('sprite:' + JSON.stringify(senzaInizio))).toMatchObject({ x: 0, y: 0, w: 256, h: 32, fotogrammi: 8 });
	});

	it('una zona libera: parte dal suo angolo e scorre i suoi fotogrammi', () => {
		// Zona 90×60 da (30, 40) con 3 fotogrammi da 30×60, disegnata alta 30.
		const s = { ...indovina('C:\\x.png', 300, 200), x: 30, y: 40, w: 90, h: 60, fotogrammi: 3, fps: 6 };
		expect(latoFotogramma(s)).toEqual({ larghezza: 30, altezza: 60 });
		const d = disegno(s, 30);
		expect(d.larghezza).toBe(15);
		expect(d.foglioL).toBe(150);
		expect(d.foglioA).toBe(100);
		expect(d.x).toBe(-15);
		expect(d.y).toBe(-20);
		expect(d.corsa).toBe(45);
		expect(d.durata).toBe(0.5);
		const st = stile(s, 'a', 30);
		expect(st).toContain('background-position:-15px -20px');
		expect(st).toContain('--fine:-60px');
		expect(st).toContain('animation-name:sprite-0-1-2');
		expect(st).toContain('--passo:15px');
	});

	it('lo stile anima a scatti e tiene i pixel nitidi', () => {
		const st = stile({ ...indovina('C:\\x.png', 64, 16), nitido: true }, 'asset://x.png');
		expect(st).toContain('animation-name:sprite-0-1-2-3');
		expect(st).toContain('animation-timing-function:step-end');
		expect(st).toContain('image-rendering:pixelated');
		expect(st).toContain('background-image:url("asset://x.png")');
	});

	it('un percorso Windows dentro url() resta intero', () => {
		// Il percorso è C:\Dati\"strano".png: backslash e virgolette vanno protetti.
		const st = stile(indovina('C:\\x.png', 64, 16), 'C:\\Dati\\"strano".png');
		expect(st).toContain(String.raw`url("C:\\Dati\\\"strano\".png")`);
	});

	it('l ordine dei fotogrammi: fermo tra un passo e l altro', () => {
		const s = { ...indovina('C:\\x.png', 96, 32), ordine: alternaConPrimo(3) };
		expect(s.ordine).toEqual([1, 0, 2, 0]);
		expect(scriviOrdine(s)).toBe('2, 1, 3, 1');
		// Un giro dura quanto la sequenza, non quanto i fotogrammi.
		expect(disegno({ ...s, fps: 8 }).durata).toBe(0.5);
		expect(stile(s, 'a')).toContain('animation-name:sprite-1-0-2-0');
		expect(decodifica(codifica(s))!.ordine).toEqual([1, 0, 2, 0]);
	});

	it('l ordine scritto a mano conta da 1 e ignora quello che non esiste', () => {
		expect(leggiOrdine('2, 1, 3, 1', 3)).toEqual([1, 0, 2, 0]);
		expect(leggiOrdine('2 1 9 0 x 3', 3)).toEqual([1, 0, 2]);
		expect(leggiOrdine('', 3)).toEqual([]);
		expect(avantiIndietro(4)).toEqual([0, 1, 2, 3, 2, 1]);
		// Meno fotogrammi: l'ordine perde quelli spariti; vuoto torna di fila.
		const s = normalizza({ ...indovina('C:\\x.png', 96, 32), ordine: [1, 0, 2, 0], fotogrammi: 2 });
		expect(s.ordine).toEqual([1, 0, 0]);
		const vuoto = normalizza({ ...indovina('C:\\x.png', 96, 32), ordine: [7] });
		expect(vuoto.ordine).toBeUndefined();
		expect(sequenza(vuoto)).toEqual([0, 1, 2]);
	});

	it('sul binario: alto 30 di base, oppure quanto si vuole, con la larghezza proporzionale', () => {
		// Fotogrammi 32×32: quadrati.
		const s = indovina('C:\\x.png', 96, 32);
		expect(misuraBinario(s)).toEqual({ larghezza: 30, altezza: 30 });
		const alto = { ...s, alto: 90 };
		expect(misuraBinario(alto)).toEqual({ larghezza: 90, altezza: 90 });
		const d = disegno(alto);
		expect([d.larghezza, d.altezza, d.foglioL, d.foglioA, d.corsa]).toEqual([90, 90, 270, 90, 270]);
	});

	it('larghezza libera: lo sprite si stira, e l anteprima tiene le proporzioni', () => {
		const s = { ...indovina('C:\\x.png', 96, 32), x: 0, y: 0, alto: 90, largo: 45 };
		const d = disegno(s);
		expect([d.larghezza, d.altezza]).toEqual([45, 90]);
		// In larghezza ogni pixel del foglio diventa 45/32, in altezza 90/32.
		expect(d.foglioL).toBeCloseTo(135);
		expect(d.foglioA).toBeCloseTo(90);
		expect(stile(s, 'a')).toContain('--passo:45px');
		// Anteprima alta 48: stesso rapporto, metà larghezza dell'altezza.
		const p = disegno(s, 48);
		expect([p.larghezza, p.altezza]).toEqual([24, 48]);
	});

	it('le misure sul binario restano nei limiti e si salvano', () => {
		const s = normalizza({ ...indovina('C:\\x.png', 96, 32), alto: 9999, largo: 1.4 });
		expect(s.alto).toBe(240);
		expect(s.largo).toBe(4);
		expect(decodifica(codifica({ ...indovina('a', 96, 32), alto: 64 }))).toMatchObject({ alto: 64 });
		expect('largo' in normalizza({ ...indovina('a', 96, 32), largo: undefined })).toBe(false);
	});

	it('16 fotogrammi in una griglia 4×4: da sinistra a destra, poi riga per riga', () => {
		// Foglio 128×128, fotogrammi da 32×32.
		const s = normalizza({ ...indovina('C:\\x.png', 128, 128), righe: 4, colonne: 4, fotogrammi: 16 });
		expect(griglia(s)).toEqual({ colonne: 4, righe: 4 });
		expect(latoFotogramma(s)).toEqual({ larghezza: 32, altezza: 32 });
		expect(cella(s, 0)).toEqual({ colonna: 0, riga: 0 });
		expect(cella(s, 5)).toEqual({ colonna: 1, riga: 1 });
		expect(cella(s, 15)).toEqual({ colonna: 3, riga: 3 });
		expect(sequenza(s)).toHaveLength(16);
		// Sul binario: un fotogramma quadrato alto 30, non una striscia di 16.
		expect(misuraBinario(s)).toEqual({ larghezza: 30, altezza: 30 });
		const d = disegno(s);
		expect([d.foglioL, d.foglioA]).toEqual([120, 120]);
		const st = stile(s, 'a');
		expect(st).toContain('--passo:30px');
		expect(st).toContain('--passo-y:30px');
		expect(st).toContain('animation-name:sprite-g4-0-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15');
		expect(decodifica(codifica(s))).toEqual(s);
	});

	it('griglia con l ultima riga incompleta, e limiti', () => {
		const s = normalizza({ ...indovina('C:\\x.png', 128, 128), righe: 4, colonne: 4, fotogrammi: 99 });
		expect(s.fotogrammi).toBe(16);
		const quindici = normalizza({ ...s, fotogrammi: 15 });
		expect(griglia(quindici)).toEqual({ colonne: 4, righe: 4 });
		// Una riga sola: colonne e righe non si salvano, valgono i fotogrammi.
		const fila = normalizza({ ...s, righe: 1 });
		expect('righe' in fila || 'colonne' in fila).toBe(false);
		expect(griglia({ ...indovina('a', 96, 32) })).toEqual({ colonne: 3, righe: 1 });
		// Righe senza colonne: le colonne bastano a contenere i fotogrammi.
		expect(griglia(normalizza({ ...indovina('a', 128, 128), righe: 3, fotogrammi: 8 }))).toEqual({ colonne: 3, righe: 3 });
	});

	it('spazio fra i fotogrammi: il fotogramma non lo comprende, il passo sì', () => {
		// 4 fotogrammi da 32 con 3 px fra l'uno e l'altro: 4·32 + 3·3 = 137.
		const s = normalizza({ ...indovina('C:\\x.png', 137, 32), fotogrammi: 4, spazioX: 3 });
		expect(latoFotogramma(s)).toEqual({ larghezza: 32, altezza: 32 });
		expect(passoFotogramma(s)).toEqual({ x: 35, y: 32 });
		const st = stile(s, 'a');
		// Alto 30: scala 30/32, il passo diventa 35 · 0,9375.
		expect(st).toContain('width:30px');
		expect(st).toContain('--passo:32.8125px');
		expect(riquadriDellaGriglia(s).map((r) => r.x)).toEqual([0, 35, 70, 105]);
		// Si salva, e uno spazio a zero non si scrive.
		expect(decodifica(codifica(s))!.spazioX).toBe(3);
		expect('spazioX' in normalizza({ ...s, spazioX: 0 })).toBe(false);
	});

	it('fotogrammi a mano di misure diverse: il più grande dà la misura sul binario', () => {
		// Fermo 32×32, poi il colpo con l'onda lungo il doppio.
		const s = normalizza({
			...indovina('C:\\x.png', 96, 32),
			riquadri: [
				{ x: 0, y: 0, w: 32, h: 32 },
				{ x: 32, y: 0, w: 64, h: 32 }
			]
		});
		expect(s.fotogrammi).toBe(2);
		expect(latoFotogramma(s)).toEqual({ larghezza: 64, altezza: 32 });
		expect(misuraBinario(s)).toEqual({ larghezza: 60, altezza: 30 });
		const st = stile(s, 'a');
		// Parte dal primo, largo 30; la scala va all'animazione.
		expect(st).toContain('width:30px');
		expect(st).toContain('--sx:0.9375');
		expect(st).toMatch(/animation-name:sprite-r\w+/);
		expect(decodifica(codifica(s))!.riquadri).toEqual(s.riquadri);
		// I riquadri restano dentro il foglio; l'ordine solo fra quelli che ci sono.
		const fuori = normalizza({ ...s, riquadri: [{ x: 90, y: -4, w: 50, h: 99 }], ordine: [0, 1, 0] });
		expect(fuori.riquadri).toEqual([{ x: 90, y: 0, w: 6, h: 32 }]);
		expect(fuori.ordine).toEqual([0, 0]);
	});
});
