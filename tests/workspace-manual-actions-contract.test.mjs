import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [componentsSource, runtimeSource, storeSource, planningSource, gradesSource] = await Promise.all([
  readFile(new URL('../src/modules/workspace/components.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('eine neue leere Datenbank ersetzt den aktiven Stand in beiden Persistenzmodi', () => {
  assert.match(componentsSource, /id="db-manual-load-btn" type="button">Bestehende Datenbankdatei auswählen<\/button>/);
  assert.match(componentsSource, /id="db-manual-save-btn" type="button">Leere Datenbankdatei neu anlegen<\/button>/);
  assert.match(runtimeSource, /buildEmptyDatabaseContainer\(reason = 'create-empty', \{ schoolYearStart = null \} = \{\}\)[\s\S]*?gradeCourseSegments: \[\]/);
  assert.match(runtimeSource, /const isEmptyDatabase = \[[\s\S]*?allowEmpty: isEmptyDatabase/);
  assert.match(storeSource, /const allowEmpty = options\?\.allowEmpty === true;[\s\S]*?if \(!allowEmpty\) this\.ensureDefaultSchoolYear\(\);/);
  assert.match(runtimeSource, /async connectEmptyWorkspaceFile\(handle, options = \{\}\)[\s\S]*?isCurrentWorkspaceFileHandle\(handle\)[\s\S]*?writeAndVerifyFileBytes[\s\S]*?await this\.loadBytes\(built\.bytes, 'new-empty'\)/);
  assert.match(runtimeSource, /async createEmptyManualDatabase\(options = \{\}\) \{[\s\S]*?downloadBytes\(built\.bytes, fileName\);[\s\S]*?await this\.loadBytes\(built\.bytes, 'manual-create-empty'\)/);
  assert.match(planningSource, /dbManualSaveBtn\.addEventListener\("click", \(\) => \{\s+void this\.startEmptyDatabase\(\);/);
  assert.match(gradesSource, /dbManualSaveBtn\?\.addEventListener\("click", \(\) => \{\s+void this\.startEmptyDatabase\(\);/);
  assert.match(planningSource, /alternateText: "Verwerfen & neu starten"/);
  assert.match(gradesSource, /alternateText: "Verwerfen & neu starten"/);
  assert.match(planningSource, /chooseInitialDatabaseSchoolYear\(\)[\s\S]*?showSelectMessage\([\s\S]*?selectOptions:/);
  assert.match(gradesSource, /chooseInitialDatabaseSchoolYear\(\)[\s\S]*?showSelectMessage\([\s\S]*?selectOptions:/);
  assert.match(planningSource, /selectSyncFile\("new-empty", \{ schoolYearStart \}\)/);
  assert.match(gradesSource, /selectSyncFile\("new-empty", \{ schoolYearStart \}\)/);
});
