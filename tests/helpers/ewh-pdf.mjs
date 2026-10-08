import { createDocxFromPreparedTemplate, prepareDocxTemplate } from '../../src/shared/docx-template.js';
import { renderPercentileRankPng } from '../../src/modules/grades/percentile-rank.js';

export async function createEwhPdfFixture(taskCount = 13, options = {}) {
  const templateBytes = new Uint8Array(await (
    await fetch('/src/modules/grades/expectation-horizon-template.docx')
  ).arrayBuffer());
  const preparedTemplate = await prepareDocxTemplate(templateBytes);
  if (options.landscape || options.pageBreak) {
    const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const entry = preparedTemplate.entries.find((item) => item.name === 'word/document.xml');
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(entry.data), 'application/xml');
    if (options.landscape) {
      const size = doc.getElementsByTagNameNS(namespace, 'pgSz')[0];
      const width = size.getAttributeNS(namespace, 'w');
      size.setAttributeNS(namespace, 'w:w', size.getAttributeNS(namespace, 'h'));
      size.setAttributeNS(namespace, 'w:h', width);
      size.setAttributeNS(namespace, 'w:orient', 'landscape');
    }
    if (options.pageBreak) {
      const paragraph = doc.createElementNS(namespace, 'w:p');
      for (const value of ['Vor dem manuellen Seitenumbruch.', null, 'Nach dem manuellen Seitenumbruch.']) {
        const run = doc.createElementNS(namespace, 'w:r');
        const child = doc.createElementNS(namespace, value === null ? 'w:br' : 'w:t');
        if (value === null) child.setAttributeNS(namespace, 'w:type', 'page');
        else child.textContent = value;
        run.append(child);
        paragraph.append(run);
      }
      doc.getElementsByTagNameNS(namespace, 'tbl')[0].after(paragraph);
    }
    entry.data = new TextEncoder().encode(new XMLSerializer().serializeToString(doc));
  }
  const replacements = {
    '<<JG>>': '11-1',
    '<<Name>>': 'Anna Beispiel',
    '<<Fach>>': 'Mathematik',
    '<<Datum>>': '8. Oktober 2026',
    '<<Ort>>': 'Berlin',
    '<<Thema>>': 'Eigene Vorlage',
    '<<Note>>': '10',
    '<<Notentext>>': 'Gut bearbeitet.',
    '<< BE1 >>': String(taskCount * (taskCount + 3) / 2),
    '<< BE2 >>': String(taskCount * (taskCount + 1) / 2),
    '<<Kommentar>>': options.blocks ? 'Individueller Kommentar zur Bearbeitung.' : '',
    '<<Prozentgrenzen>>': options.blocks ? { table: { rows: [['Note', '1', '2', '3'], ['Prozentgrenze', '90%', '75%', '60%']] } } : '',
    '<<Prozentrang>>': options.blocks ? { image: {
      data: await renderPercentileRankPng(75),
      widthEmu: 3500000,
      heightEmu: 700000,
      description: 'Prozentrang 75',
    } } : '',
  };
  const record = {
    fileName: 'Anna Beispiel.docx',
    name: 'Anna Beispiel',
    replacements,
    tableColumnReplacements: [
      {
        header: 'AFB', values: Array.from({ length: taskCount }, (_, index) => ['I', 'II', 'III'][index % 3]),
        targetRowHeader: 'Nr.', targetSectionEndText: '∑', extendRows: true,
        numberTargetRows: true, removeUnusedTargetRows: true,
      },
      { header: 'BE1', values: Array.from({ length: taskCount }, (_, index) => index + 2) },
      { header: 'BE2', values: Array.from({ length: taskCount }, (_, index) => index + 1) },
      { header: 'Erwartete Prüfungsleistungen', values: Array.from({ length: taskCount }, (_, index) => (
        options.math && index === 0 ? { runs: [
          { text: 'Eigene Erwartung mit Formel: ', bold: true },
          { text: '\\frac{1}{2} + \\sqrt{x} + x^2 + \\sqrt[3]{x}', math: true },
        ] } : `Erwartung ${index + 1}: ${options.longText ? 'Diese eigene Anforderung muss vollständig in der Ausgabe stehen. '.repeat(options.repetitions || 25) : 'Aufgabe vollständig bearbeiten.'}`
      )) },
    ],
  };
  const docxBytes = await createDocxFromPreparedTemplate(preparedTemplate, replacements, {
    tableColumnReplacements: record.tableColumnReplacements,
  });
  return { templateBytes, preparedTemplate, record, docxBytes };
}

