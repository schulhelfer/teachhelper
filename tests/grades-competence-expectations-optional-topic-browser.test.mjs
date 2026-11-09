import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('optionale Themen steuern die Einrückung und überstehen Speichern, Laden und Aufgabenzuordnung', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const [{ GradesApp }, { WorkspaceStore }] = await Promise.all([
      import('/src/modules/grades/app.js?dom-test'),
      import('/src/modules/workspace/store.js'),
    ]);
    const html = new DOMParser().parseFromString(await (await fetch('/src/modules/grades/app.html')).text(), 'text/html');
    const dialog = document.importNode(html.querySelector('#competence-expectations-dialog'), true);
    document.body.append(dialog);
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/src/modules/grades/app.css';
    await new Promise((resolve, reject) => {
      stylesheet.onload = resolve;
      stylesheet.onerror = reject;
      document.head.append(stylesheet);
    });
    const app = Object.create(GradesApp.prototype);
    app.refs = Object.fromEntries([...dialog.querySelectorAll('[id]'), dialog].map((element) => [
      element.id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), element,
    ]));
    app.refs.gradeTaskCompetenceList = document.createElement('div');
    app.openDialog = (element) => element.showModal();
    app.closeDialog = (element) => element.close();
    app.markGradesEntryDraftDirty = () => { app.gradesEntryDraftDirty = true; };
    app.getActiveGradeTestContext = () => ({ assessment: null, draft: app.gradesEntryDraft });
    app.gradesEntryDraft = { mode: 'test' };
    app.bindCompetenceExpectationsDialogEvents();
    app.openCompetenceExpectationsDialog({ ready: true, values: {} });
    const list = app.refs.competenceExpectationsList;
    const topicNode = list.firstElementChild;
    const topic = topicNode.querySelector('[data-competence-expectations-topic]');
    const competence = topicNode.querySelector('[data-competence-expectations-competence]');
    const head = topicNode.querySelector('.competence-expectations-topic-head');
    const row = competence.closest('.competence-expectations-competence-row');
    const columns = (node) => getComputedStyle(node).gridTemplateColumns;
    const initiallyFlat = columns(row) === columns(head);
    const empty = app.readCompetenceExpectationsDialogItems();
    competence.value = 'Freie Kompetenz';
    topic.value = 'Thema';
    topic.dispatchEvent(new Event('input', { bubbles: true }));
    const indented = columns(row) !== columns(head);
    topic.value = '';
    topic.dispatchEvent(new Event('input', { bubbles: true }));
    const clearedFlat = columns(row) === columns(head);
    topic.value = '   ';
    topic.dispatchEvent(new Event('input', { bubbles: true }));
    const whitespaceFlat = columns(row) === columns(head);
    app.addCompetenceExpectationsTopic('Benanntes Thema', [{ id: 'named-competence', text: 'Zugeordnete Kompetenz' }], 'named-topic', { focus: false });
    app.addCompetenceExpectationsTopic('', [''], '', { focus: false });
    const read = app.readCompetenceExpectationsDialogItems();
    const saved = app.saveCompetenceExpectationsDialog();
    const closedAfterSave = !dialog.open;
    const draftItems = app.gradesEntryDraft.competenceExpectations;
    const store = new WorkspaceStore();
    const courseId = store.createCourse(store.getActiveSchoolYear().id, 'Testkurs', '#336699');
    const assessmentId = store.createGradeAssessment(courseId, {
      mode: 'test', competenceExpectations: draftItems,
      testTasks: [{ id: 'a', maxBe: 5, competenceExpectationIds: [draftItems[0].competencies[0].id] }],
    });
    const created = structuredClone(store.getGradeAssessment(assessmentId));
    store.updateGradeAssessment(assessmentId, { competenceExpectations: draftItems });
    const snapshot = JSON.parse(JSON.stringify(store.exportGradeVaultStateSnapshot()));
    const reloadedStore = new WorkspaceStore();
    reloadedStore.replaceGradeVaultState(snapshot);
    const reloaded = reloadedStore.getGradeAssessment(assessmentId);
    app.openCompetenceExpectationsDialog({ ready: true, values: reloaded });
    const reopened = app.readCompetenceExpectationsDialogItems();
    app.renderGradeTaskCompetenceDialogOptions(reopened.items);
    app.syncGradeTaskCompetenceDialogSelection(reloaded.testTasks[0], reopened.items);
    const selection = [...app.refs.gradeTaskCompetenceList.querySelectorAll('[data-grade-task-competence-option]')]
      .map((button) => ({ text: button.textContent, selected: button.getAttribute('aria-checked') }));
    const invalidTopic = app.addCompetenceExpectationsTopic('Leeres Thema', [''], '', { focus: false });
    const invalid = app.readCompetenceExpectationsDialogItems();
    invalidTopic.remove();
    return {
      initiallyFlat, indented, clearedFlat, whitespaceFlat, placeholder: topic.placeholder, empty, read, saved,
      dirty: app.gradesEntryDraftDirty, closedAfterSave,
      created: created.competenceExpectations, reloaded: reloaded.competenceExpectations,
      reopened, selection, headings: [...app.refs.gradeTaskCompetenceList.querySelectorAll('h4')].map((node) => node.textContent),
      assigned: app.getGradeTestTaskAssignedCompetenceTexts(reloaded.testTasks[0], reopened.items), invalid,
      status: app.formatCompetenceExpectationsImportStatus([draftItems[0]]),
    };
  });
  assert.ok(result.initiallyFlat && result.indented && result.clearedFlat && result.whitespaceFlat);
  assert.equal(result.placeholder, 'Thema (optional)');
  assert.equal(result.empty.ok, false);
  assert.equal(result.empty.message, 'Bitte mindestens eine Kompetenz eintragen.');
  assert.equal(result.read.ok, true);
  assert.deepEqual(result.read.items.map((item) => item.topic), ['', 'Benanntes Thema']);
  assert.ok(result.saved && result.dirty && result.closedAfterSave);
  assert.deepEqual(result.created, result.read.items);
  assert.deepEqual(result.reloaded, result.read.items);
  assert.deepEqual(result.reopened, result.read);
  assert.deepEqual(result.headings, ['Benanntes Thema']);
  assert.deepEqual(result.selection, [
    { text: 'Freie Kompetenz', selected: 'true' },
    { text: 'Zugeordnete Kompetenz', selected: 'false' },
  ]);
  assert.deepEqual(result.assigned, ['Freie Kompetenz']);
  assert.equal(result.invalid.ok, false);
  assert.equal(result.invalid.message, 'Bitte zu jedem Thema mindestens eine Kompetenz eintragen.');
  assert.equal(result.status, '1 Kompetenz ohne Thema aus der Textdatei übernommen.');
});

