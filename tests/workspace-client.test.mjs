import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { createWorkspaceController } from '../src/modules/workspace/index.js';
import { createFeatureWorkspaceClient, createWorkspaceClient, getWorkspaceClient } from '../src/modules/workspace/client.js';

function workspace(t) {
  const controller = createWorkspaceController({ ephemeral: true });
  t.after(() => controller.dispose());
  return {
    controller,
    planning: createWorkspaceClient(controller, 'planning'),
    grades: createWorkspaceClient(controller, 'grades'),
    shell: createWorkspaceClient(controller, 'shell'),
  };
}

async function gradeCourse(t) {
  const context = workspace(t);
  const { grades } = context;
  await grades.operations.setGradeVaultEncryptionEnabledFromSettings(false);
  const year = grades.data.getActiveSchoolYear();
  const courseId = grades.data.createCourse(year.id, 'Biologie', '#3CB44B');
  await grades.operations.ensureGradeCourseLoaded(courseId);
  return { ...context, courseId };
}

test('queries and command results are detached from workspace state', (t) => {
  const { planning, grades } = workspace(t);
  const year = planning.data.getActiveSchoolYear();
  year.name = 'outside';
  assert.notEqual(planning.data.getActiveSchoolYear().name, 'outside');
  const courseId = planning.data.createCourse(year.id, 'Biologie', '#3CB44B');
  const course = planning.data.listCourses(year.id)[0];
  course.name = 'outside';
  assert.equal(grades.data.getCourse(courseId).name, 'Biologie');
  const setting = { nested: ['original'] };
  planning.data.setSetting('testSetting', setting);
  setting.nested.push('outside');
  planning.data.getSetting('testSetting').nested.push('outside');
  assert.deepEqual(grades.data.getSetting('testSetting'), { nested: ['original'] });
  const snapshot = planning.getSnapshot();
  snapshot.publicState.courses.length = 0;
  assert.equal(planning.data.listCourses(year.id).length, 1);
});

test('synchronous planning edits notify clients before returning and invalidate stale commands', async (t) => {
  const { planning, grades } = workspace(t);
  const events = [];
  grades.subscribe((detail) => events.push(detail.revision));
  const before = planning.getRevision();
  const year = planning.data.getActiveSchoolYear();
  planning.data.createCourse(year.id, 'Biologie', '#3CB44B');
  assert.ok(events.at(-1) > before);
  const result = await planning.execute('apply-settings', { settings: { hoursPerDay: 9 } }, { baseRevision: before });
  assert.equal(result.code, 'STALE_STATE');
  assert.notEqual(planning.data.getHoursPerDay(), 9);
});

test('features have a fixed list of methods and no store, runtime, or save hooks', (t) => {
  const { controller, planning, grades } = workspace(t);
  assert.ok(Object.isFrozen(planning.data));
  assert.ok(Object.isFrozen(grades.operations));
  for (const client of [planning, grades]) {
    for (const key of ['state', 'gradeVaultState', '_save', '_suspendSaveHooks', 'setAfterSaveHooks', 'normalizePublicState']) {
      assert.equal(key in client.data, false, key);
    }
    for (const key of ['store', 'syncState', 'backupState', 'courseCache', 'vault', 'syncMeta']) {
      assert.equal(key in client.operations, false, key);
    }
    assert.equal('controller' in client, false);
    assert.equal('getStore' in client, false);
    assert.equal('getOwner' in client, false);
  }
  assert.equal('setGradeEntry' in planning.data, false);
  assert.equal('lockGradeVaultSession' in planning.operations, false);
  assert.equal('createSlot' in grades.data, false);
  const seatplan = createWorkspaceClient(controller, 'seatplan');
  assert.deepEqual(Object.keys(seatplan.data), []);
  assert.deepEqual(Object.keys(seatplan.operations), []);
});

test('subscribing to shell status does not change the feature command permissions', async (t) => {
  const { planning } = workspace(t);
  planning.subscribe('shell', () => {});
  assert.equal(planning.scope, 'planning');
  assert.throws(() => { planning.scope = 'shell'; }, TypeError);
  const result = await planning.execute('owner-action', { action: 'vault-lock' });
  assert.equal(result.code, 'UNSUPPORTED');
});

test('grade entry replacement and name learning edits commit through the course transaction', async (t) => {
  const { grades, courseId } = await gradeCourse(t);
  const students = await grades.operations.runGradeCourseMutation(courseId, () => grades.data.replaceGradeStudentsForCourse(courseId, [
    { firstName: 'Ada', lastName: 'Beispiel' },
  ]));
  students[0].firstName = 'outside';
  assert.equal(grades.data.listGradeStudents(courseId)[0].firstName, 'Ada');
  const studentId = students[0].id;
  const assessmentId = await grades.operations.runGradeCourseMutation(courseId, () => grades.data.createGradeAssessment(courseId, { title: 'Mitarbeit', mode: 'grade' }));
  await grades.operations.runGradeCourseMutation(courseId, () => {
    grades.data.setGradeEntry(studentId, assessmentId, 12);
    grades.data.saveNameLearningProgress(courseId, studentId, { stage: 2, dueAt: 123 });
  }, { preserveRoster: true });
  assert.equal(grades.data.listGradeEntries().length, 1);
  const before = grades.data.exportGradeVaultStateSnapshot();
  await assert.rejects(grades.operations.runGradeCourseMutation(courseId, () => {
    grades.data.clearGradeAssessmentEntries(assessmentId);
    grades.data.saveNameLearningProgress(courseId, studentId, { stage: 3, dueAt: 456 });
    throw new Error('rollback');
  }, { preserveRoster: true }), /rollback/);
  assert.deepEqual(grades.data.exportGradeVaultStateSnapshot(), before);
  await grades.operations.runGradeCourseMutation(courseId, () => grades.data.clearGradeAssessmentEntries(assessmentId), { preserveRoster: true });
  assert.deepEqual(grades.data.listGradeEntries(), []);
  assert.deepEqual(grades.data.exportGradeVaultStateSnapshot().gradeNameLearning, [{ courseId, studentId, stage: 2, dueAt: 123 }]);
  await assert.rejects(grades.operations.runGradeCourseMutation(courseId, () => grades.data.saveNameLearningProgress(courseId, 9999, { stage: 1, dueAt: 0 })), { code: 'NAME_LEARNING_STUDENT_MISSING' });
});

