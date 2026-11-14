/**
 * The welcome guide shown once, at the first start after a fresh install.
 * Skippable at any step; reopened from the palette («Guida di benvenuto»).
 */

export interface WelcomeStep {
	title: string;
	text: string;
	keys: { keys: string; label: string }[];
}

export const WELCOME_STEPS: readonly WelcomeStep[] = [
	{
		title: 'Benvenuto in Space Train',
		text: 'Fa tutto quello che fai in Esplora risorse, con qualche comodità in più. In un minuto ti mostro le cose principali; puoi saltare quando vuoi.',
		keys: []
	},
	{
		title: 'Schede e doppio pannello',
		text: 'Tieni aperte più cartelle in schede, oppure affiancane due e trascina i file da un lato all’altro.',
		keys: [
			{ keys: 'Ctrl+T', label: 'Nuova scheda' },
			{ keys: 'Ctrl+Maiusc+D', label: 'Doppio pannello' },
			{ keys: 'F6', label: 'Passa all’altro lato' }
		]
	},
	{
		title: 'Palette dei comandi',
		text: 'Scrivi poche lettere per trovare un’azione, una cartella, un tema o un’impostazione, senza cercare nei menu.',
		keys: [{ keys: 'Ctrl+Maiusc+P', label: 'Apri la palette' }]
	},
	{
		title: 'Modifica e terminale',
		text: 'Un file di testo si modifica al volo dal clic destro, «Modifica». Il terminale si apre sotto la lista, già nella cartella in cui sei.',
		keys: [
			{ keys: 'Ctrl+S', label: 'Salva il testo' },
			{ keys: 'Ctrl+Maiusc+T', label: 'Terminale integrato' }
		]
	},
	{
		title: 'Fai spazio',
		text: 'Dal menu di una cartella, «Analizza spazio» mostra cosa pesa di più. Dal menu di un disco in Questo PC, «Pulizia disco» trova ciò che si può togliere senza rischi.',
		keys: []
	},
	{
		title: 'Il tuo stile',
		text: 'Nelle Impostazioni scegli un tema, o creane uno tuo con l’editor dei temi. Questa guida la ritrovi nella palette: «Guida di benvenuto».',
		keys: []
	}
];

/** Remembered once the guide is closed, skipped or finished. */
export const WELCOME_KEY = 'space-train.welcome-seen';
