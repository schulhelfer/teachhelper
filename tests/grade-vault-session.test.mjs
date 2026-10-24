import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createWorkspaceModuleLoader } from './helpers/workspace-modules.mjs';

const load = createWorkspaceModuleLoader({
  './archive-pdf.js': 'export async function buildWorkspaceArchivePdfBytes() {} export function downloadWorkspaceArchivePdf() {}',
});
const [{ WorkspaceRuntime }, { WorkspaceStore }, { createWorkspacePublicApi }, crypto] = await Promise.all(
  ['runtime.js', 'store.js', 'public-api.js', 'crypto.js'].map(async (name) => import(await load(name))),
);
const password = 'sicheres-test-passwort';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t) {
  const store = new WorkspaceStore();
  const runtime = new WorkspaceRuntime(store, { ephemeral: true, eventTarget: new EventTarget() });
  t.after(() => runtime.disposeGradeVaultSession());
  const year = store.getActiveSchoolYear();
  const courseId = store.createCourse(year.id, 'Sicherheitskurs');
  await runtime.runGradeCourseMutation(courseId, () => {
    store.replaceGradeStudentsForCourse(courseId, [{ firstName: 'Geheimer', lastName: 'Testname' }]);
  }, { skipAutoSave: true });
  await runtime.setupGradeVault(password);
  const bytes = (await runtime.buildContainer('seed')).bytes;
  runtime.persistence.commitPersistedVaultContainer(bytes);
  runtime.courseRepository.completeSave();
  runtime.manualDirty = false;
  return { runtime, store, courseId, bytes };
}

function delayDecode(runtime) {
  const started = deferred();
  const release = deferred();
  const original = runtime.courseRepository.decodeCourse;
  runtime.courseRepository.decodeCourse = async (...args) => {
    const state = await original(...args);
    started.resolve();
    await release.promise;
    return state;
  };
  return { started, release, restore() { runtime.courseRepository.decodeCourse = original; } };
}

for (const operation of ['ensureGradeCourseLoaded', 'getGradeCourseStateSnapshot', 'getGradeCourseRosterSummary', 'resolvePerformanceIndex']) {
  test(`${operation} cannot return or restore plaintext after locking`, async (t) => {
    const { runtime, store, courseId } = await fixture(t);
    runtime.courseRepository.clearPlaintextCourses();
    const gate = delayDecode(runtime);
    const pending = runtime[operation](operation === 'resolvePerformanceIndex' ? [courseId] : courseId);
    const rejected = assert.rejects(pending, { code: 'VAULT_LOCKED' });
    await gate.started.promise;
    await runtime.lockGradeVaultSession();
    gate.release.resolve();
    await rejected;
    assert.equal(runtime.isGradeVaultUnlocked(), false);
    assert.equal(runtime.courseCache.size, 0);
    assert.deepEqual(store.listGradeStudents(courseId), []);
  });
}

test('unlocking again does not authorize an old snapshot request', async (t) => {
  const { runtime, courseId } = await fixture(t);
  runtime.courseRepository.clearPlaintextCourses();
  const gate = delayDecode(runtime);
  const pending = runtime.getGradeCourseStateSnapshot(courseId);
  const rejected = assert.rejects(pending, { code: 'VAULT_LOCKED' });
  await gate.started.promise;
  await runtime.lockGradeVaultSession();
  gate.restore();
  await runtime.unlockGradeVault(password);
  gate.release.resolve();
  await rejected;
});

test('loading another database invalidates old reads', async (t) => {
  const { runtime, courseId, bytes } = await fixture(t);
  runtime.courseRepository.clearPlaintextCourses();
  const gate = delayDecode(runtime);
  const pending = runtime.getGradeCourseStateSnapshot(courseId);
  const rejected = assert.rejects(pending, { code: 'VAULT_LOCKED' });
  await gate.started.promise;
  await runtime.persistence.loadBytes(bytes);
  gate.release.resolve();
  await rejected;
  assert.equal(runtime.courseCache.size, 0);
});

