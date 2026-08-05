import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [planningSource, gradesSource, planningCss, gradesCss] = await Promise.all([
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

test('settings tabs remain visible but locked outside database until database and backup folder are connected', () => {
  assert.match(planningSource, /const isDatabaseLock = this\.locked && this\.lockReason === "databaseRequired";[\s\S]*?const isBackupDirectoryLock = this\.locked && this\.lockReason === "backupDirRequired";[\s\S]*?const isPersistenceSetupLock = isDatabaseLock \|\| isBackupDirectoryLock;[\s\S]*?const isHidden = isLockedHidden;[\s\S]*?const isLockedDisabled = isHidden \|\| \(isPersistenceSetupLock && button\.dataset\.tab !== "database"\);/);
  assert.doesNotMatch(planningSource, /isBackupDirectoryLockHidden/);
  assert.match(planningSource, /\(this\.lockReason === "databaseRequired" \|\| this\.lockReason === "backupDirRequired"\)[\s\S]*?tabName !== "database"/);
  assert.match(gradesSource, /const isDatabaseLock = this\.lockReason === "databaseRequired";[\s\S]*?const isBackupDirectoryLock = this\.lockReason === "backupDirRequired";[\s\S]*?const isPersistenceSetupLock = isDatabaseLock \|\| isBackupDirectoryLock;[\s\S]*?button\.disabled = !visible \|\| \(isPersistenceSetupLock && button\.dataset\.tab !== "database"\);/);
  assert.match(gradesSource, /\(this\.lockReason === "databaseRequired" \|\| this\.lockReason === "backupDirRequired"\)[\s\S]*?tabName !== "database"/);
  for (const cssSource of [planningCss, gradesCss]) {
    assert.match(cssSource, /\.settings-tab:disabled \{\s+cursor: not-allowed;\s+opacity: 0\.45;/);
  }
});
