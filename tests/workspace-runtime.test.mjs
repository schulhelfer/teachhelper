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

const [{ WorkspaceRuntime }, messages, workspaceCrypto] = await Promise.all([
  import(dataUrl(runtimeSource)),
  import(messagesUrl),
  import(cryptoUrl),
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

test('public planning changes automatically save to a connected database without touching the grade vault', () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  runtime.fileHandle = { name: 'planung.thdb' };
  runtime.isManualPersistenceMode = () => false;
  const reasons = [];
  runtime.queueSyncSave = (reason) => {
    reasons.push(reason);
    return true;
  };
  let scope = '';
  runtime.bindController({ markChanged(nextScope) { scope = nextScope; } });

  runtime.onPublicChanged();

  assert.equal(runtime.publicDirty, true);
  assert.equal(runtime.manualDirty, true);
  assert.equal(scope, 'planning');
  assert.deepEqual(reasons, ['planning-auto-save']);
});

test('public planning changes do not trigger downloads in manual persistence mode', () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  runtime.isManualPersistenceMode = () => true;
  let saveCalls = 0;
  runtime.queueSyncSave = () => { saveCalls += 1; return true; };

  runtime.onPublicChanged();

  assert.equal(saveCalls, 0);
  assert.equal(runtime.publicDirty, true);
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
    autoLockWarning: {
      active: true,
      blockedAt: Date.now() - 1000,
      retryAt: Date.now() + 1000,
      message: 'Ungespeicherte Notenänderungen müssen vor dem Sperren gespeichert werden.',
    },
  };
  await runtime.lockGradeVaultSession();
  assert.equal(runtime.courseCache.size, 0);
  assert.equal(runtime.loadedCourseId, null);
  assert.equal(runtime.vault.cryptoKey, null);
  assert.equal(runtime.vault.autoLockWarning, null);
  assert.deepEqual(store.gradeState.gradeStudents, []);
});

test('a dirty vault rejects manual locking with a typed error and keeps plaintext state intact', async () => {
  const store = new FakeStore();
  store.gradeState = {
    ...emptyGrades(),
    gradeStudents: [{ id: 1, courseId: 7, firstName: 'Ada' }],
  };
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.loadedCourseId = 7;
  runtime.courseCache.set(7, structuredClone(store.gradeState));
  runtime.dirtyCourseIds.add(7);
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    cryptoKey: { opaque: true },
    config: { kdf: { salt: 'x' } },
  };

  await assert.rejects(
    runtime.lockGradeVaultSession(),
    (error) => error?.code === messages.WORKSPACE_ERROR_VAULT_DIRTY,
  );
  assert.equal(runtime.isGradeVaultUnlocked(), true);
  assert.equal(runtime.loadedCourseId, 7);
  assert.equal(runtime.courseCache.has(7), true);
  assert.equal(store.gradeState.gradeStudents[0].firstName, 'Ada');
  runtime.clearGradeVaultAutoLockTimer();
});

test('discarding dirty grade changes restores a lockable persisted vault state', async () => {
  const store = new FakeStore();
  store.gradeState = {
    ...emptyGrades(),
    gradeStudents: [{ id: 1, courseId: 7, firstName: 'Ungespeichert' }],
  };
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  const config = { configured: true, kdf: { salt: 'x' }, validation: { ciphertext: 'x' } };
  runtime.loadedCourseId = 7;
  runtime.courseCache.set(7, structuredClone(store.gradeState));
  runtime.performanceIndexCache.set(7, [{ courseId: 7, title: 'Zwischenspeicher' }]);
  runtime.dirtyCourseIds.add(7);
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    cryptoKey: { opaque: true },
    config,
    persistedConfig: structuredClone(config),
    persistedCryptoKey: { opaque: true },
  };

  assert.equal(await runtime.discardGradeVaultChanges(), true);
  assert.equal(runtime.dirtyCourseIds.size, 0);
  assert.equal(runtime.courseCache.size, 0);
  assert.equal(runtime.performanceIndexCache.size, 0);
  assert.equal(runtime.loadedCourseId, null);
  assert.deepEqual(store.gradeState.gradeStudents, []);
  assert.equal(await runtime.lockGradeVaultSession(), true);
  assert.equal(runtime.isGradeVaultUnlocked(), false);
  assert.equal(runtime.vault.persistedCryptoKey, null);
});

