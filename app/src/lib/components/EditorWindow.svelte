<script lang="ts">
	import { emitTo } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import ThemeEditor from './ThemeEditor.svelte';
	import { tauriBackend } from '../ipc';
	import { SettingsStore } from '../stores/settings.svelte';
	import { applyTheme, accentColor, themeById, type PersonalTheme } from '../themes';
	import { EDITOR_EVENT, type EditorMessage } from '../editor-window';

	let { from }: { /** The app window that opened the editor. */ from: string } = $props();

	const settings = new SettingsStore();
	const currentTheme = themeById(settings.theme, settings.personalThemes);
	applyTheme(currentTheme, accentColor(currentTheme, settings.accent, settings.accentColor));

	function send(m: EditorMessage): Promise<void> {
		return emitTo(from, EDITOR_EVENT, m).catch(() => {});
	}

	async function close(last?: EditorMessage) {
		if (last) await send(last);
		await getCurrentWindow().close();
	}
</script>

<ThemeEditor
	inWindow
	{currentTheme}
	personal={settings.personalThemes}
	backend={tauriBackend}
	onpreview={(t: PersonalTheme) => {
		// The editor too dresses in the theme being made.
		applyTheme(t, t.variables['--plasma']);
		void send({ kind: 'preview', theme: t });
	}}
	onsave={(t) => void close({ kind: 'save', theme: t })}
	ondelete={(id) => void close({ kind: 'delete', id })}
	onclose={() => void close()}
/>
