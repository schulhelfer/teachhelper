import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWorkspaceModuleLoader } from './helpers/workspace-modules.mjs';

const moduleFiles = ['course-repository.js', 'grade-vault.js', 'workspace-persistence.js', 'workspace-backup.js'];
const loadModule = createWorkspaceModuleLoader({
  './archive-pdf.js': 'export async function buildWorkspaceArchivePdfBytes() {} export function downloadWorkspaceArchivePdf() {}',
});
const [{ WorkspaceRuntime, createWorkspaceRuntime, formatLocalBackupTimestamp }, { WorkspaceStore }, { CourseRepository }, { GradeVault }, { WorkspacePersistence }, { WorkspaceBackup }] = await Promise.all(
  ['runtime.js', 'store.js', ...moduleFiles].map(async (name) => import(await loadModule(name))),
);

function createRuntime() {
  return createWorkspaceRuntime(new WorkspaceStore(), { ephemeral: true, eventTarget: new EventTarget() });
}

test('runtime fields continue to address their owning service without sharing state between workspaces', () => {
  const first = createRuntime();
  const second = createRuntime();
  assert.ok(first instanceof WorkspaceRuntime);
  for (const [service, fields] of [
    ['courseRepository', ['courseCache', 'segmentTexts', 'dirtyCourseIds', 'persistedCourseIds', 'deletedCourseIds', 'courseRevisions', 'confirmedStudentRemovalsByCourse', 'performanceIndexCache', 'seatplanPresenceCache']],
    ['gradeVault', ['vault']],
  ]) {
    for (const field of fields) {
      assert.equal(first[field], first[service][field]);
      assert.notEqual(first[field], second[field]);
      const replacement = field === 'vault' ? { ...first.vault, autoLockNotice: { id: 'first' } } : new first[field].constructor();
      first[field] = replacement;
      assert.equal(first[service][field], replacement);
      assert.notEqual(second[field], replacement);
    }
  }
  const handle = { name: 'schule.json' };
  first.fileHandle = handle;
  assert.equal(first.persistence.fileHandle, handle);
  first.persistence.fileName = handle.name;
  assert.equal(first.fileName, handle.name);
  assert.equal(second.fileHandle, null);
  first.backupDirectoryHandle = { name: 'Sicherungen' };
  assert.equal(first.backup.backupDirectoryHandle, first.backupDirectoryHandle);
  assert.equal(second.backupDirectoryHandle, null);
  first.loadedCourseId = 7;
  assert.equal(first.courseRepository.loadedCourseId, 7);
  assert.equal(second.loadedCourseId, null);
  assert.equal(second.vault.autoLockNotice, null);
});

test('the facade preserves the shared promise for concurrent reconnect attempts', async () => {
  const runtime = new WorkspaceRuntime(new WorkspaceStore(), { eventTarget: new EventTarget() });
  let resolveReconnect;
  let attempts = 0;
  runtime.persistence.runStoredSyncFileReconnect = () => {
    attempts += 1;
    return new Promise((resolve) => { resolveReconnect = resolve; });
  };
  const first = runtime.tryReconnectStoredSyncFile();
  const second = runtime.tryReconnectStoredSyncFile();
  assert.equal(first, second);
  assert.equal(attempts, 1);
  resolveReconnect(true);
  assert.equal(await first, true);
  assert.equal(runtime.syncReconnectInFlight, null);
});

test('course mutation, file save and vault locking share one queue and recover after failure', async (t) => {
  const runtime = createRuntime();
  t.after(() => {
    runtime.clearGradeVaultAutoLockTimer();
    runtime.clearGradeVaultBackgroundAutoLockTimer();
  });
  const year = runtime.store.getActiveSchoolYear() || runtime.store.createSchoolYear(2026);
  const courseId = runtime.store.createCourse(year.id, '7a');
  runtime.vault = { ...runtime.vault, encryptionEnabled: true, configured: true, unlocked: true, cryptoKey: {} };
  runtime.fileHandle = { name: 'schule.json' };
  runtime.isManualPersistenceMode = () => false;
  const order = [];
  let releaseMutation;
  const mutationGate = new Promise((resolve) => { releaseMutation = resolve; });
  runtime.saveToConnectedFile = async () => {
    order.push('save');
    assert.equal(runtime.gradeCourseMutationActiveCourseId, null);
    runtime.dirtyCourseIds.clear();
    return true;
  };
  runtime.gradeVault.clearPlaintextCourses = () => { order.push('lock'); };
  const mutation = runtime.runGradeCourseMutation(courseId, async () => {
    assert.equal(runtime.loadedCourseId, courseId);
    order.push('mutation');
    await mutationGate;
    throw new Error('mutation rejected');
  });
  const rejected = assert.rejects(mutation, /mutation rejected/);
  const save = runtime.enqueueConnectedFileSave();
  const lock = runtime.handleGradeVaultAutoLockTimeout();
  releaseMutation();
  await rejected;
  assert.equal(await save, true);
  assert.equal(await lock, true);
  assert.deepEqual(order, ['mutation', 'save', 'lock']);
  assert.equal(runtime.isGradeVaultUnlocked(), false);
});

