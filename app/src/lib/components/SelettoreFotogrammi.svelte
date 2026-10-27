<script lang="ts">
	import {
		agganciaRiquadro,
		cella,
		latoFotogramma,
		passoFotogramma,
		RIQUADRI_MAX,
		type LatiTirati,
		type Riquadro,
		type Spritesheet
	} from '../spritesheet';

	/** Distanza a schermo, in pixel, entro cui un bordo si aggancia a un vicino. */
	const AGGANCIO = 6;

	let {
		foglio,
		src,
		nome,
		onzona,
		onriquadri,
		contagocce = false,
		onpunto
	}: {
		foglio: Spritesheet;
		/** Indirizzo dell'immagine già pronto per la WebView. */
		src: string;
		/** Nome del file, per i nomi accessibili. */
		nome: string;
		/** Zona scelta, in pixel dell'immagine: chi la riceve la riporta nei limiti. */
		onzona: (x: number, y: number, w: number, h: number) => void;
		/** Fotogrammi a mano: la lista nuova dopo ogni gesto. */
		onriquadri?: (riquadri: Riquadro[]) => void;
		/** Col contagocce un clic sceglie un pixel invece di toccare la zona. */
		contagocce?: boolean;
		onpunto?: (x: number, y: number) => void;
	} = $props();

	const ZOOM = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];

	/**
	 * Zoom iniziale: il foglio intero entra nel riquadro, ma un foglio
	 * minuscolo si ingrandisce perché la zona sia comoda da prendere.
	 */
	// svelte-ignore state_referenced_locally
	let zoom = $state(Math.min(16, Math.max(0.1, 520 / foglio.larghezza)));

	type Lati = { n: boolean; s: boolean; e: boolean; o: boolean };
	type Zona = { x: number; y: number; w: number; h: number };

	/**
	 * Gesto in corso col mouse, con il punto di partenza in pixel
	 * dell'immagine. `nuova`: si disegna una zona da capo. `sposta`: la zona
	 * intera si trascina. `bordo`: si tirano uno o due lati. `indice` dice
	 * quale fotogramma a mano si tocca; senza, è la zona della griglia.
	 */
	let gesto = $state<
		| { modo: 'nuova'; px: number; py: number; indice?: number }
		| { modo: 'sposta'; px: number; py: number; da: Zona; indice?: number }
		| { modo: 'bordo'; px: number; py: number; da: Zona; lati: Lati; indice?: number }
		| null
	>(null);

	/** Fotogrammi a mano: la lista, e quello che si sta modificando. */
	let riquadri = $derived(foglio.riquadri ?? []);
	let aMano = $derived(riquadri.length > 0);
	let scelto = $state(0);
	let sceltoValido = $derived(Math.min(scelto, Math.max(0, riquadri.length - 1)));

	/** Manda il rettangolo toccato a chi lo salva: la zona, o un fotogramma a mano. */
	function emetti(indice: number | undefined, x: number, y: number, w: number, h: number) {
		if (indice === undefined) {
			onzona(x, y, w, h);
			return;
		}
		const lista = [...riquadri];
		lista[indice] = { x, y, w, h };
		onriquadri?.(lista);
	}

	function togliScelto() {
		if (riquadri.length <= 1) return;
		onriquadri?.(riquadri.filter((_, k) => k !== sceltoValido));
		scelto = Math.max(0, sceltoValido - 1);
	}
	let foglioEl = $state<HTMLDivElement | null>(null);

	/** Il punto sotto il mouse, in pixel dell'immagine. */
	function punto(e: PointerEvent): { px: number; py: number } {
		const r = foglioEl!.getBoundingClientRect();
		return { px: (e.clientX - r.left) / zoom, py: (e.clientY - r.top) / zoom };
	}

	function premi(e: PointerEvent) {
		if (e.button !== 0) return;
		// Niente selezione del testo né focus (vedi `onmousedown`): farebbero
		// scorrere l'editor, e il foglio salterebbe sotto il mouse.
		e.preventDefault();
		const { px, py } = punto(e);
		if (contagocce) {
			onpunto?.(Math.min(foglio.larghezza - 1, px), Math.min(foglio.altezza - 1, py));
			return;
		}
		const toccato = (e.target as HTMLElement).closest<HTMLElement>('[data-maniglia]');
		let maniglia = toccato?.dataset.maniglia;
		// Coi fotogrammi a mano si tocca un riquadro: cliccandone un altro lo si sceglie.
		let indice: number | undefined;
		if (aMano) {
			const k = toccato?.closest<HTMLElement>('[data-indice]')?.dataset.indice;
			if (k !== undefined) {
				indice = Number(k);
				if (indice !== sceltoValido) maniglia = 'sposta';
				scelto = indice;
			}
		}
		const r = indice === undefined ? foglio : riquadri[indice];
		const da = { x: r.x, y: r.y, w: r.w, h: r.h };
		// Una zona grande quanto il foglio non si può spostare: dentro si
		// disegna una zona nuova, altrimenti non ci sarebbe modo di farlo.
		if (!aMano && maniglia === 'sposta' && da.w >= foglio.larghezza && da.h >= foglio.altezza) maniglia = undefined;
		foglioEl?.setPointerCapture?.(e.pointerId);
		if (maniglia === 'sposta') gesto = { modo: 'sposta', px, py, da, indice };
		else if (maniglia) {
			const lati = { n: maniglia.includes('n'), s: maniglia.includes('s'), e: maniglia.includes('e'), o: maniglia.includes('o') };
			gesto = { modo: 'bordo', px, py, da, lati, indice };
		} else if (aMano) {
			// Nello spazio vuoto si disegna un fotogramma nuovo, in fondo alla lista.
			if (riquadri.length >= RIQUADRI_MAX) return;
			const nuovo = riquadri.length;
			scelto = nuovo;
			gesto = { modo: 'nuova', px, py, indice: nuovo };
			emetti(nuovo, Math.floor(px), Math.floor(py), 1, 1);
		} else {
			gesto = { modo: 'nuova', px, py };
			onzona(Math.floor(px), Math.floor(py), 1, 1);
		}
	}

	function muovi(e: PointerEvent) {
		if (!gesto) return;
		const { px, py } = punto(e);
		const L = foglio.larghezza;
		const A = foglio.altezza;
		if (gesto.modo === 'nuova') {
			const x = Math.max(0, Math.min(gesto.px, px));
			const y = Math.max(0, Math.min(gesto.py, py));
			emetti(gesto.indice, x, y, Math.min(L, Math.max(gesto.px, px)) - x, Math.min(A, Math.max(gesto.py, py)) - y);
			return;
		}
		const dx = px - gesto.px;
		const dy = py - gesto.py;
		const { x, y, w, h } = gesto.da;
		// Coi fotogrammi a mano i bordi si agganciano a quelli dei vicini;
		// Alt premuto lascia muovere libero, al pixel.
		const indice = gesto.indice;
		const aggancia = (r: Riquadro, lati?: LatiTirati) =>
			indice === undefined || e.altKey
				? r
				: agganciaRiquadro(r, riquadri.filter((_, k) => k !== indice), AGGANCIO / zoom, lati);
		if (gesto.modo === 'sposta') {
			// Stessa misura, senza uscire dal foglio.
			const r = aggancia({ x: Math.min(L - w, Math.max(0, x + dx)), y: Math.min(A - h, Math.max(0, y + dy)), w, h });
			emetti(indice, Math.min(L - w, Math.max(0, r.x)), Math.min(A - h, Math.max(0, r.y)), w, h);
			return;
		}
		// Ogni lato tirato si ferma al bordo del foglio e a un pixel dal lato opposto.
		let sinistra = x;
		let destra = x + w;
		let alto = y;
		let basso = y + h;
		if (gesto.lati.o) sinistra = Math.min(destra - 1, Math.max(0, x + dx));
		if (gesto.lati.e) destra = Math.max(sinistra + 1, Math.min(L, x + w + dx));
		if (gesto.lati.n) alto = Math.min(basso - 1, Math.max(0, y + dy));
		if (gesto.lati.s) basso = Math.max(alto + 1, Math.min(A, y + h + dy));
		const r = aggancia({ x: sinistra, y: alto, w: destra - sinistra, h: basso - alto }, gesto.lati);
		emetti(indice, Math.max(0, r.x), Math.max(0, r.y), Math.min(L - Math.max(0, r.x), r.w), Math.min(A - Math.max(0, r.y), r.h));
	}

	function rilascia() {
		gesto = null;
	}

	function cambiaZoom(verso: 1 | -1) {
		const prossimo = verso > 0 ? ZOOM.find((z) => z > zoom + 0.001) : [...ZOOM].reverse().find((z) => z < zoom - 0.001);
		if (prossimo) zoom = prossimo;
	}

	/** Ctrl + rotellina ingrandisce, come nei programmi di disegno. */
	function rotella(e: WheelEvent) {
		if (!e.ctrlKey) return;
		e.preventDefault();
		cambiaZoom(e.deltaY < 0 ? 1 : -1);
	}

	const MANIGLIE = ['n', 's', 'e', 'o', 'ne', 'no', 'se', 'so'] as const;
	const NOMI: Record<(typeof MANIGLIE)[number], string> = {
		n: 'Bordo superiore',
		s: 'Bordo inferiore',
		e: 'Bordo destro',
		o: 'Bordo sinistro',
		ne: 'Angolo in alto a destra',
		no: 'Angolo in alto a sinistra',
		se: 'Angolo in basso a destra',
		so: 'Angolo in basso a sinistra'
	};
