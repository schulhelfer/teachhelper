import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const loadSourceUrl = async (path) => dataUrl(await readFile(new URL(path, import.meta.url), 'utf8'));

const [thdbUrl, syncUrl, defaultsUrl, messagesUrl, cryptoUrl, fileGuardsUrl] = await Promise.all([
  loadSourceUrl('../src/shared/school-data/thdb.js'),
  loadSourceUrl('../src/shared/school-data/sync-safety.js'),
  loadSourceUrl('../src/shared/school-data/defaults.js'),
  loadSourceUrl('../src/shared/school-data/messages.js'),
  loadSourceUrl('../src/modules/workspace/crypto.js'),
  loadSourceUrl('../src/shared/file-guards.js'),
]);
const archiveUrl = dataUrl(`
  export async function buildWorkspaceArchivePdfBytes() { return new Uint8Array(); }
  export function downloadWorkspaceArchivePdf() {}
`);
const storeUrl = dataUrl(`
  export function getDefaultSchoolYearStartYear(date = new Date()) {
    return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
  }
`);
let runtimeSource = await readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8');
for (const [path, url] of [
  ['../../shared/school-data/thdb.js', thdbUrl],
  ['../../shared/file-guards.js', fileGuardsUrl],
  ['../../shared/school-data/sync-safety.js', syncUrl],
  ['../../shared/school-data/defaults.js', defaultsUrl],
  ['../../shared/school-data/messages.js', messagesUrl],
  ['./store.js', storeUrl],
  ['./crypto.js', cryptoUrl],
  ['./archive-pdf.js', archiveUrl],
]) runtimeSource = runtimeSource.replace(path, url);

const [{ WorkspaceRuntime }, messages, workspaceCrypto, thdb] = await Promise.all([
  import(dataUrl(runtimeSource)),
  import(messagesUrl),
  import(cryptoUrl),
  import(thdbUrl),
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
    this.state = { settings: { ...this.publicState.settings } };
  }
  setAfterSaveHooks(hooks) { this.hooks = hooks; }
  _suspendSaveHooks() {}
  _resumeSaveHooks() {}
  exportPublicStateSnapshot() { return structuredClone(this.publicState); }
  exportGradeVaultStateSnapshot() { return structuredClone(this.gradeState); }
  normalizePublicState(state) {
    return structuredClone(state || {
      settings: { activeSchoolYearId: null },
      schoolYears: [], courses: [], slots: [], freeRanges: [], specialDays: [], lessons: [],
    });
  }
  buildNewDatabasePublicState(startYear) {
    const year = Number(startYear);
    const schoolYear = {
      id: 1,
      name: `${year}/${year + 1}`,
      startDate: `${year}-08-01`,
      endDate: `${year + 1}-07-31`,
    };
    const sourceYear = this.publicState.schoolYears.find((item) => (
      item.startDate === schoolYear.startDate && item.endDate === schoolYear.endDate
    ));
    const sourceFreeRanges = sourceYear
      ? (this.publicState.freeRanges || []).filter((item) => item.schoolYearId === sourceYear.id)
      : [{ label: 'Standardferien', startDate: `${year}-10-01`, endDate: `${year}-10-12` }];
    const sourceSpecialDays = sourceYear
      ? (this.publicState.specialDays || []).filter((item) => (
        item.dayDate >= schoolYear.startDate && item.dayDate <= schoolYear.endDate
      ))
      : [{ name: 'Standardfreier Tag', dayDate: `${year}-10-03` }];
    return {
      settings: { activeSchoolYearId: 1 },
      counters: { schoolYear: 2, freeRange: sourceFreeRanges.length + 1, specialDay: sourceSpecialDays.length + 1 },
      schoolYears: [schoolYear],
      courses: [], slots: [], lessons: [],
      freeRanges: sourceFreeRanges.map((item, index) => ({ ...item, id: index + 1, schoolYearId: 1 })),
      specialDays: sourceSpecialDays.map((item, index) => ({ ...item, id: index + 1 })),
    };
  }
  importDatabaseState(publicState, gradeState, options = {}) {
    this.publicState = this.normalizePublicState(publicState);
    this.gradeState = this.normalizeGradeVaultState(gradeState);
    this.state = { settings: { ...this.publicState.settings } };
    this.importOptions = options;
  }
  replaceGradeVaultState(state) { this.gradeState = this.normalizeGradeVaultState(state); }
  normalizeGradeVaultState(state) { return { ...emptyGrades(), ...(structuredClone(state) || {}) }; }
  getGradeVaultEncryptionEnabled() { return Boolean(this.settings.get('gradeVaultEncryptionEnabled')); }
  setGradeVaultEncryptionEnabled(value) { this.settings.set('gradeVaultEncryptionEnabled', Boolean(value)); }
  getGradeVaultAutoLockMinutes() {
    const value = Number(this.settings.get('gradeVaultAutoLockMinutes'));
    return [5, 15, 30, 45].includes(value) ? value : 30;
  }
  setGradeVaultAutoLockMinutes(value) {
    const minutes = Number(value);
    this.settings.set('gradeVaultAutoLockMinutes', [5, 15, 30, 45].includes(minutes) ? minutes : 30);
  }
  getGradeVaultAutoLockOnBackground() { return Boolean(this.settings.get('gradeVaultAutoLockOnBackground')); }
  setGradeVaultAutoLockOnBackground(value) { this.settings.set('gradeVaultAutoLockOnBackground', Boolean(value)); }
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
  store.setSetting('showGradeStudentPortraits', true);
  store.setSetting('showNameLearningModule', true);
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
  assert.equal(shell.vault.showGradeStudentPortraits, true);
  assert.equal(shell.vault.showNameLearningModule, true);

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

test('grade changes automatically save to a connected database', () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.fileHandle = { name: 'noten.thdb' };
  runtime.loadedCourseId = 7;
  runtime.isManualPersistenceMode = () => false;
  const reasons = [];
  runtime.queueSyncSave = (reason) => {
    reasons.push(reason);
    return true;
  };
  let scope = '';
  runtime.bindController({ markChanged(nextScope) { scope = nextScope; } });

  runtime.onGradeChanged();

  assert.equal(runtime.manualDirty, true);
  assert.equal(scope, 'grades');
  assert.deepEqual(reasons, ['grades-auto-save']);
  assert.equal(runtime.dirtyCourseIds.has(7), true);
});

