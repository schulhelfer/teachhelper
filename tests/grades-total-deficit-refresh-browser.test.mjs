import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('Noteneingaben aktualisieren Defizitmarkierungen ohne Neuaufbau der Kurstabelle', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/src/modules/grades/app.css';
    const loaded = new Promise((resolve, reject) => {
      stylesheet.onload = resolve;
      stylesheet.onerror = reject;
    });
    document.head.append(stylesheet);
    await loaded;
    const root = document.createElement('div');
    root.className = 'grades-master-table';
    document.body.replaceChildren(root);
    let grade = 8;
    let averageAdjustment = 0;
    let overridden = false;
    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      refs: { gradesTable: root },
      selectedCourseId: 1,
      gradeDeficitThreshold: 4,
      store: {
        setGradeEntry(studentId, assessmentId, value) {
          grade = value === '' ? null : value + averageAdjustment;
          return true;
        },
      },
      getGradeInputRoot: () => root,
      getCurrentGradeOverviewDisplaySystem: () => 'points15',
      getCurrentGradeOverviewPredicateSuffixes: () => true,
      getCurrentGradeInputDisplaySystem: () => 'points15',
      getGradeOverrideCellState: (studentId) => ({
        value: studentId === 1 ? grade : 10,
        overridden: studentId === 1 && overridden,
      }),
      isGradeOverrideEditorActive: () => false,
      canCommitImmediateGradeCourseMutation: () => true,
      getGradeCourseRevision: () => 1,
      isHomeworkGradeInput: () => false,
      isTestGradeInput: () => false,
      clearGradeEntrySkipped() {},
      applyGradeSkippedPlaceholder() {},
      refreshImmediateGradeInputRevisionTokens() {},
      refreshVisibleGradeEntryAverage() {},
      applyVisibleHomeworkSummaryToneClasses() {},
      renderGradePrivacyOverlay() {},
    });
    for (const studentId of [1, 2]) {
      for (const period of ['h1', 'h2', 'year']) {
        for (const scope of ['course', 'category', 'subcategory']) {
          root.append(app.createGradeOverrideButton(studentId, 1, scope, grade, { period }));
        }
      }
    }
    const buttons = [...root.querySelectorAll('button')];
    const input = document.createElement('input');
    Object.assign(input.dataset, { studentId: '1', courseId: '1', assessmentId: '7', gradeCourseRevision: '1' });
    root.append(input);
    const read = () => buttons.map((button) => ({
      low: button.classList.contains('is-grade-low'),
      overridden: button.classList.contains('is-overridden'),
      color: getComputedStyle(button.querySelector('.grade-total-value')).webkitTextFillColor,
      text: button.textContent,
      tooltip: button.dataset.gradeTooltip,
    }));
    const change = (value) => {
      input.value = value;
      if (!app.commitGradeCellInput(input)) throw new Error('Noteneingabe fehlgeschlagen');
      return read();
    };
    const initial = read();
    const deficit = change('04');
    averageAdjustment = 0.46;
    const fractionalDeficit = change('04');
    const renderedFractional = app.createGradeOverrideButton(1, 1, 'course', grade).querySelector('button');
    const fractionalInitiallyLow = renderedFractional.classList.contains('is-grade-low');
    averageAdjustment = 0.5;
    const boundary = change('04');
    averageAdjustment = 0;
    const recovered = change('05');
    change('00');
    const cleared = change('');
    change('03');
    overridden = true;
    const manual = change('02');
    overridden = false;
    const computed = change('01');
    return { initial, deficit, fractionalDeficit, fractionalInitiallyLow, boundary, recovered, cleared, manual, computed,
      sameButtons: buttons.every((button) => root.contains(button)) };
  });

  assert.ok(result.sameButtons);
  assert.ok(result.fractionalInitiallyLow);
  for (let index = 0; index < 9; index += 1) {
    assert.equal(result.initial[index].low, false);
    assert.equal(result.deficit[index].low, true);
    assert.equal(result.deficit[index].color, 'rgb(248, 113, 113)');
    assert.equal(result.fractionalDeficit[index].low, true);
    assert.equal(result.fractionalDeficit[index].color, 'rgb(248, 113, 113)');
    assert.equal(result.fractionalDeficit[index].text, '04');
    assert.equal(result.fractionalDeficit[index].tooltip, '4,5');
    assert.equal(result.boundary[index].low, false);
    assert.equal(result.boundary[index].text, '05');
    assert.equal(result.recovered[index].low, false);
    assert.equal(result.cleared[index].low, false);
    assert.equal(result.manual[index].low, false);
    assert.equal(result.manual[index].overridden, true);
    assert.equal(result.manual[index].color, 'rgb(245, 158, 11)');
    assert.equal(result.computed[index].low, true);
    assert.equal(result.computed[index].overridden, false);
  }
  for (const state of Object.values(result).filter(Array.isArray)) {
    assert.deepEqual(state.slice(9), result.initial.slice(9));
  }
});
