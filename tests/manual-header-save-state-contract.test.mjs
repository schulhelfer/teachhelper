import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [shellSource, shellStyles, planningSource, gradesSource] = await Promise.all([
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('die Menüleiste reserviert im manuellen Speichermodus Platz für den Kopfzeilen-Button', () => {
  assert.match(shellStyles, /--manual-save-menu-offset: 0px;/);
  assert.match(
    shellStyles,
    /\.app\.app-planning-manual-save-visible \{\s+--manual-save-menu-offset: calc\(var\(--chrome-toggle-size\) \+ 10px\);/,
  );
  assert.match(
    shellStyles,
    /padding-left: calc\(var\(--planning-menu-start-x\) - var\(--chrome-overlay-clearance\) \+ var\(--manual-save-menu-offset\)\);/,
  );
});

test('der manuelle Kopfzeilen-Speicherbutton ist ohne exportierbare Änderungen gesperrt', () => {
  assert.match(shellSource, /const hasManualChanges = Boolean\(state\.planningManualSaveState\.dirty\);/);
  assert.match(shellSource, /disabled = hidden \|\| !hasManualChanges \|\| state\.chromeTransitionState !== 'idle';/);
  assert.match(shellSource, /'Datenbank speichern'/);
  assert.match(shellSource, /Keine zu speichernden Änderungen/);
  assert.match(shellSource, /\|\| !state\.planningManualSaveState\.dirty/);
});

test('Planung und Noten leiten den Kopfzeilen-Zustand vom gemeinsamen manuellen Persistenzstatus ab', () => {
  assert.match(planningSource, /const persistence = this\.getWorkspacePersistenceStatus\(\);[\s\S]*?const dirty = isManualMode && Boolean\(persistence\.dirty\);[\s\S]*?classroom:planning-manual-save-state/);
  assert.match(gradesSource, /getWorkspacePersistenceStatus\(\) \{[\s\S]*?snapshot\.persistence/);
  assert.match(gradesSource, /const persistence = this\.getWorkspacePersistenceStatus\(\);[\s\S]*?const dirty = isManualMode && Boolean\(persistence\.dirty\);[\s\S]*?classroom:grades-manual-save-state/);
});
