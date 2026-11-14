import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('BE subtasks preserve existing results, edit independently, collapse and persist', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const { WorkspaceStore } = await import('/src/modules/workspace/store.js');
    const { createWorkspacePublicApi } = await import('/src/modules/workspace/public-api.js');
    await new Promise((resolve, reject) => {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = '/src/modules/grades/app.css';
      style.onload = resolve;
      style.onerror = reject;
      document.head.append(style);
    });
    const store = new WorkspaceStore();
    const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => ({}), scope: 'grades' });
    const courseId = store.createCourse(store.getActiveSchoolYear().id, 'Testkurs', '#336699');
    const course = store.listCourses(store.getActiveSchoolYear().id).find((item) => item.id === courseId);
    store.replaceGradeStudentsForCourse(courseId, [{ firstName: 'Lernperson 1' }, { firstName: 'Lernperson 2' }]);
    const students = store.listGradeStudents(courseId);
    store.saveGradeStructure(courseId, [{ name: 'Leistungen', weight: 1 }]);
    const categoryId = store.getGradeStructureForPeriod(courseId, 'h1').categories[0].id;
    const assessmentId = store.createGradeAssessment(courseId, {
      mode: 'test', title: 'Testleistung', categoryId, halfYear: 'h1', testScale: 'sek2',
      testTasks: [
        { id: 'main', maxBe: 3, afb: 'I', deficitDiagnosisFollowUp: true, competenceExpectationIds: ['k1'] },
        { id: 'single', maxBe: 2.5, afb: 'III' },
      ],
      competenceExpectations: [{ id: 'topic', competencies: [{ id: 'k1', text: 'Erwartung A' }, { id: 'k2', text: 'Erwartung B' }] }],
    });
    store.setGradeTestEntry(students[0].id, assessmentId, { main: 2, single: 1.5 });
    store.setGradeTestEntry(students[1].id, assessmentId, { main: 0 });
    const original = structuredClone(store.createGradeAssessmentSnapshot(assessmentId));
    const content = document.createElement('div');
    content.id = 'grades-entry-content';
    const custom = document.createElement('textarea');
    document.body.replaceChildren(content, custom);
    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      store: api.data, refs: { gradesEntryContent: content, gradeTaskCompetenceCustom: custom },
      selectedCourseId: courseId, selectedGradesEntryAssessmentId: assessmentId,
      gradeDeficitThreshold: 5, currentView: 'grades', gradesSubView: 'entry',
      getGradeCourseRevision: () => 1, resolveGradeOccurrenceCategoryId: () => null,
      getSortedGradeStudentsForNameOrder: (values) => values,
      getGradeStudentDisplayName: (student) => student.firstName,
      getGradeStudentPortraitUrl: () => '', shouldShowGradeStudentPortraitPlaceholders: () => false,
      getCurrentGradeOverviewDisplaySystem: () => 'points15', getCurrentGradeOverviewPredicateSuffixes: () => true,
      getGradeInputRoot: () => content, isGradeCourseNavigationEventBlocked: () => false,
      updateGradeVaultActionButtons() {}, dispatchGradesUnsavedState() {}, refreshGradeTotals() {},
      renderGradePrivacyOverlay() {}, refreshVisibleGradesEntryDistribution() {},
      renderGradesEntryDistributionOverlay() {}, syncSegmentControlSlideStates() {},
      updateGradesEntryTableStickyScrollbar() {}, hideGradePicker() {},
      isGradeCourseMutationContextActive: () => true,
      showConfirmMessage: async () => true,
    });
    const render = () => content.replaceChildren(app.buildGradesTestEntryTable(course, students, store.getGradeAssessment(assessmentId)));
    app.renderGradesView = render;
    const click = async (target) => app.handleGradesSurfaceClick({ target, preventDefault() {}, stopPropagation() {} });
    const inputFor = (taskId, studentId = students[0].id) => [...content.querySelectorAll('[data-grade-test-score]')]
      .find((node) => node.dataset.taskId === taskId && Number(node.dataset.studentId) === studentId);
    const summary = (studentId = students[0].id) => [...content.querySelectorAll('[data-grade-test-group-student]')]
      .find((node) => Number(node.dataset.gradeTestGroupStudent) === studentId)?.textContent;
    const ratio = () => content.querySelector('[data-grade-test-ratio-student]').textContent;
    const buttonLayout = () => {
      const button = content.querySelector('[data-grade-test-add-subtask="main"]');
      const cell = button.closest('th');
      const title = cell.querySelector('.grade-test-task-title, .grade-test-group-title');
      const number = title.querySelector('.grade-test-task-number');
      const buttonRect = button.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const numberRect = number.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      const actions = [...button.parentElement.children].filter((node) => node.tagName === 'BUTTON');
      const actionRects = actions.map((action) => action.getBoundingClientRect());
      const lines = [...button.querySelector('.grade-test-subtask-icon').children];
      const iconRect = button.querySelector('.grade-test-subtask-icon').getBoundingClientRect();
      const iconStyle = getComputedStyle(button.querySelector('.grade-test-subtask-icon'));
      const plus = button.querySelector('.grade-test-subtask-plus');
      const plusRect = plus?.getBoundingClientRect();
      return {
        outsideTitle: !title.contains(button),
        onlyOne: content.querySelectorAll('[data-grade-test-add-subtask="main"]').length === 1,
        lines: lines.map((line) => line.textContent),
        stacked: lines.every((line, index) => !index || line.getBoundingClientRect().top > lines[index - 1].getBoundingClientRect().top),
        size: [buttonRect.width, buttonRect.height],
        iconFontSize: Number.parseFloat(iconStyle.fontSize),
        iconLineHeight: Number.parseFloat(iconStyle.lineHeight),
        iconFits: iconRect.top >= buttonRect.top && iconRect.bottom <= buttonRect.bottom
          && iconRect.left >= buttonRect.left && iconRect.right <= buttonRect.right,
        plus: plus?.textContent || '',
        plusInsideOnRight: Boolean(plusRect && plusRect.left >= iconRect.right && plusRect.right <= buttonRect.right
          && plusRect.top >= buttonRect.top && plusRect.bottom <= buttonRect.bottom),
        belowTitle: buttonRect.top >= titleRect.bottom,
        sameActionRow: actionRects.every((rect) => Math.abs(rect.top + rect.height / 2 - buttonRect.top - buttonRect.height / 2) < 1),
        noOverlap: actionRects.every((rect, index) => !index || rect.left >= actionRects[index - 1].right),
        withinCell: actionRects.every((rect) => rect.left >= cellRect.left && rect.right <= cellRect.right),
        actionOrder: actions.map((action) => action.hasAttribute('data-grade-test-add-subtask') ? 'abc'
          : action.hasAttribute('data-grade-test-merge-subtasks') ? 'merge'
          : action.hasAttribute('data-grade-test-toggle-subtasks') ? 'toggle'
            : action.hasAttribute('data-grade-test-deficit-followup') ? 'followup'
              : action.hasAttribute('data-grade-test-competence') ? 'competence' : 'delete'),
        actionSizes: actionRects.map((rect) => [rect.width, rect.height]),
        centeredNumber: Math.abs((numberRect.left + numberRect.right - titleRect.left - titleRect.right) / 2) < 1,
        minColumnWidth: Number.parseFloat(getComputedStyle(cell).minWidth),
        rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        tooltip: button.title,
        accessibleLabel: button.getAttribute('aria-label'),
      };
    };
    const toggleLayout = () => {
      const button = content.querySelector('[data-grade-test-toggle-subtasks]');
      const rect = button.getBoundingClientRect();
      const title = button.closest('th').querySelector('.grade-test-group-title');
      const titleRect = title.getBoundingClientRect();
      const abc = button.closest('th').querySelector('[data-grade-test-add-subtask]');
      const remove = button.nextElementSibling;
      const removeRect = remove.getBoundingClientRect();
      const style = getComputedStyle(button);
      const abcStyle = getComputedStyle(abc);
      return { text: button.textContent, size: [rect.width, rect.height], fontSize: Number.parseFloat(style.fontSize),
        borderWidth: Number.parseFloat(style.borderTopWidth), borderStyle: style.borderTopStyle,
        matchingFrame: ['borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius', 'backgroundColor']
          .every((property) => style[property] === abcStyle[property]),
        belowTitle: rect.top >= titleRect.bottom, outsideTitle: !title.contains(button),
        deleteOnRight: remove.hasAttribute('data-grade-test-remove-task') && !remove.nextElementSibling && removeRect.left >= rect.right,
        alignedWithDelete: Math.abs(rect.top + rect.height / 2 - removeRect.top - removeRect.height / 2) < 1 };
    };
    const mergeLayout = () => {
      const button = content.querySelector('[data-grade-test-merge-subtasks]');
      const rect = button.getBoundingClientRect();
      const icon = button.querySelector('.grade-test-subtask-icon');
      const minus = button.querySelector('.grade-test-subtask-minus');
      const style = getComputedStyle(button);
      const abcStyle = getComputedStyle(content.querySelector('[data-grade-test-add-subtask]'));
      return {
        matchingDesign: ['borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius', 'backgroundColor', 'color', 'fontSize', 'gap']
          .every((property) => style[property] === abcStyle[property]),
        lines: [...icon.children].map((line) => line.textContent), minus: minus?.textContent || '',
        noText: !button.textContent.includes('Zusammenfassen'), size: [rect.width, rect.height],
        minusRightOfIcon: Boolean(minus && minus.getBoundingClientRect().left >= icon.getBoundingClientRect().right),
        accessibleLabel: button.getAttribute('aria-label'),
        noCompetenceSummary: !content.querySelector('[data-grade-test-group-competences]'),
      };
    };
    const rowAlignment = () => {
      const single = content.querySelector('th[data-grade-test-task-column="single"] .grade-test-task-head');
      const group = content.querySelector('th[data-grade-test-group] .grade-test-group-head');
      const pairs = [
        [single.querySelector('button'), group.querySelector('.grade-test-group-actions > button')],
        [single.querySelector('.grade-test-task-max'), group.querySelector('[data-grade-test-group-max]')],
        [single.querySelector('.grade-test-task-afb'), group.querySelector('.grade-test-group-subtask-actions')],
      ];
      return pairs.map(([reference, node]) => {
        const a = reference.getBoundingClientRect();
        const b = node.getBoundingClientRect();
        return Math.abs(a.top - b.top) < 1 && Math.abs(a.bottom - b.bottom) < 1;
      });
    };
    const numberBoxLayout = () => [...content.querySelectorAll('th.grade-test-task-col .grade-test-task-title')].map((title) => {
      const cell = title.closest('th');
      const rect = title.getBoundingClientRect();
      const numberRect = title.querySelector('.grade-test-task-number').getBoundingClientRect();
      const headRect = title.parentElement.getBoundingClientRect();
      const style = getComputedStyle(title);
      const paddingAndBorder = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
        .reduce((sum, property) => sum + Number.parseFloat(style[property]), 0);
      return {
        child: cell.hasAttribute('data-grade-test-parent-task'), top: rect.top, width: rect.width, height: rect.height,
        textWidth: numberRect.width, paddingAndBorder, headWidth: headRect.width,
        centered: Math.abs(rect.left + rect.width / 2 - headRect.left - headRect.width / 2) < 1,
        borderWidth: Number.parseFloat(style.borderTopWidth), borderStyle: style.borderTopStyle,
        background: style.backgroundColor, radius: style.borderRadius, onlyLabel: !title.querySelector('button'),
        fontSize: style.fontSize, fontFamily: style.fontFamily, fontWeight: style.fontWeight,
        lineHeight: style.lineHeight, color: style.color,
      };
    });
    const readMax = () => {
      const max = content.querySelector('[data-grade-test-group-max]');
      const question = max.querySelector('.grade-test-group-max-unknown');
      return { text: max.textContent, title: max.title, question: question?.textContent || '',
        questionLabel: question?.getAttribute('aria-label') || '',
        questionColor: question ? getComputedStyle(question).color : '', labelColor: getComputedStyle(max).color };
    };
    render();
    const initialButton = buttonLayout();
    const originalRatio = ratio();
    await click(content.querySelector('.grade-test-task-number'));
    const numberClickUnchanged = !app.gradesEntryDraft.testTasks[0].subTasks;
    await click(content.querySelector('[data-grade-test-add-subtask] .grade-test-subtask-icon span'));
    const first = app.gradesEntryDraft.testTasks[0].subTasks[0].id;
    const converted = {
      sameRatio: ratio() === originalRatio,
      score: inputFor(first).value,
      label: content.querySelector('[data-grade-test-parent-task] .grade-test-task-number').textContent,
      assignment: app.getGradeTaskCompetenceDialogTask(first).competenceExpectationIds,
    };
    await click(content.querySelector('[data-grade-test-add-subtask="main"]'));
    const second = app.gradesEntryDraft.testTasks[0].subTasks[1].id;
    const beforeMax = { disabled: inputFor(second).disabled, summary: summary(),
      average: content.querySelector('[data-grade-test-group-average]').textContent };
    const incompleteMax = readMax();
    await click(content.querySelector('[data-grade-test-toggle-subtasks]'));
    const missingMaxRejected = !app.commitVisibleGradeInputs({ requireTestTaskValues: true });
    const missingMaxRevealed = !content.querySelector('[data-grade-test-parent-task]').hidden
      && document.activeElement?.dataset.taskId === second;
    const maxInput = [...content.querySelectorAll('[data-grade-test-task-field="maxBe"]')].find((node) => node.dataset.taskId === second);
    maxInput.value = '5';
    app.updateGradeTestTaskFromInput(maxInput);
    app.refreshVisibleGradeTestResultsForTaskInput(maxInput);
    const completeMax = readMax();
    maxInput.value = '5,5';
    app.updateGradeTestTaskFromInput(maxInput);
    app.refreshVisibleGradeTestResultsForTaskInput(maxInput);
    const fractionalMax = readMax();
    maxInput.value = '0';
    app.updateGradeTestTaskFromInput(maxInput);
    app.refreshVisibleGradeTestResultsForTaskInput(maxInput);
    const zeroMax = readMax();
    maxInput.value = '5';
    app.updateGradeTestTaskFromInput(maxInput);
    app.refreshVisibleGradeTestResultsForTaskInput(maxInput);
    const afb = [...content.querySelectorAll('[data-grade-test-task-field="afb"]')].find((node) => node.dataset.taskId === second);
    afb.value = 'II';
    app.updateGradeTestTaskFromInput(afb);
    app.refreshGradeTestTaskGroupSummaries();
    inputFor(second).value = '6';
    const rejectedOverflow = !app.commitGradeCellInput(inputFor(second));
    inputFor(second).value = '4';
    const acceptedScore = app.commitGradeCellInput(inputFor(second));
    app.updateGradeTestTaskCompetenceAssignment(second, { competenceExpectationIds: ['k2'], customCompetenceText: 'Eigene Erwartung B' });
    render();
    const edited = {
      summary: summary(), title: content.querySelector('.grade-test-group-title span').textContent,
      max: content.querySelector('[data-grade-test-group-max]').textContent,
      noAfb: !content.querySelector('[data-grade-test-group-afb]'),
      ratio: ratio(), secondStudent: summary(students[1].id),
      firstAssignment: app.getGradeTaskCompetenceDialogTask(first).competenceExpectationIds,
      secondAssignment: app.getGradeTaskCompetenceDialogTask(second).competenceExpectationIds,
      custom: app.getGradeTaskCompetenceDialogTask(second).customCompetenceText,
      labels: [...content.querySelectorAll('th[data-grade-test-task-column] .grade-test-task-number')].map((node) => node.textContent),
      firstFields: app.gradesEntryDraft.testTasks[0].subTasks[0],
      widerSummary: content.querySelector('th[data-grade-test-group]').getBoundingClientRect().width
        > content.querySelector('th[data-grade-test-parent-task]').getBoundingClientRect().width,
      button: buttonLayout(),
      merge: mergeLayout(),
      rows: rowAlignment(),
      toggle: toggleLayout(),
      numberBoxes: numberBoxLayout(),
      noChildButtons: !content.querySelector('[data-grade-test-parent-task] [data-grade-test-add-subtask]'),
    };
    await click(content.querySelector('[data-grade-test-toggle-subtasks]'));
    const collapsed = {
      allHidden: [...content.querySelectorAll('[data-grade-test-parent-task]')].every((node) => node.hidden),
      expanded: content.querySelector('[data-grade-test-toggle-subtasks]').getAttribute('aria-expanded'),
      visibleNavigation: app.getNavigableGradeInputs(inputFor('single')).every((node) => node.dataset.taskId === 'single'),
      summary: summary(), ratio: ratio(),
      hiddenDisplay: getComputedStyle(content.querySelector('[data-grade-test-parent-task]')).display,
      toggle: toggleLayout(),
    };
    await click(content.querySelector('[data-grade-test-toggle-subtasks]'));
    const uncollapsed = !content.querySelector('[data-grade-test-parent-task]').hidden;
    await click(content.querySelector('[data-grade-test-toggle-subtasks]'));
    await click(content.querySelector('.grade-test-group-title .grade-test-task-number'));
    const groupNumberClickUnchanged = app.gradesEntryDraft.testTasks[0].subTasks.length === 2
      && content.querySelector('[data-grade-test-toggle-subtasks]').getAttribute('aria-expanded') === 'false';
    await click(content.querySelector('[data-grade-test-add-subtask="main"] .grade-test-subtask-plus'));
    const third = app.gradesEntryDraft.testTasks[0].subTasks[2].id;
    const addOpensGroup = content.querySelector('[data-grade-test-toggle-subtasks]').getAttribute('aria-expanded') === 'true'
      && [...content.querySelectorAll('[data-grade-test-parent-task]')].every((node) => !node.hidden);
    app.removeGradeTestTask(third);
    const followUp = app.collectGradeDeficitFollowUpGroups({
      students, values: app.gradesEntryDraft,
    });
    const beforeSaveUnchanged = JSON.stringify(store.createGradeAssessmentSnapshot(assessmentId)) === JSON.stringify(original);
    store.updateGradeAssessment(assessmentId, { testTasks: app.gradesEntryDraft.testTasks });
    app.persistGradesEntryDraftEntries(assessmentId, courseId, app.gradesEntryDraft, { replaceExisting: true });
    const reopened = new WorkspaceStore();
    reopened.replaceGradeVaultState(JSON.parse(JSON.stringify(store.exportGradeVaultStateSnapshot())));
    const savedEntry = reopened.getGradeEntry(students[0].id, assessmentId);
    const savedTasks = reopened.getGradeAssessment(assessmentId).testTasks;
    app.removeGradeTestTask(second);
    const afterRemoval = app.gradesEntryDraft.testTasks[0].subTasks.map((task) => task.id);
    const removedScore = !(second in app.gradesEntryDraft.entries[students[0].id].testScores);
    app.removeGradeTestTask(first);
    return {
      initialButton, numberClickUnchanged, groupNumberClickUnchanged, addOpensGroup,
      converted, beforeMax, incompleteMax, completeMax, fractionalMax, zeroMax,
      missingMaxRejected, missingMaxRevealed, rejectedOverflow, acceptedScore, edited, collapsed, uncollapsed, followUp,
      beforeSaveUnchanged, savedEntry, savedTasks, afterRemoval, removedScore,
      remainingTasks: app.gradesEntryDraft.testTasks.map((task) => task.id), first, second,
    };
  });
  for (const button of [result.initialButton, result.edited.button]) {
    for (const field of ['outsideTitle', 'onlyOne', 'stacked', 'belowTitle', 'sameActionRow', 'noOverlap', 'withinCell', 'centeredNumber']) {
      assert.equal(button[field], true, field);
    }
    assert.deepEqual(button.lines, ['(a)', '(b)']);
    assert.equal(button.iconFontSize, 10);
    assert.equal(button.iconLineHeight, 10);
    assert.equal(button.iconFits, true);
    assert.deepEqual(button.size, [button.plus ? 40 : 25, 25]);
    assert.ok(button.actionSizes.every(([width, height], index) =>
      width === (['abc', 'merge'].includes(button.actionOrder[index]) && button.plus ? 40 : 25) && height === 25));
    assert.equal(button.tooltip, 'Teilaufgabe hinzufügen');
    assert.equal(button.accessibleLabel, 'Teilaufgabe zu Aufgabe 1 hinzufügen');
  }
  assert.equal(result.initialButton.plus, '');
  assert.equal(result.edited.button.plus, '+');
  assert.equal(result.edited.button.plusInsideOnRight, true);
  assert.deepEqual(result.initialButton.actionOrder, ['followup', 'competence', 'abc', 'delete']);
  assert.deepEqual(result.edited.button.actionOrder, ['abc', 'merge']);
  assert.deepEqual(result.edited.rows, [true, true, true]);
  assert.equal(result.edited.merge.matchingDesign, true);
  assert.deepEqual(result.edited.merge.lines, ['(a)', '(b)']);
  assert.equal(result.edited.merge.minus, '−');
  assert.equal(result.edited.merge.noText, true);
  assert.deepEqual(result.edited.merge.size, [40, 25]);
  assert.equal(result.edited.merge.minusRightOfIcon, true);
  assert.equal(result.edited.merge.accessibleLabel, 'Teilaufgaben von Aufgabe 1 zusammenfassen');
  assert.equal(result.edited.merge.noCompetenceSummary, true);
  assert.ok(Math.abs(result.initialButton.minColumnWidth - 7.2 * result.initialButton.rem) < 1);
  for (const toggle of [result.edited.toggle, result.collapsed.toggle]) {
    assert.deepEqual(toggle.size, [25, 25]);
    assert.equal(toggle.fontSize, 18);
    assert.equal(toggle.borderWidth, 1);
    assert.equal(toggle.borderStyle, 'solid');
    assert.equal(toggle.matchingFrame, true);
    assert.equal(toggle.belowTitle, true);
    assert.equal(toggle.outsideTitle, true);
    assert.equal(toggle.deleteOnRight, true);
    assert.equal(toggle.alignedWithDelete, true);
  }
  const referenceBox = result.edited.numberBoxes[0];
  for (const box of result.edited.numberBoxes) {
    assert.ok(Math.abs(box.top - referenceBox.top) < 1, 'number boxes start at the same height');
    assert.equal(box.centered, true);
    assert.equal(box.onlyLabel, true);
    assert.equal(box.borderWidth, 2);
    assert.equal(box.borderStyle, 'solid');
    assert.equal(box.background, referenceBox.background);
    assert.equal(box.radius, referenceBox.radius);
    for (const property of ['height', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'color']) {
      assert.equal(box[property], referenceBox[property], property);
    }
    if (box.child) {
      assert.ok(Math.abs(box.width - box.textWidth - box.paddingAndBorder) < 1, 'subtask boxes fit their labels');
      assert.ok(box.width < box.headWidth / 2);
    } else {
      assert.ok(Math.abs(box.width - box.headWidth) < 1, 'main task boxes fill the header');
    }
  }
  assert.equal(result.edited.toggle.text, '▼');
  assert.equal(result.collapsed.toggle.text, '▶');
  assert.equal(result.numberClickUnchanged, true);
  assert.equal(result.groupNumberClickUnchanged, true);
  assert.equal(result.addOpensGroup, true);
  assert.equal(result.edited.noChildButtons, true);
  assert.equal(result.converted.sameRatio, true);
  assert.equal(result.converted.score, '2');
  assert.equal(result.converted.label, '1a');
  assert.deepEqual(result.converted.assignment, ['k1']);
  assert.equal(result.beforeMax.disabled, true);
  assert.equal(result.beforeMax.summary, '2');
  assert.equal(result.beforeMax.average, '1');
  for (const max of [result.incompleteMax, result.zeroMax]) {
    assert.equal(max.text, 'BE1: ?');
    assert.equal(max.question, '?');
    assert.equal(max.title, 'BE1 der Teilaufgaben noch unvollständig');
    assert.equal(max.questionLabel, max.title);
    assert.notEqual(max.questionColor, max.labelColor);
    const [red, green, blue] = max.questionColor.match(/\d+/g).map(Number);
    assert.ok(red > green && red > blue);
  }
  assert.equal(result.completeMax.text, 'BE1: 8');
  assert.equal(result.completeMax.question, '');
  assert.equal(result.fractionalMax.text, 'BE1: 8,5');
  assert.equal(result.fractionalMax.question, '');
  assert.equal(result.missingMaxRejected, true);
  assert.equal(result.missingMaxRevealed, true);
  assert.equal(result.rejectedOverflow, true);
  assert.equal(result.acceptedScore, true);
  assert.equal(result.edited.summary, '6');
  assert.equal(result.edited.title, '1');
  assert.equal(result.edited.max, 'BE1: 8');
  assert.equal(result.edited.noAfb, true);
  assert.match(result.edited.ratio, /^7,5 \/ 10,5/);
  assert.equal(result.edited.secondStudent, '0');
  assert.deepEqual(result.edited.labels, ['1a', '1b', '2']);
  assert.deepEqual(result.edited.firstAssignment, ['k1']);
  assert.deepEqual(result.edited.secondAssignment, ['k2']);
  assert.equal(result.edited.custom, 'Eigene Erwartung B');
  assert.equal(result.edited.firstFields.deficitDiagnosisFollowUp, true);
  assert.equal(result.edited.widerSummary, true);
  assert.equal(result.collapsed.allHidden, true);
  assert.equal(result.collapsed.expanded, 'false');
  assert.equal(result.collapsed.hiddenDisplay, 'none');
  assert.equal(result.collapsed.visibleNavigation, true);
  assert.equal(result.collapsed.summary, '6');
  assert.equal(result.collapsed.ratio, result.edited.ratio);
  assert.equal(result.uncollapsed, true);
  assert.equal(result.followUp.groups[0].label, 'Aufgabe 1a');
  assert.equal(result.followUp.groups[0].students.length, 1);
  assert.equal(result.beforeSaveUnchanged, true);
  assert.equal(result.savedTasks[0].subTasks[1].customCompetenceText, 'Eigene Erwartung B');
  assert.deepEqual(result.savedEntry.testScores, { [result.first]: 2, [result.second]: 4, single: 1.5 });
  assert.deepEqual(result.afterRemoval, [result.first]);
  assert.equal(result.removedScore, true);
  assert.deepEqual(result.remainingTasks, ['single']);
});