for (const mode of ['disabled', 'manual', 'disconnected', 'save-failure']) {
  test(`automatic locking preserves dirty courses with ${mode}`, async (t) => {
    const { runtime, store, courseId } = await fixture(t);
    await runtime.runGradeCourseMutation(courseId, () => {
      store.replaceGradeStudentsForCourse(courseId, store.listGradeStudents(courseId).map((student) => ({ ...student, firstName: 'Entwurf', lastName: 'Erhalten' })));
    }, { skipAutoSave: true });
    const before = runtime.courseRepository.captureSessionState();
    store.setGradeVaultAutoSaveBeforeLock(mode !== 'disabled');
    runtime.isManualPersistenceMode = () => mode === 'manual';
    runtime.fileHandle = mode === 'disconnected' ? null : { name: 'test.json' };
    let writes = 0;
    runtime.saveToConnectedFile = async () => { writes += 1; throw new Error('Dateikonflikt'); };
    assert.equal(await runtime.handleGradeVaultAutoLockTimeout(), true);
    assert.equal(writes, mode === 'save-failure' ? 1 : 0);
    assert.equal(runtime.isGradeVaultUnlocked(), false);
    assert.equal(runtime.vault.cryptoKey, null);
    assert.equal(runtime.vault.persistedCryptoKey, null);
    assert.equal(runtime.courseCache.size, 0);
    assert.equal(runtime.gradeVault.persistedStates.size, 0);
    assert.deepEqual(store.listGradeStudents(courseId), []);
    assert.equal(runtime.createWorkspaceSnapshot('shell').vault.suspendedChanges, true);
    assert.equal(JSON.stringify(runtime.gradeVault.suspendedSession).includes('Erhalten'), false);
    await assert.rejects(runtime.unlockGradeVault('falsches-passwort'));
    assert.equal(runtime.isGradeVaultUnlocked(), false);
    await runtime.unlockGradeVault(password);
    assert.deepEqual(runtime.courseRepository.captureSessionState(), before);
    assert.equal(runtime.createWorkspaceSnapshot('shell').unsaved.gradesDirty, true);
    assert.equal(runtime.gradeVault.suspendedSession, null);
  });
}

test('feature drafts are encrypted separately and never committed as grade changes', async (t) => {
  const { runtime } = await fixture(t);
  let draft = { text: 'Privater Entwurf', binary: new Uint8Array([1, 2]), file: new Blob(['Datei']), ids: new Set([7]) };
  let restored;
  runtime.registerFeatureClient('grades', {
    captureVaultSession: () => ({ dirty: true, draft }),
    clearVaultSession: () => { draft = null; },
    restoreVaultSession: (value) => { restored = value.draft; },
  });
  assert.equal(await runtime.handleGradeVaultAutoLockTimeout(), true);
  assert.equal(draft, null);
  assert.equal(runtime.dirtyCourseIds.size, 0);
  assert.equal(runtime.createWorkspaceSnapshot('shell').unsaved.gradesDirty, true);
  await runtime.unlockGradeVault(password);
  assert.equal(restored.text, 'Privater Entwurf');
  assert.deepEqual(restored.binary, new Uint8Array([1, 2]));
  assert.equal(await restored.file.text(), 'Datei');
  assert.deepEqual(restored.ids, new Set([7]));
  assert.equal(runtime.dirtyCourseIds.size, 0);
});

test('corrupt or substituted session envelopes leave the vault locked', async (t) => {
  const { runtime, store, courseId } = await fixture(t);
  runtime.dirtyCourseIds.add(courseId);
  await runtime.handleGradeVaultAutoLockTimeout();
  const suspended = runtime.gradeVault.suspendedSession;
  suspended.id += '-substituted';
  await assert.rejects(runtime.unlockGradeVault(password));
  assert.equal(runtime.isGradeVaultUnlocked(), false);
  assert.deepEqual(store.listGradeStudents(courseId), []);
  assert.equal(runtime.gradeVault.suspendedSession, suspended);
});

