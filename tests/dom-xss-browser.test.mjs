import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('DOM renderers preserve text, attributes, form state and rich-text boundaries in Chrome', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const grades = await import('/src/modules/grades/app.js?dom-test');
    const rich = await import('/src/shared/planning-rich-text.js');
    const school = await import('/src/shared/school-data/index.js');
    const { WorkspaceStore } = await import('/src/modules/workspace/store.js');
    const payloads = [
      '<img src=x onerror=alert(1)>',
      '<script>alert(1)</script>',
      '\" autofocus onfocus=alert(1) data-injected=\"yes',
      "'><svg onload=alert(1)><a href=javascript:alert(1)>x</a></svg>",
      'A & B < C > D "E" \'F\'',
    ];
    let checks = 0;
    const check = (condition, label) => { if (!condition) throw new Error(label); checks += 1; };
    const mount = (node) => {
      const root = document.createElement('div');
      root.append(node);
      document.body.replaceChildren(root);
      return root;
    };
    const safe = (root) => {
      check(!root.querySelector('script,img,svg,iframe,object,embed,style,link'), 'No injected elements');
      for (const element of root.querySelectorAll('*')) {
        check(![...element.attributes].some(({ name }) => /^on/i.test(name) || name === 'data-injected' || name === 'autofocus'), 'No injected attributes');
      }
    };
    const app = Object.create(grades.GradesApp.prototype);
    Object.assign(app, {
      refs: {}, gradeDeficitThreshold: 4,
      activeGradeAssessmentId: null,
      getGradeStudentDisplayName: (student) => student.name,
      getGradeStudentPortraitUrl: () => '',
      shouldShowGradeStudentPortraitPlaceholders: () => false,
      getSortedGradeStudentsForNameOrder: (students) => students,
      isGradesEntryStudentActive: () => false,
      getCurrentGradeInputDisplaySystem: () => 'points',
      getCurrentGradeOverviewPredicateSuffixes: () => true,
      getGradeCourseRevision: () => 1,
      isGradeEntrySkipped: () => true,
      getGradeOccurrenceCategoryDisplayName: () => 'Vorkommnis',
      getGradeOccurrenceCategoryEmoji: () => '✓',
      getGradeOccurrenceCategoryPolarity: () => 'negative',
      getGradesOverviewTransferColumnKey: () => '',
      getGradesOverviewColumnKey: () => '',
      applyGradeLeftBoundaryClass() {}, applyGradeRightBoundaryClass() {},
      applyGradesOverviewColumnSelection() {},
      isGradesTopTabActive: () => true,
      updateSettingsActionButtons() {}, updateGradesEntryTableStickyScrollbar() {},
      removeGradesEntryDistributionOverlay() {},
      hasGradeVaultUnlockConfig: () => true,
      store: { getGradeEntry: () => ({ value: 5 }), getGradeTestScaleSettings: () => ({}) },
    });

    for (const payload of payloads) {
      const imported = school.normalizePublicSchoolData({
        schoolYears: [{ id: 1, name: payload, startDate: '2026-08-01', endDate: '2027-07-31' }],
        courses: [{ id: 2, schoolYearId: 1, name: payload, subject: payload }],
      });
      check(imported.courses[0].name === payload, 'Import preserves literal course names');
      const course = imported.courses[0];
      const vault = WorkspaceStore.prototype.normalizeGradeVaultState.call({
        getGradeTestScaleSettings: () => ({}),
        getGradeOccurrenceCategories: () => [],
      }, {
        gradeStudents: [{ id: 7, courseId: 2, firstName: payload, lastName: '', rufname: payload }],
        gradeAssessments: [{ id: 9, courseId: 2, title: payload, mode: 'grade' }],
        gradeEntries: [{ studentId: 7, assessmentId: 9, expectationHorizonComment: payload }],
      });
      check(vault.gradeStudents[0].firstName === payload, 'Vault import preserves literal student names');
      check(vault.gradeEntries[0].expectationHorizonComment === payload, 'Vault import preserves literal comments');
      const student = { ...vault.gradeStudents[0], name: vault.gradeStudents[0].firstName };
      const assessment = { id: 9, courseId: 2, title: payload, mode: 'grade' };

      let root = mount(grades.createGradeAssessmentDisplayTitle(payload));
      safe(root);
      check(root.textContent === payload, 'Assessment title stays literal without double escaping');
      root = mount(grades.createGradeStudentNameElement(student, payload));
      safe(root);
      check(root.textContent === payload, 'Student name stays literal');
      check(root.querySelector('[data-student-label]').dataset.studentLabel === payload, 'Student label metadata preserved');

      for (const mode of ['grade', 'homework', 'test']) {
        for (const active of [false, true]) {
          assessment.mode = mode;
          app.activeGradeAssessmentId = active ? assessment.id : null;
          root = mount(app.createGradeAssessmentCell(student, assessment, 0, 1, payload, { disabled: true }));
          safe(root);
          const control = root.querySelector('input,button');
          check(control.disabled, 'Disabled controls remain disabled');
          check(control.getAttribute('aria-label').includes(payload), 'Accessible label is literal');
          if (control.dataset.subcategoryId !== undefined) check(control.dataset.subcategoryId === payload, 'Attribute values cannot break out');
        }
      }
      root = mount(app.createHomeworkCheckbox(payload, true, (input) => { input.dataset.studentId = payload; }, { disabled: true }));
      safe(root);
      const checkbox = root.querySelector('input');
      check(checkbox.checked && checkbox.defaultChecked && checkbox.disabled, 'Checkbox state and reset baseline preserved');
      check(checkbox.dataset.studentId === payload, 'Checkbox metadata stays literal');

      for (const type of ['category-open', 'category-collapsed', 'subcategory-open', 'subcategory-collapsed', 'assessment', 'add']) {
        const cell = {
          type, period: payload,
          category: { id: payload, name: payload, weight: 2 },
          subcategory: { id: payload, name: payload, weight: 3 },
          assessment: { ...assessment, id: payload, courseId: payload, mode: 'grade' },
        };
        root = mount(app.renderGradesTableHeaderCell(cell, { courseId: 2 }));
        safe(root);
        check(root.querySelector('button') !== null, 'Header action remains present');
        if (type.endsWith('-open')) check(root.textContent.includes(payload), 'Expanded header label stays literal');
        if (type === 'assessment') check(root.querySelector('[data-grade-edit-assessment]').dataset.gradeEditAssessment === payload, 'Assessment ID stays literal');
      }

      app.refs.gradesEntryContent = document.createElement('div');
      app.renderGradesEntryEmptyState(payload, payload, { primaryAction: 'manageStudents' });
      root = mount(app.refs.gradesEntryContent);
      safe(root);
      check(root.querySelector('h3').textContent === payload && root.querySelector('p').textContent === payload, 'Empty-state text stays literal');
      check(!!root.querySelector('[data-grades-entry-primary-action="manageStudents"]'), 'Empty-state action preserved');

      app.refs.gradesVaultBanner = document.createElement('div');
      app.getGradeVaultAutoLockWarning = () => ({ message: payload, retryAt: 0 });
      app.renderGradeVaultBanner();
      root = mount(app.refs.gradesVaultBanner);
      safe(root);
      check(root.querySelector('p').textContent.includes(payload), 'Error message stays literal');

      const draft = { mode: 'grade', entries: { 7: { value: null } } };
      app.getGradesEntryDraft = app.getGradesEntryAssessmentDraft = () => draft;
      root = mount(app.buildGradesEntryTable(course, [student]));
      safe(root);
      check(root.querySelector('[data-grade-draft-input]').placeholder === '--', 'Skipped grade remains a placeholder');
      check(root.querySelector('[data-grade-draft-input]').value === '', 'Skipped grade remains empty');
      draft.mode = 'homework';
      draft.entries[7] = { checked: true };
      root = mount(app.buildGradesEntryTable(course, [student], assessment));
      safe(root);
      check(root.querySelector('[data-grade-checkbox]').checked, 'Occurrence draft remains checked');

      draft.mode = 'test';
      draft.testTasks = [{ id: payload, maxBe: 10, afb: 'II', customCompetenceText: payload }];
      draft.entries[7] = { testScores: { [payload]: 5 }, expectationHorizonComment: payload };
      root = mount(app.buildGradesTestEntryTable(course, [student], assessment, draft));
      safe(root);
      check(root.querySelector('[data-grade-test-task-field="afb"]').value === 'II', 'Task AFB selection preserved');
      check(root.querySelector('[data-grade-test-task-field="maxBe"]').dataset.taskId === payload, 'Imported task ID stays literal');

      app.refs.gradeTestScaleSettingsContent = document.createElement('div');
      app.getGradeTestScaleSettingsDraft = () => ({ custom: { label: payload } });
      app.renderGradeTestScaleSettingsSection();
      root = mount(app.refs.gradeTestScaleSettingsContent);
      safe(root);
      check(root.querySelector('[data-grade-test-scale-custom-name]').value === payload.trim().slice(0, 40), 'Custom scale name stays literal within the existing length limit');
      check(root.querySelector('[data-grade-test-scale-grade="0"]').readOnly, 'Zero threshold stays readonly');
    }

    const title = mount(grades.createGradeAssessmentDisplayTitle('12.09.'));
    check(title.querySelectorAll('br').length === 1, 'Date title retains its line break');
    const select = document.createElement('select');
    select.append(grades.createGradeTestAfbOptions('III'));
    check(select.value === 'III', 'AFB default selection preserved');
    const tooltip = mount(grades.createGradeTestScaleTooltip('sek2', null, { showBeColumn: true, maxBeSum: 40 }));
    check(tooltip.querySelector('thead tr').children.length === 3, 'Tooltip optional BE column preserved');

    window.__xssExecuted = 0;
    window.alert = () => { window.__xssExecuted += 1; };
    const pasted = rich.planningRichTextFromClipboard(
      '<p><strong>Fett</strong> <em>Kursiv</em> <u>Unterstrichen</u></p>'
      + '<ul><li>Liste</li></ul><table><tr><td>Zelle</td></tr></table>'
      + '<p><a href="https://example.com" onclick="alert(1)">Link</a><a href="javascript:alert(1)">Unsicher</a></p>'
      + '<img src=x onerror=alert(1)><script>alert(1)</script><svg onload=alert(1)></svg>',
      'Fallback',
    );
    const notes = document.createElement('div');
    rich.renderPlanningRichText(notes, pasted);
    document.body.replaceChildren(notes);
    await new Promise((done) => setTimeout(done, 100));
    safe(notes);
    check(window.__xssExecuted === 0, 'Paste never executes active content, even without CSP');
    check(!!notes.querySelector('strong') && !!notes.querySelector('em') && !!notes.querySelector('u'), 'Inline formatting survives paste');
    check(!!notes.querySelector('ul li') && !!notes.querySelector('table td'), 'Lists and tables survive paste');
    check(notes.querySelectorAll('a').length === 1, 'Only permitted links survive paste');
    check(notes.querySelector('a').rel === 'noopener noreferrer', 'Link protection retained');
    return { checks, payloads: payloads.length };
  });
  assert.equal(result.payloads, 5);
  assert.ok(result.checks > 200, `Expected comprehensive DOM assertions, got ${result.checks}`);
});

