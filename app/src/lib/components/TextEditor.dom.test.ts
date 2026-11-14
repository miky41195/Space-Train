import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/svelte';
import TextEditor from './TextEditor.svelte';
import { fakeBackend } from '../test-doubles';
import type { Backend } from '../ipc';

afterEach(cleanup);

function setup(over: Partial<Backend> = {}) {
	const textWrite = vi.fn(async () => 2000);
	const backend = fakeBackend({
		textRead: async () => ({ text: 'uno\ndue', crlf: true, bom: false, modified: 1000 }),
		textWrite,
		...over
	});
	const onclose = vi.fn();
	render(TextEditor, { props: { path: 'C:\\note.txt', name: 'note.txt', onclose, describeError: () => 'errore', backend } });
	return { textWrite, onclose };
}

describe('TextEditor', () => {
	it('saves with Ctrl+S keeping the file’s line endings', async () => {
		const { textWrite } = setup();
		const area = await screen.findByLabelText('Testo di note.txt');
		await fireEvent.input(area, { target: { value: 'uno\ndue\ntre' } });
		await fireEvent.keyDown(area, { key: 's', ctrlKey: true });
		await waitFor(() =>
			expect(textWrite).toHaveBeenCalledWith('C:\\note.txt', { text: 'uno\ndue\ntre', crlf: true, bom: false }, 1000, false)
		);
	});

	it('asks before closing with unsaved changes', async () => {
		const { onclose } = setup();
		const area = await screen.findByLabelText('Testo di note.txt');
		await fireEvent.input(area, { target: { value: 'cambiato' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
		expect(onclose).not.toHaveBeenCalled();
		await fireEvent.click(await screen.findByRole('button', { name: 'Non salvare' }));
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('closes at once when nothing changed', async () => {
		const { onclose } = setup();
		await screen.findByLabelText('Testo di note.txt');
		await fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('a file changed on disk is not overwritten without asking', async () => {
		const textWrite = vi.fn(async (_p: string, _f: unknown, _e: number, force: boolean) => {
			if (!force) throw { kind: 'changed' };
			return 3000;
		});
		setup({ textWrite: textWrite as Backend['textWrite'] });
		const area = await screen.findByLabelText('Testo di note.txt');
		await fireEvent.input(area, { target: { value: 'mio' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Sovrascrivi' }));
		await waitFor(() => expect(textWrite).toHaveBeenLastCalledWith('C:\\note.txt', expect.anything(), 1000, true));
	});
});
