import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [mainSource, tutorialSource] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/first-run-tutorial.js', import.meta.url), 'utf8'),
]);

test('ein Tutorial erstellt bei eingerichteter Persistenz zuerst ein Backup', () => {
  assert.match(mainSource, /async function createBackupBeforeTutorialStart\(\)/);
  assert.match(mainSource, /if \(!databaseConnected \|\| !backupDirectoryConnected\) return true;/);
  assert.match(mainSource, /createLatestWebBackup\?\.\('tutorial', true\)/);
  assert.match(mainSource, /beforeStart: createBackupBeforeTutorialStart/);
});

test('der zentrale Tutorial-Einstieg wartet auf seine Vorbereitung', () => {
  assert.match(tutorialSource, /beforeStart = async \(\) => true/);
  assert.match(tutorialSource, /const allowed = await beforeStart\(\);/);
  assert.match(tutorialSource, /function startFromEntry\(\) \{\s+return start\(\{ markStarted: true \}\);/);
});