test('immediate grade edits are blocked while a course transaction is active', async (t) => {
  const { grades, courseId } = await gradeCourse(t);
  assert.equal(grades.operations.canCommitImmediateGradeCourseMutation(courseId), true);
  assert.equal(grades.operations.canCommitImmediateGradeCourseMutation(courseId + 1), false);
  assert.equal(grades.operations.canCommitImmediateGradeCourseMutation(courseId, { studentId: 9999 }), false);
  await grades.operations.runGradeCourseMutation(courseId, () => {
    assert.equal(grades.operations.getGradeCourseActivity().mutationCourseId, courseId);
    assert.equal(grades.operations.canCommitImmediateGradeCourseMutation(courseId), false);
  });
  assert.equal(grades.operations.getGradeCourseActivity().mutationCourseId, null);
});

test('reading another course preserves the active course and returns detached data', async (t) => {
  const { grades, courseId } = await gradeCourse(t);
  const secondId = grades.data.createCourse(grades.data.getActiveSchoolYear().id, 'Chemie', '#3CB44B');
  await grades.operations.runGradeCourseMutation(secondId, () => grades.data.replaceGradeStudentsForCourse(secondId, [{ firstName: 'Sam', lastName: 'Beispiel' }]));
  await grades.operations.ensureGradeCourseLoaded(courseId);
  const summary = await grades.operations.getGradeCourseRosterSummary(secondId);
  assert.equal(summary.studentCount, 1);
  const state = await grades.operations.getGradeCourseStateSnapshot(secondId);
  state.gradeStudents.length = 0;
  assert.equal((await grades.operations.getGradeCourseStateSnapshot(secondId)).gradeStudents.length, 1);
  assert.equal(grades.operations.isGradeCourseLoaded(courseId), true);
});

test('persistence presentation exposes names and flags without filesystem handles', (t) => {
  const { controller, grades } = workspace(t);
  const runtime = controller.getOwner();
  runtime.fileHandle = { name: 'School.json', createWritable() {} };
  runtime.backupDirectoryHandle = { name: 'Backups', getFileHandle() {} };
  runtime.storedFileHandle = { name: 'Pending.json', requestPermission() {} };
  runtime.storedBackupDirectoryHandle = { name: '', requestPermission() {} };
  const view = grades.operations.getPersistenceView();
  assert.equal(view.sync.connected, true);
  assert.equal(view.sync.pendingFileName, 'Pending.json');
  assert.equal(view.sync.pending, true);
  assert.equal(view.backup.directoryName, 'Backups');
  assert.equal(view.backup.pending, true);
  assert.doesNotMatch(JSON.stringify(view), /Handle/);
  view.manual.fileName = 'outside';
  assert.notEqual(grades.operations.getPersistenceView().manual.fileName, 'outside');
});

test('feature connection shares a same-origin workspace and isolates tutorial and standalone clients', (t) => {
  const { controller } = workspace(t);
  const host = { location: { origin: 'https://teachhelper.test' }, __teachhelperWorkspaceController: controller };
  const frame = { location: { origin: 'https://teachhelper.test' }, parent: host };
  const shared = createFeatureWorkspaceClient('planning', { targetWindow: frame });
  shared.data.setSetting('testConnection', true);
  assert.equal(getWorkspaceClient(host).data.getSetting('testConnection'), true);
  assert.equal(getWorkspaceClient(host), getWorkspaceClient(host));
  const isolated = createFeatureWorkspaceClient('planning', { targetWindow: frame, isolated: true });
  assert.equal(isolated.data.getSetting('testConnection'), null);
  assert.equal(isolated.operations.getPersistenceView().sync.supported, false);
  const standalone = createFeatureWorkspaceClient('grades', { targetWindow: new EventTarget() });
  assert.equal(standalone.operations.hasShellDatabaseConnection(), false);
});

test('disposed clients cannot use previously obtained methods', (t) => {
  const { controller, planning } = workspace(t);
  const query = planning.data.getActiveSchoolYear;
  controller.dispose();
  assert.throws(query, /nicht mehr verfügbar/);
});

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'vendor' || entry.name === 'workspace') continue;
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

test('production consumers cannot access raw workspace store or owner', async () => {
  for (const file of await sourceFiles(new URL('../src/', import.meta.url))) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\b(?:getStore|getOwner)\s*(?:\?\.)?\s*\(/, file.pathname);
  }
  for (const module of ['planning', 'grades']) {
    for (const file of await sourceFiles(new URL(`../src/modules/${module}/`, import.meta.url))) {
      const source = await readFile(file, 'utf8');
      assert.doesNotMatch(source, /from\s*["']\.\.\/workspace\/(?!client\.js["'])/, file.pathname);
      assert.doesNotMatch(source, /__teachhelperWorkspaceController|\.store\.(?:state|gradeVaultState|_\w+)/, file.pathname);
    }
  }
});