test('failed session encryption keeps unsaved changes and reports failure', async (t) => {
  const { runtime, store, courseId } = await fixture(t);
  runtime.dirtyCourseIds.add(courseId);
  runtime.vault.kdf = { invalid: true };
  assert.equal(await runtime.handleGradeVaultAutoLockTimeout(), false);
  assert.equal(runtime.isGradeVaultUnlocked(), true);
  assert.equal(runtime.canAccessGradeVault(), true);
  assert.equal(store.listGradeStudents(courseId).length, 1);
  assert.equal(runtime.gradeVault.suspendedSession, null);
  assert.equal(runtime.vault.autoLockWarning.active, true);
});

test('password changes survive suspension without retaining old keys and keep content checks', async (t) => {
  const { runtime, store, courseId } = await fixture(t);
  const nextPassword = 'anderes-sicheres-passwort';
  await runtime.changeGradeVaultPassword(password, nextPassword);
  await runtime.handleGradeVaultAutoLockTimeout();
  assert.equal(runtime.vault.persistedCryptoKey, null);
  await runtime.unlockGradeVault(nextPassword);
  assert.equal(runtime.vault.persistedCryptoKey, null);
  await runtime.buildContainer('after-suspension');
  store.gradeVaultState.gradeStudents = [];
  await assert.rejects(runtime.buildContainer('loss'), /Teilnehmende|inhaltlich leer/);
  await runtime.discardGradeVaultChanges();
  assert.equal(runtime.isGradeVaultUnlocked(), false);
  await assert.rejects(runtime.unlockGradeVault(nextPassword));
  await runtime.unlockGradeVault(password);
  await runtime.ensureGradeCourseLoaded(courseId);
  assert.equal(store.listGradeStudents(courseId).length, 1);
});

test('locked public data reads cannot expose repopulated state and writes are rejected', async (t) => {
  const { runtime, store, courseId } = await fixture(t);
  const state = store.exportGradeVaultStateSnapshot();
  const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => runtime, scope: 'grades' });
  await runtime.lockGradeVaultSession();
  store.replaceGradeVaultState(state);
  assert.deepEqual(api.data.listGradeStudents(courseId), []);
  assert.deepEqual(api.data.listGradeEntries(), []);
  assert.deepEqual(api.data.exportGradeVaultStateSnapshot().gradeStudents, []);
  assert.throws(() => api.data.replaceGradeStudentsForCourse(courseId, []), { code: 'VAULT_LOCKED' });
});

test('session serialization preserves records without interpreting user object keys as type tags', async () => {
  const value = { type: 'bytes', data: 'anything', map: new Map([[3, { value: undefined }]]) };
  assert.deepEqual(crypto.deserializeWorkspaceVaultSession(await crypto.serializeWorkspaceVaultSession(value)), value);
});

test('session serialization preserves typed drafts from another frame realm', async () => {
  const draft = runInNewContext('({ ids: new Set([7]), rows: new Map([[3, "Entwurf"]]), bytes: new Uint8Array([1, 2]), buffer: new Uint8Array([3, 4]).buffer })');
  const result = crypto.deserializeWorkspaceVaultSession(await crypto.serializeWorkspaceVaultSession(draft));
  assert.deepEqual(result.ids, new Set([7]));
  assert.deepEqual(result.rows, new Map([[3, 'Entwurf']]));
  assert.deepEqual(result.bytes, new Uint8Array([1, 2]));
  assert.deepEqual(new Uint8Array(result.buffer), new Uint8Array([3, 4]));
});

for (const boundary of ['lock', 'database', 'dispose']) {
  test(`delayed password validation cannot unlock after ${boundary}`, async (t) => {
    const { runtime, store, courseId, bytes } = await fixture(t);
    await runtime.lockGradeVaultSession();
    const started = deferred();
    const release = deferred();
    const subtle = globalThis.crypto.subtle;
    const decrypt = subtle.decrypt.bind(subtle);
    t.mock.method(subtle, 'decrypt', async (...args) => {
      const result = await decrypt(...args);
      started.resolve();
      await release.promise;
      return result;
    });
    const pending = runtime.unlockGradeVault(password);
    const rejected = assert.rejects(pending, { code: 'VAULT_LOCKED' });
    await started.promise;
    if (boundary === 'lock') await runtime.lockGradeVaultSession();
    if (boundary === 'database') await runtime.persistence.loadBytes(bytes);
    if (boundary === 'dispose') runtime.disposeGradeVaultSession();
    release.resolve();
    await rejected;
    assert.equal(runtime.isGradeVaultUnlocked(), false);
    assert.equal(runtime.vault.cryptoKey, null);
    assert.deepEqual(store.listGradeStudents(courseId), []);
  });
}

