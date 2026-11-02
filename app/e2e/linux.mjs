// End-to-end check of the real app on Linux, run by CI under Xvfb.
//
// Starts tauri-driver (WebDriver for Tauri, backed by WebKitWebDriver),
// launches the debug build on a scratch folder in $HOME and drives it like
// a user: browse, delete to the Trash, undo, delete for good, This PC.
// Every step leaves a screenshot in e2e/shots/ (uploaded as a CI artifact).
// Failures are printed as GitHub annotations.
//
// Usage: node e2e/linux.mjs <path to the app binary>

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const app = path.resolve(process.argv[2] ?? 'src-tauri/target/debug/app');
const driverUrl = 'http://127.0.0.1:4444';
const shots = path.resolve('e2e/shots');
const home = os.homedir();
const folder = path.join(home, 'st-e2e');
const trashFiles = path.join(process.env.XDG_DATA_HOME || path.join(home, '.local/share'), 'Trash/files');
const ELEMENT = 'element-6066-11e4-a23d-4ec7b6e5f6';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Scratch folder ────────────────────────────────────────────────────
fs.rmSync(folder, { recursive: true, force: true });
fs.mkdirSync(path.join(folder, 'gamma'), { recursive: true });
fs.writeFileSync(path.join(folder, 'alfa.txt'), 'alfa');
fs.writeFileSync(path.join(folder, 'beta.txt'), 'beta');
fs.writeFileSync(path.join(folder, 'gamma', 'dentro.txt'), 'x');
fs.mkdirSync(shots, { recursive: true });

// ── WebDriver plumbing ────────────────────────────────────────────────
async function wd(method, url, body) {
	const r = await fetch(driverUrl + url, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const json = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(`${method} ${url}: ${JSON.stringify(json.value ?? json)}`);
	return json.value;
}

let session = null;
const run = (script, ...args) => wd('POST', `/session/${session}/execute/sync`, { script, args });

async function until(what, check, ms = 20000) {
	const end = Date.now() + ms;
	let last;
	while (Date.now() < end) {
		try {
			last = await check();
			if (last) return last;
		} catch (e) {
			last = e.message;
		}
		await sleep(250);
	}
	throw new Error(`Timed out waiting for: ${what} (last: ${JSON.stringify(last)})`);
}

const names = () => run(`return [...document.querySelectorAll('.row .name, .cella .nome')].map(n => n.textContent.trim())`);

async function click(what, script, ...args) {
	const el = await until(what, () => run(script, ...args));
	await wd('POST', `/session/${session}/element/${el[ELEMENT]}/click`, {});
}

const clickRow = (name) =>
	click(
		`row ${name}`,
		`return [...document.querySelectorAll('.row')].find(r => r.querySelector('.name')?.textContent.trim() === arguments[0]) ?? null`,
		name
	);

const clickDialogButton = (label) =>
	click(
		`dialog button ${label}`,
		`return [...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === arguments[0]) ?? null`,
		label
	);

const clickSidebar = (label) =>
	click(
		`sidebar ${label}`,
		`return [...document.querySelectorAll('.sidebar .voce')].find(b => b.textContent.trim() === arguments[0]) ?? null`,
		label
	);

const key = (k, mod = {}) =>
	run(
		`window.dispatchEvent(new KeyboardEvent('keydown', { key: arguments[0], ctrlKey: !!arguments[1].ctrl, shiftKey: !!arguments[1].shift, bubbles: true }))`,
		k,
		mod
	);

let shot = 0;
async function screenshot(name) {
	const png = await wd('GET', `/session/${session}/screenshot`);
	fs.writeFileSync(path.join(shots, `${String(++shot).padStart(2, '0')}-${name}.png`), Buffer.from(png, 'base64'));
}

// ── Steps ─────────────────────────────────────────────────────────────
const results = [];
async function step(name, fn) {
	try {
		await fn();
		results.push({ name, ok: true });
		console.log(`ok   ${name}`);
	} catch (e) {
		results.push({ name, ok: false, error: e.message });
		console.log(`::error::E2E step failed: ${name}: ${e.message}`);
	}
	await screenshot(name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()).catch(() => {});
}

const driver = spawn('tauri-driver', [], { stdio: ['ignore', 'inherit', 'inherit'] });
try {
	await until('tauri-driver', () => fetch(driverUrl + '/status').then((r) => r.ok), 30000);
	const s = await wd('POST', '/session', {
		capabilities: { alwaysMatch: { 'tauri:options': { application: app, args: [folder] } } }
	});
	session = s.sessionId;

	await step('opens the folder passed on the command line', async () => {
		await until('alfa.txt listed', async () => (await names()).includes('alfa.txt'));
		const n = await names();
		for (const x of ['beta.txt', 'gamma']) if (!n.includes(x)) throw new Error(`missing ${x}: ${n}`);
	});

	await step('breadcrumbs follow the Linux path', async () => {
		const text = await run(`return document.body.innerText`);
		for (const x of ['File system', 'st-e2e']) if (!text.includes(x)) throw new Error(`no «${x}» on screen`);
	});

	await step('sidebar has no Windows network entry', async () => {
		const voci = await run(`return [...document.querySelectorAll('.sidebar .voce')].map(b => b.textContent.trim())`);
		if (voci.includes('Rete')) throw new Error(`«Rete» shown: ${voci}`);
		for (const x of ['Questo PC', 'Cestino']) if (!voci.includes(x)) throw new Error(`missing ${x}: ${voci}`);
	});

	await step('Delete moves a file to the Trash', async () => {
		await clickRow('alfa.txt');
		await key('Delete');
		await clickDialogButton('Sposta nel Cestino');
		await until('alfa.txt gone from the list', async () => !(await names()).includes('alfa.txt'));
		if (fs.existsSync(path.join(folder, 'alfa.txt'))) throw new Error('alfa.txt still on disk');
		if (!fs.existsSync(path.join(trashFiles, 'alfa.txt'))) throw new Error(`alfa.txt not in ${trashFiles}`);
	});

	await step('Ctrl+Z brings it back from the Trash', async () => {
		await key('z', { ctrl: true });
		await until('alfa.txt back in the list', async () => (await names()).includes('alfa.txt'));
		if (!fs.existsSync(path.join(folder, 'alfa.txt'))) throw new Error('alfa.txt not restored on disk');
	});

	await step('Shift+Delete removes a folder for good', async () => {
		await clickRow('gamma');
		await key('Delete', { shift: true });
		await clickDialogButton('Elimina definitivamente');
		await until('gamma gone from the list', async () => !(await names()).includes('gamma'));
		if (fs.existsSync(path.join(folder, 'gamma'))) throw new Error('gamma still on disk');
		if (fs.existsSync(path.join(trashFiles, 'gamma'))) throw new Error('gamma went to the Trash');
	});

	await step('This PC lists the file system', async () => {
		await clickSidebar('Questo PC');
		await until('File system listed', async () => (await names()).includes('File system'));
	});

	await step('the Trash location opens', async () => {
		await clickSidebar('Cestino');
		await until('Trash view', async () => (await run(`return document.body.innerText`)).includes('Cestino'));
	});
} catch (e) {
	results.push({ name: 'setup', ok: false, error: e.message });
	console.log(`::error::E2E setup failed: ${e.message}`);
} finally {
	if (session) await wd('DELETE', `/session/${session}`).catch(() => {});
	driver.kill();
	fs.rmSync(folder, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} E2E steps passed`);
console.log(`::notice::E2E Linux: ${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
