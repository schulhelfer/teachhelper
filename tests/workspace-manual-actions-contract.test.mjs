import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [componentsSource, runtimeSource, planningSource, gradesSource] = await Promise.all([
  readFile(new URL('../src/modules/workspace/components.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('die manuelle Datenbankverwaltung verwendet dieselben Entscheidungen wie der automatische Modus', () => {
  assert.match(componentsSource, /id="db-manual-load-btn" type="button">Bestehende Datenbankdatei auswählen<\/button>/);
  assert.match(componentsSource, /id="db-manual-save-btn" type="button">Leere Datenbankdatei neu anlegen<\/button>/);
  assert.match(runtimeSource, /async createEmptyManualDatabase\(\) \{[\s\S]*?gradeCourseSegments: \[\],[\s\S]*?reason: 'manual-create-empty'/);
  assert.match(planningSource, /dbManualSaveBtn\.addEventListener\("click", \(\) => \{\s+void this\.createEmptyManualDatabase\(\);/);
  assert.match(gradesSource, /dbManualSaveBtn\?\.addEventListener\("click", \(\) => \{\s+void this\.createEmptyManualDatabase\(\);/);
});
