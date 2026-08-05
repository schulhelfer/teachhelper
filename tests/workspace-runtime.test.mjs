import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const loadSourceUrl = async (path) => dataUrl(await readFile(new URL(path, import.meta.url), 'utf8'));

const [thdbUrl, syncUrl, defaultsUrl, messagesUrl, cryptoUrl] = await Promise.all([
  loadSourceUrl('../src/shared/school-data/thdb.js'),
  loadSourceUrl('../src/shared/school-data/sync-safety.js'),
  loadSourceUrl('../src/shared/school-data/defaults.js'),
  loadSourceUrl('../src/shared/school-data/messages.js'),
  loadSourceUrl('../src/modules/workspace/crypto.js'),
]);
const archiveUrl = dataUrl(`
  export async function buildWorkspaceArchivePdfBytes() { return new Uint8Array(); }
  export function downloadWorkspaceArchivePdf() {}
`);
let runtimeSource = await readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8');
for (const [path, url] of [
  ['../../shared/school-data/thdb.js', thdbUrl],
  ['../../shared/school-data/sync-safety.js', syncUrl],
  ['../../shared/school-data/defaults.js', defaultsUrl],
  ['../../shared/school-data/messages.js', messagesUrl],
  ['./crypto.js', cryptoUrl],
  ['./archive-pdf.js', archiveUrl],
]) runtimeSource = runtimeSource.replace(path, url);

const [{ WorkspaceRuntime }, messages] = await Promise.all([
  import(dataUrl(runtimeSource)),
  import(messagesUrl),
]);

function emptyGrades() {
  return {
    counters: {}, gradeStructures: [], gradeAssessments: [], gradeStudents: [],
    gradeEntries: [], gradeOverrides: [], gradeImports: [], gradeSeatPlans: [], gradeAccommodations: [],
  };
}

class FakeStore {
  constructor() {
    this.publicState = { settings: { activeSchoolYearId: 1 }, schoolYears: [{ id: 1 }], courses: [{ id: 7, name: '7a' }] };
    this.gradeState = emptyGrades();
    this.settings = new Map();
  }
  setAfterSaveHooks(hooks) { this.hooks = hooks; }
  exportPublicStateSnapshot() { return structuredClone(this.publicState); }
  exportGradeVaultStateSnapshot() { return structuredClone(this.gradeState); }
  replaceGradeVaultState(state) { this.gradeState = this.normalizeGradeVaultState(state); }
  normalizeGradeVaultState(state) { return { ...emptyGrades(), ...(structuredClone(state) || {}) }; }
  getGradeVaultEncryptionEnabled() { return Boolean(this.settings.get('gradeVaultEncryptionEnabled')); }
  setGradeVaultEncryptionEnabled(value) { this.settings.set('gradeVaultEncryptionEnabled', Boolean(value)); }
  getSetting(key, fallback = null) { return this.settings.has(key) ? this.settings.get(key) : fallback; }
  setSetting(key, value) { this.settings.set(key, structuredClone(value)); }
  setHoursPerDay(value) { this.settings.set('hoursPerDay', Number(value)); }
  getHoursPerDay() { return Number(this.settings.get('hoursPerDay')) || 8; }
  setLessonTimes(value) { this.settings.set('lessonTimes', structuredClone(value)); }
  setBackupEnabled(value) { this.settings.set('backupEnabled', Boolean(value)); }
  setBackupIntervalDays(value) { this.settings.set('backupIntervalDays', Number(value)); }
  getBackupEnabled() { return this.settings.get('backupEnabled') !== false; }
  getBackupIntervalDays() { return Number(this.settings.get('backupIntervalDays')) || 7; }
}

