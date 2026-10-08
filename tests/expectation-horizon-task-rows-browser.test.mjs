import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

async function buildDocuments(scenario) {
  const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
  const { prepareDocxTemplate, createDocxFromPreparedTemplate } = await import('/src/shared/docx-template.js');
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const children = (element, name) => [...element.children].filter((child) => child.localName === name);
  const serialize = (element) => element ? new XMLSerializer().serializeToString(element) : '';
  const readDocument = async (bytes) => {
    const prepared = await prepareDocxTemplate(bytes);
    const entry = prepared.entries.find((item) => item.name === 'word/document.xml');
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(entry.data), 'application/xml');
    const rows = children(doc.getElementsByTagNameNS(namespace, 'tbl')[0], 'tr');
    return {
      rows: rows.map((row) => children(row, 'tc').map((cell) => (
        [...cell.getElementsByTagNameNS(namespace, 't')].map((text) => text.textContent).join('')
      ))),
      formatting: rows.slice(1, -1).map((row) => ({
        row: serialize(children(row, 'trPr')[0]),
        cells: children(row, 'tc').map((cell) => serialize(children(cell, 'tcPr')[0])),
      })),
      boldContent: rows.slice(1, -1).map((row) => (
        children(row, 'tc')[1].getElementsByTagNameNS(namespace, 'b').length > 0
      )),
    };
  };
  let templateBytes = new Uint8Array(await (
    await fetch('/src/modules/grades/expectation-horizon-template.docx')
  ).arrayBuffer());
  if (scenario.manualContent) {
    templateBytes = await createDocxFromPreparedTemplate(await prepareDocxTemplate(templateBytes), {}, {
      tableColumnReplacements: [{
        header: 'Erwartete Prüfungsleistungen',
        values: Array.from({ length: 9 }, (_, index) => ({
          runs: [{ text: `Eigene Erwartung ${index + 1}`, bold: true }],
        })),
      }],
    });
  }
  const source = await readDocument(templateBytes);
  const tasks = Array.from({ length: scenario.taskCount }, (_, index) => ({
    id: `t${index + 1}`,
    title: `Aufgabe ${index + 1}`,
    afb: ['I', 'II', 'III'][index % 3],
    maxBe: index + 2,
    customCompetenceText: scenario.latexTaskCount ? '' : `Kompetenz ${index + 1}`,
  }));
  const values = {
    testTasks: tasks,
    testScale: 'sek2',
    testScaleSnapshot: {
      id: 'sek2',
      thresholds: Array.from({ length: 16 }, (_, index) => [(15 - index) / 15, 15 - index]),
    },
    yearLevel: 11,
    topic: 'Test',
  };
  const context = {
    ready: true,
    course: { id: 1, name: 'Kurs', subject: 'Mathematik' },
    students: [{ id: 1, firstName: 'Anna' }],
    values,
  };
  const statuses = [];
  const app = Object.create(GradesApp.prototype);
  Object.assign(app, {
    store: {
      getExpectationHorizonLocation: () => 'Berlin',
      getGradeTestScaleSettings: () => null,
    },
    getExpectationHorizonCourseContext: () => context,
    getCurrentExpectationHorizonTemplateBytes: async () => app.expectationHorizonTemplateFile?.bytes || templateBytes,
    getCurrentExpectationHorizonTemplateName: () => 'EWH.docx',
    getCurrentGradeOverviewDisplaySystem: () => 'points',
    getGradeStudentLegalDisplayName: (student) => student.firstName,
    getActiveGradeTestContext: () => ({ draft: values }),
    showConfirmMessage: async () => Boolean(scenario.updateGradeTable),
    updateGradeTestContextTasks(updatedTasks) {
      values.testTasks = updatedTasks;
      return true;
    },
    storeTemporaryExpectationHorizonTemplateFile: () => true,
    setExpectationHorizonStatus: (message, type) => statuses.push({ message, type }),
    setExpectationHorizonFileName() {},
    syncExpectationHorizonGenerateState() {},
    renderGradesView() {},
    yieldToBrowser: async () => {},
  });
  let latexImport;
  if (scenario.latexTaskCount) {
    const latex = Array.from({ length: scenario.latexTaskCount }, (_, index) => (
      `\\begin{Aufgabe}[BE: ${index + 2}]Erwartung ${index + 1}\\end{Aufgabe}`
    )).join('\n');
    const imported = await app.addExpectationHorizonLatexFileToTemplate(new File([latex], 'Aufgaben.tex', {
      type: 'text/plain',
    }));
    if (!imported) throw new Error(JSON.stringify(statuses));
    templateBytes = app.expectationHorizonTemplateFile.bytes;
    latexImport = await readDocument(templateBytes);
  }
  const download = await app.buildCurrentExpectationHorizonDialogTemplateDownload();
  values.entries = {
    1: { testScores: Object.fromEntries(values.testTasks.map((task, index) => [task.id, index + 1])) },
  };
  const [record] = await app.buildExpectationHorizonStudentRecords(context, {
    includeExpectedPerformanceCompetences: !scenario.manualContent && !scenario.latexTaskCount,
    includePercentile: false,
    includePercentBoundaries: false,
  });
  const generate = async (bytes) => readDocument(await createDocxFromPreparedTemplate(
    await prepareDocxTemplate(bytes),
    record.replacements,
    { tableColumnReplacements: record.tableColumnReplacements },
  ));
  return {
    source,
    tasks: values.testTasks,
    download: await readDocument(download.bytes),
    generatedFromSource: await generate(templateBytes),
    generatedFromDownload: await generate(download.bytes),
    unchangedTemplate: await readDocument(templateBytes),
    latexImport,
  };
}