test('Word exportiert Kompetenzen ohne Thema auf Ebene null und zugeordnete Kompetenzen auf Ebene eins', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const { prepareDocxTemplate, createDocxFromPreparedTemplate } = await import('/src/shared/docx-template.js');
    const app = Object.create(GradesApp.prototype);
    const template = await prepareDocxTemplate(new Uint8Array(await (await fetch('/src/modules/grades/competence-expectations-template.docx')).arrayBuffer()));
    const expectations = [
      { topic: '', competencies: [{ text: 'Freie Kompetenz' }, { text: 'Weitere freie Kompetenz' }] },
      { topic: 'Benanntes Thema', competencies: [{ text: 'Zugeordnete Kompetenz' }] },
      { topic: '   ', competencies: [{ text: 'Abschließende freie Kompetenz' }] },
    ];
    const documents = [];
    for (const items of [expectations, [expectations[0]]]) {
      const richText = app.buildCompetenceExpectationsRichText(items);
      const bytes = await createDocxFromPreparedTemplate(template, { '<<Kompetenzen>>': richText });
      const prepared = await prepareDocxTemplate(bytes);
      const xml = new TextDecoder().decode(prepared.entries.find((entry) => entry.name === 'word/document.xml').data);
      const document = new DOMParser().parseFromString(xml, 'application/xml');
      const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      documents.push([...document.getElementsByTagNameNS(namespace, 'p')].map((paragraph) => ({
        text: [...paragraph.getElementsByTagNameNS(namespace, 't')].map((node) => node.textContent).join(''),
        level: paragraph.getElementsByTagNameNS(namespace, 'ilvl')[0]?.getAttributeNS(namespace, 'val'),
        bold: paragraph.getElementsByTagNameNS(namespace, 'b').length > 0,
      })).filter((paragraph) => richText.runs.some((run) => run.text === paragraph.text)));
    }
    return documents;
  });
  assert.deepEqual(result[0].map(({ text, level }) => ({ text, level })), [
    { text: 'Freie Kompetenz', level: '0' },
    { text: 'Weitere freie Kompetenz', level: '0' },
    { text: 'Benanntes Thema', level: '0' },
    { text: 'Zugeordnete Kompetenz', level: '1' },
    { text: 'Abschließende freie Kompetenz', level: '0' },
  ]);
  assert.equal(result[0][2].bold, true);
  assert.deepEqual(result[1].map((paragraph) => paragraph.level), ['0', '0']);
});