test('auto-lock keeps dirty grades unlocked in manual download mode, publishes a warning, and retries after ten minutes', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    cryptoKey: { opaque: true },
    config: { kdf: { salt: 'x' } },
  };
  runtime.dirtyCourseIds.add(7);
  let changedScope = '';
  let retryDelay = 0;
  let saveCalls = 0;
  runtime.bindController({ markChanged(scope) { changedScope = scope; } });
  runtime.scheduleGradeVaultAutoLock = (delay) => { retryDelay = delay; };
  runtime.isManualPersistenceMode = () => true;
  runtime.saveToConnectedFile = async () => { saveCalls += 1; return true; };

  assert.equal(await runtime.handleGradeVaultAutoLockTimeout(), false);
  assert.equal(runtime.isGradeVaultUnlocked(), true);
  assert.equal(changedScope, 'grades');
  assert.equal(saveCalls, 0);
  assert.equal(retryDelay, 10 * 60 * 1000);
  const warning = runtime.createWorkspaceSnapshot('shell').vault.autoLockWarning;
  assert.equal(warning.active, true);
  assert.match(warning.message, /manuellen Download-Modus/);
  assert.ok(warning.retryAt > Date.now());
});

test('auto-lock saves every dirty grade course to a connected database before locking', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    cryptoKey: { opaque: true },
    config: { kdf: { salt: 'x' } },
  };
  runtime.fileHandle = { name: 'noten.thdb' };
  runtime.isManualPersistenceMode = () => false;
  runtime.dirtyCourseIds.add(7);
  runtime.dirtyCourseIds.add(8);
  const order = [];
  runtime.saveToConnectedFile = async (reason) => {
    order.push(`save:${reason}`);
    runtime.dirtyCourseIds.clear();
    return true;
  };
  const lockGradeVaultSession = runtime.lockGradeVaultSession.bind(runtime);
  runtime.lockGradeVaultSession = async () => {
    order.push('lock');
    return lockGradeVaultSession();
  };

  assert.equal(await runtime.handleGradeVaultAutoLockTimeout(), true);
  assert.deepEqual(order, ['save:grade-vault-auto-lock', 'lock']);
  assert.equal(runtime.dirtyCourseIds.size, 0);
  assert.equal(runtime.isGradeVaultUnlocked(), false);
});

test('auto-lock locks a clean vault without saving', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    cryptoKey: { opaque: true },
    config: { kdf: { salt: 'x' } },
  };
  let saveCalls = 0;
  runtime.saveToConnectedFile = async () => { saveCalls += 1; return true; };

  assert.equal(await runtime.handleGradeVaultAutoLockTimeout(), true);
  assert.equal(saveCalls, 0);
  assert.equal(runtime.isGradeVaultUnlocked(), false);
});

test('auto-lock leaves dirty grades unlocked when automatic saving fails', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    cryptoKey: { opaque: true },
    config: { kdf: { salt: 'x' } },
  };
  runtime.fileHandle = { name: 'noten.thdb' };
  runtime.isManualPersistenceMode = () => false;
  runtime.dirtyCourseIds.add(7);
  runtime.saveToConnectedFile = async () => {
    throw new Error('Dateikonflikt');
  };
  let retryDelay = 0;
  runtime.scheduleGradeVaultAutoLock = (delay) => { retryDelay = delay; };

  assert.equal(await runtime.handleGradeVaultAutoLockTimeout(), false);
  assert.equal(runtime.isGradeVaultUnlocked(), true);
  assert.equal(runtime.dirtyCourseIds.has(7), true);
  assert.match(runtime.vault.autoLockWarning.message, /Dateikonflikt/);
  assert.equal(retryDelay, 10 * 60 * 1000);
});