test('grade changes do not trigger downloads in manual persistence mode', () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  runtime.isManualPersistenceMode = () => true;
  let saveCalls = 0;
  runtime.queueSyncSave = () => { saveCalls += 1; return true; };

  runtime.onGradeChanged();

  assert.equal(saveCalls, 0);
  assert.equal(runtime.manualDirty, true);
});

test('explizite Notenkursmutationen markieren den manuellen Speicherstatus und synchronisieren automatisch', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.loadedCourseId = 7;
  runtime.isManualPersistenceMode = () => false;
  runtime.fileHandle = { name: 'noten.thdb' };
  const reasons = [];
  runtime.queueSyncSave = (reason) => { reasons.push(reason); return true; };

  await runtime.runGradeCourseMutation(7, () => {
    store.gradeState.gradeStudents.push({ id: 10, courseId: 7, firstName: 'Ada' });
  });

  assert.equal(runtime.manualDirty, true);
  assert.equal(runtime.dirtyCourseIds.has(7), true);
  assert.deepEqual(reasons, ['grades-auto-save']);
});

test('explizite Notenkursmutationen können eine nachfolgende explizite Speicherung ohne parallelen Auto-Sync vorbereiten', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.loadedCourseId = 7;
  runtime.isManualPersistenceMode = () => false;
  runtime.fileHandle = { name: 'noten.thdb' };
  let saveCalls = 0;
  runtime.queueSyncSave = () => { saveCalls += 1; return true; };

  await runtime.runGradeCourseMutation(7, () => {
    store.gradeState.gradeStudents.push({ id: 10, courseId: 7, firstName: 'Ada' });
  }, { skipAutoSave: true });

  assert.equal(saveCalls, 0);
  assert.equal(runtime.dirtyCourseIds.has(7), true);
});