test('the complete grade editor still renders all modes and dispatches its existing actions', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    history.replaceState(null, '', '/?tutorial-demo=grades');
    const markup = await (await fetch('/src/modules/grades/app.html')).text();
    const fixture = new DOMParser().parseFromString(markup, 'text/html');
    fixture.querySelectorAll('script').forEach((script) => script.remove());
    document.body.replaceChildren(...fixture.body.childNodes);
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const app = new GradesApp();
    await app.showGradesTutorialSurface('gradesEntry');
    const courseId = app.selectedCourseId;
    const payload = '<img src=x onerror=alert(1)>"';
    const course = app.store.listCourses(app.activeSchoolYear.id).find((item) => item.id === courseId);
    course.name = payload;
    const modes = [];
    for (const mode of ['grade', 'homework', 'test']) {
      const draft = app.getGradesEntryDraft(courseId);
      draft.title = payload;
      draft.topic = payload;
      draft.mode = mode;
      app.renderGradesView();
      const editor = document.querySelector('.grades-entry-editor');
      if (!editor) throw new Error(`Editor missing for ${mode}`);
      if (editor.querySelector('img,script,svg[onload],[onerror]')) throw new Error(`Injected content in ${mode}`);
      const title = editor.querySelector('[data-grades-entry-title]');
      if (title.value !== payload) throw new Error(`Title changed in ${mode}: ${title.value}`);
      const radios = [...editor.querySelectorAll('[data-grades-entry-mode]')];
      if (radios.filter((input) => input.checked).length !== 1 || !radios.find((input) => input.value === mode)?.checked) {
        throw new Error(`Radio state changed for ${mode}`);
      }
      if (editor.querySelector('[data-grades-entry-course]').selectedOptions[0].textContent !== payload) throw new Error('Course option changed');
      if (!editor.querySelector('[data-grades-entry-save]') || !editor.querySelector('[data-grades-entry-cancel]')) throw new Error('Editor actions missing');
      if (mode === 'test' && !editor.querySelector('.grade-test-scale-tooltip')) throw new Error('Scale tooltip missing');
      modes.push(mode);
    }
    const cancel = document.querySelector('[data-grades-entry-cancel]');
    let cancelled = 0;
    app.openGradesOverviewForCourse = () => { cancelled += 1; return true; };
    cancel.click();
    return { modes, cancelled, title: document.title };
  });
  assert.deepEqual(result.modes, ['grade', 'homework', 'test']);
  assert.equal(result.cancelled, 1);
});

