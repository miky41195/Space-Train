<script lang="ts">
	import type { Backend } from '../ipc';
	import {
		TEMI,
		CARATTERI,
		FORME_BASE,
		DIMENSIONE_MIN,
		DIMENSIONE_MAX,
		variabiliDa,
		temaDa,
		type Tema,
		type TemaPersonale
	} from '../temi';
	import { FIGURE, svgFigura } from '../figure';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import {
		codifica,
		decodifica,
		indovina,
		alternaConPrimo,
		avantiIndietro,
		latoFotogramma,
		leggiOrdine,
		misuraBinario,
		griglia,
		riquadriDellaGriglia,
		ALTO_MIN,
		ALTO_MAX,
		LARGO_MIN,
		LARGO_MAX,
		normalizza,
		scriviOrdine,
		stile,
		zona,
		disegno,
		type Spritesheet
	} from '../spritesheet';
	import SelettoreFotogrammi from './SelettoreFotogrammi.svelte';
	import { spostabile } from '../spostabile';
	import {
		CAMMINA,
		conMovimento,
		leggiMovimento,
		movimentoPredefinito,
		normalizzaMovimento,
		type Movimento,
		type TipoMovimento
	} from '../movimento';
	import { coloreSfondo, colorePixel, daEsadecimale, esadecimale, togliSfondo } from '../trasparenza';
	import { leggiPixel, scriviPng } from '../pixel';

	let {
		finestra = false,
		temaAttuale,
		personali,
		backend,
		onanteprima,
		onsalva,
		onelimina,
		onchiudi
	}: {
		/**
		 * In una finestra sua: la occupa tutta e si sposta come una finestra
		 * di Windows, anche fuori dall'app. Senza, è un riquadro sopra l'app.
		 */
		finestra?: boolean;
		/** Il tema in uso: se è uno dei tuoi si modifica, altrimenti si parte da lui. */
		temaAttuale: Tema;
		personali: readonly TemaPersonale[];
		backend: Backend;
		/** Il tema com'è adesso, per mostrarlo dal vivo sull'app. */
		onanteprima: (t: TemaPersonale) => void;
		onsalva: (t: TemaPersonale) => void;
		onelimina: (id: string) => void;
		onchiudi: () => void;
	} = $props();

	/**
	 * I colori che l'editor fa scegliere, con il loro nome per l'utente.
	 * «Sfondo» è `--hull`: è il colore di elenco, barra laterale e testata,
	 * cioè quello che si vede. `--void` sta solo dietro e nei campi.
	 */
	const COLORI = [
		['hull', '--hull', 'Sfondo'],
		['void', '--void', 'Campi di testo e bordi'],
		['text', '--text', 'Testo'],
		['dim', '--text-dim', 'Testo secondario'],
		['plasma', '--plasma', 'Evidenziazione'],
		['current', '--current', 'Luci e binario acceso'],
		['signal', '--signal', 'Preferiti e segnali'],
		['rail', '--rail-metal', 'Binario spento']
	] as const;

	type Chiave = (typeof COLORI)[number][0];

	// Lo stato iniziale si legge una volta all'apertura: l'editor non deve
	// ricominciare da capo se il tema in uso cambia mentre si modifica.
	// svelte-ignore state_referenced_locally
	const modifica = temaAttuale.gruppo === 'personale' ? temaAttuale : null;

	let id = $state(modifica?.id ?? `personale-${Date.now()}`);
	let nome = $state(modifica?.nome ?? `Il mio tema`);
	let chiaro = $state(false);
	let tavolozza = $state<Record<Chiave, string>>({} as Record<Chiave, string>);
	let raggio = $state(FORME_BASE.raggio);
	let raggioPiccolo = $state(FORME_BASE.raggioPiccolo);
	let carattere = $state(FORME_BASE.carattere);
	let carattereTitoli = $state(FORME_BASE.carattereTitoli);
	let dimensione = $state(FORME_BASE.dimensione);
	let corteoTipo = $state<'treno' | 'figure' | 'immagini'>('treno');
	let figure = $state<string[]>([]);
	let immagini = $state<string[]>([]);
	/** Come si muove ogni immagine sul binario, nello stesso ordine di `immagini`. */
	let movimenti = $state<Movimento[]>([]);
	let motivo = $state('');
	let caricando = $state(false);
	let errore = $state<string | null>(null);

	/** Come togliere lo sfondo di ogni immagine; senza colore si legge dagli angoli. */
	type OpzioniSfondo = { tolleranza: number; soloBordi: boolean; colore?: string };
	let opzioniSfondo = $state<Record<number, OpzioniSfondo>>({});
	/** Immagine senza sfondo → l'originale da cui è stata ricavata. */
	let originali = $state<Record<string, string>>({});
	/** L'immagine su cui si sta lavorando, e quella col contagocce attivo. */
	let elaborando = $state<number | null>(null);
	let contagocce = $state<number | null>(null);
	let esitoSfondo = $state<string | null>(null);

	/** Copia nell'editor tutto ciò che definisce `t`: colori, forme, corteo. */
	function parti(t: Tema) {
		chiaro = t.chiaro;
		tavolozza = Object.fromEntries(
			COLORI.map(([k, v]) => [k, solo6(t.variabili[v] ?? '#888888')])
		) as Record<Chiave, string>;
		raggio = t.forme?.raggio ?? FORME_BASE.raggio;
		raggioPiccolo = t.forme?.raggioPiccolo ?? FORME_BASE.raggioPiccolo;
		carattere = t.forme?.carattere ?? FORME_BASE.carattere;
		carattereTitoli = t.forme?.carattereTitoli ?? FORME_BASE.carattereTitoli;
		dimensione = t.forme?.dimensione ?? FORME_BASE.dimensione;
		const voci = t.corteo ?? [];
		const lette = voci.map((v) => leggiMovimento(v));
		const mie = lette.filter((l) => mia(l.voce));
		immagini = mie.map((l) => l.voce);
		movimenti = mie.map((l) => l.movimento);
		figure = voci.filter((v) => !mia(leggiMovimento(v).voce));
		corteoTipo = immagini.length > 0 ? 'immagini' : figure.length > 0 ? 'figure' : 'treno';
		motivo = t.motivo ?? '';
	}

	/** Cambia il movimento di un'immagine; scegliendo un tipo si riparte dai suoi valori. */
	function impostaMovimento(i: number, parziale: Partial<Movimento>) {
		const attuale = movimenti[i] ?? CAMMINA;
		const nuovo =
			parziale.tipo && parziale.tipo !== attuale.tipo
				? movimentoPredefinito(parziale.tipo)
				: normalizzaMovimento({ ...attuale, ...parziale });
		movimenti = movimenti.map((m, j) => (j === i ? nuovo : m));
	}

	/** Il giro completo di chi attraversa in continuo: viaggio più pausa. */
	function giroDi(m: Movimento): string {
		const s = m.durata + m.pausa;
		return `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
	}

	const TIPI_MOVIMENTO: Array<[TipoMovimento, string]> = [
		['cammina', 'Cammina con gli altri'],
		['fermo', 'Resta fermo in un punto'],
		['attraversa', 'Attraversa da solo fino in fondo']
	];

	/** Il selettore di colore vuole sempre `#rrggbb`. */
	function solo6(c: string): string {
		return /^#[0-9a-f]{6}$/i.test(c) ? c : '#888888';
	}

	// svelte-ignore state_referenced_locally
	parti(temaAttuale);

	let tema = $derived<TemaPersonale>({
		id,
		nome: nome.trim() || 'Il mio tema',
		chiaro,
		gruppo: 'personale',
		variabili: variabiliDa(tavolozza, chiaro),
		forme: { raggio, raggioPiccolo, carattere, carattereTitoli, dimensione },
		corteo:
			corteoTipo === 'treno'
				? undefined
				: corteoTipo === 'figure'
					? figure
					: immagini.map((v, i) => conMovimento(v, movimenti[i] ?? CAMMINA)),
		motivo: motivo || undefined
	});

	// Anteprima dal vivo: l'app cambia mentre si sceglie.
	$effect(() => {
		onanteprima(tema);
	});

	/** Una voce del corteo che viene da un file dell'utente. */
	function mia(v: string): boolean {
		return v.startsWith('img:') || v.startsWith('sprite:');
	}

	function percorsoDi(v: string): string {
		return decodifica(v)?.src ?? v.slice(4);
	}

	/**
	 * Dimensioni vere dell'immagine, per capire se è uno spritesheet e
	 * quanto è grande un fotogramma. Se non si riesce a leggerle (formato
	 * strano) l'immagine resta un'immagine semplice.
	 */
	async function misura(path: string): Promise<{ w: number; h: number } | null> {
		try {
			const img = new Image();
			img.src = convertFileSrc(path);
			await Promise.race([img.decode(), new Promise((_, ko) => setTimeout(ko, 3000))]);
			return img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null;
		} catch {
			return null;
		}
	}

	/** Da immagine semplice a spritesheet e viceversa. */
	async function alternaSprite(i: number) {
		const v = immagini[i];
		const foglio = decodifica(v);
		if (foglio) {
			immagini[i] = `img:${foglio.src}`;
			return;
		}
		const path = v.slice(4);
		const d = await misura(path);
		if (!d) {
			errore = 'Non riesco a leggere le dimensioni di questa immagine.';
			return;
		}
		immagini[i] = codifica(indovina(path, d.w, d.h));
	}

	function aggiornaSprite<K extends keyof Spritesheet>(i: number, campo: K, valore: Spritesheet[K]) {
		const foglio = decodifica(immagini[i]);
		if (!foglio) return;
		// Zona e fotogrammi si ricontrollano contro l'immagine.
		immagini[i] = codifica(normalizza({ ...foglio, [campo]: valore }));
	}

	/** L'ordine scritto a mano: il campo mostra poi quello che si userà davvero. */
	function campoOrdine(i: number, input: HTMLInputElement) {
		const foglio = decodifica(immagini[i]);
		if (!foglio) return;
		aggiornaSprite(i, 'ordine', leggiOrdine(input.value, foglio.fotogrammi));
		input.value = scriviOrdine(decodifica(immagini[i])!);
	}

	/**
	 * Colonne, righe e fotogrammi della griglia nella zona. Cambiando la
	 * griglia si usano tutte le celle; i fotogrammi si possono poi togliere
	 * dalla fine, per un'ultima riga incompleta.
	 */
	function campoGriglia(i: number, campo: 'colonne' | 'righe' | 'fotogrammi', valore: number) {
		const foglio = decodifica(immagini[i]);
		if (!foglio || !(valore >= 1)) return;
		const g = { ...griglia(foglio), [campo === 'fotogrammi' ? '_' : campo]: Math.round(valore) };
		const fotogrammi = campo === 'fotogrammi' ? Math.round(valore) : g.colonne * g.righe;
		// Con una riga sola le colonne sono i fotogrammi stessi.
		const nuovo =
			g.righe > 1
				? { ...foglio, righe: g.righe, colonne: g.colonne, fotogrammi }
				: { ...foglio, righe: undefined, colonne: undefined, fotogrammi };
		immagini[i] = codifica(normalizza(nuovo));
	}

	function aggiornaZona(i: number, x: number, y: number, w: number, h: number) {
		const foglio = decodifica(immagini[i]);
		if (foglio) immagini[i] = codifica(zona(foglio, x, y, w, h));
	}

	/**
	 * Un campo della zona scritto a mano. Se il valore esce dall'immagine si
	 * riporta nei limiti, e il campo mostra quello vero, non quello scritto.
	 */
	function sfondoDi(i: number): OpzioniSfondo {
		return opzioniSfondo[i] ?? { tolleranza: 24, soloBordi: false };
	}

	function impostaSfondo(i: number, cambi: Partial<OpzioniSfondo>) {
		opzioniSfondo = { ...opzioniSfondo, [i]: { ...sfondoDi(i), ...cambi } };
	}

	/** La stessa voce del corteo, con un'altra immagine. */
	function conImmagine(voce: string, path: string): string {
		const foglio = decodifica(voce);
		return foglio ? codifica({ ...foglio, src: path }) : `img:${path}`;
	}

	/**
	 * Toglie lo sfondo partendo sempre dall'originale: rifarlo con un'altra
	 * tolleranza non accumula i tagli. Il risultato è un PNG nuovo nella
	 * cartella dei temi; l'originale resta lì, per poterlo ripristinare.
	 */
	async function togliSfondoDi(i: number) {
		const path = percorsoDi(immagini[i]);
		const sorgente = originali[path] ?? path;
		const o = sfondoDi(i);
		elaborando = i;
		errore = null;
		esitoSfondo = null;
		try {
			const img = await leggiPixel(await backend.readThemeImage(sorgente));
			const colore = o.colore ? daEsadecimale(o.colore) : coloreSfondo(img);
			if (!colore) {
				errore = 'Lo sfondo di questa immagine è già trasparente.';
				return;
			}
			const tolti = togliSfondo(img, { colore, tolleranza: o.tolleranza, soloBordi: o.soloBordi });
			const base = (sorgente.split('\\').pop() ?? 'immagine').replace(/\.[^.]+$/, '');
			const nuovo = await backend.saveThemeImage(`${base}-trasparente.png`, await scriviPng(img));
			originali = { ...originali, [nuovo]: sorgente };
			immagini[i] = conImmagine(immagini[i], nuovo);
			esitoSfondo = tolti > 0 ? `Sfondo tolto: ${tolti} pixel ora trasparenti.` : 'Nessun pixel di quel colore.';
		} catch (e) {
			errore = `Non riesco a togliere lo sfondo: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			elaborando = null;
		}
	}

	function ripristinaOriginale(i: number) {
		const originale = originali[percorsoDi(immagini[i])];
		if (originale) immagini[i] = conImmagine(immagini[i], originale);
		esitoSfondo = null;
	}

	/** Contagocce: il colore dello sfondo è quello del pixel cliccato sul foglio. */
	async function prendiColore(i: number, x: number, y: number) {
		contagocce = null;
		const path = percorsoDi(immagini[i]);
		try {
			const img = await leggiPixel(await backend.readThemeImage(originali[path] ?? path));
			impostaSfondo(i, { colore: esadecimale(colorePixel(img, x, y)) });
		} catch (e) {
			errore = `Non riesco a leggere il colore: ${e instanceof Error ? e.message : String(e)}`;
		}
	}

	function campoZona(i: number, campo: 'x' | 'y' | 'w' | 'h', input: HTMLInputElement) {
		aggiornaSprite(i, campo, Number(input.value));
		const foglio = decodifica(immagini[i]);
		if (foglio) input.value = String(foglio[campo]);
	}

	function alternaFigura(f: string) {
		figure = figure.includes(f) ? figure.filter((x) => x !== f) : [...figure, f].slice(0, 6);
	}

	/** Le immagini scelte si copiano nella cartella dati dell'app. */
	async function aggiungiImmagini(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = [...(input.files ?? [])];
		if (file.length === 0) return;
		caricando = true;
		errore = null;
		try {
			for (const f of file) {
				const base64 = await leggiBase64(f);
				const path = await backend.saveThemeImage(f.name, base64);
				// Una striscia di fotogrammi quadrati diventa subito uno
				// spritesheet; tutto il resto parte come immagine semplice.
				const d = await misura(path);
				const proposta = d ? indovina(path, d.w, d.h) : null;
				const voce = proposta && proposta.fotogrammi > 1 ? codifica(proposta) : `img:${path}`;
				immagini = [...immagini, voce].slice(0, 8);
				movimenti = [...movimenti, CAMMINA].slice(0, 8);
			}
			corteoTipo = 'immagini';
		} catch {
			errore = 'Non è stato possibile salvare l’immagine.';
		} finally {
			caricando = false;
			input.value = '';
		}
	}

	function leggiBase64(f: File): Promise<string> {
		return new Promise((ok, ko) => {
			const r = new FileReader();
			r.onload = () => ok(String(r.result).split(',')[1] ?? '');
			r.onerror = () => ko(r.error);
			r.readAsDataURL(f);
		});
	}

	let tutti = $derived([...TEMI, ...personali]);

	/** Il riquadro si sposta a mano solo dentro l'app: la finestra ci pensa Windows. */
	function sposta(nodo: HTMLElement, attivo: boolean) {
		return attivo ? spostabile(nodo) : undefined;
	}
</script>

<div class="sfondo" class:intera={finestra} role="presentation">
	<div class="finestra" class:intera={finestra} role="dialog" aria-modal="true" aria-label="Editor dei temi"
		use:sposta={!finestra}>
		<!-- In finestra la testata la sposta Windows: anche fuori dall'app. -->
		<header title="Trascina per spostare l'editor e vedere il tema dietro" data-tauri-drag-region={finestra || undefined}>
			<h2 data-tauri-drag-region={finestra || undefined}>{modifica ? 'Modifica tema' : 'Nuovo tema'}</h2>
			<button class="chiudi" onclick={onchiudi} aria-label="Chiudi l'editor">×</button>
		</header>

		<div class="corpo">
			<section>
				<label class="riga">
					<span>Nome</span>
					<input type="text" bind:value={nome} maxlength="40" aria-label="Nome del tema" />
				</label>
				<label class="riga">
					<span>Parti da</span>
					<select
						aria-label="Parti da un tema"
						onchange={(e) => parti(temaDa(e.currentTarget.value, personali))}
					>
						<option value="" selected disabled>Scegli un tema…</option>
						{#each tutti as t (t.id)}
							<option value={t.id}>{t.nome}</option>
						{/each}
					</select>
				</label>
				<label class="riga">
					<span>Fondo chiaro</span>
					<input type="checkbox" bind:checked={chiaro} aria-label="Fondo chiaro" />
				</label>
			</section>

			<section>
				<h3>Colori</h3>
				<div class="colori">
					{#each COLORI as [k, , etichetta] (k)}
						<label class="colore">
							<input type="color" bind:value={tavolozza[k]} aria-label={etichetta} />
							<span>{etichetta}</span>
						</label>
					{/each}
				</div>
			</section>

			<section>
				<h3>Forme</h3>
				<label class="riga">
					<span>Arrotondamento finestre</span>
					<input type="range" min="0" max="28" bind:value={raggio} aria-label="Arrotondamento finestre" />
					<output>{raggio}px</output>
				</label>
				<label class="riga">
					<span>Arrotondamento righe e pulsanti</span>
					<input type="range" min="0" max="20" bind:value={raggioPiccolo} aria-label="Arrotondamento righe" />
					<output>{raggioPiccolo}px</output>
				</label>
				<label class="riga">
					<span>Dimensione del testo</span>
					<input type="range" min={DIMENSIONE_MIN} max={DIMENSIONE_MAX} bind:value={dimensione}
						aria-label="Dimensione del testo" />
					<input class="pixel" type="number" min={DIMENSIONE_MIN} max={DIMENSIONE_MAX} value={dimensione}
						aria-label="Dimensione del testo in pixel"
						onchange={(e) => {
							const n = Math.round(Number(e.currentTarget.value));
							dimensione = Number.isFinite(n) ? Math.min(DIMENSIONE_MAX, Math.max(DIMENSIONE_MIN, n)) : FORME_BASE.dimensione;
							e.currentTarget.value = String(dimensione);
						}} />
					<span class="unita">px</span>
				</label>
				<label class="riga">
					<span>Carattere del testo</span>
					<select bind:value={carattere} aria-label="Carattere del testo">
						{#each CARATTERI as c (c.valore)}
							<option value={c.valore}>{c.nome}</option>
						{/each}
					</select>
				</label>
				<label class="riga">
					<span>Carattere dei titoli</span>
					<select bind:value={carattereTitoli} aria-label="Carattere dei titoli">
						{#each CARATTERI as c (c.valore)}
							<option value={c.valore}>{c.nome}</option>
						{/each}
					</select>
				</label>
			</section>

			<section>
				<h3>Sul binario passa…</h3>
				<div class="scelta" role="radiogroup" aria-label="Chi passa sul binario">
					<label><input type="radio" bind:group={corteoTipo} value="treno" /> Il treno</label>
					<label><input type="radio" bind:group={corteoTipo} value="figure" /> Personaggi inclusi</label>
					<label><input type="radio" bind:group={corteoTipo} value="immagini" /> Le mie immagini</label>
				</div>

				{#if corteoTipo === 'figure'}
					<p class="nota">Scegli fino a 6 personaggi: sfilano nell’ordine in cui li selezioni.</p>
					<div class="figure">
						{#each Object.entries(FIGURE) as [fid, f] (fid)}
							<button
								class="figura"
								class:scelta-attiva={figure.includes(fid)}
								aria-pressed={figure.includes(fid)}
								title={f.nome}
								aria-label={f.nome}
								onclick={() => alternaFigura(fid)}
							>
								{@html svgFigura(f, 2)}
								{#if figure.includes(fid)}<span class="ordine">{figure.indexOf(fid) + 1}</span>{/if}
							</button>
						{/each}
					</div>
				{:else if corteoTipo === 'immagini'}
					<p class="nota">
						PNG, GIF animate o WebP, meglio con lo sfondo trasparente. Anche spritesheet: una
						striscia o una griglia di fotogrammi, che l’app fa scorrere mentre il personaggio
						cammina. Le immagini vengono copiate nell’app: puoi spostare o cancellare gli originali.
					</p>
					<label class="carica">
						<input
							type="file"
							accept="image/png,image/gif,image/webp,image/jpeg"
							multiple
							onchange={aggiungiImmagini}
							aria-label="Aggiungi immagini"
						/>
						{caricando ? 'Copia in corso…' : 'Aggiungi immagini…'}
					</label>
					<ul class="immagini">
						{#each immagini as voce, i (i)}
							{@const foglio = decodifica(voce)}
							{@const o = sfondoDi(i)}
							{@const m = movimenti[i] ?? CAMMINA}
							{@const nome = percorsoDi(voce).split('\\').pop() ?? ''}
							<li>
								<div class="testa">
									<span class="nome-file">{nome}</span>
									<label class="interruttore-sprite">
										<input
											type="checkbox"
											checked={foglio !== null}
											onchange={() => alternaSprite(i)}
											aria-label="Spritesheet {nome}"
										/>
										Spritesheet
									</label>
									<button
										onclick={() => {
											immagini = immagini.filter((_, j) => j !== i);
											movimenti = movimenti.filter((_, j) => j !== i);
										}}
										aria-label="Togli {nome}">×</button
									>
								</div>
								<div class="strumenti-sfondo">
									<button
										class="togli-sfondo"
										disabled={elaborando !== null}
										onclick={() => togliSfondoDi(i)}
										>{elaborando === i ? 'Elaboro…' : 'Togli lo sfondo'}</button
									>
									<label title="Quanto un colore può essere diverso dallo sfondo ed essere tolto lo stesso">
										Tolleranza
										<input type="range" min="0" max="128" value={o.tolleranza}
											aria-label="Tolleranza dello sfondo di {nome}"
											oninput={(e) => impostaSfondo(i, { tolleranza: Number(e.currentTarget.value) })} />
									</label>
									<label title="Sfondo da togliere">
										<input type="color" value={o.colore ?? '#ffffff'}
											aria-label="Colore dello sfondo di {nome}"
											oninput={(e) => impostaSfondo(i, { colore: e.currentTarget.value })} />
										{o.colore ? o.colore : 'dagli angoli'}
									</label>
									{#if o.colore}
										<button class="piccolo" onclick={() => impostaSfondo(i, { colore: undefined })}
											title="Leggi il colore dello sfondo dagli angoli dell'immagine">Automatico</button>
									{/if}
									{#if foglio}
										<button class="piccolo" aria-pressed={contagocce === i}
											onclick={() => (contagocce = contagocce === i ? null : i)}
											title="Clicca sul foglio per scegliere il colore dello sfondo">Contagocce</button>
									{/if}
									<label>
										<input type="checkbox" checked={o.soloBordi}
											aria-label="Solo lo sfondo che tocca i bordi di {nome}"
											onchange={(e) => impostaSfondo(i, { soloBordi: e.currentTarget.checked })} />
										Solo quello che tocca i bordi
									</label>
									{#if originali[percorsoDi(voce)]}
										<button class="piccolo" onclick={() => ripristinaOriginale(i)}>Ripristina originale</button>
									{/if}
								</div>
								<div class="movimento">
									<label>
										Movimento
										<select value={m.tipo} aria-label="Movimento di {nome}"
											onchange={(e) => impostaMovimento(i, { tipo: e.currentTarget.value as TipoMovimento })}>
											{#each TIPI_MOVIMENTO as [tipo, etichetta] (tipo)}
												<option value={tipo}>{etichetta}</option>
											{/each}
										</select>
									</label>
									{#if m.tipo !== 'cammina'}
										<label title="Sempre: resta in scena senza durata, e chi attraversa riparte all'infinito. Col passaggio: compare solo quando passa il corteo.">
											Quando
											<select value={m.continuo ? 'sempre' : 'passaggio'} aria-label="Quando compare {nome}"
												onchange={(e) => impostaMovimento(i, { continuo: e.currentTarget.value === 'sempre' })}>
												<option value="sempre">Sempre, in loop</option>
												<option value="passaggio">Col passaggio del corteo</option>
											</select>
										</label>
										{#if m.tipo === 'attraversa'}
											<label title="Verso quale bordo va">
												Verso
												<select value={m.verso} aria-label="Verso di {nome}"
													onchange={(e) => impostaMovimento(i, { verso: e.currentTarget.value as 'destra' | 'sinistra' })}>
													<option value="destra">Destra</option>
													<option value="sinistra">Sinistra</option>
												</select>
											</label>
										{/if}
										<label title={m.tipo === 'fermo' ? 'Dove sta sul binario' : 'Da dove parte: poi va fino al bordo'}>
											{m.tipo === 'fermo' ? 'Posizione' : 'Parte da'}
											<input type="range" min="0" max="100" value={m.posizione}
												aria-label="{m.tipo === 'fermo' ? 'Posizione' : 'Partenza'} di {nome}"
												oninput={(e) => impostaMovimento(i, { posizione: Number(e.currentTarget.value) })} />
											{m.posizione}%
										</label>
										<label title="Pixel sopra il binario: per esempio un'onda all'altezza delle mani">
											Altezza
											<input type="range" min="0" max="200" value={m.altezza}
												aria-label="Altezza di {nome}"
												oninput={(e) => impostaMovimento(i, { altezza: Number(e.currentTarget.value) })} />
											{m.altezza} px
										</label>
										<label title="Disegnato allo specchio, rivolto dall'altra parte">
											<input type="checkbox" checked={m.specchia} aria-label="Specchia {nome}"
												onchange={(e) => impostaMovimento(i, { specchia: e.currentTarget.checked })} />
											Specchia
										</label>
										<label title={m.continuo ? "Secondi dall'apertura prima della prima comparsa: sfasa più voci fra loro" : "Secondi dall'inizio del passaggio prima di comparire"}>
											{m.continuo ? 'Prima volta dopo' : 'Dopo'}
											<input type="number" min="0" max="60" step="0.1" value={m.ritardo}
												aria-label="Ritardo di {nome}"
												onchange={(e) => impostaMovimento(i, { ritardo: Number(e.currentTarget.value) })} />
											s
										</label>
										{#if !(m.continuo && m.tipo === 'fermo')}
											<label title={m.tipo === 'fermo' ? 'Quanto resta in scena' : 'Quanto ci mette ad arrivare in fondo: meno secondi, più veloce'}>
												{m.tipo === 'fermo' ? 'Per' : 'In'}
												<input type="number" min="0.5" max="120" step="0.1" value={m.durata}
													aria-label="Durata di {nome}"
													onchange={(e) => impostaMovimento(i, { durata: Number(e.currentTarget.value) })} />
												s
											</label>
										{/if}
										{#if m.continuo && m.tipo === 'attraversa'}
											<label title="Attesa fra un lancio e l'altro: con viaggio + pausa uguali al ciclo dello spritesheet, l'onda parte sempre allo stesso gesto">
												Pausa
												<input type="number" min="0" max="120" step="0.1" value={m.pausa}
													aria-label="Pausa di {nome}"
													onchange={(e) => impostaMovimento(i, { pausa: Number(e.currentTarget.value) })} />
												s
											</label>
											<span title="Ogni quanto riparte">giro {giroDi(m)}</span>
										{/if}
									{/if}
								</div>
								{#if foglio}
									{@const d = disegno(foglio, 48)}
									<div class="foglio">
										<!-- Anteprima: il personaggio cammina qui come sul binario. -->
										<!-- Cornice grande quanto il fotogramma più grande: coi
										     fotogrammi a mano la misura cambia a ogni passo, e senza
										     cornice tutta la riga si muoveva insieme all'anteprima. -->
										<span class="cornice-anteprima" style:width="{d.larghezza}px" style:height="{d.altezza}px">
											<span
												class="anteprima-sprite"
												style={stile(foglio, convertFileSrc(foglio.src), 48)}
												aria-label="Anteprima di {nome}"
											></span>
										</span>
										<div class="campi">
												<label class="campo-a-mano">
													<input type="checkbox" checked={!!foglio.riquadri}
														aria-label="Fotogrammi a mano di {nome}"
														onchange={(e) =>
															aggiornaSprite(i, 'riquadri', e.currentTarget.checked ? riquadriDellaGriglia(foglio) : undefined)} />
													Fotogrammi a mano, anche di misure diverse (un colpo, un'onda di energia)
												</label>
												{#if foglio.riquadri}
													<p class="aiuto-aggancio">Vicino a un altro fotogramma i bordi si agganciano: tieni Alt per muoverlo libero.</p>
												{/if}
												{#if !foglio.riquadri}
												<label>
													X
													<input type="number" min="0" max={foglio.larghezza - 1} value={foglio.x}
														aria-label="X della zona di {nome}"
														onchange={(e) => campoZona(i, 'x', e.currentTarget)} />
												</label>
												<label>
													Y
													<input type="number" min="0" max={foglio.altezza - 1} value={foglio.y}
														aria-label="Y della zona di {nome}"
														onchange={(e) => campoZona(i, 'y', e.currentTarget)} />
												</label>
												<label>
													Larghezza
													<input type="number" min="1" max={foglio.larghezza} value={foglio.w}
														aria-label="Larghezza della zona di {nome}"
														onchange={(e) => campoZona(i, 'w', e.currentTarget)} />
												</label>
												<label>
													Altezza
													<input type="number" min="1" max={foglio.altezza} value={foglio.h}
														aria-label="Altezza della zona di {nome}"
														onchange={(e) => campoZona(i, 'h', e.currentTarget)} />
												</label>
												<label>
													Colonne
													<input type="number" min="1" max={foglio.w} value={griglia(foglio).colonne}
														aria-label="Colonne della griglia di {nome}"
														oninput={(e) => campoGriglia(i, 'colonne', Number(e.currentTarget.value))} />
												</label>
												<label>
													Righe
													<input type="number" min="1" max={foglio.h} value={griglia(foglio).righe}
														aria-label="Righe della griglia di {nome}"
														oninput={(e) => campoGriglia(i, 'righe', Number(e.currentTarget.value))} />
												</label>
												<label>
													Fotogrammi
													<input type="number" min="1" max={griglia(foglio).righe > 1 ? griglia(foglio).colonne * griglia(foglio).righe : foglio.w}
														value={foglio.fotogrammi}
														aria-label="Fotogrammi di {nome}"
														oninput={(e) => campoGriglia(i, 'fotogrammi', Number(e.currentTarget.value))} />
												</label>
												<label title="Spazio vuoto fra una colonna e l'altra, in pixel del foglio">
													Spazio orizzontale
													<input type="number" min="0" max={foglio.w} value={foglio.spazioX ?? 0}
														aria-label="Spazio orizzontale fra i fotogrammi di {nome}"
														oninput={(e) => aggiornaSprite(i, 'spazioX', Number(e.currentTarget.value))} />
												</label>
												<label title="Spazio vuoto fra una riga e l'altra, in pixel del foglio">
													Spazio verticale
													<input type="number" min="0" max={foglio.h} value={foglio.spazioY ?? 0}
														aria-label="Spazio verticale fra i fotogrammi di {nome}"
														oninput={(e) => aggiornaSprite(i, 'spazioY', Number(e.currentTarget.value))} />
												</label>
												{:else}
												<p class="nota-a-mano">
													{foglio.fotogrammi} fotogrammi. Sul foglio clicca un fotogramma per spostarlo o
													ridimensionarlo; trascina nello spazio vuoto per aggiungerne uno. Sul binario i
													piedi restano sulla linea anche quando il fotogramma si allarga.
												</p>
												{/if}
												<label class="campo-ordine">
													Ordine
													<input type="text" value={scriviOrdine(foglio)}
														aria-label="Ordine dei fotogrammi di {nome}"
														placeholder="es. 2, 1, 3, 1"
														onchange={(e) => campoOrdine(i, e.currentTarget)} />
												</label>
												<div class="preset">
														<button type="button" disabled={foglio.fotogrammi < 3}
															title="Il primo fotogramma (fermo) tra ognuno degli altri: 2, 1, 3, 1…"
															onclick={() => aggiornaSprite(i, 'ordine', alternaConPrimo(foglio.fotogrammi))}
															>Fermo tra i passi</button>
														<button type="button" disabled={foglio.fotogrammi < 3}
															title="Avanti e indietro: 1, 2, 3, 2…"
															onclick={() => aggiornaSprite(i, 'ordine', avantiIndietro(foglio.fotogrammi))}
															>Avanti e indietro</button>
														<button type="button"
															title="Tutti di fila: 1, 2, 3…"
															onclick={() => aggiornaSprite(i, 'ordine', [])}
															>Di fila</button>
												</div>
												<label>
													Velocità (fps)
													<input type="number" min="1" max="30" value={foglio.fps}
														aria-label="Velocità di {nome}"
														oninput={(e) => aggiornaSprite(i, 'fps', Number(e.currentTarget.value))} />
												</label>
												<label class="spunta-nitido">
													<input type="checkbox" checked={foglio.nitido}
														aria-label="Pixel nitidi per {nome}"
														onchange={(e) => aggiornaSprite(i, 'nitido', e.currentTarget.checked)} />
													Pixel art nitida
												</label>
												<span class="misura-fotogramma">
													Fotogramma {+latoFotogramma(foglio).larghezza.toFixed(1)}×{+latoFotogramma(foglio).altezza.toFixed(1)} px
												</span>
												<div class="campo-binario">
													<span class="titolo-binario">Sul binario</span>
													<label>
														Altezza
														<input type="range" min={ALTO_MIN} max={ALTO_MAX} value={misuraBinario(foglio).altezza}
															aria-label="Altezza sul binario di {nome}"
															oninput={(e) => aggiornaSprite(i, 'alto', Number(e.currentTarget.value))} />
														<input type="number" min={ALTO_MIN} max={ALTO_MAX} value={misuraBinario(foglio).altezza}
															aria-label="Altezza in pixel sul binario di {nome}"
															onchange={(e) => aggiornaSprite(i, 'alto', Number(e.currentTarget.value))} />
														px
													</label>
													<label>
														Larghezza
														<input type="number" min={LARGO_MIN} max={LARGO_MAX}
															value={Math.round(misuraBinario(foglio).larghezza)}
															disabled={foglio.largo === undefined}
															aria-label="Larghezza sul binario di {nome}"
															onchange={(e) => aggiornaSprite(i, 'largo', Number(e.currentTarget.value))} />
														px
													</label>
													<label>
														<input type="checkbox" checked={foglio.largo === undefined}
															aria-label="Larghezza proporzionale di {nome}"
															onchange={(e) =>
																aggiornaSprite(i, 'largo', e.currentTarget.checked ? undefined : Math.round(misuraBinario(foglio).larghezza))} />
														Proporzionale
													</label>
												</div>
											</div>
										</div>
										<SelettoreFotogrammi
											{foglio}
											src={convertFileSrc(foglio.src)}
											{nome}
											onzona={(x, y, w, h) => aggiornaZona(i, x, y, w, h)}
											onriquadri={(lista) => aggiornaSprite(i, 'riquadri', lista)}
											contagocce={contagocce === i}
											onpunto={(x, y) => prendiColore(i, x, y)}
										/>
								{/if}
							</li>
						{/each}
					</ul>
					{#if esitoSfondo}<p class="nota" role="status">{esitoSfondo}</p>{/if}
					{#if errore}<p class="errore">{errore}</p>{/if}
				{/if}
			</section>

			<section>
				<h3>Sfondo decorativo</h3>
				<select bind:value={motivo} aria-label="Sfondo decorativo">
					<option value="">Nessuno</option>
					{#each Object.entries(FIGURE) as [fid, f] (fid)}
						<option value={fid}>{f.nome}</option>
					{/each}
				</select>
			</section>
		</div>

		<footer>
			{#if modifica}
				<button class="pericolo" onclick={() => onelimina(id)}>Elimina tema</button>
			{/if}
			<span class="spazio"></span>
			<button onclick={onchiudi}>Annulla</button>
			<button class="primario" onclick={() => onsalva(tema)}>Salva tema</button>
		</footer>
	</div>
</div>

<style>
	.sfondo {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
	}
	.finestra {
		display: flex;
		flex-direction: column;
		width: 620px;
		max-width: calc(100vw - 32px);
		max-height: calc(100vh - 48px);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
	}
	.sfondo.intera {
		display: block;
		background: transparent;
	}
	.finestra.intera {
		width: 100%;
		height: 100vh;
		max-width: none;
		max-height: none;
		box-shadow: none;
		overflow: hidden;
	}
	.finestra.intera .corpo {
		flex: 1;
	}
	header,
	footer {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 14px 18px;
	}
	header {
		border-bottom: 1px solid var(--border);
		cursor: grab;
		user-select: none;
	}
	.finestra:global(.in-spostamento) header {
		cursor: grabbing;
	}
	footer {
		border-top: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		flex: 1;
		font-family: var(--font-display);
		font-size: calc(17px * var(--scala-testo, 1));
	}
	h3 {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-size: calc(12px * var(--scala-testo, 1));
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dim);
	}
	.corpo {
		overflow-y: auto;
		padding: 6px 18px 12px;
	}
	section {
		padding: 12px 0;
		border-bottom: 1px solid var(--border);
	}
	section:last-child {
		border-bottom: none;
	}
	.riga {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 6px 0;
	}
	.riga > span {
		width: 200px;
		flex-shrink: 0;
		color: var(--text-dim);
	}
	.riga input[type='text'],
	.riga select,
	section > select {
		flex: 1;
		height: 30px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.riga input[type='range'] {
		flex: 1;
		accent-color: var(--accent);
	}
	.riga input.pixel {
		width: 56px;
		height: 28px;
		padding: 0 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.riga > span.unita {
		width: auto;
	}
	output {
		width: 40px;
		text-align: right;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	.colori {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px 16px;
	}
	.colore {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.colore input {
		width: 34px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: none;
	}
	.scelta {
		display: flex;
		gap: 16px;
		margin-bottom: 8px;
	}
	.nota {
		margin: 6px 0;
		color: var(--text-dim);
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.figure {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
		gap: 6px;
	}
	.figura {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 44px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		cursor: default;
	}
	.figura :global(.passo-b) {
		display: none;
	}
	.figura.scelta-attiva {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.ordine {
		position: absolute;
		top: 2px;
		right: 4px;
		font-size: calc(10px * var(--scala-testo, 1));
		font-weight: 700;
		color: var(--accent);
	}
	.carica {
		display: inline-flex;
		align-items: center;
		height: 30px;
		padding: 0 12px;
		border: 1px dashed var(--text-dim);
		border-radius: var(--radius-sm);
		cursor: default;
	}
	.carica input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.immagini {
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
	}
	.immagini li {
		padding: 6px 0;
		border-bottom: 1px solid var(--border);
	}
	.testa {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.nome-file {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.interruttore-sprite,
	.spunta-nitido {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-dim);
	}
	.foglio {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 8px;
	}
	/* Riquadro a scacchi: si vede dove lo sprite è trasparente. */
	.movimento {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		margin: 6px 0;
		font-size: calc(12px * var(--scala-testo, 1));
		color: var(--text-dim);
	}
	.movimento label {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.movimento input[type='number'] {
		width: 56px;
	}
	.movimento input[type='range'] {
		width: 110px;
	}
	.cornice-anteprima {
		flex-shrink: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		overflow: hidden;
		background-color: var(--bg);
		border-radius: 6px;
		outline: 1px solid var(--border);
	}
	.anteprima-sprite {
		flex-shrink: 0;
		display: block;
		background-repeat: no-repeat;
		animation-name: fotogrammi-anteprima;
		animation-iteration-count: infinite;
	}
	@keyframes fotogrammi-anteprima {
		from {
			background-position: var(--x) var(--y);
		}
		to {
			background-position: var(--fine) var(--y);
		}
	}
	.campi {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px 12px;
		flex: 1;
	}
	.campi label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: calc(11px * var(--scala-testo, 1));
		color: var(--text-dim);
	}
	.campi input[type='number'] {
		height: 26px;
		padding: 0 6px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.campi .campo-a-mano,
	.nota-a-mano {
		grid-column: 1 / -1;
	}
	.campi .campo-a-mano {
		flex-direction: row;
		align-items: center;
		gap: 6px;
		color: var(--text);
	}
	.aiuto-aggancio {
		flex-basis: 100%;
		margin: 0;
		color: var(--text-dim);
		font-size: calc(11px * var(--scala-testo, 1));
	}
	.nota-a-mano {
		margin: 0;
		font-size: calc(11px * var(--scala-testo, 1));
		color: var(--text-dim);
	}
	.campi .campo-ordine {
		grid-column: 1 / -1;
	}
	.campi .campo-ordine input {
		height: 26px;
		padding: 0 6px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.campo-binario {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 16px;
		padding-top: 6px;
		border-top: 1px solid var(--border);
	}
	.titolo-binario {
		font-size: calc(11px * var(--scala-testo, 1));
		font-weight: 600;
		color: var(--text);
	}
	.campi .campo-binario label {
		flex-direction: row;
		align-items: center;
		gap: 6px;
	}
	.campi .campo-binario input[type='number'] {
		width: 64px;
	}
	.campi .campo-binario input[type='range'] {
		width: 120px;
	}
	.campi .campo-binario input:disabled {
		opacity: 0.5;
	}
	.preset {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.preset button {
		flex: none;
		white-space: nowrap;
		padding: 3px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: calc(11px * var(--scala-testo, 1));
		cursor: default;
	}
	.preset button:disabled {
		opacity: 0.45;
	}
	.misura-fotogramma {
		align-self: end;
		padding-bottom: 5px;
		white-space: nowrap;
		font-size: calc(11px * var(--scala-testo, 1));
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	.campi .spunta-nitido {
		flex-direction: row;
		align-self: end;
	}
	.errore {
		color: var(--errore-testo);
	}
	.spazio {
		flex: 1;
	}
	button {
		height: 32px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	button:hover {
		background: var(--row-hover);
	}
	.chiudi {
		width: 30px;
		padding: 0;
		border: none;
		font-size: calc(18px * var(--scala-testo, 1));
	}
	.primario {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	.primario:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
	.pericolo:hover {
		background: rgba(196, 43, 28, 0.2);
		color: var(--errore-testo);
	}
	.strumenti-sfondo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
		margin: 6px 0;
		font-size: calc(12px * var(--scala-testo, 1));
		color: var(--text-dim);
	}
	.strumenti-sfondo label {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.strumenti-sfondo input[type='color'] {
		width: 26px;
		height: 22px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: none;
	}
	.strumenti-sfondo button {
		height: 26px;
		padding: 0 10px;
		white-space: nowrap;
		font-size: calc(12px * var(--scala-testo, 1));
	}
	.strumenti-sfondo button[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}
	.immagini .testa button {
		height: 24px;
		width: 24px;
		padding: 0;
		border: none;
	}
</style>
