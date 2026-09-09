import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('refreshing the scale tooltips replaces each option tooltip without throwing', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const grades = await import('/src/modules/grades/app.js?dom-test');

    const content = document.createElement('div');
    content.id = 'grades-entry-content';
    const field = document.createElement('div');
    field.className = 'grades-entry-test-scale-field';
    content.append(field);
    for (const scale of ['sek1', 'sek2']) {
      const option = document.createElement('label');
      option.className = 'grade-test-scale-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.value = scale;
      input.setAttribute('data-grades-entry-test-scale', '1');
      option.append(input);
      const tooltip = document.createElement('div');
      tooltip.className = 'grade-test-scale-tooltip';
      tooltip.textContent = 'stale';
      option.append(tooltip);
      field.append(option);
    }
    document.body.replaceChildren(content);

    const buildSnapshot = (scale) => ({
      id: scale,
      label: scale,
      thresholds: [
        { grade: 1, percent: 92 },
        { grade: 2, percent: 81 },
        { grade: 3, percent: 67 },
        { grade: 4, percent: 50 },
        { grade: 5, percent: 30 },
        { grade: 6, percent: 0 },
      ],
    });

    const app = Object.create(grades.GradesApp.prototype);
    Object.assign(app, {
      refs: { gradesEntryContent: content },
      gradeTestScaleTooltipState: null,
      readGradesEntryEditorValues: () => ({
        testScale: 'sek1',
        testScaleSnapshot: null,
        testTasks: [{ max: 10 }, { max: 30 }],
        testPredicateSuffixes: true,
      }),
      getGradeTestScaleTemplatesForEditor: () => [buildSnapshot('sek1'), buildSnapshot('sek2')],
      store: { buildGradeTestScaleSnapshot: (scale) => buildSnapshot(scale) },
      showGradeTestScaleTooltip() {},
    });

    app.refreshVisibleGradeTestScaleTooltips();

    const tooltips = [...field.querySelectorAll('.grade-test-scale-option')]
      .map((option) => option.querySelector('.grade-test-scale-tooltip'));
    return {
      count: tooltips.length,
      replaced: tooltips.every((tooltip) => tooltip && tooltip.textContent !== 'stale'),
      hasTable: tooltips.every((tooltip) => Boolean(tooltip?.querySelector('table'))),
      strayText: field.textContent.includes('stale'),
    };
  });

  assert.equal(result.count, 2);
  assert.equal(result.replaced, true);
  assert.equal(result.hasTable, true);
  assert.equal(result.strayText, false);
});
