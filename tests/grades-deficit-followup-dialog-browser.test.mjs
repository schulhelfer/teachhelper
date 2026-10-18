import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('BE follow-up dialog lists affected learners per flagged task', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const [{ GradesApp }, { WorkspaceStore }, { WorkspaceRuntime }, { createWorkspacePublicApi }] = await Promise.all([
      import('/src/modules/grades/app.js?dom-test'),
      import('/src/modules/workspace/store.js'),
      import('/src/modules/workspace/runtime.js'),
      import('/src/modules/workspace/public-api.js'),
    ]);
    const store = new WorkspaceStore();
    const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
    const year = store.getActiveSchoolYear();
    const courseId = store.createCourse(year.id, 'Testkurs', '#336699');
    const testTasks = [
      { id: 't1', title: 'Aufgabe 1', maxBe: 6, afb: 'I', deficitDiagnosisFollowUp: true },
      { id: 't2', title: 'Aufgabe 2', maxBe: 6, afb: 'I' },
      { id: 't3', title: 'Aufgabe 3', maxBe: 9, afb: 'II', deficitDiagnosisFollowUp: true },
      { id: 't4', title: 'Aufgabe 4', maxBe: 6, afb: 'III', deficitDiagnosisFollowUp: true },
    ];
    const xssName = '<img src=x onerror="window.__followUpXss = true">';
    let assessmentId;
    let gradeAssessmentId;
    let quietAssessmentId;
    await runtime.runGradeCourseMutation(courseId, () => {
      store.replaceGradeStudentsForCourse(courseId, [
        { firstName: 'Anna', lastName: 'Test' },
        { firstName: 'Ben', lastName: 'Test' },
        { firstName: 'Cem', lastName: 'Test' },
        { firstName: xssName, lastName: 'Test' },
      ]);
      const categoryId = store.getGradeStructureForPeriod(courseId, 'h1').categories[0].id;
      assessmentId = store.createGradeAssessment(courseId, {
        title: 'Klausur 1', mode: 'test', halfYear: 'h1', categoryId, testTasks, testScale: 'sek2',
      });
      quietAssessmentId = store.createGradeAssessment(courseId, {
        title: 'Klausur 2', mode: 'test', halfYear: 'h1', categoryId, testTasks, testScale: 'sek2',
      });
      gradeAssessmentId = store.createGradeAssessment(courseId, {
        title: 'Mündlich', mode: 'grade', halfYear: 'h1', categoryId,
      });
      const byName = (name) => store.listGradeStudents(courseId).find((student) => student.firstName === name);
      const [anna, ben, cem, xss] = ['Anna', 'Ben', 'Cem', xssName].map(byName);
      store.setGradeTestEntry(anna.id, assessmentId, { t1: 1, t2: 0, t3: 3, t4: 2 });
      store.setGradeTestEntry(ben.id, assessmentId, { t1: 2, t2: 6, t3: 2, t4: 6 });
      store.setGradeTestEntry(cem.id, assessmentId, { t2: 1, t3: 0, t4: 3 });
      store.setGradeTestEntry(xss.id, assessmentId, { t1: 0, t2: 6, t3: 9, t4: 6 });
      for (const student of [anna, ben, cem, xss]) {
        store.setGradeTestEntry(student.id, quietAssessmentId, { t1: 6, t2: 0, t3: 9, t4: 6 });
      }
    }, { skipAutoSave: true });

    const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => runtime, scope: 'grades' });
    const dialog = document.createElement('dialog');
    const form = document.createElement('form');
    const summary = document.createElement('div');
    const list = document.createElement('div');
    form.append(summary, list);
    dialog.append(form);
    document.body.replaceChildren(dialog);

    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      store: api.data,
      refs: {
        gradeDeficitFollowUpDialog: dialog,
        gradeDeficitFollowUpSummary: summary,
        gradeDeficitFollowUpList: list,
      },
      getSortedGradeStudentsForNameOrder: (students) => students,
      getGradeStudentDisplayName: (student) => student.firstName,
    });

    const readList = () => [...list.querySelectorAll('.grade-deficit-followup-task')].map((section) => ({
      task: section.querySelector('.grade-deficit-followup-task-title')?.textContent,
      students: [...section.querySelectorAll('li')].map((item) => item.textContent),
    }));

    const opened = app.showGradeDeficitFollowUpsAfterSave(courseId, assessmentId);
    const afterSave = {
      opened,
      dialogOpen: dialog.open,
      summary: summary.textContent,
      groups: readList(),
      injectedImages: list.querySelectorAll('img').length,
    };
    app.closeGradeDeficitFollowUpDialog();

    const students = api.data.listGradeStudents(courseId);
    const assessment = api.data.getGradeAssessment(assessmentId);
    const cem = students.find((student) => student.firstName === 'Cem');
    const ben = students.find((student) => student.firstName === 'Ben');
    const draftResult = app.collectGradeDeficitFollowUpGroups({
      students,
      assessment,
      draft: { entries: { [cem.id]: { testScores: { t3: 5 } } } },
      values: {
        testTasks: assessment.testTasks,
        entries: { [ben.id]: { testScores: { t3: 4, t4: 1 } } },
      },
    });

    const quietOpened = app.showGradeDeficitFollowUpsAfterSave(courseId, quietAssessmentId);
    const quietDialogOpen = dialog.open;
    const gradeOpened = app.showGradeDeficitFollowUpsAfterSave(courseId, gradeAssessmentId);

    app.renderGradeDeficitFollowUpDialogList({ flaggedTaskCount: 2, groups: [] });
    const emptyWithFlags = list.textContent;
    app.renderGradeDeficitFollowUpDialogList(app.collectGradeDeficitFollowUpGroups({
      students,
      values: { testTasks: [{ id: 'x', maxBe: 4 }] },
    }));
    const emptyWithoutFlags = list.textContent;

    return {
      afterSave,
      draftGroups: draftResult.groups.map((group) => ({
        task: group.label,
        students: group.students.map((student) => student.name),
      })),
      draftFlaggedTaskCount: draftResult.flaggedTaskCount,
      quietOpened,
      quietDialogOpen,
      gradeOpened,
      emptyWithFlags,
      emptyWithoutFlags,
      xssExecuted: window.__followUpXss === true,
    };
  });

  assert.equal(result.afterSave.opened, true);
  assert.equal(result.afterSave.dialogOpen, true);
  assert.equal(result.afterSave.summary, 'Klausur 1 · Testkurs');
  assert.deepEqual(result.afterSave.groups, [
    { task: 'Aufgabe 1', students: ['<img src=x onerror="window.__followUpXss = true">', 'Anna'] },
    { task: 'Aufgabe 3', students: ['Ben', 'Cem'] },
  ]);
  assert.equal(result.afterSave.injectedImages, 0);
  assert.equal(result.xssExecuted, false);

  assert.equal(result.draftFlaggedTaskCount, 3);
  assert.deepEqual(result.draftGroups, [
    { task: 'Aufgabe 1', students: ['<img src=x onerror="window.__followUpXss = true">', 'Anna'] },
    { task: 'Aufgabe 4', students: ['Ben'] },
  ]);

  assert.equal(result.quietOpened, false);
  assert.equal(result.quietDialogOpen, false);
  assert.equal(result.gradeOpened, false);
  assert.equal(result.emptyWithFlags, 'Keine Lernenden mit Nachbereitungshinweis.');
  assert.equal(result.emptyWithoutFlags, 'Für keine Aufgabe ist eine Nachbereitung vorgesehen.');
});
