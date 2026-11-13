import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('group view state is independent of grades and assessment, with visible invalid totals', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createSubtaskHarness } = await import('/tests/helpers/grades-subtask-harness.mjs');
    const h = await createSubtaskHarness();
    const { app, students, content } = h;
    const tasks = [{ id: 'main', subTasks: [{ id: 'a', maxBe: 5 }, { id: 'b', maxBe: 5 }] }];
    h.reset(tasks, { [students[0].id]: { testScores: { a: 5 } }, [students[1].id]: { testScores: { b: 5 } } });
    const averages = { rows: students.map((student) => h.summary(student.id).textContent),
      mean: content.querySelector('[data-grade-test-group-average]').textContent };
    const unchanged = app.commitGradeCellInput(h.input('a'));
    await h.click(content.querySelector('[data-grade-test-toggle-subtasks]'));
    const collapsed = content.querySelector('[data-grade-test-toggle-subtasks]').getAttribute('aria-expanded');
    const viewDirty = app.gradesEntryDraftDirty;
    await h.click(content.querySelector('[data-grade-test-toggle-subtasks]'));
    const reopened = content.querySelector('[data-grade-test-toggle-subtasks]').getAttribute('aria-expanded');
    app.openGradeTaskCompetenceDialog('b');
    await new Promise(requestAnimationFrame);
    const title = h.dialogTitle.textContent;
    await h.click(content.querySelector('[data-grade-test-toggle-subtasks]'));
    const nextAssessment = h.store.createGradeAssessment(h.courseId, {
      mode: 'test', title: 'Weitere Leistung', categoryId: h.categoryId, halfYear: 'h1', testTasks: tasks,
    });
    app.selectedGradesEntryAssessmentId = nextAssessment;
    app.gradesEntryDraft = null;
    h.render();
    const otherExpanded = content.querySelector('[data-grade-test-toggle-subtasks]').getAttribute('aria-expanded');
    h.reset([{ id: 'main', subTasks: [{ id: 'a', maxBe: 10 }, { id: 'b', maxBe: 5 }] }], {
      [students[0].id]: { testScores: { a: 8, b: 4 } },
    });
    const maxInput = [...content.querySelectorAll('[data-grade-test-task-field="maxBe"]')].find((node) => node.dataset.taskId === 'a');
    maxInput.value = '5';
    app.updateGradeTestTaskFromInput(maxInput);
    app.refreshVisibleGradeTestResultsForTaskInput(maxInput);
    const overflow = { value: h.summary().textContent, invalid: h.summary().getAttribute('aria-invalid'),
      styled: h.summary().classList.contains('is-invalid-score'),
      mean: content.querySelector('[data-grade-test-group-average]').textContent };
    app.commitGradeCellInput(h.input('a'));
    await h.click(content.querySelector('[data-grade-test-toggle-subtasks]'));
    overflow.expanded = content.querySelector('[data-grade-test-toggle-subtasks]').getAttribute('aria-expanded');
    overflow.validation = app.commitVisibleGradeInputs({ requireTestTaskValues: true });
    h.input('a').value = '4';
    app.commitGradeCellInput(h.input('a'));
    app.refreshGradeTestTaskGroupSummaries();
    const corrected = h.summary().textContent;
    return { averages, unchanged, collapsed, reopened, viewDirty, title, otherExpanded, overflow, corrected };
  });
  assert.deepEqual(result.averages, { rows: ['5', '5'], mean: '5' });
  assert.equal(result.unchanged, true);
  assert.equal(result.collapsed, 'false');
  assert.equal(result.reopened, 'true');
  assert.equal(result.viewDirty, false);
  assert.equal(result.title, 'Kompetenzen – Aufgabe 1b');
  assert.equal(result.otherExpanded, 'true');
  assert.deepEqual(result.overflow, { value: '?', invalid: 'true', styled: true, mean: '?', expanded: 'true', validation: false });
  assert.equal(result.corrected, '8');
});