test('explizite Datenbank-Speicherungen laden nur im manuellen Modus herunter', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  let downloads = 0;
  runtime.saveManualDatabase = async () => { downloads += 1; return true; };

  runtime.isManualPersistenceMode = () => true;
  assert.equal(await runtime.persistExplicitDatabaseSave(), true);
  runtime.isManualPersistenceMode = () => false;
  assert.equal(await runtime.persistExplicitDatabaseSave(), true);
  assert.equal(downloads, 1);
});

test('explizites Notenspeichern wartet auf ein bereits eingereihtes automatisches Speichern', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  runtime.fileHandle = { name: 'noten.thdb' };
  runtime.isManualPersistenceMode = () => false;
  const events = [];
  let releaseAutoSave;
  const autoSaveReleased = new Promise((resolve) => { releaseAutoSave = resolve; });
  let signalAutoSaveStart;
  const autoSaveStarted = new Promise((resolve) => { signalAutoSaveStart = resolve; });
  runtime.saveToConnectedFile = async (reason) => {
    events.push(`start:${reason}`);
    if (reason === 'grades-auto-save') {
      signalAutoSaveStart();
      await autoSaveReleased;
    }
    events.push(`end:${reason}`);
    return true;
  };

  assert.equal(runtime.queueSyncSave('grades-auto-save'), true);
  await autoSaveStarted;
  const explicitSave = runtime.saveGradeVaultChanges();
  await Promise.resolve();
  assert.deepEqual(events, ['start:grades-auto-save']);

  releaseAutoSave();
  assert.equal(await explicitSave, true);
  await runtime.operationTail;
  assert.deepEqual(events, [
    'start:grades-auto-save',
    'end:grades-auto-save',
    'start:grade-vault-explicit-save',
    'end:grade-vault-explicit-save',
  ]);
});

test('ein leerer Datenbankcontainer bleibt beim Laden ohne Schuljahre und Kurse', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  const empty = runtime.buildEmptyDatabaseContainer();

  await runtime.loadBytes(empty.bytes, 'test');

  assert.deepEqual(store.publicState.schoolYears, []);
  assert.deepEqual(store.publicState.courses, []);
  assert.equal(store.importOptions.allowEmpty, true);
});

test('ein gewähltes erstes Schuljahr wird in den neuen Datenbankcontainer übernommen', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  const database = runtime.buildEmptyDatabaseContainer('test', { schoolYearStart: 2026 });

  await runtime.loadBytes(database.bytes, 'test');

  assert.deepEqual(runtime.store.publicState.schoolYears, [{
    id: 1, name: '2026/2027', startDate: '2026-08-01', endDate: '2027-07-31',
  }]);
  assert.equal(runtime.store.publicState.settings.activeSchoolYearId, 1);
});

test('ein neuer Datenbankcontainer übernimmt nur die Kalenderdaten des gewählten Schuljahrs', async () => {
  const store = new FakeStore();
  store.publicState = {
    settings: { activeSchoolYearId: 4 },
    schoolYears: [
      { id: 3, startDate: '2025-08-01', endDate: '2026-07-31' },
      { id: 4, startDate: '2026-08-01', endDate: '2027-07-31' },
    ],
    courses: [{ id: 9, schoolYearId: 4 }],
    slots: [{ id: 10, courseId: 9 }],
    lessons: [{ id: 11, courseId: 9 }],
    freeRanges: [
      { id: 12, schoolYearId: 3, label: 'Alt', startDate: '2025-10-01', endDate: '2025-10-10' },
      { id: 13, schoolYearId: 4, label: 'Herbstferien', startDate: '2026-10-12', endDate: '2026-10-24' },
    ],
    specialDays: [
      { id: 14, name: 'Alt', dayDate: '2025-10-03' },
      { id: 15, name: 'Neu', dayDate: '2026-10-03' },
    ],
  };
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  const database = runtime.buildEmptyDatabaseContainer('test', { schoolYearStart: 2026 });

  await runtime.loadBytes(database.bytes, 'test');

  assert.deepEqual(store.publicState.freeRanges, [{
    id: 1, schoolYearId: 1, label: 'Herbstferien', startDate: '2026-10-12', endDate: '2026-10-24',
  }]);
  assert.deepEqual(store.publicState.specialDays, [{ id: 1, name: 'Neu', dayDate: '2026-10-03' }]);
  assert.deepEqual(store.publicState.courses, []);
  assert.deepEqual(store.publicState.slots, []);
  assert.deepEqual(store.publicState.lessons, []);
});

