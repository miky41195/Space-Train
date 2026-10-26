// Pubblica una nuova versione: `npm run rilascia -- 0.2.0`.
//
// Aggiorna il numero di versione nei tre posti in cui vive, crea il commit
// e il tag `v0.2.0` e li spinge su GitHub. Da lì GitHub Actions costruisce
// l'installatore e le copie installate trovano l'aggiornamento.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const versione = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(versione ?? '')) {
	console.error('Uso: npm run rilascia -- 0.2.0');
	process.exit(1);
}

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: app, stdio: 'inherit' });

if (execFileSync('git', ['status', '--porcelain'], { cwd: app }).toString().trim()) {
	console.error('Ci sono modifiche non salvate: fai prima un commit.');
	process.exit(1);
}

function sostituisci(file, cerca, nuovo) {
	const path = join(app, file);
	const testo = readFileSync(path, 'utf8');
	if (!cerca.test(testo)) throw new Error(`Versione non trovata in ${file}`);
	writeFileSync(path, testo.replace(cerca, nuovo));
}

sostituisci('package.json', /"version": "[^"]+"/, `"version": "${versione}"`);
sostituisci('src-tauri/tauri.conf.json', /"version": "[^"]+"/, `"version": "${versione}"`);
sostituisci('src-tauri/Cargo.toml', /^version = "[^"]+"/m, `version = "${versione}"`);
// Cargo.lock segue Cargo.toml: senza, la build in CI lo riscriverebbe.
execFileSync('cargo', ['update', '-p', 'app', '--offline'], { cwd: join(app, 'src-tauri'), stdio: 'inherit' });

git('add', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock');
git('commit', '-m', `Versione ${versione}`);
git('tag', `v${versione}`);
git('push');
git('push', 'origin', `v${versione}`);

console.log(`\nv${versione} inviata. La release compare fra qualche minuto su GitHub (scheda Actions).`);
