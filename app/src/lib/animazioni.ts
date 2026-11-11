/**
 * Theme animations: at startup and when a folder opens.
 *
 * Folder animations are short on purpose (at most 250 ms): a folder opens
 * hundreds of times a day. They run through the Web Animations API on the
 * elements already there, so nothing is remounted and the list keeps its
 * scroll and selection.
 */

export type AnimAvvio = 'treno' | 'corrente' | 'stelle' | 'personalizzata' | 'nessuna';
export type MotoAvvio = 'entra' | 'attraversa' | 'centro';
export type AnimCartella = 'nessuna' | 'vagoni' | 'dissolvenza' | 'scorrimento' | 'corrente';

export interface Animazioni {
	avvio: AnimAvvio;
	/** For «personalizzata»: a corteo entry (figure id, `img:…`, `sprite:…`). */
	figura?: string;
	moto: MotoAvvio;
	/** Seconds, 0.5 to 3. */
	durata: number;
	cartella: AnimCartella;
}

export const ANIM_AVVIO: readonly { valore: AnimAvvio; nome: string }[] = [
	{ valore: 'nessuna', nome: 'Nessuna' },
	{ valore: 'treno', nome: 'Treno che arriva' },
	{ valore: 'corrente', nome: 'Corrente' },
	{ valore: 'stelle', nome: 'Pioggia di stelle' },
	{ valore: 'personalizzata', nome: 'Personalizzata' }
];
export const MOTI_AVVIO: readonly { valore: MotoAvvio; nome: string }[] = [
	{ valore: 'entra', nome: 'Entra da un lato' },
	{ valore: 'attraversa', nome: 'Attraversa' },
	{ valore: 'centro', nome: 'Compare al centro' }
];
export const ANIM_CARTELLA: readonly { valore: AnimCartella; nome: string }[] = [
	{ valore: 'nessuna', nome: 'Nessuna' },
	{ valore: 'vagoni', nome: 'Vagoni' },
	{ valore: 'dissolvenza', nome: 'Dissolvenza' },
	{ valore: 'scorrimento', nome: 'Scorrimento' },
	{ valore: 'corrente', nome: 'Corrente sul percorso' }
];

export const ANIMAZIONI_BASE: Animazioni = { avvio: 'treno', moto: 'attraversa', durata: 1.25, cartella: 'nessuna' };

function una<T extends string>(v: unknown, ammessi: readonly { valore: T }[], base: T): T {
	return ammessi.some((a) => a.valore === v) ? (v as T) : base;
}

/** What a theme asks for, checked: saved themes may be old or hand-edited. */
export function animazioniDi(a: Partial<Animazioni> | undefined): Animazioni {
	const durata = Number(a?.durata);
	return {
		avvio: una(a?.avvio, ANIM_AVVIO, ANIMAZIONI_BASE.avvio),
		figura: typeof a?.figura === 'string' && a.figura ? a.figura : undefined,
		moto: una(a?.moto, MOTI_AVVIO, ANIMAZIONI_BASE.moto),
		durata: Number.isFinite(durata) ? Math.min(3, Math.max(0.5, durata)) : ANIMAZIONI_BASE.durata,
		cartella: una(a?.cartella, ANIM_CARTELLA, ANIMAZIONI_BASE.cartella)
	};
}

/** The rows that arrive one behind the other: only those on screen count. */
const MAX_VAGONI = 14;

/**
 * Plays the folder animation on `lista` (the list or grid) and `percorso`
 * (the address bar's line). Does nothing where animations are missing.
 */
export function animaCartella(tipo: AnimCartella, lista: HTMLElement | null, percorso: HTMLElement | null): void {
	const puo = (el: Element | null): el is HTMLElement => !!el && typeof (el as HTMLElement).animate === 'function';
	switch (tipo) {
		case 'dissolvenza':
			if (puo(lista)) lista.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
			break;
		case 'scorrimento':
			if (puo(lista))
				lista.animate(
					[
						{ opacity: 0, transform: 'translateY(8px)' },
						{ opacity: 1, transform: 'none' }
					],
					{ duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
				);
			break;
		case 'vagoni': {
			const righe = [...(lista?.querySelectorAll('[role="row"], [role="gridcell"]') ?? [])].slice(0, MAX_VAGONI);
			righe.forEach((r, i) => {
				if (puo(r))
					r.animate(
						[
							{ opacity: 0, transform: 'translateX(-12px)' },
							{ opacity: 1, transform: 'none' }
						],
						// The last wagon still ends within 250 ms.
						{ duration: 120, delay: i * 9, easing: 'ease-out', fill: 'backwards' }
					);
			});
			break;
		}
		case 'corrente': {
			if (!puo(percorso)) break;
			const luce = document.createElement('span');
			luce.setAttribute('aria-hidden', 'true');
			Object.assign(luce.style, {
				position: 'absolute',
				left: '0',
				bottom: '0',
				height: '2px',
				width: '64px',
				pointerEvents: 'none',
				background: 'linear-gradient(90deg, transparent, var(--plasma), var(--current))',
				boxShadow: '0 0 6px var(--current)'
			});
			if (getComputedStyle(percorso).position === 'static') percorso.style.position = 'relative';
			percorso.appendChild(luce);
			const fine = Math.max(0, percorso.scrollWidth - 64);
			const a = luce.animate([{ transform: 'translateX(-64px)' }, { transform: `translateX(${fine}px)`, opacity: 0.2 }], {
				duration: 240,
				easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
			});
			a.onfinish = () => luce.remove();
			a.oncancel = () => luce.remove();
			break;
		}
	}
}
