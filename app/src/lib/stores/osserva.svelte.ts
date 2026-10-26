/**
 * Osserva una lettura reattiva fuori da un componente.
 *
 * Serve ai test: verificare che un valore sia corretto non dimostra che
 * l'interfaccia venga avvisata del cambiamento. Scrivere sull'oggetto
 * grezzo invece che sul proxy di `$state` produce esattamente questo caso,
 * valore giusto e schermo fermo, e solo un osservatore lo distingue.
 *
 * Restituisce la funzione per smettere di osservare.
 */
export function osserva<T>(leggi: () => T, quandoCambia: (valore: T) => void): () => void {
	return $effect.root(() => {
		$effect(() => quandoCambia(leggi()));
	});
}
