import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [bridgeSource, gradesBridgeSource, appSource] = await Promise.all([
  readFile(new URL('../src/app/planning-seatplan-bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('der Vorabmount meldet dem Notenmodul keinen aktiven Notentab', () => {
  const start = bridgeSource.indexOf('const initGradesTab');
  const end = bridgeSource.indexOf('const mountGradesTabNow');
  assert.ok(start >= 0 && end > start, 'initGradesTab muss vor mountGradesTabNow stehen');
  assert.doesNotMatch(bridgeSource.slice(start, end), /activeTab/);
});

test('der Layout-Refresh reicht den aktiven Tab an das Notenmodul weiter', () => {
  assert.match(
    bridgeSource,
    /if \(id === TAB_GRADES \|\| id === TAB_SEATPLAN\) detail\.activeTab = activeTab/,
  );
});

test('die Noten-Bridge leitet das Shell-Layout als Fensterereignis weiter', () => {
  const start = gradesBridgeSource.indexOf('if (data.type === SHELL_LAYOUT_EVENT) {');
  assert.ok(start >= 0, 'die Bridge muss das Shell-Layout behandeln');
  const branch = gradesBridgeSource.slice(start, gradesBridgeSource.indexOf('\n    }', start));
  assert.match(branch, /window\.dispatchEvent\(new CustomEvent\(SHELL_LAYOUT_EVENT, \{ detail \}\)\)/);
});

test('das Notenmodul gilt erst als sichtbar, wenn die Shell den Notentab meldet', () => {
  assert.match(appSource, /this\.gradesSurfaceRevealed = false;/);

  const start = appSource.indexOf('window.addEventListener("classroom:grades-shell-layout"');
  assert.ok(start >= 0, 'das Notenmodul muss auf das Shell-Layout hören');
  const listener = appSource.slice(start, appSource.indexOf('\n      });', start));
  assert.match(listener, /if \(String\(detail\?\.activeTab \|\| ""\) !== "grades"\) return;/);
  assert.match(listener, /this\.gradesSurfaceRevealed = true;/);
  assert.match(listener, /this\.promptGradeVaultUnlockForInitialCourse\(\);/);
});

test('die Sichtbarkeitswache läuft vor dem Verbrauch des Einmal-Flags', () => {
  const start = appSource.indexOf('  promptGradeVaultUnlockForInitialCourse()');
  const end = appSource.indexOf('\n  getShellGradeVaultStatusMode()', start);
  assert.ok(start >= 0 && end > start, 'promptGradeVaultUnlockForInitialCourse muss existieren');
  const promptSource = appSource.slice(start, end);

  const revealedGuard = promptSource.indexOf('if (!this.gradesSurfaceRevealed) {');
  const resolvedMarker = promptSource.indexOf('this.gradeVaultStartupUnlockPromptResolved = true');

  assert.ok(revealedGuard >= 0, 'der Startdialog muss auf die sichtbare Notenoberfläche warten');
  assert.ok(
    revealedGuard < resolvedMarker,
    'der verborgene Vorabmount darf das Einmal-Flag nicht verbrauchen',
  );
});
