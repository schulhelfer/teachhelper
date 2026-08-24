import assert from 'node:assert/strict';
import test from 'node:test';

import { stampAppVersion } from '../scripts/stamp-app-version.mjs';

const APP_VERSION_PATH = 'src/shared/app-version.js';

test('increments and stages the only app version', () => {
  const sources = new Map([
    [APP_VERSION_PATH, "globalThis.TEACHHELPER_APP_VERSION = '44';\n"],
  ]);
  const gitCalls = [];
  const result = stampAppVersion({
    git: (...args) => {
      gitCalls.push(args);
      if (args[0] === 'diff') return '';
      return '';
    },
    readFile: (path) => sources.get(path),
    writeFile: (path, source) => sources.set(path, source),
  });

  assert.deepEqual(result, { appVersion: '45' });
  assert.equal(sources.get(APP_VERSION_PATH), "globalThis.TEACHHELPER_APP_VERSION = '45';\n");
  assert.deepEqual(gitCalls.at(-1), ['add', '--', APP_VERSION_PATH]);
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