export async function createEwhPdfExportApp() {
  const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
  const html = await (await fetch('/src/modules/grades/app.html')).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
  document.head.append(meta);
  for (const href of ['/src/shared/segment-control.css', '/src/modules/grades/app.css']) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }
  const dialog = document.importNode(doc.querySelector('#expectation-horizon-dialog'), true);
  document.body.append(dialog);
  const refs = Object.fromEntries([...dialog.querySelectorAll('[id]'), dialog].map((element) => [
    element.id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), element,
  ]));
  refs.expectationHorizonOutputFormatInputs = [...dialog.querySelectorAll('[data-expectation-horizon-output-format]')];
  refs.expectationHorizonPercentBoundaryModeInputs = [...dialog.querySelectorAll('[data-expectation-horizon-percent-boundary-mode]')];
  const fixture = await createEwhPdfFixture(13, { blocks: true, math: true });
  const templateBytes = await createDocxFromPreparedTemplate(fixture.preparedTemplate, {}, {
    tableColumnReplacements: [fixture.record.tableColumnReplacements.at(-1)],
  });
  const context = {
    ready: true,
    course: { id: 1, name: 'Mathematik 11', subject: 'Mathematik' },
    values: { topic: 'Eigene Vorlage', testTasks: Array.from({ length: 13 }, (_, index) => ({
      id: `t${index + 1}`, title: `Aufgabe ${index + 1}`, maxBe: index + 2, afb: ['I', 'II', 'III'][index % 3],
    })) },
  };
  const records = [fixture.record, { ...fixture.record, fileName: 'Ben Beispiel.docx' }].map((record) => ({
    ...record,
    tableColumnReplacements: record.tableColumnReplacements.filter((column) => column.header !== 'Erwartete Prüfungsleistungen'),
  }));
  const downloads = [];
  const app = Object.create(GradesApp.prototype);
  Object.assign(app, {
    refs,
    segmentControlSlidePositions: new Map(),
    expectationHorizonOutputFormat: 'pdf',
    getExpectationHorizonCourseContext: () => context,
    ensureStoredExpectationHorizonTemplateLoaded: async () => {},
    loadTemporaryExpectationHorizonTemplateFile() { this.expectationHorizonTemplateFile = { bytes: templateBytes }; },
    getCurrentExpectationHorizonDialogTemplateLabel: () => 'Eigene Vorlage.docx',
    getCurrentExpectationHorizonTemplateInfo: () => ({ name: 'Eigene Vorlage.docx' }),
    getCurrentExpectationHorizonTemplateBytes: async () => templateBytes,
    getCurrentExpectationHorizonTemplateName: () => 'Eigene Vorlage.docx',
    commitVisibleGradeInputs: () => true,
    buildExpectationHorizonStudentRecords: async () => records,
    openDialog: (element) => element.showModal(),
    closeDialog: (element) => element.close(),
    bindDialogBackdropClose() {},
    downloadBytes: (data, name, type) => downloads.push({ data, name, type }),
    yieldToBrowser: async () => new Promise((resolve) => setTimeout(resolve, 0)),
  });
  app.bindExpectationHorizonDialogEvents();
  window.ewhExportApp = app;
  return { app, context, downloads, records };
}
