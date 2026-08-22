#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootUrl = new URL('../', import.meta.url);
const rootPath = fileURLToPath(rootUrl);
const checkOnly = process.argv.slice(2).includes('--check');

function fail(message) {
  console.error(`Versions-Sync fehlgeschlagen: ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, { cwd: rootPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const appVersionSource = readFileSync(new URL('src/shared/app-version.js', rootUrl), 'utf8');
const appVersion = appVersionSource.match(/export\s+const\s+APP_VERSION\s*=\s*'([^']+)'/)?.[1];
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
if (currentVersion === appVersion && checkOnly) {
  process.exit(0);
}

if (currentVersion !== appVersion && checkOnly) {
  fail(
    `sw.js ist auf APP_VERSION ${currentVersion}, aber src/shared/app-version.js auf ${appVersion}. `
    + 'Zum Synchronisieren: node scripts/sync-sw-version.mjs',
  );
}

let inGitRepository = true;
let hasUnstagedServiceWorkerChanges = false;
let stagedServiceWorkerSource = '';
try {
  hasUnstagedServiceWorkerChanges = git('diff', '--name-only', '--', 'sw.js').trim().length > 0;
  stagedServiceWorkerSource = git('show', ':sw.js');
} catch {
  inGitRepository = false;
}

if (currentVersion === appVersion) {
  if (!inGitRepository || stagedServiceWorkerSource === serviceWorkerSource) {
    process.exit(0);
  }

  const stagedVersion = stagedServiceWorkerSource.match(versionPattern)?.[2];
  const stampedStagedSource = stagedServiceWorkerSource.replace(versionPattern, `$1${appVersion}$3`);
  if (!stagedVersion || stampedStagedSource !== serviceWorkerSource) {
    fail('sw.js enthält neben dem Versionsstempel ungestagte Änderungen. Bitte prüfen und selbst stagen.');
  }

  git('add', '--', 'sw.js');
  console.log(`sw.js: APP_VERSION ${stagedVersion} -> ${appVersion} im Index gestempelt.`);
  process.exit(0);
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
