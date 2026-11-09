import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('Nachschreibtermine kennzeichnen JG in EWH und Kompetenzerwartungen', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const results = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const { prepareDocxTemplate, createDocxFromPreparedTemplate } = await import('/src/shared/docx-template.js');
    const templates = await Promise.all(['expectation-horizon', 'competence-expectations'].map(async (name) => (
      prepareDocxTemplate(new Uint8Array(await (await fetch(`/src/modules/grades/${name}-template.docx`)).arrayBuffer()))
    )));
    const app = Object.create(GradesApp.prototype);
    app.store = {
      getExpectationHorizonLocation: () => '',
      getGradeTestScaleSettings: () => null,
    };
    app.getGradeStudentLegalDisplayName = () => 'Testperson';
    const results = [];
    for (const yearLevel of [12, null]) {
      for (const assessmentNumber of [2, null]) {
        for (const isMakeupAssessment of [undefined, false, true]) {
          const values = {
            mode: 'test', yearLevel, halfYear: 'h2', assessmentNumber, isMakeupAssessment,
            testScale: 'sek2',
            testScaleSnapshot: { id: 'sek2', thresholds: Array.from({ length: 16 }, (_, index) => [(15 - index) / 15, 15 - index]) },
            testTasks: [{ id: 'a', title: 'Aufgabe 1', maxBe: 10, afb: 'II' }],
            entries: { 1: { testScores: { a: 5 } } },
          };
          const context = { values, course: { subject: 'Testfach' }, students: [{ id: 1 }] };
          const [record] = await app.buildExpectationHorizonStudentRecords(context, {
            includePercentile: false, includePercentBoundaries: false,
          });
          const competenceReplacements = app.buildCompetenceExpectationsReplacements(context);
          const replacements = [record.replacements, competenceReplacements];
          const documents = [];
          for (let index = 0; index < templates.length; index += 1) {
            const bytes = await createDocxFromPreparedTemplate(templates[index], replacements[index]);
            const document = await prepareDocxTemplate(bytes);
            documents.push(document.entries.filter((entry) => /^word\/.*\.xml$/.test(entry.name)).map((entry) => {
              const dom = new DOMParser().parseFromString(new TextDecoder().decode(entry.data), 'application/xml');
              return [...dom.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't')]
                .map((node) => node.textContent).join('');
            }).join('\n'));
          }
          results.push({ yearLevel, assessmentNumber, isMakeupAssessment: isMakeupAssessment === true,
            jg: replacements.map((replacement) => replacement['<<JG>>']), documents });
        }
      }
    }
    return results;
  });
  for (const result of results) {
    const base = result.yearLevel === null ? '—' : `12-2${result.assessmentNumber === null ? '' : '-2'}`;
    const expected = `${base}${result.isMakeupAssessment ? ' (NT)' : ''}`;
    assert.deepEqual(result.jg, [expected, expected]);
    for (const text of result.documents) {
      assert.ok(text.includes(expected), expected);
      assert.equal(text.includes('(NT)'), result.isMakeupAssessment);
      assert.equal(text.includes('<<JG>>'), false);
    }
  }
});