test('the course repository retains untouched persisted segments without encryption or runtime access', async () => {
  const store = new WorkspaceStore();
  const repository = new CourseRepository({
    store,
    clone: structuredClone,
    isGradeVaultConfigured: () => true,
    isGradeVaultUnlocked: () => false,
    encodeCourse: () => assert.fail('an untouched segment must not be rewritten'),
    decodeCourseSegmentForPlausibility: () => assert.fail('identical segments need no decryption'),
  });
  const segment = { courseId: 7, text: '{ "unchanged encrypted data": true }' };
  repository.commitPersistedSegments([segment]);
  const result = await repository.buildGradeCourseSegments();
  assert.deepEqual(result.segments, [segment]);
  assert.equal(repository.courseCache.size, 0);
  assert.equal(repository.dirtyCourseIds.size, 0);
});

test('the vault uses injected timers and refuses plaintext in a protected database independently', async () => {
  const store = new WorkspaceStore();
  const timers = new Map();
  const cleared = [];
  const vault = new GradeVault({
    store,
    clone: structuredClone,
    nowMs: () => 1234,
    setTimeout: (callback, delay) => {
      timers.set(41, { callback, delay });
      return 41;
    },
    clearTimeout: (id) => { cleared.push(id); timers.delete(id); },
  });
  vault.vault = { ...vault.vault, configured: true, encryptionEnabled: true, unlocked: true, cryptoKey: {} };
  vault.recordGradeVaultActivity();
  assert.equal(vault.vault.lastActivityAt, 1234);
  assert.equal(vault.vault.autoLockTimer, 41);
  assert.equal(timers.get(41).delay, vault.getGradeVaultAutoLockMs());
  await assert.rejects(
    () => vault.decodeCourse(7, JSON.stringify({ schema: 'teachhelper-grade-course-v1', courseId: 7 })),
    { code: 'VAULT_PLAINTEXT_SEGMENT' },
  );
  vault.clearGradeVaultAutoLockTimer();
  assert.equal(timers.size, 0);
  assert.equal(cleared.at(-1), 41);
});

test('persistence validates a large file through its injected confirmation before reading it', async () => {
  let confirmations = 0;
  let reads = 0;
  const persistence = new WorkspacePersistence({
    confirmLargeFile: async ({ size }) => {
      confirmations += 1;
      assert.equal(reads, 0);
      assert.equal(size, 101 * 1024 * 1024);
      return false;
    },
  });
  await assert.rejects(() => persistence.readDatabaseFileBytes({
    size: 101 * 1024 * 1024,
    arrayBuffer: async () => { reads += 1; return new ArrayBuffer(1); },
  }), /wurde nicht geladen/);
  assert.equal(confirmations, 1);
  assert.equal(reads, 0);
});

test('backup export uses injected persistence and the compatible local filename', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const date = new Date(2026, 8, 15, 8, 9);
  const downloads = [];
  const backup = new WorkspaceBackup({
    now: () => date,
    isPersistenceReady: () => true,
    buildContainer: async (reason) => {
      assert.equal(reason, 'backup-export');
      return { bytes };
    },
    downloadBytes: (...args) => downloads.push(args),
  });
  assert.equal(await backup.exportBackup(), true);
  assert.deepEqual(downloads, [[bytes, 'TeachHelper-Backup-2026-09-15-08-09.json']]);
  assert.equal(formatLocalBackupTimestamp(date), '2026-09-15-08-09');
});

test('workspace services have no imports from their orchestrator or each other and are precached', async () => {
  const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  for (const file of moduleFiles) {
    const source = await readFile(new URL(`../src/modules/workspace/${file}`, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.ok(!imports.includes('./runtime.js'), file);
    for (const sibling of moduleFiles) assert.ok(!imports.includes(`./${sibling}`), `${file} imports ${sibling}`);
    assert.ok(worker.includes(`'./src/modules/workspace/${file}'`), `${file} is precached`);
  }
  const runtime = await readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8');
  assert.doesNotMatch(runtime, /from ['"].*(?:thdb|sync-safety|crypto)\.js['"]/);
});
