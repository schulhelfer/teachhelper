#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootUrl = new URL('../', import.meta.url);
const rootPath = fileURLToPath(rootUrl);

function fail(message) {
  console.error(`Versions-Sync fehlgeschlagen: ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, { cwd: rootPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const appVersionSource = readFileSync(new URL('src/shared/app-version.js', rootUrl), 'utf8');
const appVersion = appVersionSource.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
if (!appVersion) {
  fail('src/shared/app-version.js exportiert kein APP_VERSION-Literal.');
}

const serviceWorkerUrl = new URL('sw.js', rootUrl);
const serviceWorkerSource = readFileSync(serviceWorkerUrl, 'utf8');
const versionPattern = /(const APP_VERSION = ')([^']*)(';)/;
const currentVersion = serviceWorkerSource.match(versionPattern)?.[2];
if (currentVersion === undefined) {
  fail("sw.js enthält keine Zeile const APP_VERSION = '...';");
}
if (currentVersion === appVersion) {
  process.exit(0);
}

let inGitRepository = true;
let hasUnstagedServiceWorkerChanges = false;
try {
  hasUnstagedServiceWorkerChanges = git('diff', '--name-only', '--', 'sw.js').trim().length > 0;
} catch {
  inGitRepository = false;
}

writeFileSync(
  serviceWorkerUrl,
  serviceWorkerSource.replace(versionPattern, `$1${appVersion}$3`),
);
console.log(`sw.js: APP_VERSION ${currentVersion} -> ${appVersion} gestempelt.`);

if (!inGitRepository) {
  process.exit(0);
}

if (hasUnstagedServiceWorkerChanges) {
  console.error('sw.js hatte bereits ungestagte Änderungen - der Stempel wurde geschrieben, aber');
  console.error('nicht gestaged. Bitte sw.js prüfen und selbst stagen: git add sw.js');
  process.exit(1);
}

git('add', '--', 'sw.js');
