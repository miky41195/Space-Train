import { t } from './i18n';
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
		title: t('Benvenuto in Space Train'),
		text: t('Fa tutto quello che fai in Esplora risorse, con qualche comodità in più. In un minuto ti mostro le cose principali; puoi saltare quando vuoi.'),
		keys: []
	},
	{
		title: t('Schede e doppio pannello'),
		text: t('Tieni aperte più cartelle in schede, oppure affiancane due e trascina i file da un lato all’altro.'),
		keys: [
			{ keys: 'Ctrl+T', label: t('Nuova scheda') },
			{ keys: 'Ctrl+Maiusc+D', label: t('Doppio pannello') },
			{ keys: 'F6', label: t('Passa all’altro lato') }
		]
	},
	{
		title: t('Palette dei comandi'),
		text: t('Scrivi poche lettere per trovare un’azione, una cartella, un tema o un’impostazione, senza cercare nei menu.'),
		keys: [{ keys: 'Ctrl+Maiusc+P', label: t('Apri la palette') }]
	},
	{
		title: t('Modifica e terminale'),
		text: t('Un file di testo si modifica al volo dal clic destro, «Modifica». Il terminale si apre sotto la lista, già nella cartella in cui sei.'),
		keys: [
			{ keys: 'Ctrl+S', label: t('Salva il testo') },
			{ keys: 'Ctrl+Maiusc+T', label: t('Terminale integrato') }
		]
	},
	{
		title: t('Fai spazio'),
		text: t('Dal menu di una cartella, «Analizza spazio» mostra cosa pesa di più. Dal menu di un disco in Questo PC, «Pulizia disco» trova ciò che si può togliere senza rischi.'),
		keys: []
	},
	{
		title: t('Il tuo stile'),
		text: t('Nelle Impostazioni scegli un tema, o creane uno tuo con l’editor dei temi. Questa guida la ritrovi nella palette: «Guida di benvenuto».'),
		keys: []
	}
];

/** Remembered once the guide is closed, skipped or finished. */
export const WELCOME_KEY = 'space-train.welcome-seen';