test('DOCX, competence and table exports use subtask labels and count points once', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const { prepareDocxTemplate, createDocxFromPreparedTemplate } = await import('/src/shared/docx-template.js');
    const values = {
      mode: 'test', testScale: 'sek2', testScaleSnapshot: { id: 'sek2', thresholds: [[0.9, 15], [0, 0]] },
      testTasks: [
        { id: 'main', subTasks: [
          { id: 'a', maxBe: 3, afb: 'I', competenceExpectationIds: ['k1'], deficitDiagnosisFollowUp: true },
          { id: 'b', maxBe: 5, afb: 'II', customCompetenceText: 'Erwartung B' },
        ] },
        { id: 'single', maxBe: 2, afb: 'III' },
      ],
      competenceExpectations: [{ id: 'topic', competencies: [{ id: 'k1', text: 'Erwartung A' }] }],
      entries: { 1: { testScores: { a: 0, b: 4, single: 2 } } },
    };
    const context = {
      ready: true, course: { id: 1, name: 'Testkurs' }, students: [{ id: 1, firstName: 'Lernperson 1' }], values, draft: values,
    };
    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      store: { getGradeTestScaleSettings: () => null, getExpectationHorizonLocation: () => '',
        getExpectationHorizonCommentTemplate: () => 'Nachbereitung: <<Aufgabenliste>>',
        getGradeEntry: () => values.entries[1] },
      getGradeStudentLegalDisplayName: (student) => student.firstName,
      getGradeStudentDisplayName: (student) => student.firstName,
      getCurrentGradeOverviewDisplaySystem: () => 'points15',
    });
    const bytes = new Uint8Array(await (await fetch('/src/modules/grades/expectation-horizon-template.docx')).arrayBuffer());
    const prepared = await prepareDocxTemplate(bytes);
    const [record] = await app.buildExpectationHorizonStudentRecords(context, { includePercentile: false, includePercentBoundaries: false });
    const readRows = async (data) => {
      const entry = (await prepareDocxTemplate(data)).entries.find((item) => item.name === 'word/document.xml');
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(entry.data), 'application/xml');
      return [...doc.getElementsByTagNameNS('*', 'tbl')[0].children].filter((node) => node.localName === 'tr')
        .map((row) => [...row.children].filter((node) => node.localName === 'tc')
          .map((cell) => [...cell.getElementsByTagNameNS('*', 't')].map((node) => node.textContent).join('')));
    };
    const enriched = await createDocxFromPreparedTemplate(prepared, {}, {
      tableColumnReplacements: app.buildExpectationHorizonTaskTemplateColumnReplacements(values.testTasks),
    });
    const generated = await createDocxFromPreparedTemplate(await prepareDocxTemplate(enriched), record.replacements, {
      tableColumnReplacements: record.tableColumnReplacements,
    });
    const competence = app.buildCompetenceExpectationsReplacements(context, values.competenceExpectations)['<<Kompetenzen>>'];
    const print = app.buildGradesEntryTestPrintTable(context);
    const archive = app.buildArchiveGradeBeMaskSection(context.course, context.students, { ...values, id: 1 });
    const originalTasks = JSON.stringify(values.testTasks);
    app.getActiveGradeTestContext = () => ({ draft: values });
    app.updateGradeTestContextTasks = (tasks) => { values.testTasks = tasks; return true; };
    app.renderGradesView = () => {};
    app.applyExpectationHorizonLatexTasksToGradeTest([{ maxBe: 99 }, { maxBe: 99 }]);
    return {
      rows: await readRows(generated), templateRows: await readRows(enriched),
      replacements: record.replacements, competence,
      printHeaders: [...print.tHead.rows[0].cells].map((cell) => cell.textContent),
      printScores: [...print.tBodies[0].rows[0].cells].slice(2).map((cell) => cell.textContent),
      archiveColumns: archive.columns, latexUnchanged: originalTasks === JSON.stringify(values.testTasks),
    };
  });
  assert.deepEqual(result.rows.slice(1, -1).map((row) => row[0]), ['(1a)', '(1b)', '(2)']);
  assert.deepEqual(result.templateRows.slice(1, -1).map((row) => row[0]), ['(1a)', '(1b)', '(2)']);
  assert.deepEqual(result.rows[1].slice(1), ['Erwartung A', 'I', '3', '0']);
  assert.deepEqual(result.rows[2].slice(1), ['Erwartung B', 'II', '5', '4']);
  assert.deepEqual(result.rows.at(-1).slice(3), ['10', '6']);
  assert.match(result.replacements['<<Kommentar>>'], /Aufgabe 1a/);
  assert.match(result.competence.runs[0].text, /Erwartung A \(Aufgabe 1a\)/);
  assert.match(result.printHeaders[3], /^A1a/);
  assert.match(result.printHeaders[4], /^A1b/);
  assert.match(result.printHeaders[5], /^A2/);
  assert.deepEqual(result.printScores.slice(1), ['0', '4', '2']);
  assert.match(result.printScores[0], /^6 \/ 10/);
  assert.match(result.archiveColumns[3], /^A1a/);
  assert.equal(result.latexUnchanged, true);
});

