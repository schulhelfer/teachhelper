import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceModuleLoader } from './helpers/workspace-modules.mjs';
import { loadGradesInternals } from './helpers/grades-module.mjs';

const load = createWorkspaceModuleLoader({
  './archive-pdf.js': 'export async function buildWorkspaceArchivePdfBytes() {} export function downloadWorkspaceArchivePdf() {}',
});
const { WorkspaceStore } = await import(await load('store.js'));
const { WorkspaceRuntime } = await import(await load('runtime.js'));
const { GradesApp, normalizeGradeClassFlair } = await loadGradesInternals(['GradesApp', 'normalizeGradeClassFlair']);

test('class flairs accept only a–g and normalize uppercase and legacy values', () => {
  for (const value of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
    assert.equal(normalizeGradeClassFlair(value), value);
    assert.equal(normalizeGradeClassFlair(` ${value.toUpperCase()} `), value);
  }
  for (const value of [undefined, null, '', 'h', 'ab', '7a', 1, {}, ['a']]) {
    assert.equal(normalizeGradeClassFlair(value), '');
  }
});

test('student replacement and vault snapshots retain optional class flairs per course', () => {
  const store = new WorkspaceStore();
  const year = store.getActiveSchoolYear();
  const first = store.createCourse(year.id, 'Erster Kurs');
  const second = store.createCourse(year.id, 'Zweiter Kurs');
  store.replaceGradeStudentsForCourse(first, [
    { firstName: 'Alex', classFlair: 'B', performanceFlair: 'P2' },
    { firstName: 'Kim' },
    { firstName: 'Sam', classFlair: 'h' },
  ]);
  store.replaceGradeStudentsForCourse(second, [{ firstName: 'Alex', classFlair: 'g' }]);
  const students = store.listGradeStudents(first);
  assert.deepEqual(students.map((student) => student.classFlair), ['b', '', '']);
  store.replaceGradeStudentsForCourse(first, students.map((student) => ({ ...student, classFlair: 'C' })));
  const snapshot = JSON.parse(JSON.stringify(store.exportGradeVaultStateSnapshot()));
  store.replaceGradeVaultState(snapshot);
  assert.deepEqual(store.listGradeStudents(first).map((student) => student.classFlair), ['c', 'c', 'c']);
  assert.equal(store.listGradeStudents(first)[0].performanceFlair, 'P2');
  assert.equal(store.listGradeStudents(second)[0].classFlair, 'g');
  snapshot.gradeStudents.forEach((student) => delete student.classFlair);
  store.replaceGradeVaultState(snapshot);
  assert.ok(store.listGradeStudents(first).every((student) => student.classFlair === ''));
});

for (const encrypted of [false, true]) {
  test(`class flairs survive a THDB1 round-trip with encryption ${encrypted ? 'enabled' : 'disabled'}`, async (t) => {
    const store = new WorkspaceStore();
    const runtime = new WorkspaceRuntime(store, { ephemeral: true, eventTarget: new EventTarget() });
    const targetStore = new WorkspaceStore();
    const target = new WorkspaceRuntime(targetStore, { ephemeral: true, eventTarget: new EventTarget() });
    t.after(() => { runtime.disposeGradeVaultSession(); target.disposeGradeVaultSession(); });
    const courseId = store.createCourse(store.getActiveSchoolYear().id, 'Klassenkurs');
    await runtime.runGradeCourseMutation(courseId, () => {
      store.replaceGradeStudentsForCourse(courseId, [{ firstName: 'Alex', classFlair: 'C' }]);
    }, { skipAutoSave: true });
    const password = 'sicheres-test-passwort';
    if (encrypted) await runtime.setupGradeVault(password);
    else store.setGradeVaultEncryptionEnabled(false);
    const built = await runtime.buildContainer('class-flair-test');
    await target.loadBytes(built.bytes);
    if (encrypted) assert.equal(await target.unlockGradeVault(password), true);
    const snapshot = await target.getGradeCourseStateSnapshot(courseId);
    assert.equal(snapshot.gradeStudents[0].classFlair, 'c');
  });
}

test('class sorting preserves the selected name order and never mutates entry order or source', () => {
  const app = Object.create(GradesApp.prototype);
  const students = [
    { id: 1, firstName: 'Zoe', lastName: 'A', classFlair: 'b' },
    { id: 2, firstName: 'Ben', lastName: 'Z', classFlair: 'a' },
    { id: 3, firstName: 'Ada', lastName: 'B', classFlair: 'a' },
    { id: 4, firstName: 'Aaron', lastName: 'AA' },
    { id: 5, firstName: 'Chris', lastName: 'C', classFlair: 'g' },
  ];
  app.gradesOverviewNameOrder = 'last';
  app.gradesEntryNameOrder = 'first';
  const ids = (rows) => rows.map((student) => student.id);
  assert.deepEqual(ids(app.getSortedGradeOverviewStudents(students)), [1, 4, 3, 5, 2]);
  app.gradesOverviewSortByClass = true;
  assert.deepEqual(ids(app.getSortedGradeOverviewStudents(students)), [3, 2, 1, 5, 4]);
  app.gradesOverviewNameOrder = 'first';
  assert.deepEqual(ids(app.getSortedGradeOverviewStudents(students)), [3, 2, 1, 5, 4]);
  students[1].firstName = 'Abe';
  assert.deepEqual(ids(app.getSortedGradeOverviewStudents(students)), [2, 3, 1, 5, 4]);
  assert.deepEqual(ids(app.getSortedGradeStudentsForNameOrder(students)), [4, 2, 3, 5, 1]);
  assert.deepEqual(ids(students), [1, 2, 3, 4, 5]);
});

test('CSV re-import keeps classes only on unique name matches and course import copies new rows', () => {
  const app = Object.create(GradesApp.prototype);
  app.courseDialogDraft = { students: [
    { id: 1, lastName: 'Muster', firstName: 'Alex', classFlair: 'c' },
    { id: 2, lastName: 'Doppelt', firstName: 'Kim', classFlair: 'a' },
    { id: 3, lastName: 'Doppelt', firstName: 'Kim', classFlair: 'b' },
  ] };
  const imported = app.extractStudentsFromCsvRows([
    ['Nachname', 'Vorname', 'Klasse'], ['Muster', 'Alex', 'g'], ['Doppelt', 'Kim', 'g'], ['Neu', 'Sam', 'a'],
  ], ';').students;
  assert.equal(imported.find((student) => student.firstName === 'Alex').classFlair, 'c');
  assert.equal(imported.find((student) => student.firstName === 'Kim').classFlair, '');
  assert.equal(imported.find((student) => student.firstName === 'Sam').classFlair, '');
  const duplicates = app.extractStudentsFromCsvRows([
    ['Nachname', 'Vorname'], ['Muster', 'Alex'], ['Muster', 'Alex'],
  ], ';').students;
  assert.ok(duplicates.every((student) => student.classFlair === ''));
  app.appendCourseDialogStudents([
    { lastName: 'Muster', firstName: 'Alex', classFlair: 'g' },
    { lastName: 'Neu', firstName: 'Sam', classFlair: 'F' },
  ]);
  assert.equal(app.courseDialogDraft.students.find((student) => student.firstName === 'Alex').classFlair, 'c');
  assert.equal(app.courseDialogDraft.students.find((student) => student.firstName === 'Sam').classFlair, 'f');
});
