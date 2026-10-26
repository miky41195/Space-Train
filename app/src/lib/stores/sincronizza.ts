/**
 * Più finestre dell'app condividono lo stesso archivio locale. Quando una
 * salva, le altre ricevono l'evento `storage` e rileggono: così un tema o
 * un colore cambiato in una finestra si vede subito anche nelle altre.
 */
export function alCambioDi(chiave: string, ricarica: (valore: string | null) => void): void {
	if (typeof window === 'undefined') return;
	window.addEventListener('storage', (e) => {
		if (e.key === chiave) ricarica(e.newValue);
	});
}
