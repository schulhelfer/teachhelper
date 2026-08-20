#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootUrl = new URL('../', import.meta.url);
const rootPath = fileURLToPath(rootUrl);
const APP_VERSION_PATH = 'src/shared/app-version.js';

function git(...args) {
  return execFileSync('git', args, { cwd: rootPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

let lastBumpCommit = '';
try {
  git('rev-parse', '--verify', 'HEAD');
  lastBumpCommit = git('log', '-1', '--format=%H', '--', APP_VERSION_PATH).trim();
} catch {
  process.exit(0);
}
if (!lastBumpCommit) {
  process.exit(0);
}

let changedPaths = [];
try {
  changedPaths = git('diff', '--cached', '--name-only', lastBumpCommit)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
} catch {
  process.exit(0);
}

if (changedPaths.includes(APP_VERSION_PATH)) {
  process.exit(0);
}

const serviceWorkerSource = readFileSync(new URL('sw.js', rootUrl), 'utf8');
const shippedPaths = new Set(
  ['APP_SHELL', 'DEFERRED_ASSETS'].flatMap((name) => {
    const match = serviceWorkerSource.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
    if (!match) return [];
    return [...match[1].matchAll(/'([^']+)'/g)]
      .map((entry) => entry[1].replace(/^\.\//, ''))
      .filter(Boolean);
  }),
);

const staleAssets = changedPaths.filter((path) => shippedPaths.has(path));
if (staleAssets.length === 0) {
  process.exit(0);
}

console.error(`Seit dem letzten Versions-Bump (${lastBumpCommit.slice(0, 7)}) haben sich ausgelieferte`);
console.error('Dateien geändert, ohne dass APP_VERSION erhöht wurde:');
for (const asset of staleAssets.slice(0, 10)) {
  console.error(`  ${asset}`);
}
if (staleAssets.length > 10) {
  console.error(`  ... und ${staleAssets.length - 10} weitere`);
}
console.error('');
console.error(`Ohne Bump erreicht das Update niemanden. Bitte APP_VERSION in ${APP_VERSION_PATH}`);
console.error('erhöhen (sw.js wird dann automatisch gestempelt).');
process.exit(1);