test('joining parts preserves points and metadata, and deleting a final part explains the consequence', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createSubtaskHarness } = await import('/tests/helpers/grades-subtask-harness.mjs');
    const h = await createSubtaskHarness();
    const { app, students, content } = h;
    h.reset([{ id: 'main', subTasks: [
      { id: 'a', maxBe: 3, afb: 'I', competenceExpectationIds: ['k1'], customCompetenceText: 'Erwartung A', deficitDiagnosisFollowUp: true },
      { id: 'b', maxBe: 5.5, afb: 'II', competenceExpectationIds: ['k2'], customCompetenceText: 'Erwartung B' },
    ] }], {
      [students[0].id]: { testScores: { a: 2.5, b: 4 }, expectationHorizonComment: 'Nachbereitung' },
      [students[1].id]: { testScores: { a: 0 } },
    }, { name: 'Vorlage.docx', bytes: [1, 2], taskRowIds: ['a', 'b'] });
    app.showConfirmMessage = async () => false;
    await h.click(content.querySelector('[data-grade-test-merge-subtasks]'));
    const cancelled = app.gradesEntryDraft.testTasks[0].subTasks.length;
    app.showConfirmMessage = async () => true;
    await h.click(content.querySelector('[data-grade-test-merge-subtasks]'));
    const merged = structuredClone(app.gradesEntryDraft);
    h.store.updateGradeAssessment(h.assessmentId, merged);
    const { WorkspaceStore } = await import('/src/modules/workspace/store.js');
    const reopened = new WorkspaceStore();
    reopened.replaceGradeVaultState(JSON.parse(JSON.stringify(h.store.exportGradeVaultStateSnapshot())));
    const restoredTemplate = reopened.getGradeAssessment(h.assessmentId).expectationHorizonTemplateFile;
    h.reset([{ id: 'main', subTasks: [{ id: 'last', maxBe: 5 }] }], { [students[0].id]: { testScores: { last: 2 } } });
    let message;
    app.showConfirmMessage = async (value) => { message = value; return false; };
    await h.click(content.querySelector('[data-grade-test-remove-task][data-task-id="last"]'));
    const remains = app.gradesEntryDraft.testTasks.length;
    app.showConfirmMessage = async () => true;
    await h.click(content.querySelector('[data-grade-test-remove-task][data-task-id="last"]'));
    return { cancelled, task: merged.testTasks[0], entries: students.map((student) => merged.entries[student.id]),
      template: merged.expectationHorizonTemplateFile, restoredTemplate, message, remains,
      removed: app.gradesEntryDraft.testTasks.length };
  });
  assert.equal(result.cancelled, 2);
  assert.equal(result.task.subTasks, undefined);
  assert.equal(result.task.maxBe, 8.5);
  assert.equal(result.task.afb, '');
  assert.equal(result.task.deficitDiagnosisFollowUp, true);
  assert.deepEqual(result.task.competenceExpectationIds, ['k1', 'k2']);
  assert.equal(result.task.customCompetenceText, 'Erwartung A\nErwartung B');
  assert.deepEqual(result.entries.map((entry) => entry.testScores), [{ main: 6.5 }, { main: 0 }]);
  assert.equal(result.entries[0].expectationHorizonComment, 'Nachbereitung');
  assert.deepEqual(result.template.taskRowIds, ['main', 'main']);
  assert.deepEqual(result.restoredTemplate, result.template);
  assert.match(result.message, /Teilaufgabe 1a/);
  assert.match(result.message, /gesamte Hauptaufgabe mit ihren Bewertungen/);
  assert.equal(result.remains, 1);
  assert.equal(result.removed, 0);
});