test('Textdateien mit themenlosen Kompetenzen lassen sich ersetzen und an Themenblöcke anhängen', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const app = Object.create(GradesApp.prototype);
    app.refs = {
      competenceExpectationsList: document.createElement('div'),
      competenceExpectationsStatus: document.createElement('div'),
    };
    const textFile = (text) => new File([text], 'Kompetenzen.txt', { type: 'text/plain' });
    app.showConfirmMessage = async () => true;
    app.renderCompetenceExpectationsDialogItems([
      { topic: 'Altes Thema', competencies: [{ text: 'Alte Kompetenz' }] },
    ]);
    const replaced = await app.importCompetenceExpectationsTextFile(textFile('-- Freie Kompetenz\n!-- Ausgelassene Kompetenz\n-- Weitere freie Kompetenz'));
    const replacement = app.readCompetenceExpectationsDialogItems();
    const replacementStatus = app.refs.competenceExpectationsStatus.textContent;
    app.showConfirmMessage = async () => false;
    const appendedTopic = await app.importCompetenceExpectationsTextFile(textFile('- Benanntes Thema\n-- Zugeordnete Kompetenz'));
    const appendedFree = await app.importCompetenceExpectationsTextFile(textFile('-- Abschließende freie Kompetenz'));
    const mixed = app.readCompetenceExpectationsDialogItems();
    const invalid = await app.importCompetenceExpectationsTextFile(textFile('- Thema ohne Kompetenz'));
    return {
      replaced, replacement, replacementStatus, appendedTopic, appendedFree, mixed, invalid,
      unchanged: JSON.stringify(mixed) === JSON.stringify(app.readCompetenceExpectationsDialogItems()),
    };
  });
  assert.ok(result.replaced && result.appendedTopic && result.appendedFree);
  assert.equal(result.replacement.ok, true);
  assert.equal(result.replacementStatus, '2 Kompetenzen ohne Thema aus der Textdatei übernommen.');
  assert.deepEqual(result.mixed.items.map((item) => item.topic), ['', 'Benanntes Thema', '']);
  assert.deepEqual(result.mixed.items.map((item) => item.competencies.map((competence) => competence.text)), [
    ['Freie Kompetenz', 'Weitere freie Kompetenz'], ['Zugeordnete Kompetenz'], ['Abschließende freie Kompetenz'],
  ]);
  assert.deepEqual(result.mixed.items[0], result.replacement.items[0]);
  assert.equal(new Set(result.mixed.items.flatMap((item) => item.competencies.map((competence) => competence.id))).size, 4);
  assert.equal(result.invalid, false);
  assert.equal(result.unchanged, true);
});
