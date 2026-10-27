import { describe, it, expect } from 'vitest';
import {
	vociMenu,
	vociVista,
	vociOrdina,
	vociAspetto,
	vociNuovo,
	vociAccessoRapido,
	posizionaMenu
} from './menu';
import type { Entry } from './ipc';

function voci(quante: number): Entry[] {
	return Array.from({ length: quante }, (_, i) => ({
		name: `f${i}.txt`,
		path: `C:\\f${i}.txt`,
		kind: 'file' as const,
		size: 1,
		modified: 1,
		hidden: false
	}));
}

const azioni = (c: Parameters<typeof vociMenu>[0]) => vociMenu(c).map((v) => v.azione);

describe('vociMenu', () => {
	it('sul vuoto offre di creare, aggiornare e le proprietà della cartella', () => {
		expect(azioni({ selezione: [], appuntiPieni: false })).toEqual([
			'menuNuovo',
			'nuovaCartella',
			'aggiorna',
			'fissa',
			'condividi',
			'paginaIniziale',
			'cartellaAvvio',
			'terminale',
			'altreOpzioni',
			'proprieta'
		]);
	});

	it('una cartella si fissa per l avvio e si toglie dallo stesso posto', () => {
		const v = (allAvvio: boolean) =>
			vociMenu({ selezione: [], appuntiPieni: false, allAvvio }).find((x) => x.azione === 'cartellaAvvio')?.etichetta;
		expect(v(false)).toBe('Apri sempre all’avvio');
		expect(v(true)).toBe('Non aprire più all’avvio');
	});

	it('la cartella che è già pagina iniziale non la offre di nuovo', () => {
		expect(azioni({ selezione: [], appuntiPieni: false, iniziale: true })).not.toContain('paginaIniziale');
		const cartella = [{ ...voci(1)[0], name: 'Foto', kind: 'dir' as const }];
		expect(azioni({ selezione: cartella, appuntiPieni: false })).toEqual(
			expect.arrayContaining(['paginaIniziale', 'terminale'])
		);
		expect(azioni({ selezione: voci(1), appuntiPieni: false })).not.toContain('terminale');
		expect(azioni({ selezione: [], appuntiPieni: false, posizione: 'pc' })).toContain('iniziale:pc');
	});

	it('sul vuoto con appunti pieni offre anche di incollare', () => {
		expect(azioni({ selezione: [], appuntiPieni: true })).toContain('incolla');
	});

	it('sul vuoto offre di annullare l ultima operazione, dicendo quale', () => {
		const v = vociMenu({ selezione: [], appuntiPieni: false, annullabile: 'rinomina di «a.txt»' });
		expect(v.find((x) => x.azione === 'annulla')?.etichetta).toBe('Annulla rinomina di «a.txt»');
	});

	it('su un file offre apri con, comprimi ed elimina definitivamente', () => {
		const a = azioni({ selezione: voci(1), appuntiPieni: false });
		expect(a).toEqual(
			expect.arrayContaining(['apriCon', 'comprimi', 'eliminaDefinitivo', 'altreOpzioni', 'proprieta'])
		);
		expect(a).not.toContain('apriNuovaScheda');
		expect(a).not.toContain('estrai');
	});

	it('su una cartella offre di aprirla in una nuova scheda', () => {
		const cartella = [{ ...voci(1)[0], name: 'Foto', kind: 'dir' as const }];
		const a = azioni({ selezione: cartella, appuntiPieni: false });
		expect(a).toContain('apriNuovaScheda');
		expect(a).not.toContain('apriCon');
	});

	it('su uno zip offre di estrarlo, su un exe di avviarlo come amministratore', () => {
		const zip = [{ ...voci(1)[0], name: 'a.zip' }];
		const exe = [{ ...voci(1)[0], name: 'setup.exe' }];
		expect(azioni({ selezione: zip, appuntiPieni: false })).toContain('estrai');
		expect(azioni({ selezione: exe, appuntiPieni: false })).toContain('amministratore');
	});

	it('fra i risultati di ricerca offre il percorso e non i preferiti', () => {
		const a = azioni({ selezione: voci(1), appuntiPieni: true, ricerca: true });
		expect(a).toContain('apriPercorso');
		expect(a).not.toContain('preferito');
		expect(a).not.toContain('incolla');
	});

	it('nel Cestino si ripristina o si elimina per sempre', () => {
		expect(azioni({ selezione: voci(2), appuntiPieni: true, posizione: 'cestino' })).toEqual([
			'ripristina',
			'eliminaDefinitivo'
		]);
		expect(azioni({ selezione: [], appuntiPieni: false, posizione: 'cestino' })).toEqual([
			'aggiorna',
			'svuotaCestino'
		]);
	});

	it('in Questo PC un disco si apre o se ne vedono le proprietà', () => {
		const disco = [{ ...voci(1)[0], name: 'C:', kind: 'dir' as const }];
		const a = azioni({ selezione: disco, appuntiPieni: false, posizione: 'pc' });
		expect(a).toContain('apri');
		expect(a).toContain('proprieta');
		expect(a).not.toContain('cestina');
	});

	it('su una voce sola offre apri e rinomina', () => {
		const a = azioni({ selezione: voci(1), appuntiPieni: false });

		expect(a).toContain('apri');
		expect(a).toContain('rinomina');
		expect(a).toContain('mostraInEsplora');
	});

	it('su più voci non offre apri né rinomina', () => {
		const a = azioni({ selezione: voci(3), appuntiPieni: false });

		// Aprire venti file insieme è quasi sempre un incidente.
		expect(a).not.toContain('apri');
		expect(a).not.toContain('rinomina');
		expect(a).not.toContain('mostraInEsplora');
	});

	it('la voce preferiti dice se aggiunge o toglie', () => {
		const etichetta = (giaPreferiti: boolean) =>
			vociMenu({ selezione: voci(1), appuntiPieni: false, giaPreferiti }).find(
				(v) => v.azione === 'preferito'
			)?.etichetta;

		expect(etichetta(false)).toBe('Aggiungi ai preferiti');
		expect(etichetta(true)).toBe('Rimuovi dai preferiti');
	});

	it('sul vuoto non offre i preferiti', () => {
		expect(azioni({ selezione: [], appuntiPieni: false })).not.toContain('preferito');
	});

	it('incolla compare solo con gli appunti pieni', () => {
		expect(azioni({ selezione: voci(1), appuntiPieni: false })).not.toContain('incolla');
		expect(azioni({ selezione: voci(1), appuntiPieni: true })).toContain('incolla');
	});

	it('l etichetta del cestino dice quanti elementi spariscono', () => {
		const uno = vociMenu({ selezione: voci(1), appuntiPieni: false }).find(
			(v) => v.azione === 'cestina'
		);
		const tre = vociMenu({ selezione: voci(3), appuntiPieni: false }).find(
			(v) => v.azione === 'cestina'
		);

		expect(uno?.etichetta).toBe('Sposta nel Cestino');
		expect(tre?.etichetta).toBe('Sposta 3 elementi nel Cestino');
	});

	it('il cestino è marcato come pericoloso', () => {
		const cestina = vociMenu({ selezione: voci(1), appuntiPieni: false }).find(
			(v) => v.azione === 'cestina'
		);
		expect(cestina?.pericolosa).toBe(true);
	});

	it('copia percorso si accorda al numero', () => {
		const uno = vociMenu({ selezione: voci(1), appuntiPieni: false }).find(
			(v) => v.azione === 'copiaPercorso'
		);
		const due = vociMenu({ selezione: voci(2), appuntiPieni: false }).find(
			(v) => v.azione === 'copiaPercorso'
		);

		expect(uno?.etichetta).toBe('Copia percorso');
		expect(due?.etichetta).toBe('Copia percorsi');
	});
});