function assertTaskColumns(document, tasks, scored = false) {
  assert.deepEqual(document.rows[0], ['Nr.', 'Erwartete Prüfungsleistungen', 'AFB', 'BE1', 'BE2']);
  assert.equal(document.rows.length, tasks.length + 2);
  tasks.forEach((task, index) => {
    const row = document.rows[index + 1];
    assert.equal(row[0], `(${index + 1})`);
    assert.equal(row[2], task.afb);
    assert.equal(row[3], String(task.maxBe));
    assert.equal(row[4], scored ? String(index + 1) : '');
  });
  const sum = document.rows.at(-1);
  assert.equal(sum[0], '∑');
  assert.equal(sum[2], '');
  assert.equal(sum[3], scored ? String(tasks.reduce((total, task) => total + task.maxBe, 0)) : '<< BE1 >>');
  assert.equal(sum[4], scored ? String(tasks.length * (tasks.length + 1) / 2) : '<< BE2 >>');
  if (!scored) assert.equal(sum[1], '<<Note>><<Notentext>>');
}

test('EWH-Vorlagen und Dokumente enthalten alle Aufgabenwerte in passenden Zeilen', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  for (const taskCount of [1, 5, 9, 13]) {
    await t.test(`${taskCount} Aufgaben`, async () => {
      const result = await evaluate(buildDocuments, { taskCount });
      assertTaskColumns(result.download, result.tasks);
      assert.ok(result.download.rows.slice(1, -1).every((row) => row[1] === ''));
      for (const document of [result.generatedFromSource, result.generatedFromDownload]) {
        assertTaskColumns(document, result.tasks, true);
        result.tasks.forEach((task, index) => {
          assert.equal(document.rows[index + 1][1], task.customCompetenceText);
        });
      }
      assert.deepEqual(result.unchangedTemplate, result.source);
      assert.equal(result.source.rows.length, 11);
    });
  }
});

test('eigene Erwartungstexte und Formatierungen bleiben beim Anpassen der Zeilen erhalten', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  for (const taskCount of [5, 13]) {
    await t.test(`${taskCount} Aufgaben mit bearbeiteter Vorlage`, async () => {
      const result = await evaluate(buildDocuments, { taskCount, manualContent: true });
      assertTaskColumns(result.download, result.tasks);
      for (const document of [result.download, result.generatedFromSource, result.generatedFromDownload]) {
        if (document !== result.download) assertTaskColumns(document, result.tasks, true);
        result.tasks.forEach((task, index) => {
          assert.equal(document.rows[index + 1][1], index < 9 ? `Eigene Erwartung ${index + 1}` : '');
          assert.deepEqual(document.formatting[index], result.source.formatting[Math.min(index, 8)]);
          if (index < 9) assert.equal(document.boldContent[index], true);
        });
      }
      assert.deepEqual(result.unchangedTemplate, result.source);
    });
  }
});

test('LaTeX-Inhalte und BE1-Werte erreichen auch die neu angelegten Aufgabenzeilen', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  for (const updateGradeTable of [false, true]) {
    await t.test(updateGradeTable ? 'BE-Tabelle von 9 auf 13 Aufgaben ergänzen' : '13 vorhandene Aufgaben ausfüllen', async () => {
      const result = await evaluate(buildDocuments, {
        taskCount: updateGradeTable ? 9 : 13,
        latexTaskCount: 13,
        updateGradeTable,
      });
      assert.equal(result.tasks.length, 13);
      assertTaskColumns(result.latexImport, result.tasks);
      assertTaskColumns(result.download, result.tasks);
      for (const document of [result.latexImport, result.download, result.generatedFromSource, result.generatedFromDownload]) {
        if (document === result.generatedFromSource || document === result.generatedFromDownload) {
          assertTaskColumns(document, result.tasks, true);
        }
        result.tasks.forEach((task, index) => {
          assert.equal(document.rows[index + 1][1], `Erwartung ${index + 1}`);
        });
      }
      assert.deepEqual(result.unchangedTemplate, result.latexImport);
    });
  }
});