test('DOCX task content follows stable IDs when splitting, removing and joining tasks', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createSubtaskHarness } = await import('/tests/helpers/grades-subtask-harness.mjs');
    const { prepareDocxTemplate, createDocxFromPreparedTemplate } = await import('/src/shared/docx-template.js');
    const h = await createSubtaskHarness();
    const { app } = h;
    const base = new Uint8Array(await (await fetch('/src/modules/grades/expectation-horizon-template.docx')).arrayBuffer());
    const tasks = [{ id: 'main', maxBe: 5 }, { id: 'single', maxBe: 5 }];
    const bytes = await createDocxFromPreparedTemplate(await prepareDocxTemplate(base), {}, {
      tableColumnReplacements: app.buildExpectationHorizonTaskTemplateColumnReplacements(tasks).concat([{
        header: 'Erwartete Prüfungsleistungen', values: ['Inhalt Aufgabe eins', 'Inhalt Aufgabe zwei'],
      }]),
    });
    const readRows = async (data) => {
      const entry = (await prepareDocxTemplate(data)).entries.find((item) => item.name === 'word/document.xml');
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(entry.data), 'application/xml');
      return [...doc.getElementsByTagNameNS('*', 'tbl')[0].children].filter((node) => node.localName === 'tr')
        .slice(1, -1).map((row) => [...row.children].filter((node) => node.localName === 'tc')
          .map((cell) => [...cell.getElementsByTagNameNS('*', 't')].map((node) => node.textContent).join('')));
    };
    const generate = async () => {
      const draft = app.gradesEntryDraft;
      return readRows(await createDocxFromPreparedTemplate(await prepareDocxTemplate(draft.expectationHorizonTemplateFile.bytes), {}, {
        tableColumnReplacements: app.buildExpectationHorizonTaskTemplateColumnReplacements(draft.testTasks, draft.expectationHorizonTemplateFile),
      }));
    };
    h.reset(tasks, {}, { name: 'Vorlage.docx', bytes: [...bytes] });
    app.addGradeTestSubTask('main');
    app.addGradeTestSubTask('main');
    const split = await generate();
    const child = app.gradesEntryDraft.testTasks[0].subTasks[1];
    child.maxBe = 3;
    app.removeGradeTestTask('single');
    const removed = await generate();
    app.mergeGradeTestSubTasks('main');
    const joined = await generate();
    const splitTemplate = await createDocxFromPreparedTemplate(await prepareDocxTemplate(base), {}, {
      tableColumnReplacements: app.buildExpectationHorizonTaskTemplateColumnReplacements([
        { id: 'main', subTasks: [{ id: 'main-part-1', maxBe: 3 }, { id: 'main-part-2', maxBe: 5 }] },
      ], {}).concat([{ header: 'Erwartete Prüfungsleistungen', values: ['Inhalt Teil eins', 'Inhalt Teil zwei'] }]),
    });
    const splitTasks = [{ id: 'main', subTasks: [{ id: 'main-part-1', maxBe: 3 }, { id: 'main-part-2', maxBe: 5 }] }];
    h.reset(splitTasks, {}, { name: 'Teilaufgaben.docx', bytes: [...splitTemplate], taskRowIds: ['main-part-1', 'main-part-2'] });
    app.mergeGradeTestSubTasks('main');
    const joinedContents = await generate();
    h.reset(splitTasks, {}, { name: 'Teilaufgaben.docx', bytes: [...splitTemplate], taskRowIds: ['main-part-1', 'main-part-2'] });
    app.removeGradeTestTask('main-part-2');
    app.addGradeTestSubTask('main');
    const replacementPart = await generate();
    h.reset(tasks);
    app.expectationHorizonTemplateFile = { name: 'Fremde Vorlage.docx', bytes: [...bytes], taskRowIds: ['unrelated'] };
    app.addGradeTestSubTask('main');
    const unrelatedTemplateIgnored = app.gradesEntryDraft.expectationHorizonTemplateFile === null;
    return { split, removed, joined, joinedContents, replacementPart, unrelatedTemplateIgnored };
  });
  assert.deepEqual(result.split.map((row) => [row[0], row[1]]), [
    ['(1a)', 'Inhalt Aufgabe eins'], ['(1b)', ''], ['(2)', 'Inhalt Aufgabe zwei'],
  ]);
  assert.deepEqual(result.removed.map((row) => [row[0], row[1]]), [['(1a)', 'Inhalt Aufgabe eins'], ['(1b)', '']]);
  assert.deepEqual(result.joined.map((row) => [row[0], row[1]]), [['(1)', 'Inhalt Aufgabe eins']]);
  assert.equal(result.joined[0][3], '8');
  assert.match(result.joinedContents[0][1], /Inhalt Teil eins.*Inhalt Teil zwei/);
  assert.equal(result.replacementPart[1][1], '');
  assert.equal(result.unrelatedTemplateIgnored, true);
});

