import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceModuleLoader } from './helpers/workspace-modules.mjs';

const load = createWorkspaceModuleLoader({
  './archive-pdf.js': 'export async function buildWorkspaceArchivePdfBytes() {} export function downloadWorkspaceArchivePdf() {}',
});
const [{ WorkspaceRuntime }, { WorkspaceStore }] = await Promise.all(
  ['runtime.js', 'store.js'].map(async (name) => import(await load(name))),
);
const password = 'sicheres-test-passwort';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t) {
  const store = new WorkspaceStore();
  const runtime = new WorkspaceRuntime(store, { ephemeral: true, eventTarget: new EventTarget() });
  t.after(() => runtime.disposeGradeVaultSession());
  const courseId = store.createCourse(store.getActiveSchoolYear().id, 'Testkurs');
  await runtime.runGradeCourseMutation(courseId, () => {
    store.replaceGradeStudentsForCourse(courseId, [{ firstName: 'Alter', lastName: 'Stand' }]);
  }, { skipAutoSave: true });
  await runtime.setupGradeVault(password);
  const built = await runtime.buildContainer('seed');
  runtime.persistence.commitBuiltContainer(built, { clearDeleted: true });
  return { store, runtime, courseId, bytes: built.bytes };
}

test('unlock finishes while the overview is still pending', async (t) => {
  const { runtime } = await fixture(t);
  await runtime.lockGradeVaultSession();
  const gate = deferred();
  let started = false;
  runtime.refreshNameLearningDueSummary = async () => { started = true; await gate.promise; };
  assert.equal(await runtime.unlockGradeVault(password), true);
  assert.equal(started, true);
  assert.equal(runtime.isGradeVaultUnlocked(), true);
  gate.resolve();
});

test('an overview failure after unlocking does not lock the vault again', async (t) => {
  const { runtime } = await fixture(t);
  await runtime.lockGradeVaultSession();
  const gate = deferred();
  t.mock.method(console, 'warn', () => {});
  runtime.refreshNameLearningDueSummary = async () => {
    await gate.promise;
    throw new Error('Übersicht fehlgeschlagen');
  };
  await runtime.unlockGradeVault(password);
  gate.resolve();
  await tick();
  assert.equal(runtime.isGradeVaultUnlocked(), true);
});

test('background overview work does not extend the automatic lock deadline', async (t) => {
  const { runtime } = await fixture(t);
  await runtime.lockGradeVaultSession();
  const activity = t.mock.method(runtime.gradeVault, 'recordGradeVaultActivity');
  const refresh = runtime.refreshNameLearningDueSummary.bind(runtime);
  let pending;
  runtime.refreshNameLearningDueSummary = () => { pending = refresh(); return pending; };
  await runtime.unlockGradeVault(password);
  const activityAtUnlock = runtime.vault.lastActivityAt;
  await pending;
  assert.equal(activity.mock.callCount(), 1);
  assert.equal(runtime.vault.lastActivityAt, activityAtUnlock);
});

for (const transition of ['lock', 'database', 'dispose', 'unlock-again']) {
  test(`overview cannot restore data or results after ${transition}`, async (t) => {
    const { runtime, courseId, bytes, store } = await fixture(t);
    runtime.courseRepository.clearPlaintextCourses();
    const started = deferred();
    const release = deferred();
    const decode = runtime.courseRepository.decodeCourse;
    runtime.courseRepository.decodeCourse = async (...args) => {
      const result = await decode(...args);
      started.resolve();
      await release.promise;
      return result;
    };
    const refresh = runtime.refreshNameLearningDueSummary();
    assert.equal(runtime.getNameLearningDueCount(), null);
    await started.promise;
    if (transition === 'database') await runtime.loadBytes(bytes);
    else if (transition === 'dispose') runtime.disposeGradeVaultSession();
    else await runtime.lockGradeVaultSession();
    const summary = structuredClone(store.state.settings.nameLearningDueSummary);
    if (transition === 'unlock-again') {
      runtime.refreshNameLearningDueSummary = async () => false;
      await runtime.unlockGradeVault(password);
    }
    release.resolve();
    assert.equal(await refresh, false);
    assert.equal(runtime.courseCache.has(courseId), false);
    assert.deepEqual(store.state.settings.nameLearningDueSummary, summary);
  });
}