test('planning, group metadata, file names and shared errors cross the DOM boundary as data', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { PlanningApp } = await import('/src/modules/planning/app.js?dom-test');
    const { createMessageApi } = await import('/src/shared/messages.js');
    const payload = '\"><img src=x onerror=alert(1)><script>alert(1)</script>';
    const check = (condition, label) => { if (!condition) throw new Error(label); };
    const assertSafe = (node) => check(!node.querySelector('img,script,[onerror],[autofocus]'), 'No injected elements or attributes');
    const planner = Object.create(PlanningApp.prototype);
    Object.defineProperty(planner, 'activeSchoolYear', { value: { id: 1 } });
    Object.assign(planner, {
      refs: { slotList: document.createElement('ul'), lessonTimesList: document.createElement('div') },
      store: {
        listSlotsForYear: () => [{ id: payload, courseId: 2, dayOfWeek: 1, startHour: 1, duration: 1 }],
        listCourses: () => [{ id: 2, name: payload }],
        getHoursPerDay: () => 2,
      },
      getSettingsDraftLessonTimes: () => [{ lesson: payload, start: payload, end: '09:30' }],
      updateSettingsActionButtons() {},
    });
    planner.renderSlotList();
    assertSafe(planner.refs.slotList);
    check(planner.refs.slotList.textContent.includes(payload), 'Course name is literal');
    check(planner.refs.slotList.querySelector('[data-action="edit"]').dataset.id === payload, 'Slot ID is literal');
    planner.renderLessonTimesSection();
    assertSafe(planner.refs.lessonTimesList);
    const start = planner.refs.lessonTimesList.querySelector('[data-lesson-time="start"]');
    check(start.dataset.lesson === payload && start.getAttribute('value') === payload, 'Lesson metadata is literal');
    check(start.value === '', 'Invalid time retains native input sanitization');
    check(planner.refs.lessonTimesList.querySelector('[data-lesson-time="end"]').value === '09:30', 'Valid time unchanged');

    const originalCommand = document.execCommand;
    const calls = [];
    document.execCommand = (...args) => { calls.push(args); return true; };
    planner.refs.topicDialogNotes = document.createElement('div');
    planner.restoreTopicDialogNotesSelectionRange = () => {};
    planner.normalizeTopicDialogNotesEditor = () => {};
    planner.updateTopicDialogRichTextToolbar = () => {};
    planner.executeTopicDialogRichTextCommand('insertHTML', payload);
    planner.executeTopicDialogRichTextCommand('createLink', 'javascript:alert(1)');
    check(calls.length === 0, 'Arbitrary HTML and link commands are rejected');
    planner.executeTopicDialogRichTextCommand('insertTable', '2x3');
    check(calls.length === 1 && calls[0][0] === 'insertHTML', 'Table insertion keeps its native undo command');
    const table = document.createElement('template');
    table.innerHTML = calls[0][2];
    check(table.content.querySelectorAll('td').length === 6, 'Table dimensions preserved');
    assertSafe(table.content);
    document.execCommand = originalCommand;

    const source = await (await fetch('/src/modules/groups/app.js')).text();
    const begin = source.indexOf('  function buildGrid() {');
    const end = source.indexOf('\n  function renderSeats()', begin);
    check(begin >= 0 && end > begin, 'Group renderer found');
    const state = { gridRows: 1, gridCols: 1, activeSeatOrder: [payload], activeSeats: new Set([payload]), seats: {}, seatTopics: { [payload]: payload }, lockedSeats: new Set() };
    const els = { groupsGrid: document.createElement('div') };
    const hooks = {
      enforceGridBounds() {}, isSeatWithinBounds: () => true, buildFullActiveSet: () => new Set(),
      addDropHandlers() {}, initSeatTopicInput() {}, syncSeatTopicState() {},
      deleteGroupSeat: (id) => { hooks.deleted = id; }, getSeatList: () => [], renderSeats() {},
      addPlaceholderDropHandlers() {}, createNewSeatAndAssign() {}, requestGroupGridLayoutRefresh() {},
    };
    const buildGrid = Function('state', 'els', 'doc', ...Object.keys(hooks), `${source.slice(begin, end)}; return buildGrid;`)(state, els, document, ...Object.values(hooks));
    buildGrid();
    assertSafe(els.groupsGrid);
    const topic = els.groupsGrid.querySelector('.seat-topic');
    check(topic.name === `seat-topic-${payload}` && topic.value === payload, 'Group ID and topic remain literal');
    topic.value = 'Geändert';
    topic.dispatchEvent(new Event('input', { bubbles: true }));
    check(state.seatTopics[payload] === 'Geändert', 'Group input listener retained');
    els.groupsGrid.querySelector('.seat-delete-button').click();
    check(hooks.deleted === payload, 'Group deletion listener retained');

    const duplicate = await (await fetch('/src/modules/duplicate-check/app.js')).text();
    const summaryStart = duplicate.indexOf('  function setFileSummary(file) {');
    const summaryEnd = duplicate.indexOf('\n  function renderInitial()', summaryStart);
    check(summaryStart >= 0 && summaryEnd > summaryStart, 'File summary renderer found');
    const ui = { fileSummary: document.createElement('div'), dropHint: document.createElement('div') };
    const setFileSummary = Function('ui', `${duplicate.slice(summaryStart, summaryEnd)}; return setFileSummary;`)(ui);
    setFileSummary(new File(['content'], payload));
    assertSafe(ui.fileSummary);
    check(ui.fileSummary.querySelector('strong').textContent === payload, 'Imported filename remains literal');
    createMessageApi(document).showMessage(payload, 'error');
    const message = document.querySelector('.message-body');
    assertSafe(message);
    check(message.textContent === payload, 'Shared error remains literal');
    return true;
  });
  assert.equal(result, true);
});