</script>

<div class="selettore">
	<div class="barra">
		{#if aMano}
			{@const r = riquadri[sceltoValido]}
			<span class="aiuto">Clicca un fotogramma per modificarlo, disegnane uno nuovo nello spazio vuoto</span>
			<span class="scelta">n. {sceltoValido + 1}: {r.w}×{r.h} px da {r.x},{r.y}</span>
			<button class="testo" disabled={riquadri.length <= 1} onclick={togliScelto}
				aria-label="Togli il fotogramma {sceltoValido + 1} di {nome}">Togli</button>
		{:else}
			<span class="aiuto">Disegna la zona dei fotogrammi, tira bordi e angoli o spostala</span>
			<span class="scelta">{foglio.w}×{foglio.h} px da {foglio.x},{foglio.y}</span>
		{/if}
		<button onclick={() => cambiaZoom(-1)} aria-label="Riduci lo zoom di {nome}">−</button>
		<span class="zoom">{Math.round(zoom * 100)}%</span>
		<button onclick={() => cambiaZoom(1)} aria-label="Aumenta lo zoom di {nome}">+</button>
	</div>

	<div class="finestra-foglio" onwheel={rotella}>
		<div
			class="foglio"
			class:contagocce
			bind:this={foglioEl}
			role="grid"
			tabindex="-1"
			aria-label="Foglio di {nome}"
			style:width="{foglio.larghezza * zoom}px"
			style:height="{foglio.altezza * zoom}px"
			style:background-image={`url("${src.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`}
			style:image-rendering={foglio.nitido ? 'pixelated' : 'auto'}
			onpointerdown={premi}
			onmousedown={(e) => e.preventDefault()}
			onpointermove={muovi}
			onpointerup={rilascia}
			onpointercancel={rilascia}
		>
			{#if aMano}
				<!-- Fotogrammi a mano: ognuno il suo riquadro, quello scelto con le maniglie. -->
				{#each riquadri as r, k (k)}
					<div
						class="riquadro"
						class:scelto={k === sceltoValido}
						data-indice={k}
						data-maniglia="sposta"
						aria-label="Fotogramma {k + 1} di {nome}"
						style:left="{r.x * zoom}px"
						style:top="{r.y * zoom}px"
						style:width="{r.w * zoom}px"
						style:height="{r.h * zoom}px"
					>
						<span class="numero">{k + 1}</span>
						{#if k === sceltoValido}
							{#each MANIGLIE as m (m)}
								<span class="maniglia {m}" data-maniglia={m} aria-label="{NOMI[m]} del fotogramma di {nome}"></span>
							{/each}
						{/if}
					</div>
				{/each}
			{:else}
				<!-- La zona scelta, divisa nei suoi fotogrammi. -->
				<div
					class="zona"
					class:attiva={gesto !== null}
					data-maniglia="sposta"
					aria-label="Zona di {nome}"
					style:left="{foglio.x * zoom}px"
					style:top="{foglio.y * zoom}px"
					style:width="{foglio.w * zoom}px"
					style:height="{foglio.h * zoom}px"
				>
					<!-- Ogni cella col suo numero: da sinistra a destra e poi riga per
					     riga, l'ordine in cui si mostrano. Fra le celle, lo spazio scelto. -->
					{#each { length: Math.min(foglio.fotogrammi, 256) }, k (k)}
						{@const c = cella(foglio, k)}
						<span
							class="cella"
							style:left="{c.colonna * passoFotogramma(foglio).x * zoom}px"
							style:top="{c.riga * passoFotogramma(foglio).y * zoom}px"
							style:width="{latoFotogramma(foglio).larghezza * zoom}px"
							style:height="{latoFotogramma(foglio).altezza * zoom}px"
						><span class="numero">{k + 1}</span></span>
					{/each}
					{#each MANIGLIE as m (m)}
						<span class="maniglia {m}" data-maniglia={m} aria-label="{NOMI[m]} della zona di {nome}"></span>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.selettore {
		margin-top: 8px;
	}
	.barra {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
		font-size: 12px;
	}
	/* Testi su una riga sola: se andassero a capo mentre si trascina, il
	   foglio si sposterebbe sotto il mouse. */
	.aiuto {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-dim);
	}
	.scelta {
		white-space: nowrap;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}
	.zoom {
		width: 44px;
		text-align: center;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	.barra button {
		width: 26px;
		height: 26px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: default;
	}
	/* I fogli grandi scorrono dentro il riquadro invece di allungare l'editor. */
	.finestra-foglio {
		max-height: 320px;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: 6px;
		/* Scacchiera: si vede dove lo sprite è trasparente. */
		background:
			repeating-conic-gradient(rgba(127, 127, 127, 0.18) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px,
			var(--bg);
	}
	.foglio {
		position: relative;
		/* Spazio per le maniglie quando la zona tocca il bordo del foglio. */
		margin: 8px;
		background-size: 100% 100%;
		background-repeat: no-repeat;
		cursor: crosshair;
		touch-action: none;
		user-select: none;
	}
	/* Col contagocce la zona non si prende: il clic arriva al foglio. */
	.foglio.contagocce {
		cursor: copy;
	}
	.foglio.contagocce .zona {
		pointer-events: none;
	}
	.zona {
		position: absolute;
		z-index: 1;
		cursor: move;
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 0 3px rgba(0, 0, 0, 0.5);
	}
	.zona.attiva {
		background-color: color-mix(in srgb, var(--accent) 18%, transparent);
	}
	/* Una cella della griglia: si vede il suo contorno, e lo spazio fra le celle. */
	.cella {
		position: absolute;
		pointer-events: none;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent);
	}
	.riquadro {
		position: absolute;
		z-index: 1;
		cursor: pointer;
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent),
			0 0 0 2px rgba(0, 0, 0, 0.4);
	}
	.riquadro.scelto {
		z-index: 2;
		cursor: move;
		background-color: color-mix(in srgb, var(--accent) 14%, transparent);
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 0 3px rgba(0, 0, 0, 0.5);
	}
	.foglio.contagocce .riquadro {
		pointer-events: none;
	}
	.barra button.testo {
		width: auto;
		padding: 0 10px;
	}
	.barra button:disabled {
		opacity: 0.45;
	}
	.numero {
		position: absolute;
		top: 2px;
		left: 0;
		padding: 0 3px;
		margin-left: 2px;
		border-radius: 3px;
		background: var(--accent);
		color: var(--bg);
		font-size: 10px;
		font-weight: 600;
		line-height: 14px;
		pointer-events: none;
	}
	.maniglia {
		position: absolute;
		width: 10px;
		height: 10px;
		margin: -5px 0 0 -5px;
		border-radius: 2px;
		background: var(--accent);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
	}
	.maniglia.n,
	.maniglia.s {
		left: 50%;
		cursor: ns-resize;
	}
	.maniglia.e,
	.maniglia.o {
		top: 50%;
		cursor: ew-resize;
	}
	.maniglia.n,
	.maniglia.ne,
	.maniglia.no {
		top: 0;
	}
	.maniglia.s,
	.maniglia.se,
	.maniglia.so {
		top: 100%;
	}
	.maniglia.o,
	.maniglia.no,
	.maniglia.so {
		left: 0;
	}
	.maniglia.e,
	.maniglia.ne,
	.maniglia.se {
		left: 100%;
	}
	.maniglia.ne,
	.maniglia.so {
		cursor: nesw-resize;
	}
	.maniglia.no,
	.maniglia.se {
		cursor: nwse-resize;
	}
</style>