test('workspace runtime emits strictly scoped snapshots', () => {
  const store = new FakeStore();
  store.gradeState = {
    ...emptyGrades(),
    gradeStudents: [{ id: 10, courseId: 7, firstName: 'Geheim' }],
    gradeAssessments: [{ id: 20, courseId: 7, title: 'Test', date: '2026-09-01' }],
    gradeEntries: [{ studentId: 10, assessmentId: 20, value: 12 }],
  };
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.loadedCourseId = 7;
  runtime.rememberPerformanceIndex(7, store.gradeState);

  const planning = runtime.createWorkspaceSnapshot('planning');
  assert.equal('gradeState' in planning, false);
  assert.equal('status' in planning, false);
  assert.deepEqual(planning.assessmentIndex, [{ courseId: 7, assessmentId: 20, date: '2026-09-01', title: 'Test' }]);

  const shell = runtime.createWorkspaceSnapshot('shell');
  assert.equal('publicState' in shell, false);
  assert.equal('gradeState' in shell, false);
  assert.equal('password' in shell, false);

  const grades = runtime.createWorkspaceSnapshot('grades');
  assert.equal(grades.activeCourseId, 7);
  assert.equal(grades.gradeState.gradeEntries[0].value, 12);
});

test('ephemeral tutorial runtimes never reconnect database or backup handles', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), {
    eventTarget: new EventTarget(),
    ephemeral: true,
  });
  let reconnectCalls = 0;
  let backupCalls = 0;
  runtime.tryReconnectStoredSyncFile = async () => {
    reconnectCalls += 1;
    return true;
  };
  runtime.ensureBackupDirectoryReady = async () => {
    backupCalls += 1;
    return true;
  };
  runtime.bindController({ publish() {} });

  assert.equal(await runtime.initialize(), false);
  assert.equal(reconnectCalls, 0);
  assert.equal(backupCalls, 0);
  assert.equal(await runtime.openHandleDb(), null);
});

test('locking a vault clears every plaintext course cache', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.loadedCourseId = 7;
  runtime.courseCache.set(7, { ...emptyGrades(), gradeStudents: [{ id: 1, courseId: 7 }] });
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    cryptoKey: { opaque: true },
    config: { kdf: { salt: 'x' } },
  };
  await runtime.lockGradeVaultSession();
  assert.equal(runtime.courseCache.size, 0);
  assert.equal(runtime.loadedCourseId, null);
  assert.equal(runtime.vault.cryptoKey, null);
  assert.deepEqual(store.gradeState.gradeStudents, []);
});

test('disabling an unlocked vault clears its encryption configuration', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  let changedScope = '';
  runtime.bindController({ markChanged(scope) { changedScope = scope; } });
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    cryptoKey: { opaque: true },
    kdf: { salt: 'x' },
    config: { configured: true, kdf: { salt: 'x' }, validation: { ciphertext: 'x' } },
  };

  assert.equal(await runtime.setGradeVaultEncryptionEnabledFromSettings(false), true);
  assert.equal(runtime.isGradeVaultEncryptionEnabled(), false);
  assert.equal(runtime.vault.configured, false);
  assert.equal(runtime.vault.cryptoKey, null);
  assert.equal(store.getGradeVaultEncryptionEnabled(), false);
  assert.equal(changedScope, 'grades');
});

test('read-only roster summaries never replace or publish the active grade course', async () => {
  const store = new FakeStore();
  store.gradeState = {
    ...emptyGrades(),
    gradeStudents: [{ id: 70, courseId: 7, firstName: 'Aktiv' }],
  };
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.loadedCourseId = 7;
  runtime.courseCache.set(8, {
    ...emptyGrades(),
    gradeStudents: [
      { id: 80, courseId: 8, firstName: 'Ada' },
      { id: 81, courseId: 8, firstName: 'Bea' },
      { id: 82, courseId: 8, isPlaceholder: true },
    ],
  });
  let publishCount = 0;
  runtime.bindController({ publish() { publishCount += 1; } });

  assert.deepEqual(await runtime.getGradeCourseRosterSummary(8), {
    courseId: 8,
    studentCount: 2,
  });
  assert.equal(runtime.loadedCourseId, 7);
  assert.equal(store.gradeState.gradeStudents[0].courseId, 7);
  assert.equal(publishCount, 0);
});

