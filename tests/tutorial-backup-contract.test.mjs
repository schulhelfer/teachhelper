import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [mainSource, tutorialSource] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/first-run-tutorial.js', import.meta.url), 'utf8'),
]);

test('ein Tutorial erstellt bei eingerichteter Persistenz zuerst ein Backup', () => {
  assert.match(mainSource, /async function createBackupBeforeTutorialStart\(\)/);
  assert.match(mainSource, /const result = await runGuardBackup\('tutorial'\);/);
  assert.match(mainSource, /beforeStart: createBackupBeforeTutorialStart/);
});

test('der Backup-Gate überspringt nur ohne Persistenz und meldet sonst den Grund', () => {
  assert.match(mainSource, /if \(!isGuardBackupPossible\(\)\) \{\s+return \{ ok: true, skipped: true, reason: '' \};/);
  assert.match(
    mainSource,
    /createLatestWebBackup\?\.\(mode, false\)/,
    'der Gate darf nicht im silent-Modus laufen, sonst geht der Fehlergrund verloren',
  );
});

test('der zentrale Tutorial-Einstieg wartet auf seine Vorbereitung', () => {
  assert.match(tutorialSource, /beforeStart = async \(\) => true/);
  assert.match(tutorialSource, /const allowed = await beforeStart\(\);/);
  assert.match(tutorialSource, /function startFromEntry\(\) \{\s+return start\(\{ markStarted: true \}\);/);
});