describe('posizionaMenu', () => {
	const menu = { larghezza: 200, altezza: 300 };
	const finestra = { larghezza: 1000, altezza: 700 };

	it('al centro resta dove è stato chiesto', () => {
		expect(posizionaMenu(400, 200, menu, finestra)).toEqual({ x: 400, y: 200 });
	});

	it('vicino al bordo destro rientra nella finestra', () => {
		const { x } = posizionaMenu(950, 200, menu, finestra);
		expect(x + menu.larghezza).toBeLessThanOrEqual(finestra.larghezza);
	});

	it('vicino al bordo inferiore rientra nella finestra', () => {
		const { y } = posizionaMenu(400, 690, menu, finestra);
		expect(y + menu.altezza).toBeLessThanOrEqual(finestra.altezza);
	});

	it('non finisce mai a coordinate negative', () => {
		const p = posizionaMenu(0, 0, menu, finestra);
		expect(p.x).toBeGreaterThanOrEqual(0);
		expect(p.y).toBeGreaterThanOrEqual(0);
	});

	it('un menu più alto della finestra resta comunque ancorato in alto', () => {
		const gigante = { larghezza: 200, altezza: 900 };
		const p = posizionaMenu(400, 300, gigante, finestra);
		expect(p.y).toBe(8);
	});
});

