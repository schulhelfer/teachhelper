import { createDocxFromPreparedTemplate, prepareDocxTemplate } from '../../src/shared/docx-template.js';
import { renderPercentileRankPng } from '../../src/modules/grades/percentile-rank.js';

export async function readEwhDocx(bytes) {
  const prepared = await prepareDocxTemplate(bytes);
  const xml = new TextDecoder().decode(prepared.entries.find((entry) => entry.name === 'word/document.xml').data);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const mathNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
  const children = (element, name) => [...element.children].filter((child) => child.localName === name);
  const text = (element) => [...element.getElementsByTagNameNS(namespace, 't')].map((node) => node.textContent).join('');
  const table = doc.getElementsByTagNameNS(namespace, 'tbl')[0];
  return {
    rows: children(table, 'tr').map((row) => children(row, 'tc').map(text)),
    text: text(doc),
    math: ['f', 'rad', 'sSup'].map((name) => doc.getElementsByTagNameNS(mathNamespace, name).length),
    bold: children(children(table, 'tr')[1], 'tc')[1].getElementsByTagNameNS(namespace, 'b').length,
    imageDescriptions: [...doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'docPr')].map((node) => node.getAttribute('descr')),
    images: prepared.entries.filter((entry) => entry.name.startsWith('word/media/')).map((entry) => [...entry.data.slice(0, 8)]),
  };
}

export async function createEwhDocxExportApp(taskCount = 13) {
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
  document.querySelector('#expectation-horizon-dialog')?.remove();
  const dialog = document.importNode(doc.querySelector('#expectation-horizon-dialog'), true);
  document.body.append(dialog);
  const refs = Object.fromEntries([...dialog.querySelectorAll('[id]'), dialog].map((element) => [
    element.id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), element,
  ]));
  refs.expectationHorizonPercentBoundaryModeInputs = [...dialog.querySelectorAll('[data-expectation-horizon-percent-boundary-mode]')];
  const templateBytes = new Uint8Array(await (await fetch('/src/modules/grades/expectation-horizon-template.docx')).arrayBuffer());
  const tasks = Array.from({ length: taskCount }, (_, index) => ({
    id: `t${index + 1}`, title: `Aufgabe ${index + 1}`, maxBe: index + 2, afb: ['I', 'II', 'III'][index % 3],
  }));
  const tableColumnReplacements = [
    {
      header: 'AFB', values: tasks.map((task) => task.afb),
      targetRowHeader: 'Nr.', targetSectionEndText: '∑', extendRows: true,
      numberTargetRows: true, removeUnusedTargetRows: true,
    },
    { header: 'BE1', values: tasks.map((task) => task.maxBe) },
    { header: 'BE2', values: tasks.map((task, index) => index + 1) },
  ];
  const ownTemplate = await createDocxFromPreparedTemplate(await prepareDocxTemplate(templateBytes), {}, {
    tableColumnReplacements: [
      ...tableColumnReplacements.slice(0, 2),
      { header: 'Erwartete Prüfungsleistungen', values: tasks.map((task, index) => (
        index === 0 ? { runs: [
          { text: 'Eigene Erwartung mit Formel: ', bold: true },
          { text: '\\frac{1}{2} + \\sqrt{x} + x^2 + \\sqrt[3]{x}', math: true },
        ] } : `Eigene Erwartung ${index + 1}: Aufgabe vollständig bearbeiten.`
      )) },
    ],
  });
  const percentileImage = await renderPercentileRankPng(75);
  const records = ['Anna Beispiel', 'Ben Beispiel'].map((name) => ({
    name, fileName: `${name}.docx`, hasPercentileImage: true, tableColumnReplacements,
    replacements: {
      '<<JG>>': '11-1-2', '<<Name>>': name, '<<Fach>>': 'Mathematik',
      '<<Datum>>': '8. Oktober 2026', '<<Ort>>': 'Berlin', '<<Thema>>': 'Eigene Vorlage',
      '<<Note>>': '10', '<<Notentext>>': 'Gut bearbeitet.',
      '<< BE1 >>': String(taskCount * (taskCount + 3) / 2),
      '<< BE2 >>': String(taskCount * (taskCount + 1) / 2),
      '<<Kommentar>>': `Individueller Kommentar für ${name}.`,
      '<<Prozentgrenzen>>': { table: { rows: [['Note', '1', '2', '3'], ['Prozentgrenze', '90%', '75%', '60%']] } },
      '<<Prozentrang>>': { image: { data: percentileImage, widthEmu: 3500000, heightEmu: 700000, description: 'Prozentrang 75' } },
    },
  }));
  const context = {
    ready: true, course: { id: 1, name: 'Mathematik 11', subject: 'Mathematik' },
    values: { topic: 'Eigene Vorlage', testTasks: tasks, yearLevel: 11, halfYear: 'h1', assessmentNumber: 2 },
  };
  const downloads = [];
  const app = Object.create(GradesApp.prototype);
  Object.assign(app, {
    refs,
    segmentControlSlidePositions: new Map(),
    getExpectationHorizonCourseContext: () => context,
    ensureStoredExpectationHorizonTemplateLoaded: async () => {},
    loadTemporaryExpectationHorizonTemplateFile() { this.expectationHorizonTemplateFile = { bytes: ownTemplate }; },
    getCurrentExpectationHorizonDialogTemplateLabel: () => 'Eigene Vorlage.docx',
    getCurrentExpectationHorizonTemplateInfo: () => ({ name: 'Eigene Vorlage.docx' }),
    getCurrentExpectationHorizonTemplateBytes: async () => ownTemplate,
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
  return { app, context, downloads, records };
}
