import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('BE entry navigation scrolls the focused score cell clear of sticky header and name column', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const course = { id: 1, name: 'Kurs', color: '#336699' };
    const students = Array.from({ length: 16 }, (_, index) => ({ id: index + 1, firstName: `Person ${index + 1}` }));
    const snapshot = {
      id: 'sek2', label: 'Schlüssel',
      thresholds: Array.from({ length: 16 }, (_, index) => [(15 - index) / 20, 15 - index]),
    };
    const testTasks = Array.from({ length: 12 }, (_, index) => ({
      id: `t${index + 1}`, title: `Aufgabe ${index + 1}`, maxBe: 10, afb: 'I',
    }));
    const assessment = {
      id: 7, courseId: 1, title: 'Test', mode: 'test', halfYear: 'h1', categoryId: 1,
      testScale: 'sek2', testScaleSnapshot: snapshot, testPredicateSuffixes: true, testTasks,
    };
    const style = document.createElement('style');
    style.textContent = `
      #grades-entry-content { position: relative; width: 360px; height: 220px; overflow: hidden; padding: 0; }
      #grades-entry-content table { border-collapse: separate; border-spacing: 0; }
      #grades-entry-content th, #grades-entry-content td { min-width: 90px; height: 32px; background: #fff; }
      #grades-entry-content thead th { position: sticky; top: 0; z-index: 5; }
      #grades-entry-content .student-col { position: sticky; left: 0; z-index: 7; min-width: 140px; }
    `;
    const content = document.createElement('div');
    content.id = 'grades-entry-content';
    document.head.append(style);
    document.body.replaceChildren(content);
    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      refs: { gradesEntryContent: content }, selectedCourseId: 1,
      selectedGradesEntryAssessmentId: 7,
      gradeDeficitThreshold: 5,
      store: {
        getGradeAssessment: () => structuredClone(assessment),
        listGradeEntries: () => [],
        getGradeEntry: () => null,
        listGradeStudents: () => students,
        listCourses: () => [course],
        createGradeAssessmentSnapshot: () => ({ assessment, entries: [] }),
        getGradeTestScaleSettings: () => null,
        buildGradeTestScaleSnapshot: () => snapshot,
      },
      getGradeCourseRevision: () => 1,
      resolveGradeOccurrenceCategoryId: () => null,
      getGradesEntryStructureCategories: () => [{ id: 1, subcategories: [] }],
      getMostUsedGradeAssessmentSelection: () => ({ categoryId: 1, subcategoryId: null }),
      getSortedGradeStudentsForNameOrder: (items) => items,
      getGradeStudentDisplayName: (student) => student.firstName,
      getGradeStudentPortraitUrl: () => '',
      shouldShowGradeStudentPortraitPlaceholders: () => false,
      getCurrentGradeOverviewDisplaySystem: () => 'points',
      getCurrentGradeOverviewPredicateSuffixes: () => true,
      courseAllowsGrades: () => true,
      updateGradeVaultActionButtons() {}, dispatchGradesUnsavedState() {},
      syncSegmentControlSlideStates() {},
      isGradeCourseMutationContextActive: () => true,
    });
    Object.defineProperty(app, 'activeSchoolYear', { value: { id: 1 } });
    const draft = app.getGradesEntryAssessmentDraft(assessment);
    content.replaceChildren(app.buildGradesTestEntryTable(course, students, assessment, draft));
    const scoreInput = (studentId, taskId) => content.querySelector(
      `input[data-grade-test-score='1'][data-student-id="${studentId}"][data-task-id="${taskId}"]`
    );
    const visibility = (input) => {
      const rootRect = content.getBoundingClientRect();
      const cellRect = input.closest('td').getBoundingClientRect();
      const headBottom = content.querySelector('thead').getBoundingClientRect().bottom;
      const nameRight = input.closest('tr').querySelector('.student-col').getBoundingClientRect().right;
      return {
        belowHead: cellRect.top >= headBottom - 0.5,
        aboveBottom: cellRect.bottom <= rootRect.bottom + 0.5,
        rightOfName: cellRect.left >= nameRight - 0.5,
        insideRight: cellRect.right <= rootRect.right + 0.5,
      };
    };
    const farInput = scoreInput(16, 't12');
    const initiallyVisible = visibility(farInput);
    const farScrolled = app.scrollGradeInputIntoView(farInput);
    const farState = { top: content.scrollTop, left: content.scrollLeft, ...visibility(farInput) };
    const settledAgain = app.scrollGradeInputIntoView(farInput);
    const upperInput = scoreInput(1, 't12');
    app.scrollGradeInputIntoView(upperInput);
    const upperState = visibility(upperInput);
    content.scrollLeft = content.scrollWidth;
    const leftInput = scoreInput(1, 't1');
    const leftHiddenBefore = !visibility(leftInput).rightOfName;
    app.scrollGradeInputIntoView(leftInput);
    const leftState = visibility(leftInput);
    return { initiallyVisible, farScrolled, farState, settledAgain, upperState, leftHiddenBefore, leftState };
  });

  assert.equal(result.initiallyVisible.aboveBottom && result.initiallyVisible.insideRight, false);
  assert.equal(result.farScrolled, true);
  assert.ok(result.farState.top > 0);
  assert.ok(result.farState.left > 0);
  assert.deepEqual(
    [result.farState.belowHead, result.farState.aboveBottom, result.farState.rightOfName, result.farState.insideRight],
    [true, true, true, true]
  );
  assert.equal(result.settledAgain, false);
  assert.equal(result.upperState.belowHead, true);
  assert.equal(result.leftHiddenBefore, true);
  assert.equal(result.leftState.rightOfName, true);
});