describe('vociVista', () => {
	it('spunta la taglia, la vista e le opzioni attive', () => {
		const v = vociVista({
			vista: 'icone',
			lato: 128,
			compatta: true,
			colonne: { tipo: true, dimensione: false, data: true },
			estensioni: false,
			nascosti: true,
			anteprima: false
		});
		const spuntate = v.filter((x) => x.spunta).map((x) => x.azione);
		expect(spuntate).toEqual(['lato:128', 'compatta', 'colonnaTipo', 'colonnaData', 'nascosti', 'iniziale:c']);
	});

	it('spunta la pagina iniziale, anche una cartella scelta col menu', () => {
		const base = {
			vista: 'dettagli' as const,
			lato: 96,
			compatta: false,
			colonne: { tipo: false, dimensione: true, data: true },
			estensioni: true,
			nascosti: false,
			anteprima: false
		};
		const spuntata = (iniziale: string) =>
			vociVista({ ...base, iniziale }).filter((x) => x.azione.startsWith('iniziale:') && x.spunta);
		expect(spuntata('::pc').map((x) => x.azione)).toEqual(['iniziale:pc']);
		expect(spuntata('::ultima').map((x) => x.azione)).toEqual(['iniziale:ultima']);
		expect(spuntata('D:\\Progetti\\').map((x) => x.etichetta)).toEqual(['Progetti']);
	});

	it('elenca le otto viste di Esplora', () => {
		const v = vociVista({
			vista: 'dettagli',
			lato: 96,
			compatta: false,
			colonne: { tipo: false, dimensione: true, data: true },
			estensioni: true,
			nascosti: false,
			anteprima: false
		});
		expect(v.slice(0, 8).map((x) => x.etichetta)).toEqual([
			'Icone molto grandi',
			'Icone grandi',
			'Icone medie',
			'Icone piccole',
			'Elenco',
			'Dettagli',
			'Riquadri',
			'Contenuto'
		]);
	});
});

describe('vociOrdina', () => {
	it('spunta colonna, verso e raggruppamento', () => {
		const v = vociOrdina({ key: 'modified', ascending: false }, 'tipo');
		expect(v.filter((x) => x.spunta).map((x) => x.azione)).toEqual([
			'ordina:modified',
			'decrescente',
			'gruppi:tipo'
		]);
		expect(v.find((x) => x.sezione)?.sezione).toBe('Raggruppa per');
	});
});

describe('vociAspetto', () => {
	it('offre i temi e una tavolozza di accenti con quello attivo', () => {
		const v = vociAspetto({ tema: 'chiaro', accento: 'verde' });
		expect(v.find((x) => x.spunta)?.azione).toBe('tema:chiaro');
		const tavolozza = v.find((x) => x.tavolozza)?.tavolozza ?? [];
		expect(tavolozza.find((c) => c.attivo)?.azione).toBe('accento:verde');
	});

	it('divide colori, mondi e temi propri in sezioni', () => {
		const mio = { id: 'personale-1', nome: 'Il mio', chiaro: false, gruppo: 'personale' as const, variabili: {} };
		const sezioni = vociAspetto({ tema: 'spazio', accento: 'tema', personali: [mio] })
			.map((x) => x.sezione)
			.filter(Boolean);
		expect(sezioni).toEqual(['Colori', 'Mondi: forme e personaggi', 'I tuoi temi', 'Passaggi del treno e dei personaggi']);
	});

	it('la pausa fra i passaggi: una sola scelta spuntata, 30 secondi se non detto', () => {
		const spuntate = (pausaTreno?: number) =>
			vociAspetto({ tema: 'spazio', accento: 'tema', pausaTreno })
				.filter((x) => x.azione.startsWith('pausa:') && x.spunta)
				.map((x) => x.etichetta);
		expect(spuntate()).toEqual(['Ogni 30 secondi']);
		expect(spuntate(300)).toEqual(['Ogni 5 minuti']);
		expect(spuntate(-1)).toEqual(['Solo durante i trasferimenti']);
	});

	it('il campione personalizzato mostra il colore scelto e porta all editor', () => {
		const v = vociAspetto({ tema: 'spazio', accento: 'personalizzato', coloreAccento: '#123456' });
		const p = v.find((x) => x.tavolozza)?.tavolozza?.find((c) => c.personalizzato);
		expect(p).toMatchObject({ colore: '#123456', attivo: true });
		expect(v.map((x) => x.azione)).toContain('editorTemi');
	});
});