test('THDB saves and reopens nested scores alongside an unchanged legacy course', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { WorkspaceStore } = await import('/src/modules/workspace/store.js');
    const { WorkspaceRuntime } = await import('/src/modules/workspace/runtime.js');
    const store = new WorkspaceStore();
    const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
    const yearId = store.getActiveSchoolYear().id;
    const nestedCourseId = store.createCourse(yearId, 'Teilaufgabenkurs', '#336699');
    const legacyCourseId = store.createCourse(yearId, 'Bestandskurs', '#336699');
    let assessmentId;
    let studentId;
    await runtime.runGradeCourseMutation(nestedCourseId, () => {
      store.replaceGradeStudentsForCourse(nestedCourseId, [{ firstName: 'Lernperson 1' }]);
      studentId = store.listGradeStudents(nestedCourseId)[0].id;
      assessmentId = store.createGradeAssessment(nestedCourseId, { mode: 'test', testTasks: [
        { id: 'main', subTasks: [
          { id: 'a', maxBe: 3.5, afb: 'I', competenceExpectationIds: ['k1'], deficitDiagnosisFollowUp: true },
          { id: 'b', maxBe: 5, afb: 'II', customCompetenceText: 'Erwartung B' },
        ] },
      ] });
      store.setGradeTestEntry(studentId, assessmentId, { a: 0, b: 4.5 }, { expectationHorizonComment: 'Rückmeldung' });
    }, { skipAutoSave: true });
    let legacy;
    let legacyId;
    await runtime.runGradeCourseMutation(legacyCourseId, () => {
      legacyId = store.createGradeAssessment(legacyCourseId, { title: 'Bestehende Leistung', mode: 'test',
        testTasks: [{ id: 'old', maxBe: 10, afb: 'III' }] });
      legacy = structuredClone(store.getGradeAssessment(legacyId));
    }, { skipAutoSave: true });
    const bytes = (await runtime.buildContainer('test')).bytes;
    const reopened = new WorkspaceStore();
    const reopenedRuntime = new WorkspaceRuntime(reopened, { eventTarget: new EventTarget() });
    await reopenedRuntime.loadBytes(bytes, 'manual');
    await reopenedRuntime.ensureGradeCourseLoaded(nestedCourseId);
    const assessment = structuredClone(reopened.getGradeAssessment(assessmentId));
    const entry = structuredClone(reopened.getGradeEntry(studentId, assessmentId));
    await reopenedRuntime.ensureGradeCourseLoaded(legacyCourseId);
    return { assessment, entry, legacyUnchanged: JSON.stringify(reopened.getGradeAssessment(legacyId)) === JSON.stringify(legacy) };
  });
  assert.equal(result.assessment.testTasks[0].subTasks[0].maxBe, 3.5);
  assert.deepEqual(result.assessment.testTasks[0].subTasks[0].competenceExpectationIds, ['k1']);
  assert.equal(result.assessment.testTasks[0].subTasks[0].deficitDiagnosisFollowUp, true);
  assert.equal(result.assessment.testTasks[0].subTasks[1].customCompetenceText, 'Erwartung B');
  assert.deepEqual(result.entry.testScores, { a: 0, b: 4.5 });
  assert.equal(result.entry.expectationHorizonComment, 'Rückmeldung');
  assert.equal(result.legacyUnchanged, true);
});
