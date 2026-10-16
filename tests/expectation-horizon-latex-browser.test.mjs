import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

async function importLatexIntoTemplate({ latex, includeSolutions }) {
  const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
  const { prepareDocxTemplate } = await import('/src/shared/docx-template.js');
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const children = (element, name) => [...element.children].filter((child) => child.localName === name);
  const templateBytes = new Uint8Array(await (
    await fetch('/src/modules/grades/expectation-horizon-template.docx')
  ).arrayBuffer());
  const values = {
    testTasks: [{ id: 't1', title: 'Aufgabe 1', afb: 'I', maxBe: 4, customCompetenceText: '' }],
  };
  const statuses = [];
  const app = Object.create(GradesApp.prototype);
  Object.assign(app, {
    expectationHorizonIncludeLatexSolutions: includeSolutions,
    getActiveGradeTestContext: () => ({ draft: values }),
    getCurrentExpectationHorizonTemplateBytes: async () => templateBytes,
    getCurrentExpectationHorizonTemplateName: () => 'EWH.docx',
    showConfirmMessage: async () => false,
    storeTemporaryExpectationHorizonTemplateFile: () => true,
    setExpectationHorizonStatus: (message, type) => statuses.push({ message, type }),
    setExpectationHorizonFileName() {},
    syncExpectationHorizonGenerateState() {},
    yieldToBrowser: async () => {},
  });
  const imported = await app.addExpectationHorizonLatexFileToTemplate(new File([latex], 'Aufgaben.tex', {
    type: 'text/plain',
  }));
  if (!imported) throw new Error(JSON.stringify(statuses));
  const prepared = await prepareDocxTemplate(app.expectationHorizonTemplateFile.bytes);
  const entry = prepared.entries.find((item) => item.name === 'word/document.xml');
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(entry.data), 'application/xml');
  const [, firstTaskRow] = children(doc.getElementsByTagNameNS(namespace, 'tbl')[0], 'tr');
  const contentCell = children(firstTaskRow, 'tc')[1];
  return children(contentCell, 'p')
    .map((paragraph) => ({
      text: [...paragraph.getElementsByTagNameNS(namespace, 't')].map((text) => text.textContent).join(''),
      italic: paragraph.getElementsByTagNameNS(namespace, 'i').length > 0,
      bullet: paragraph.getElementsByTagNameNS(namespace, 'numPr').length > 0,
    }))
    .filter((paragraph) => paragraph.text);
}

const latex = [
  '\\begin{Aufgabe}[BE: 4]',
  'Erste Zeile\\\\',
  'zweite Zeile',
  'dritte Zeile.',
  '',
  'Neuer Absatz.',
  '\\lsg{Lösung eins\\newline Lösung zwei}',
  '\\lsg{',
  'Beschreibung:',
  '-\tKetten werden von religiösen Symbolen festgehalten',
  'Aussage: ',
  '-\tAnarchie wirkt befreiend.',
  '}',
  '\\end{Aufgabe}',
].join('\n');

test('LaTeX-Zeilenumbrüche und Lösungen erscheinen als eigene Absätze im EWH', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  await t.test('mit Lösungen', async () => {
    const paragraphs = await evaluate(importLatexIntoTemplate, { latex, includeSolutions: true });
    assert.deepEqual(paragraphs, [
      { text: 'Erste Zeile', italic: true, bullet: false },
      { text: 'zweite Zeile', italic: true, bullet: false },
      { text: 'dritte Zeile.', italic: true, bullet: false },
      { text: 'Neuer Absatz.', italic: true, bullet: false },
      { text: 'Lösung eins', italic: false, bullet: false },
      { text: 'Lösung zwei', italic: false, bullet: false },
      { text: 'Beschreibung:', italic: false, bullet: false },
      { text: 'Ketten werden von religiösen Symbolen festgehalten', italic: false, bullet: true },
      { text: 'Aussage:', italic: false, bullet: false },
      { text: 'Anarchie wirkt befreiend.', italic: false, bullet: true },
    ]);
  });
  await t.test('ohne Lösungen', async () => {
    const paragraphs = await evaluate(importLatexIntoTemplate, { latex, includeSolutions: false });
    assert.deepEqual(paragraphs, [
      { text: 'Erste Zeile', italic: false, bullet: false },
      { text: 'zweite Zeile', italic: false, bullet: false },
      { text: 'dritte Zeile.', italic: false, bullet: false },
      { text: 'Neuer Absatz.', italic: false, bullet: false },
    ]);
  });
});
