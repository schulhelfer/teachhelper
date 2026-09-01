import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [planningSource, gradesSource, shellSource] = await Promise.all([
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
]);

test('manuelle Backups warten in Planung und Noten auf ihr Ergebnis und melden es als Toast', () => {
  for (const source of [planningSource, gradesSource]) {
    assert.match(source, /async createManualWebBackup\(\) \{[\s\S]*?await this\.createLatestWebBackup\("manual"\);/);
    assert.match(source, /created \? "Backup erstellt\." : "Backup konnte nicht erstellt werden\."/);
    assert.match(source, /Backup konnte nicht erstellt werden\.\$\{detail\}/);
    assert.match(source, /async \(\) => \{\s+await this\.createManualWebBackup\(\);/);
  }
});

test('die Shell akzeptiert Toast-Anfragen nur aus dem Planungs- oder Notenmodul', () => {
  assert.match(shellSource, /const TOAST_REQUEST_EVENT = 'classroom:toast-request';/);
  assert.match(
    shellSource,
    /if \(data\.type === TOAST_REQUEST_EVENT\) \{[\s\S]*?if \(frame !== getPlanningFrame\(\) && frame !== getGradesFrame\(\)\) return;[\s\S]*?detail\.source !== 'iframe'[\s\S]*?showMessage\(message, variant, \{ presentation: 'toast' \}\);/,
  );
});
