import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, storeSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
]);

function extractClassMethod(name) {
  const match = new RegExp(`\\n  ${name}\\(`).exec(appSource);
  assert.ok(match, `${name} must exist`);
  const start = match.index + 1;
  const bodyStart = appSource.indexOf(') {', start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`${name} is incomplete`);
}

const { buildGradesTableModel } = Function(
  `"use strict"; return ({${extractClassMethod('buildGradesTableModel')}});`,
)();

test('direct categories produce category-level assessment, homework, and add columns', () => {
  const model = buildGradesTableModel.call({
    isGradePeriodExpanded() { return true; },
    isGradeCategoryExpanded() { return true; },
    isHomeworkAssessment(assessment) { return assessment.mode === 'homework'; },
    getGradeOccurrenceCategories() { return [{ id: 1, name: 'Fehlt' }]; },
    resolveGradeOccurrenceCategoryId() { return 1; },
  }, { id: 1 }, [{
    period: 'h1',
    label: 'HJ1',
    categories: [{
      id: 10,
      name: 'Mündlich',
      subcategories: [],
      assessments: [
        { id: 101, categoryId: 10, subcategoryId: null, mode: 'grade' },
        { id: 102, categoryId: 10, subcategoryId: null, mode: 'homework', occurrenceCategoryId: 1 },
      ],
    }],
  }]);

  assert.ok(model.columns.some((column) => column.type === 'category-partial' && column.categoryId === 10));
  assert.ok(model.columns.some((column) => column.type === 'category-homework' && column.categoryId === 10));
  assert.ok(model.columns.some((column) => column.type === 'assessment' && column.assessment.id === 101 && column.subcategoryId === null));
  assert.ok(model.columns.some((column) => column.type === 'add' && column.categoryId === 10 && column.subcategoryId === null));
  assert.equal(model.columns.some((column) => column.type.startsWith('subcategory-')), false);
});

test('direct-category assignments stay nullable and are guarded against a grouped-mode switch', () => {
  assert.match(storeSource, /assessments: period\.includeAssessments && subcategories\.length === 0[\s\S]*?!Number\(assessment\.subcategoryId\)/);
  assert.match(storeSource, /categoryId > 0[\s\S]*?subcategoryId === 0[\s\S]*?categoryHasSubcategories\.get\(categoryId\) === true/);
  assert.match(storeSource, /category\.subcategories\.length === 0[\s\S]*?calculateComputedGradeForStudentInSubcategoryPeriod\([\s\S]*?null/);
  assert.match(appSource, /Leistungen werden direkt dieser Kategorie zugeordnet\./);
  assert.match(appSource, /subcategories\.length > 0 && Math\.abs\(subcategoryWeightSum - 100\)/);
  assert.match(appSource, /isGradeAssessmentAssignmentValid\([\s\S]*?resolveGradeAssessmentSubcategoryId/);
});
