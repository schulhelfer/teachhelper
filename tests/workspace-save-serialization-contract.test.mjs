import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [runtimeSource, gradesSource] = await Promise.all([
  readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('explizite und automatische Datenbank-Speicherungen werden serialisiert', () => {
  const explicitStart = runtimeSource.indexOf('  async saveGradeVaultChanges()');
  const explicitEnd = runtimeSource.indexOf('\n  scheduleGradeVaultBackgroundAutoLock', explicitStart);
  assert.ok(explicitStart >= 0 && explicitEnd > explicitStart, 'saveGradeVaultChanges must exist');
  const explicitSource = runtimeSource.slice(explicitStart, explicitEnd);
  assert.match(explicitSource, /this\.enqueueConnectedFileSave\('grade-vault-explicit-save'\)/);

  const enqueueStart = runtimeSource.indexOf("  enqueueConnectedFileSave(reason = 'save')");
  const enqueueEnd = runtimeSource.indexOf("\n  queueSyncSave(reason = 'auto-save')", enqueueStart);
  assert.ok(enqueueStart >= 0 && enqueueEnd > enqueueStart, 'enqueueConnectedFileSave must exist');
  const enqueueSource = runtimeSource.slice(enqueueStart, enqueueEnd);
  assert.match(enqueueSource, /this\.operationTail\.then\(save, save\)/);
  assert.match(enqueueSource, /this\.operationTail = operation\.catch\(\(\) => undefined\)/);

  const autoSaveStart = runtimeSource.indexOf("  queueSyncSave(reason = 'auto-save')");
  const autoSaveEnd = runtimeSource.indexOf('\n  async saveManualDatabase()', autoSaveStart);
  assert.ok(autoSaveStart >= 0 && autoSaveEnd > autoSaveStart, 'queueSyncSave must exist');
  const autoSaveSource = runtimeSource.slice(autoSaveStart, autoSaveEnd);
  assert.match(autoSaveSource, /this\.enqueueConnectedFileSave\(reason\)/);

  assert.match(gradesSource, /enqueueConnectedFileSave\?\.\("before-create-empty"\)/);
});