test('ein nicht vorhandenes Schuljahr erhält Standardkalenderdaten', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  const database = runtime.buildEmptyDatabaseContainer('test', { schoolYearStart: 2031 });

  await runtime.loadBytes(database.bytes, 'test');

  assert.equal(store.publicState.freeRanges[0].label, 'Standardferien');
  assert.equal(store.publicState.specialDays[0].name, 'Standardfreier Tag');
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

test('a stored database handle is retained and re-authorized on the next user action', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  const handle = {
    name: 'Klasse-7a.thdb',
    async queryPermission() { return 'prompt'; },
    async requestPermission() { return 'granted'; },
  };
  let acceptedHandle = null;
  let acceptedMode = '';
  runtime.loadStoredHandle = async () => handle;
  runtime.acceptWorkspaceSyncFileHandle = async (nextHandle, mode) => {
    acceptedHandle = nextHandle;
    acceptedMode = mode;
    runtime.fileHandle = nextHandle;
    return true;
  };

  assert.equal(await runtime.tryReconnectStoredSyncFile(), false);
  assert.equal(runtime.storedFileHandle, handle);
  assert.equal(runtime.fileName, 'Klasse-7a.thdb');
  assert.equal(runtime.createWorkspaceSnapshot('shell').persistence.pendingFileName, 'Klasse-7a.thdb');

  assert.equal(await runtime.tryReconnectStoredSyncFile({ allowPrompt: true }), true);
  assert.equal(acceptedHandle, handle);
  assert.equal(acceptedMode, 'reconnect');
});

test('selecting a database handle explicitly requests persistent write access', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  const handle = {
    name: 'Klasse-7a.thdb',
    async queryPermission() { return 'prompt'; },
    async requestPermission() { return 'granted'; },
    async getFile() { return { async arrayBuffer() { return new Uint8Array().buffer; } }; },
  };
  let storedHandle = null;
  runtime.storeHandle = async (_key, value) => {
    storedHandle = value;
    return true;
  };
  runtime.loadBytes = async () => ({ ok: true });

  assert.equal(await runtime.acceptWorkspaceSyncFileHandle(handle), true);
  assert.equal(storedHandle, handle);
});

test('a stored backup directory is retained and re-authorized on the next user action', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  const handle = {
    name: 'TeachHelper-Backups',
    async queryPermission() { return 'prompt'; },
    async requestPermission() { return 'granted'; },
  };
  let changedScope = '';
  runtime.loadStoredHandle = async () => handle;
  runtime.bindController({ markChanged(scope) { changedScope = scope; } });

  assert.equal(await runtime.ensureBackupDirectoryReady(), false);
  assert.equal(runtime.backupDirectoryHandle, null);
  assert.equal(runtime.backupState.storedDirectoryHandle, handle);
  assert.equal(runtime.createWorkspaceSnapshot('shell').persistence.pendingBackupDirectoryName, 'TeachHelper-Backups');

  assert.equal(await runtime.ensureBackupDirectoryReady({ allowPrompt: true }), true);
  assert.equal(runtime.backupDirectoryHandle, handle);
  assert.equal(changedScope, 'shell');
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

test('only a successful auto-lock publishes an in-memory unlock notice', async () => {
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

  assert.equal(await runtime.lockGradeVaultSession(), true);
  assert.equal(runtime.createWorkspaceSnapshot('grades').status.vault.autoLockNotice.active, false);

  runtime.vault.unlocked = true;
  runtime.vault.cryptoKey = { opaque: true };
  assert.equal(await runtime.handleGradeVaultAutoLockTimeout(), true);
  const notice = runtime.createWorkspaceSnapshot('grades').status.vault.autoLockNotice;
  assert.ok(notice.id);
  assert.ok(notice.lockedAt > 0);
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

  assert.equal(scheduledDelay, 30 * 60 * 1000);
  assert.equal(runtime.vault.autoLockWarning.active, true);
});

test('grade-vault activity uses the configured auto-lock interval', () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.vault = { ...runtime.vault, encryptionEnabled: true, configured: true, unlocked: true, cryptoKey: { opaque: true } };
  let scheduledDelay = 0;
  runtime.scheduleGradeVaultAutoLock = (delay) => { scheduledDelay = delay; };

  for (const minutes of [5, 15, 30, 45]) {
    store.setGradeVaultAutoLockMinutes(minutes);
    runtime.recordGradeVaultActivity();
    assert.equal(scheduledDelay, minutes * 60 * 1000);
  }
});