describe('colore cartella', () => {
	it('la tavolozza compare solo se fra le voci c è una cartella', () => {
		const file = voci(1);
		const cartella = [{ ...voci(1)[0], kind: 'dir' as const }];
		expect(azioni({ selezione: file, appuntiPieni: false })).not.toContain('coloreCartella');
		const v = vociMenu({ selezione: cartella, appuntiPieni: false, coloreAttuale: 'verde' });
		const tavolozza = v.find((x) => x.azione === 'coloreCartella')?.tavolozza ?? [];
		expect(tavolozza.find((c) => c.attivo)?.azione).toBe('colore:verde');
		expect(tavolozza[0].azione).toBe('coloreNessuno');
	});
});

describe('vociNuovo', () => {
	it('prima la cartella, poi i tipi di file di Windows', () => {
		const v = vociNuovo([
			{ ext: '.txt', nome: 'Documento di testo' },
			{ ext: '.docx', nome: 'Documento di Microsoft Word' }
		]);
		expect(v.map((x) => x.azione)).toEqual(['nuovaCartella', 'nuovo:.txt', 'nuovo:.docx']);
		expect(v[1].stacca).toBe(true);
	});
});

describe('rete locale nel menu', () => {
	const pari = [
		{ id: 'PC2-ab12', nome: 'PC2' },
		{ id: 'PC3-cd34', nome: 'PC3' }
	];

	it('offre un invio per ogni PC trovato', () => {
		const a = azioni({ selezione: voci(1), appuntiPieni: false, pari });
		expect(a).toContain('invia:PC2-ab12');
		expect(a).toContain('invia:PC3-cd34');
	});

	it('una cartella si condivide o si smette di condividere', () => {
		const cartella = [{ ...voci(1)[0], path: 'C:\\Foto', kind: 'dir' as const }];
		expect(azioni({ selezione: cartella, appuntiPieni: false })).toContain('condividi');
		expect(azioni({ selezione: cartella, appuntiPieni: false, condivisa: 'c:\\foto' })).toContain(
			'nonCondividere'
		);
	});

	it('nella cartella di un altro PC si legge e si copia soltanto', () => {
		expect(azioni({ selezione: voci(1), appuntiPieni: true, posizione: 'lan' })).toEqual([
			'apri',
			'copia',
			'scarica'
		]);
	});
});

describe('accesso rapido nel menu', () => {
	it('una cartella si fissa o si rimuove, un file no', () => {
		const cartella = [{ ...voci(1)[0], kind: 'dir' as const }];
		expect(azioni({ selezione: cartella, appuntiPieni: false })).toContain('fissa');
		expect(azioni({ selezione: cartella, appuntiPieni: false, fissata: true })).toContain('sgancia');
		expect(azioni({ selezione: voci(1), appuntiPieni: false })).not.toContain('fissa');
	});

	it('il menu della barra laterale non offre di spostare oltre i bordi', () => {
		const az = (v: ReturnType<typeof vociAccessoRapido>) => v.map((x) => x.azione);
		expect(az(vociAccessoRapido(true, false))).not.toContain('suAccesso');
		expect(az(vociAccessoRapido(false, true))).not.toContain('giuAccesso');
		expect(az(vociAccessoRapido(true, true))).toEqual(['apriNuovaScheda', 'apriNuovaFinestra', 'sgancia']);
	});
});