test('overview retries a course changed while its snapshot was pending', async (t) => {
  const { runtime, courseId, store } = await fixture(t);
  const started = deferred();
  const release = deferred();
  let reads = 0;
  runtime.courseRepository.getGradeCourseStateSnapshot = async () => {
    reads += 1;
    if (reads === 1) { started.resolve(); await release.promise; }
    return { gradeStudents: Array.from({ length: reads === 1 ? 1 : 2 }, (_, index) => ({ id: index + 1, courseId, portrait: 'portrait' })) };
  };
  const refresh = runtime.refreshNameLearningDueSummary();
  await started.promise;
  runtime.courseRepository.courseRevisions.set(courseId, runtime.getGradeCourseRevision(courseId) + 1);
  release.resolve();
  await refresh;
  assert.equal(reads, 2);
  assert.equal(store.state.settings.nameLearningDueSummary.complete, true);
  assert.deepEqual(store.state.settings.nameLearningDueSummary.courses[courseId], [{ dueAt: 0, count: 2 }]);
});

test('a delayed decode cannot overwrite a newer cached course', async (t) => {
  const { runtime, courseId, store } = await fixture(t);
  runtime.courseRepository.clearPlaintextCourses();
  const started = deferred();
  const release = deferred();
  const decode = runtime.courseRepository.decodeCourse;
  let first = true;
  runtime.courseRepository.decodeCourse = async (...args) => {
    const result = await decode(...args);
    if (first) { first = false; started.resolve(); await release.promise; }
    return result;
  };
  const pending = runtime.getGradeCourseStateSnapshot(courseId);
  await started.promise;
  await runtime.runGradeCourseMutation(courseId, () => {
    store.replaceGradeStudentsForCourse(courseId, store.listGradeStudents(courseId).map((student) => ({ ...student, firstName: 'Neuer' })));
  }, { skipAutoSave: true });
  release.resolve();
  const snapshot = await pending;
  assert.equal(snapshot.gradeStudents[0].firstName, 'Neuer');
  assert.equal(runtime.courseCache.get(courseId).gradeStudents[0].firstName, 'Neuer');
});

test('overview revisits a previously processed course and prioritizes the open course', async (t) => {
  const { runtime, courseId, store } = await fixture(t);
  const second = store.createCourse(store.getActiveSchoolYear().id, 'Zweiter Kurs');
  const started = deferred();
  const release = deferred();
  const order = [];
  runtime.courseRepository.loadedCourseId = second;
  runtime.courseRepository.getGradeCourseStateSnapshot = async (id) => {
    order.push(id);
    if (id === courseId) { started.resolve(); await release.promise; }
    return { gradeStudents: [] };
  };
  const refresh = runtime.refreshNameLearningDueSummary();
  await started.promise;
  assert.equal(order[0], second);
  runtime.courseRepository.courseRevisions.set(second, 1);
  release.resolve();
  await refresh;
  assert.deepEqual(order, [second, courseId, second]);
});

test('a newer overview refresh supersedes a delayed earlier refresh', async (t) => {
  const { runtime, courseId, store } = await fixture(t);
  const started = deferred();
  const release = deferred();
  let first = true;
  runtime.courseRepository.getGradeCourseStateSnapshot = async () => {
    if (first) {
      first = false;
      started.resolve();
      await release.promise;
      return { gradeStudents: [{ id: 1, courseId, portrait: 'old' }] };
    }
    return { gradeStudents: [] };
  };
  const earlier = runtime.refreshNameLearningDueSummary();
  await started.promise;
  await runtime.refreshNameLearningDueSummary();
  const summary = structuredClone(store.state.settings.nameLearningDueSummary);
  release.resolve();
  assert.equal(await earlier, false);
  assert.deepEqual(store.state.settings.nameLearningDueSummary, summary);
  await tick();
});
