import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const loadSourceUrl = async (path) => dataUrl(await readFile(new URL(path, import.meta.url), 'utf8'));

const [thdbUrl, syncUrl, defaultsUrl, messagesUrl, cryptoUrl, fileGuardsUrl, nameLearningDueSummaryUrl] = await Promise.all([
  loadSourceUrl('../src/shared/school-data/thdb.js'),
  loadSourceUrl('../src/shared/school-data/sync-safety.js'),
  loadSourceUrl('../src/shared/school-data/defaults.js'),
  loadSourceUrl('../src/shared/school-data/messages.js'),
  loadSourceUrl('../src/modules/workspace/crypto.js'),
  loadSourceUrl('../src/shared/file-guards.js'),
  loadSourceUrl('../src/shared/name-learning-due-summary.js'),
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
  ['../../shared/name-learning-due-summary.js', nameLearningDueSummaryUrl],
]) runtimeSource = runtimeSource.replace(path, url);

const [{ WorkspaceRuntime }, messages, workspaceCrypto] = await Promise.all([
  import(dataUrl(runtimeSource)),
  import(messagesUrl),
  import(cryptoUrl),
]);

const COURSE_ID = 7;
const PASSWORD = 'ein-ausreichend-langes-passwort';

function emptyGrades() {
  return {
    counters: {}, gradeStructures: [], gradeAssessments: [], gradeStudents: [],
    gradeEntries: [], gradeOverrides: [], gradeImports: [], gradeSeatPlans: [], gradeAccommodations: [],
  };
}

class FakeStore {
  constructor() {
    this.publicState = { settings: { activeSchoolYearId: 1 }, schoolYears: [{ id: 1 }], courses: [{ id: COURSE_ID, name: '7a' }] };
    this.gradeState = emptyGrades();
    this.settings = new Map();
    this.state = { settings: { ...this.publicState.settings }, courses: this.publicState.courses };
  }
  setAfterSaveHooks(hooks) { this.hooks = hooks; }
  _suspendSaveHooks() {}
  _resumeSaveHooks() {}
  exportPublicStateSnapshot() { return structuredClone(this.publicState); }
  exportGradeVaultStateSnapshot() { return structuredClone(this.gradeState); }
  replaceGradeVaultState(state) { this.gradeState = this.normalizeGradeVaultState(state); }
  normalizeGradeVaultState(state) { return { ...emptyGrades(), ...(structuredClone(state) || {}) }; }
  getGradeVaultEncryptionEnabled() { return Boolean(this.settings.get('gradeVaultEncryptionEnabled')); }
  setGradeVaultEncryptionEnabled(value) { this.settings.set('gradeVaultEncryptionEnabled', Boolean(value)); }
  getGradeVaultAutoLockMinutes() { return 30; }
  getGradeVaultAutoLockOnBackground() { return false; }
  getSetting(key, fallback = null) { return this.settings.has(key) ? this.settings.get(key) : fallback; }
  setSetting(key, value) { this.settings.set(key, structuredClone(value)); }
  getDefaultGradeStructure() { return null; }
}

function forgedPlaintextSegment(value = 15) {
  return JSON.stringify({
    schema: 'teachhelper-grade-course-v1',
    courseId: COURSE_ID,
    counters: {},
    gradeStructures: [],
    gradeAssessments: [{ id: 21, title: 'Klausur' }],
    gradeStudents: [{ id: 201, firstName: 'Ada', lastName: 'Lovelace' }],
    gradeEntries: [{ studentId: 201, assessmentId: 21, value }],
    gradeOverrides: [],
    gradeImports: [],
    gradeSeatPlans: [],
    gradeAccommodations: [],
    gradeNameLearning: [],
  });
}