test('background auto-lock uses the configured interval and locks after delayed visibility restoration', async () => {
  const documentTarget = new EventTarget();
  Object.defineProperty(documentTarget, 'visibilityState', { value: 'hidden', writable: true });
  const eventTarget = new EventTarget();
  eventTarget.document = documentTarget;
  const store = new FakeStore();
  store.setGradeVaultAutoLockMinutes(5);
  store.setGradeVaultAutoLockOnBackground(true);
  const runtime = new WorkspaceRuntime(store, { eventTarget });
  runtime.vault = { ...runtime.vault, encryptionEnabled: true, configured: true, unlocked: true, cryptoKey: { opaque: true } };
  let scheduledDelay = 0;
  runtime.scheduleGradeVaultBackgroundAutoLock = (delay) => {
    scheduledDelay = delay ?? runtime.getGradeVaultAutoLockMs();
    runtime.vault.backgroundHiddenAt = Date.now();
  };

  await runtime.handleGradeVaultVisibilityChange();
  assert.equal(scheduledDelay, 5 * 60 * 1000);

  let lockCalls = 0;
  runtime.handleGradeVaultAutoLockTimeout = async () => { lockCalls += 1; return true; };
  runtime.vault.backgroundHiddenAt = Date.now() - (5 * 60 * 1000);
  documentTarget.visibilityState = 'visible';
  await runtime.handleGradeVaultVisibilityChange();
  assert.equal(lockCalls, 1);
});

test('visibility changes leave the existing auto-lock timer untouched when background locking is disabled', async () => {
  const documentTarget = new EventTarget();
  Object.defineProperty(documentTarget, 'visibilityState', { value: 'hidden', writable: true });
  const eventTarget = new EventTarget();
  eventTarget.document = documentTarget;
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget });
  runtime.vault = { ...runtime.vault, encryptionEnabled: true, configured: true, unlocked: true };
  let scheduled = false;
  runtime.scheduleGradeVaultAutoLock = () => { scheduled = true; };

  await runtime.handleGradeVaultVisibilityChange();
  documentTarget.visibilityState = 'visible';
  await runtime.handleGradeVaultVisibilityChange();
  assert.equal(scheduled, false);
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

test('grade-vault crypto rejects hostile KDF and AES-GCM parameters before WebCrypto', async () => {
  const validKdf = {
    iterations: workspaceCrypto.WORKSPACE_VAULT_KDF_ITERATIONS,
    salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
  };
  const invalidKdfs = [
    { ...validKdf, iterations: workspaceCrypto.WORKSPACE_VAULT_KDF_MAX_ITERATIONS + 1 },
    { ...validKdf, iterations: 100000.5 },
    { ...validKdf, salt: 'AAAAAAAAAAAAAAAAAAAAAA=' },
  ];
  let cryptoCalls = 0;
  const cryptoProvider = {
    subtle: {
      importKey() { cryptoCalls += 1; },
      deriveKey() { cryptoCalls += 1; },
      decrypt() { cryptoCalls += 1; },
    },
  };

  for (const kdf of invalidKdfs) {
    await assert.rejects(
      () => workspaceCrypto.deriveWorkspaceVaultKey('ein-passwort', kdf, cryptoProvider),
      /KDF|PBKDF2|Salt/,
    );
  }

  const validEnvelope = {
    schema: workspaceCrypto.WORKSPACE_VAULT_SCHEMA,
    ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==',
    cipher: { name: 'AES-GCM', iv: 'AAAAAAAAAAAAAAAA', tagLength: 128 },
  };
  for (const envelope of [
    { ...validEnvelope, cipher: { ...validEnvelope.cipher, iv: 'AAAAAAAAAAAAAA==' } },
    { ...validEnvelope, cipher: { ...validEnvelope.cipher, tagLength: 96 } },
    { ...validEnvelope, cipher: { ...validEnvelope.cipher, name: 'AES-CBC' } },
  ]) {
    await assert.rejects(
      () => workspaceCrypto.decryptWorkspaceVaultText(envelope, {}, validKdf, {}, cryptoProvider),
      /AES-GCM|IV|Verschlüsselungsverfahren/,
    );
  }
  assert.equal(cryptoCalls, 0);
});