test('temporary course callbacks cannot restore a previous course after locking', async (t) => {
  const { runtime, store, courseId } = await fixture(t);
  const other = store.createCourse(store.getActiveSchoolYear().id, 'Zweiter Kurs');
  const started = deferred();
  const release = deferred();
  const pending = runtime.withTemporaryGradeCourse(other, async () => {
    started.resolve();
    await release.promise;
    return 'outdated';
  });
  const rejected = assert.rejects(pending, { code: 'VAULT_LOCKED' });
  await started.promise;
  await runtime.handleGradeVaultAutoLockTimeout();
  release.resolve();
  await rejected;
  assert.equal(runtime.courseCache.size, 0);
  assert.deepEqual(store.listGradeStudents(courseId), []);
});

test('automatic locking waits for a mutation and preserves its completed changes', async (t) => {
  const { runtime, store, courseId } = await fixture(t);
  const started = deferred();
  const release = deferred();
  const mutation = runtime.runGradeCourseMutation(courseId, async () => {
    started.resolve();
    await release.promise;
    store.replaceGradeStudentsForCourse(courseId, store.listGradeStudents(courseId).map((student) => ({ ...student, firstName: 'Warteschlange' })));
  }, { skipAutoSave: true });
  await started.promise;
  const locked = runtime.handleGradeVaultAutoLockTimeout();
  release.resolve();
  await mutation;
  assert.equal(await locked, true);
  await runtime.unlockGradeVault(password);
  assert.equal(store.listGradeStudents(courseId)[0].firstName, 'Warteschlange');
  assert.equal(runtime.dirtyCourseIds.has(courseId), true);
});

test('a stale mutation failure cannot roll back plaintext into a new database', async (t) => {
  const { runtime, store, courseId, bytes } = await fixture(t);
  const started = deferred();
  const release = deferred();
  const mutation = runtime.runGradeCourseMutation(courseId, async () => {
    started.resolve();
    await release.promise;
    throw new Error('Verspäteter Fehler');
  }, { skipAutoSave: true });
  const rejected = assert.rejects(mutation, { code: 'VAULT_LOCKED' });
  await started.promise;
  await runtime.persistence.loadBytes(bytes);
  release.resolve();
  await rejected;
  assert.equal(runtime.courseCache.size, 0);
  assert.deepEqual(store.listGradeStudents(courseId), []);
});

test('a suspended KDF upgrade keeps removal approvals and can be saved and reopened', async (t) => {
  const { runtime, store, courseId } = await fixture(t);
  const kdf = crypto.createWorkspaceVaultKdf({ iterations: 100000 });
  const { cryptoKey } = await crypto.deriveWorkspaceVaultKey(password, kdf);
  const validation = await crypto.encryptWorkspaceVaultText('teachhelper-grade-vault-v1', cryptoKey, kdf, { type: 'validation' });
  runtime.vault.persistedCryptoKey = runtime.vault.cryptoKey;
  runtime.vault.config = { ...runtime.vault.config, kdf, validation };
  runtime.vault.cryptoKey = cryptoKey;
  runtime.vault.kdf = kdf;
  runtime.dirtyCourseIds.add(courseId);
  runtime.persistence.commitPersistedVaultContainer((await runtime.buildContainer('old-kdf')).bytes);
  runtime.courseRepository.completeSave();
  await runtime.lockGradeVaultSession();
  await runtime.unlockGradeVault(password);
  assert.equal(runtime.vault.kdf.iterations, crypto.WORKSPACE_VAULT_KDF_ITERATIONS);
  await runtime.ensureGradeCourseLoaded(courseId);
  const students = store.listGradeStudents(courseId);
  await runtime.runGradeCourseMutation(courseId, () => {
    store.replaceGradeStudentsForCourse(courseId, [], null, { confirmedRemovedStudentIds: students.map((student) => student.id) });
  }, { skipAutoSave: true, confirmedRemovedStudentIds: students.map((student) => student.id) });
  const before = runtime.courseRepository.captureSessionState();
  await runtime.handleGradeVaultAutoLockTimeout();
  assert.equal(runtime.vault.persistedCryptoKey, null);
  await runtime.unlockGradeVault(password);
  assert.deepEqual(runtime.courseRepository.captureSessionState(), before);
  const saved = (await runtime.buildContainer('restored-kdf')).bytes;
  runtime.persistence.commitPersistedVaultContainer(saved);
  runtime.courseRepository.completeSave();
  await runtime.persistence.loadBytes(saved);
  await runtime.unlockGradeVault(password);
  await runtime.ensureGradeCourseLoaded(courseId);
  assert.deepEqual(store.listGradeStudents(courseId), []);
});