test('auto-lock leaves dirty grades unlocked when no database file is connected', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    cryptoKey: { opaque: true },
    config: { kdf: { salt: 'x' } },
  };
  runtime.isManualPersistenceMode = () => false;
  runtime.dirtyCourseIds.add(7);
  let saveCalls = 0;
  let retryDelay = 0;
  runtime.saveToConnectedFile = async () => { saveCalls += 1; return true; };
  runtime.scheduleGradeVaultAutoLock = (delay) => { retryDelay = delay; };

  assert.equal(await runtime.handleGradeVaultAutoLockTimeout(), false);
  assert.equal(runtime.isGradeVaultUnlocked(), true);
  assert.equal(saveCalls, 0);
  assert.match(runtime.vault.autoLockWarning.message, /keine Datenbankdatei verbunden/);
  assert.equal(retryDelay, 10 * 60 * 1000);
});

test('grade-vault activity postpones a blocked auto-lock retry to the normal idle period', () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    cryptoKey: { opaque: true },
    config: { kdf: { salt: 'x' } },
    autoLockWarning: { active: true, blockedAt: Date.now(), retryAt: Date.now() + 600000, message: 'Speichern' },
  };
  let scheduledDelay = 0;
  runtime.scheduleGradeVaultAutoLock = (delay) => { scheduledDelay = delay; };

  runtime.recordGradeVaultActivity();

  assert.equal(scheduledDelay, 45 * 60 * 1000);
  assert.equal(runtime.vault.autoLockWarning.active, true);
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

test('unlocking a legacy PBKDF2 vault upgrades its KDF and stages every course for rewrite', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  const password = 'ein-ausreichend-langes-passwort';
  const legacyKdf = workspaceCrypto.createWorkspaceVaultKdf({ iterations: 250000 });
  const { cryptoKey } = await workspaceCrypto.deriveWorkspaceVaultKey(password, legacyKdf);
  const validation = await workspaceCrypto.encryptWorkspaceVaultText(
    'teachhelper-grade-vault-v1',
    cryptoKey,
    legacyKdf,
    { type: 'validation' },
  );
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: false,
    config: { configured: true, kdf: legacyKdf, validation },
    cryptoKey: null,
    kdf: legacyKdf,
  };
  runtime.loadedCourseId = 7;
  runtime.courseCache.set(7, {
    ...emptyGrades(),
    gradeStudents: [{ id: 70, courseId: 7, firstName: 'Ada' }],
  });

  assert.equal(await runtime.unlockGradeVault(password), true);
  assert.equal(runtime.vault.config.kdf.iterations, workspaceCrypto.WORKSPACE_VAULT_KDF_ITERATIONS);
  assert.equal(runtime.vault.kdf.iterations, workspaceCrypto.WORKSPACE_VAULT_KDF_ITERATIONS);
  assert.equal(runtime.dirtyCourseIds.has(7), true);
  assert.equal(runtime.courseCache.get(7).gradeStudents[0].firstName, 'Ada');
  runtime.fileHandle = { name: 'noten.thdb' };
  runtime.isManualPersistenceMode = () => false;
  let autoSaveCalls = 0;
  runtime.saveToConnectedFile = async (reason) => {
    autoSaveCalls += 1;
    assert.equal(reason, 'grade-vault-auto-lock');
    runtime.dirtyCourseIds.clear();
    return true;
  };

  assert.equal(await runtime.handleGradeVaultAutoLockTimeout(), true);
  assert.equal(autoSaveCalls, 1);
  assert.equal(runtime.isGradeVaultUnlocked(), false);
  assert.equal(runtime.dirtyCourseIds.size, 0);
  runtime.clearGradeVaultAutoLockTimer();
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