test('import rejects a vault configuration with excessive PBKDF2 work before it can be unlocked', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  const empty = runtime.buildEmptyDatabaseContainer();
  const parsed = thdb.parseThdb1ContainerBytes(empty.bytes, { includePlanningPublic: true });
  const hostile = thdb.buildThdb1ContainerBytes({
    schema: parsed.header.schema,
    startupShellText: parsed.startupShellText,
    planningPublicText: parsed.planningPublicText,
    gradeVaultConfigText: JSON.stringify({
      configured: true,
      kdf: {
        iterations: workspaceCrypto.WORKSPACE_VAULT_KDF_MAX_ITERATIONS + 1,
        salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
      },
      validation: { ciphertext: 'irrelevant' },
    }),
  });

  await assert.rejects(
    () => runtime.loadBytes(hostile.bytes, 'test'),
    /Verschlüsselungseinstellungen/,
  );
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

test('read-only grade course snapshots retain the selected course data without replacing the active course', async () => {
  const store = new FakeStore();
  store.gradeState = {
    ...emptyGrades(),
    gradeStudents: [{ id: 70, courseId: 7, firstName: 'Aktiv' }],
  };
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.loadedCourseId = 7;
  runtime.courseCache.set(8, {
    ...emptyGrades(),
    gradeStructures: [{ courseId: 8, periodCategories: { h1: [{ name: 'Mitarbeit' }], h2: [] } }],
    gradeStudents: [{ id: 80, courseId: 8, firstName: 'Ada' }],
  });
  let publishCount = 0;
  runtime.bindController({ publish() { publishCount += 1; } });

  const snapshot = await runtime.getGradeCourseStateSnapshot(8);

  assert.equal(snapshot.gradeStudents[0].firstName, 'Ada');
  assert.equal(snapshot.gradeStructures[0].periodCategories.h1[0].name, 'Mitarbeit');
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
  await runtime.handleWorkspaceCommand({
    client: 'grades',
    command: messages.WORKSPACE_COMMAND_APPLY_SETTINGS,
    payload: { settings: { gradeVaultAutoLockMinutes: 15, gradeVaultAutoLockOnBackground: true } },
  });
  assert.equal(store.getGradeVaultAutoLockMinutes(), 15);
  assert.equal(store.getGradeVaultAutoLockOnBackground(), true);
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

test('large database files require confirmation and oversized files are rejected before reading', async () => {
  const runtime = new WorkspaceRuntime(new FakeStore(), { eventTarget: new EventTarget() });
  const originalConfirm = globalThis.confirm;
  let promptCount = 0;
  let readCount = 0;
  globalThis.confirm = () => {
    promptCount += 1;
    return false;
  };
  try {
    await assert.rejects(runtime.readDatabaseFileBytes({
      name: 'gross.thdb',
      size: 101 * 1024 * 1024,
      async arrayBuffer() {
        readCount += 1;
        return new ArrayBuffer(0);
      },
    }), /wurde nicht geladen/);
    assert.equal(promptCount, 1);
    assert.equal(readCount, 0);

    await assert.rejects(runtime.readDatabaseFileBytes({
      name: 'zu-gross.thdb',
      size: 251 * 1024 * 1024,
      async arrayBuffer() {
        readCount += 1;
        return new ArrayBuffer(0);
      },
    }), /zu groß/);
    assert.equal(promptCount, 1);
    assert.equal(readCount, 0);
  } finally {
    if (originalConfirm === undefined) {
      delete globalThis.confirm;
    } else {
      globalThis.confirm = originalConfirm;
    }
  }
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