async function unlockedRuntime() {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  const kdf = workspaceCrypto.createWorkspaceVaultKdf({ iterations: 100000 });
  const { cryptoKey } = await workspaceCrypto.deriveWorkspaceVaultKey(PASSWORD, kdf);
  const validation = await workspaceCrypto.encryptWorkspaceVaultText(
    'teachhelper-grade-vault-v1',
    cryptoKey,
    kdf,
    { type: 'validation' },
  );
  runtime.vault = {
    ...runtime.vault,
    encryptionEnabled: true,
    configured: true,
    unlocked: true,
    config: { configured: true, kdf, validation },
    persistedConfig: { configured: true, kdf, validation },
    cryptoKey,
    kdf,
  };
  return { store, runtime, cryptoKey, kdf };
}

test('a smuggled plaintext course segment is rejected in a protected database', async () => {
  const { runtime } = await unlockedRuntime();

  await assert.rejects(
    () => runtime.decodeCourse(COURSE_ID, forgedPlaintextSegment()),
    (error) => {
      assert.equal(error.code, messages.WORKSPACE_ERROR_VAULT_PLAINTEXT_SEGMENT);
      assert.match(error.message, /unverschlüsselt/);
      return true;
    },
  );
});

test('a smuggled plaintext segment is rejected while the vault is still locked', async () => {
  const { runtime } = await unlockedRuntime();
  runtime.vault.unlocked = false;
  runtime.vault.cryptoKey = null;

  await assert.rejects(
    () => runtime.decodeCourse(COURSE_ID, forgedPlaintextSegment()),
    (error) => error.code === messages.WORKSPACE_ERROR_VAULT_PLAINTEXT_SEGMENT,
  );
});

test('the plausibility check refuses a plaintext segment instead of trusting it as the previous state', async () => {
  const { runtime } = await unlockedRuntime();

  for (const options of [{ persisted: true }, { persisted: false }, {}]) {
    await assert.rejects(
      () => runtime.decodeCourseSegmentForPlausibility(COURSE_ID, forgedPlaintextSegment(), options),
      (error) => error.code === messages.WORKSPACE_ERROR_VAULT_PLAINTEXT_SEGMENT,
      JSON.stringify(options),
    );
  }
});

test('segments written before encryption was switched on stay readable for the plausibility check', async () => {
  const { runtime } = await unlockedRuntime();
  runtime.vault.persistedConfig = { configured: false };

  const previous = await runtime.decodeCourseSegmentForPlausibility(
    COURSE_ID,
    forgedPlaintextSegment(9),
    { persisted: true },
  );
  assert.equal(previous.gradeEntries[0].value, 9);

  await assert.rejects(
    () => runtime.decodeCourseSegmentForPlausibility(COURSE_ID, forgedPlaintextSegment(), { persisted: false }),
    (error) => error.code === messages.WORKSPACE_ERROR_VAULT_PLAINTEXT_SEGMENT,
  );
});

test('an unencrypted database still accepts plaintext course segments', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });

  const state = await runtime.decodeCourse(COURSE_ID, forgedPlaintextSegment(2));
  assert.equal(state.gradeEntries[0].value, 2);
  assert.equal(state.gradeStudents[0].courseId, COURSE_ID);
});

test('a properly encrypted segment is still accepted after unlocking', async () => {
  const { runtime, cryptoKey, kdf } = await unlockedRuntime();
  const envelope = await workspaceCrypto.encryptWorkspaceVaultText(
    forgedPlaintextSegment(11),
    cryptoKey,
    kdf,
    { type: 'course', courseId: COURSE_ID },
  );

  const state = await runtime.decodeCourse(COURSE_ID, JSON.stringify(envelope));
  assert.equal(state.gradeEntries[0].value, 11);
});

test('enabling encryption still reads the existing plaintext segments', async () => {
  const store = new FakeStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.refreshNameLearningDueSummary = async () => false;
  runtime.recordGradeVaultActivity = () => {};
  runtime.segmentTexts.set(COURSE_ID, forgedPlaintextSegment(9));

  assert.equal(await runtime.setupGradeVault(PASSWORD), true);
  assert.equal(runtime.isGradeVaultConfigured(), true);
  assert.equal(runtime.courseCache.get(COURSE_ID).gradeEntries[0].value, 9);
});