test('unsaved encryption setup removes original plaintext segments while suspended', async (t) => {
  const { runtime, store, courseId } = await fixture(t);
  await runtime.setGradeVaultEncryptionEnabledFromSettings(false);
  runtime.persistence.commitPersistedVaultContainer((await runtime.buildContainer('plaintext')).bytes);
  runtime.courseRepository.completeSave();
  const original = runtime.segmentTexts.get(courseId);
  assert.ok(original.includes('Testname'));
  await runtime.setupGradeVault(password);
  await runtime.handleGradeVaultAutoLockTimeout();
  assert.equal(runtime.segmentTexts.has(courseId), false);
  assert.equal(JSON.stringify(runtime.gradeVault.suspendedSession).includes('Testname'), false);
  await runtime.unlockGradeVault(password);
  assert.equal(runtime.segmentTexts.get(courseId), original);
  await runtime.buildContainer('encrypted');
  await runtime.discardGradeVaultChanges();
  assert.equal(runtime.isGradeVaultEncryptionEnabled(), false);
  await runtime.ensureGradeCourseLoaded(courseId);
  assert.equal(store.listGradeStudents(courseId)[0].lastName, 'Testname');
});

test('the lock transition blocks public changes until encryption has completed', async (t) => {
  const { runtime, store, courseId } = await fixture(t);
  runtime.dirtyCourseIds.add(courseId);
  const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => runtime, scope: 'grades' });
  const started = deferred();
  const release = deferred();
  const subtle = globalThis.crypto.subtle;
  const encrypt = subtle.encrypt.bind(subtle);
  t.mock.method(subtle, 'encrypt', async (...args) => {
    started.resolve();
    await release.promise;
    return encrypt(...args);
  });
  const pending = runtime.handleGradeVaultAutoLockTimeout();
  await started.promise;
  assert.equal(runtime.canAccessGradeVault(), false);
  assert.deepEqual(api.data.listGradeStudents(courseId), []);
  assert.throws(() => api.data.replaceGradeStudentsForCourse(courseId, []), { code: 'VAULT_LOCKED' });
  release.resolve();
  assert.equal(await pending, true);
  await runtime.unlockGradeVault(password);
  assert.equal(store.listGradeStudents(courseId)[0].lastName, 'Testname');
});

test('database replacement clears a suspended session and its draft callbacks', async (t) => {
  const { runtime, courseId, bytes } = await fixture(t);
  runtime.dirtyCourseIds.add(courseId);
  let restored = false;
  runtime.registerFeatureClient('grades', {
    captureVaultSession: () => ({ dirty: true, text: 'alter Entwurf' }),
    restoreVaultSession: () => { restored = true; },
  });
  await runtime.handleGradeVaultAutoLockTimeout();
  assert.ok(runtime.gradeVault.suspendedSession);
  await runtime.persistence.loadBytes(bytes);
  assert.equal(runtime.gradeVault.suspendedSession, null);
  await runtime.unlockGradeVault(password);
  assert.equal(restored, false);
});