test('concurrent requests for the same grade course are serialized without a late second publish', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.courseCache.set(7, {
    ...emptyGrades(),
    gradeStudents: [{ id: 70, courseId: 7, firstName: 'Aktiv' }],
  });
  let publishCount = 0;
  runtime.bindController({ publish(scope) { if (scope === 'grades') publishCount += 1; } });

  const [first, second] = await Promise.all([
    runtime.ensureGradeCourseLoaded(7),
    runtime.ensureGradeCourseLoaded(7),
  ]);

  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(runtime.loadedCourseId, 7);
  assert.equal(publishCount, 1);
});

test('temporarily loading an initially supplied course retains its participants', async () => {
  const store = new FakeStore();
  store.gradeState = {
    ...emptyGrades(),
    gradeStudents: [{ id: 70, courseId: 7, firstName: 'Aktiv' }],
  };
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });

  const students = await runtime.withTemporaryGradeCourse(7, () => structuredClone(store.gradeState.gradeStudents));

  assert.deepEqual(students, [{ id: 70, courseId: 7, firstName: 'Aktiv' }]);
  assert.equal(runtime.loadedCourseId, 7);
  assert.equal(runtime.courseCache.get(7).gradeStudents.length, 1);
});

test('workspace settings operations reject fields from the wrong client group', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  await assert.rejects(runtime.handleWorkspaceCommand({
    client: 'grades',
    command: messages.WORKSPACE_COMMAND_APPLY_SETTINGS,
    payload: { settings: { hoursPerDay: 9 } },
  }), /Unzulässige Einstellungsfelder/);
  await runtime.handleWorkspaceCommand({
    client: 'planning',
    command: messages.WORKSPACE_COMMAND_APPLY_SETTINGS,
    payload: { settings: { hoursPerDay: 9 } },
  });
  assert.equal(store.getHoursPerDay(), 9);
});

test('latest directory backup is selected and loaded by the workspace', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  const loaded = [];
  runtime.loadBytes = async (bytes, source) => loaded.push({ bytes: [...bytes], source });
  const entry = (name, value) => ({
    kind: 'file', name,
    async getFile() { return { async arrayBuffer() { return Uint8Array.of(value).buffer; } }; },
  });
  runtime.backupDirectoryHandle = {
    async *values() {
      yield entry('ignore.txt', 1);
      yield entry('Planung-Backup-2026-01-01.json', 2);
      yield entry('TeachHelper-Backup-2026-02-01.json', 3);
    },
  };
  assert.equal(await runtime.restoreLatestWebBackup(), true);
  assert.deepEqual(loaded, [{ bytes: [3], source: 'backup' }]);
});

test('new backups use the TeachHelper backup filename while legacy backups remain restorable', () => {
  assert.match(runtimeSource, /TeachHelper-Backup-\$\{stamp\}\.json/);
  assert.match(runtimeSource, /TeachHelper-Backup-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.json/);
  assert.match(runtimeSource, /\^\(\?:Planung-Backup-\|TeachHelper-Backup-\)/);
});

test('explicit database selection requires a fresh backup directory, while startup reconnect keeps it', () => {
  assert.match(runtimeSource, /const preserveBackupDirectory = String\(mode \|\| ''\) === 'reconnect';[\s\S]*?this\.backupDirectoryHandle = null;/);
  assert.match(runtimeSource, /await this\.removeStoredHandle\(HANDLE_BACKUP_KEY\);[\s\S]*?this\.controller\?\.markChanged\?\.\('shell'\);/);
  assert.match(runtimeSource, /return this\.acceptWorkspaceSyncFileHandle\(handle, 'reconnect'\);/);
});
