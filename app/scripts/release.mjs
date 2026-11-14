// Publishes a new version: `npm run release -- 0.2.0`.
//
// Updates the version number in the three places where it lives, creates the
// commit and the tag `v0.2.0` and pushes them to GitHub. From there GitHub
// Actions builds the installer and the installed copies find the update.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
	console.error('Usage: npm run release -- 0.2.0');
	process.exit(1);
}

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: app, stdio: 'inherit' });

// Whoever updates sees what is new in this version: the notes must be there.
if (!readFileSync(join(app, 'src/lib/whats-new.ts'), 'utf8').includes(`version: '${version}'`)) {
	console.error(`The release notes for ${version} are missing: add them at the top of src/lib/whats-new.ts.`);
	process.exit(1);
}

if (execFileSync('git', ['status', '--porcelain'], { cwd: app }).toString().trim()) {
	console.error('There are unsaved changes: commit first.');
	process.exit(1);
}

function replace(file, search, replacement) {
	const path = join(app, file);
	const text = readFileSync(path, 'utf8');
	if (!search.test(text)) throw new Error(`Version not found in ${file}`);
	writeFileSync(path, text.replace(search, replacement));
}

replace('package.json', /"version": "[^"]+"/, `"version": "${version}"`);
replace('src-tauri/tauri.conf.json', /"version": "[^"]+"/, `"version": "${version}"`);
replace('src-tauri/Cargo.toml', /^version = "[^"]+"/m, `version = "${version}"`);
// Cargo.lock follows Cargo.toml: without this, the CI build would rewrite it.
execFileSync('cargo', ['update', '-p', 'app', '--offline'], { cwd: join(app, 'src-tauri'), stdio: 'inherit' });

git('add', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock');
git('commit', '-m', `Release ${version}`);
git('tag', `v${version}`);
git('push', 'origin', 'HEAD');
git('push', 'origin', `v${version}`);

console.log(`\nv${version} pushed. The release shows up in a few minutes on GitHub (Actions tab).`);