test('LaTeX import refuses omitted main tasks and imports all content when extending the BE table', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createSubtaskHarness } = await import('/tests/helpers/grades-subtask-harness.mjs');
    const { prepareDocxTemplate } = await import('/src/shared/docx-template.js');
    const h = await createSubtaskHarness();
    const { app } = h;
    const bytes = new Uint8Array(await (await fetch('/src/modules/grades/expectation-horizon-template.docx')).arrayBuffer());
    h.reset([{ id: 'main', subTasks: [{ id: 'a', maxBe: 3 }, { id: 'b', maxBe: 2 }] }, { id: 'single', maxBe: 5 }], {},
      { name: 'Vorlage.docx', bytes: [...bytes] });
    const statuses = [];
    Object.assign(app, {
      setExpectationHorizonStatus: (message, type) => statuses.push({ message, type }),
      setExpectationHorizonFileName() {}, syncExpectationHorizonGenerateState() {},
      yieldToBrowser: async () => {}, getCurrentExpectationHorizonTemplateBytes: async () => bytes,
      showConfirmMessage: async () => false,
    });
    const file = new File([String.raw`\begin{Aufgabe}Inhalt eins\end{Aufgabe}
\begin{Aufgabe}Inhalt zwei\end{Aufgabe}
\begin{Aufgabe}Inhalt drei\end{Aufgabe}`], 'Aufgaben.tex', { type: 'text/plain' });
    const original = JSON.stringify(app.gradesEntryDraft);
    const refused = await app.addExpectationHorizonLatexFileToTemplate(file);
    const unchanged = original === JSON.stringify(app.gradesEntryDraft);
    const error = statuses.at(-1);
    app.showConfirmMessage = async () => true;
    const accepted = await app.addExpectationHorizonLatexFileToTemplate(file);
    const status = statuses.at(-1);
    const entry = (await prepareDocxTemplate(app.expectationHorizonTemplateFile.bytes)).entries.find((item) => item.name === 'word/document.xml');
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(entry.data), 'application/xml');
    const rows = [...doc.getElementsByTagNameNS('*', 'tbl')[0].children].filter((node) => node.localName === 'tr')
      .slice(1, -1).map((row) => [...row.children].filter((node) => node.localName === 'tc')
        .map((cell) => [...cell.getElementsByTagNameNS('*', 't')].map((node) => node.textContent).join('')));
    return { refused, unchanged, error, accepted, status, rows, taskCount: app.gradesEntryDraft.testTasks.length };
  });
  assert.equal(result.refused, false);
  assert.equal(result.unchanged, true);
  assert.equal(result.error.type, 'error');
  assert.match(result.error.message, /zusätzliche Aufgaben/);
  assert.equal(result.accepted, true, result.status.message);
  assert.equal(result.status.type, 'success');
  assert.equal(result.taskCount, 3);
  assert.deepEqual(result.rows.map((row) => [row[0], row[1]]), [
    ['(1a)', 'Inhalt eins'], ['(1b)', ''], ['(2)', 'Inhalt zwei'], ['(3)', 'Inhalt drei'],
  ]);
});
