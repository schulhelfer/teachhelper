import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [planningSource, gradesSource, planningCss, gradesCss] = await Promise.all([
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

test('der Einrichtungsstatus markiert beide Module bis Datenbank und Backup-Ordner verbunden sind', () => {
  for (const source of [planningSource, gradesSource]) {
    assert.match(source, /const persistenceSetupRequired = !this\.tutorialDemoMode;/);
    assert.match(
      source,
      /document\.body\.dataset\.persistenceSetupPending = \(databaseRequired \|\| backupDirRequired\) \? "true" : "false"/,
    );
  }
});

test('gesperrte Kernflächen verwenden während der Einrichtung den nativen Sperr-Cursor', () => {
  assert.match(planningCss, /body\[data-persistence-setup-pending="true"\] #sidebar-course-list button\[data-add-course\],[\s\S]*?#view-week-btn,[\s\S]*?#view-week \*,[\s\S]*?#week-table \* \{[\s\S]*?cursor: not-allowed !important;/);
  assert.match(gradesCss, /body\[data-persistence-setup-pending="true"\] #sidebar-course-list button\[data-add-course\],[\s\S]*?#view-grades-entry-btn,[\s\S]*?#grades-entry-content \* \{[\s\S]*?cursor: not-allowed !important;/);
});
