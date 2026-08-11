import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [css, appSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
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

test('subcategory separators are drawn from the following cell edge', () => {
  const rule = css.match(
    /\.grades-master-table th\.is-boundary-category,\s+\.grades-master-table td\.is-boundary-category,\s+\.grades-master-table th\.is-boundary-subcategory,\s+\.grades-master-table td\.is-boundary-subcategory\s*\{[\s\S]*?\}/,
  )?.[0] || '';

  assert.ok(rule, 'the grade boundary rule must exist');
  assert.match(rule, /border-right-color: transparent/);
  assert.match(appSource, /const subcategoryLeftBoundary = subcategoryIndex > 0 \? "subcategory" : "";/);
  assert.match(appSource, /leftBoundary: subcategoryLeftBoundary,/);
  assert.match(appSource, /is-leading-boundary-subcategory/);
  assert.match(appSource, /grade-header-summary-cover/);
  assert.match(css, /\.grades-master-table thead th > \.grade-header-summary-cover/);
  assert.match(css, /th:has\(\+ th\.is-leading-boundary-subcategory\)/);
  assert.match(
    css,
    /\.grades-master-table th\.is-leading-boundary-subcategory::before,[\s\S]*?top: 0;[\s\S]*?bottom: 0;[\s\S]*?left: 0;[\s\S]*?background: (?:rgb\(75, 83, 96\)|var\(--border-control\));/,
  );
});

test('the first cell of a following subcategory owns its separator in every table row', () => {
  const model = buildGradesTableModel.call({
    isGradePeriodExpanded() { return true; },
    isGradeCategoryExpanded() { return true; },
    isGradeSubcategoryExpanded(_courseId, _categoryId, subcategoryId) {
      return subcategoryId === 1;
    },
    isHomeworkAssessment() { return false; },
    getGradeOccurrenceCategories() { return [{ id: 1, name: 'Vorkommnis' }]; },
    resolveGradeOccurrenceCategoryId() { return 1; },
  }, { id: 1 }, [{
    period: 'h1',
    label: '1. Halbjahr',
    categories: [{
      id: 10,
      subcategories: [
        { id: 1, assessments: [] },
        { id: 2, assessments: [] },
      ],
    }],
  }], { includeAddColumns: false });

  const firstSubcategory = model.columns.find((column) => column.type === 'subcategory-partial' && column.subcategoryId === 1);
  const collapsedSubcategory = model.columns.find((column) => column.type === 'subcategory-collapsed' && column.subcategoryId === 2);
  const collapsedHeader = model.headerRows[2].find((cell) => cell.type === 'subcategory-collapsed' && cell.subcategory.id === 2);

  assert.equal(firstSubcategory.rightBoundary, '');
  assert.equal(collapsedSubcategory.leftBoundary, 'subcategory');
  assert.equal(collapsedHeader.leftBoundary, 'subcategory');
});

test('collapsed subcategories hide occurrence summary columns', () => {
  const model = buildGradesTableModel.call({
    isGradePeriodExpanded() { return true; },
    isGradeCategoryExpanded() { return true; },
    isGradeSubcategoryExpanded() { return false; },
    isHomeworkAssessment(assessment) { return assessment.mode === 'homework'; },
    getGradeOccurrenceCategories() {
      return [{ id: 1, name: 'Fehlt' }, { id: 2, name: 'Störung' }];
    },
    resolveGradeOccurrenceCategoryId(value) { return Number(value) || 1; },
  }, { id: 1 }, [{
    period: 'h1',
    label: '1. Halbjahr',
    categories: [{
      id: 10,
      subcategories: [{
        id: 20,
        assessments: [
          { id: 101, mode: 'homework', occurrenceCategoryId: 1 },
          { id: 102, mode: 'homework', occurrenceCategoryId: 2 },
        ],
      }],
    }],
  }], { includeAddColumns: false });

  const collapsedSubcategory = model.columns.find((column) => column.type === 'subcategory-collapsed');
  const collapsedHeader = model.headerRows[2].find((cell) => cell.type === 'subcategory-collapsed');

  assert.ok(collapsedSubcategory);
  assert.equal(model.columns.some((column) => column.type === 'subcategory-homework'), false);
  assert.equal(model.headerRows.flat().some((cell) => cell.type === 'subcategory-homework'), false);
  assert.equal(collapsedHeader.colSpan, 1);
  assert.equal(collapsedHeader.rowSpan, 2);
});
