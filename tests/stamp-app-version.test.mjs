import assert from 'node:assert/strict';
import test from 'node:test';

import { stampAppVersion } from '../scripts/stamp-app-version.mjs';

const APP_VERSION_PATH = 'src/shared/app-version.js';
const SERVICE_WORKER_PATH = 'sw.js';
const SERVICE_WORKER_BODY = "importScripts('./src/shared/app-version.js');\n";

function createSources(version = '44') {
  return new Map([
    [APP_VERSION_PATH, `globalThis.TEACHHELPER_APP_VERSION = '${version}';\n`],
    [SERVICE_WORKER_PATH, `// teachhelper-app-version: ${version}\n${SERVICE_WORKER_BODY}`],
  ]);
}

test('increments and stages the only app version', () => {
  const sources = createSources();
  const gitCalls = [];
  const result = stampAppVersion({
    git: (...args) => {
      gitCalls.push(args);
      return '';
    },
    readFile: (path) => sources.get(path),
    writeFile: (path, source) => sources.set(path, source),
  });

  assert.deepEqual(result, { appVersion: '45' });
  assert.equal(sources.get(APP_VERSION_PATH), "globalThis.TEACHHELPER_APP_VERSION = '45';\n");
  assert.deepEqual(gitCalls.slice(-2), [
    ['add', '--', APP_VERSION_PATH],
    ['add', '--', SERVICE_WORKER_PATH],
  ]);
});

test('stamps the service worker so its own bytes change with the release', () => {
  const sources = createSources();
  stampAppVersion({
    git: () => '',
    readFile: (path) => sources.get(path),
    writeFile: (path, source) => sources.set(path, source),
  });

  assert.equal(
    sources.get(SERVICE_WORKER_PATH),
    `// teachhelper-app-version: 45\n${SERVICE_WORKER_BODY}`,
  );
});

test('refuses to overwrite an unstaged manual edit to the app version', () => {
  assert.throws(
    () => stampAppVersion({
      git: (command, ...args) => (command === 'diff' && args.at(-1) === APP_VERSION_PATH ? `${APP_VERSION_PATH}\n` : ''),
      readFile: () => "globalThis.TEACHHELPER_APP_VERSION = '44';\n",
      writeFile: () => assert.fail('must not overwrite an unstaged manual edit'),
    }),
    /hat ungestagte Änderungen/,
  );
});

test('refuses to stage unrelated unstaged service worker edits', () => {
  const sources = createSources();
  assert.throws(
    () => stampAppVersion({
      git: (command, ...args) => (command === 'diff' && args.at(-1) === SERVICE_WORKER_PATH ? `${SERVICE_WORKER_PATH}\n` : ''),
      readFile: (path) => sources.get(path),
      writeFile: () => assert.fail('must not write while sw.js has unstaged changes'),
    }),
    /sw\.js hat ungestagte Änderungen/,
  );
});

test('refuses a service worker without the version stamp', () => {
  const sources = createSources();
  sources.set(SERVICE_WORKER_PATH, SERVICE_WORKER_BODY);
  assert.throws(
    () => stampAppVersion({
      git: () => '',
      readFile: (path) => sources.get(path),
      writeFile: (path, source) => sources.set(path, source),
    }),
    /muss mit \/\/ teachhelper-app-version/,
  );
});
