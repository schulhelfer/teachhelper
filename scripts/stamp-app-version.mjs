#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function stampAppVersion({
  git,
  readFile,
  writeFile,
  appVersionPath = 'src/shared/app-version.js',
}) {
  if (git('diff', '--name-only', '--', appVersionPath).trim()) {
    throw new Error(`${appVersionPath} hat ungestagte Änderungen. Die Datei wird beim Commit generiert; bitte Änderungen verwerfen oder erst stagen.`);
  }

  const appVersionSource = readFile(appVersionPath);
  const appVersionMatch = appVersionSource.match(/^globalThis\.TEACHHELPER_APP_VERSION = '(\d+)';\n?$/);
  if (!appVersionMatch) {
    throw new Error(`${appVersionPath} muss genau globalThis.TEACHHELPER_APP_VERSION = '<Zahl>'; enthalten.`);
  }
  const appVersion = (BigInt(appVersionMatch[1]) + 1n).toString();
  const nextAppVersionSource = `globalThis.TEACHHELPER_APP_VERSION = '${appVersion}';\n`;
  if (appVersionSource !== nextAppVersionSource) {
    writeFile(appVersionPath, nextAppVersionSource);
  }
  git('add', '--', appVersionPath);
  return { appVersion };
}

function run() {
  const args = process.argv.slice(2);
  const rootOptionIndex = args.indexOf('--root');
  if (rootOptionIndex >= 0 && !args[rootOptionIndex + 1]) {
    throw new Error('--root benötigt einen Verzeichnispfad.');
  }
  const rootPath = rootOptionIndex >= 0
    ? resolve(process.cwd(), args[rootOptionIndex + 1])
    : fileURLToPath(new URL('../', import.meta.url));
  const appVersionPath = 'src/shared/app-version.js';
  const git = (...gitArgs) => execFileSync('git', gitArgs, {
    cwd: rootPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { appVersion } = stampAppVersion({
    git,
    appVersionPath,
    readFile: (path) => readFileSync(resolve(rootPath, path), 'utf8'),
    writeFile: (path, source) => writeFileSync(resolve(rootPath, path), source),
  });
  console.log(`App-Version ${appVersion} gestempelt.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    const message = error?.stderr || error?.message || 'Unbekannter Fehler.';
    console.error(`App-Version-Stempel fehlgeschlagen: ${String(message).trim()}`);
    process.exitCode = 1;
  }
}
