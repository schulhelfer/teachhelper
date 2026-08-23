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

test('every vertical separator belongs to the cell on its left', () => {
  const rule = css.match(
    /\.grades-master-table th\.is-boundary-category,\s+\.grades-master-table td\.is-boundary-category,\s+\.grades-master-table th\.is-boundary-subcategory,\s+\.grades-master-table td\.is-boundary-subcategory,\s+\.grades-master-table th:has\([\s\S]*?\{[^}]*\}/,
  )?.[0] || '';

  assert.ok(rule, 'the grade boundary rule must exist');
  assert.match(rule, /border-right-color: var\(--border-control\);/);
  assert.doesNotMatch(rule, /border-right-color: transparent/);
  assert.doesNotMatch(css, /is-boundary-(?:sub)?category::after/);
  assert.doesNotMatch(css, /is-leading-boundary-(?:sub)?category::before/);
  assert.doesNotMatch(css, /--grade-boundary-(?:left|right)-shadow: inset (?!0 0 0 0 transparent)/);
  assert.match(appSource, /const subcategoryLeftBoundary = subcategoryIndex > 0 \? "subcategory" : "";/);
  assert.match(appSource, /leftBoundary: subcategoryLeftBoundary,/);
  assert.match(appSource, /is-leading-boundary-subcategory/);
  assert.match(appSource, /grade-header-summary-cover/);
  assert.match(css, /\.grades-master-table thead th > \.grade-header-summary-cover/);
  assert.match(appSource, /const isHeaderCell = cell\.tagName === "TH";/);
  assert.match(appSource, /const isHeaderSummaryCell = isHeaderCell/);
  assert.match(appSource, /if \(isHeaderSummaryCell\) return;/);
  assert.match(appSource, /clipPath: isHeaderCell \? "inset\(0\)" : "inset\(0 100% 0 0\)"/);
  assert.doesNotMatch(appSource, /oldShell\.animate\(/);
  assert.match(css, /th:has\(\+ th\.is-leading-boundary-subcategory\)/);
  assert.match(css, /td:has\(\+ td\.is-leading-boundary-subcategory\)/);
  assert.match(css, /th:has\(\+ th\.is-leading-boundary-category\)/);
  assert.match(css, /td:has\(\+ td\.is-leading-boundary-category\)/);
});

test('only cells at the real right edge give up their separator', () => {
  assert.doesNotMatch(css, /\.grades-master-table tr>\*:last-child \{/);
  assert.match(
    css,
    /\.grades-master-table \.is-table-edge-cell \{\s+border-right: none;\s+\}/,
  );
  assert.match(appSource, /th\.classList\.toggle\("is-table-edge-cell", cell\.atRightEdge === true\);/);
  assert.match(appSource, /td\.classList\.toggle\("is-table-edge-cell", column\.atRightEdge === true\);/);

  const placeHeaderRows = (headerRows, columnCount) => {
    const occupied = [];
    return headerRows.map((row, rowIndex) => {
      if (!occupied[rowIndex]) occupied[rowIndex] = [];
      let column = 0;
      return row.map((cell) => {
        while (occupied[rowIndex][column]) column += 1;
        const colSpan = Number(cell.colSpan || 1);
        const rowSpan = Number(cell.rowSpan || 1);
        for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
          if (!occupied[r]) occupied[r] = [];
          for (let c = column; c < column + colSpan; c += 1) occupied[r][c] = true;
        }
        column += colSpan;
        return { cell, end: column, isRowEnd: column >= columnCount };
      });
    });
  };

  const category = (id, subcategories, assessments = []) => ({
    id, name: `K${id}`, assessments, subcategories,
  });
  const subcategory = (id, assessments = []) => ({ id, name: `S${id}`, assessments });
  const groups = [
    {
      period: 'h1',
      label: '1. Halbjahr',
      categories: [
        category(10, [subcategory(1, [{ id: 101 }, { id: 102 }]), subcategory(2, [{ id: 103 }])]),
        category(11, [], [{ id: 110 }]),
        category(12, [subcategory(3, [{ id: 120 }])]),
      ],
    },
    {
      period: 'h2',
      label: '2. Halbjahr',
      categories: [
        category(20, [subcategory(4, [{ id: 201 }])]),
        category(21, [], [{ id: 210 }]),
      ],
    },
  ];

  let combinations = 0;
  let earlyEndingRows = 0;
  for (const h1 of [true, false]) for (const h2 of [true, false])
  for (const c10 of [true, false]) for (const c11 of [true, false]) for (const c12 of [true, false])
  for (const s1 of [true, false]) for (const s2 of [true, false])
  for (const includeAddColumns of [true, false]) {
    combinations += 1;
    const label = `h1=${h1} h2=${h2} c=${c10}${c11}${c12} s=${s1}${s2} add=${includeAddColumns}`;
    const model = buildGradesTableModel.call({
      isGradePeriodExpanded(_courseId, period) { return period === 'h1' ? h1 : h2; },
      isGradeCategoryExpanded(_courseId, categoryId) {
        if (categoryId === 10) return c10;
        if (categoryId === 11) return c11;
        return c12;
      },
      isGradeSubcategoryExpanded(_courseId, _categoryId, subcategoryId) {
        return subcategoryId === 1 ? s1 : s2;
      },
      isHomeworkAssessment() { return false; },
      getGradeOccurrenceCategories() { return []; },
      resolveGradeOccurrenceCategoryId() { return 1; },
    }, { id: 1 }, groups, { includeAddColumns });

    const columnCount = model.columns.length;
    model.columns.forEach((column, index) => {
      assert.equal(column.atRightEdge, index === columnCount - 1, `${label}: body column ${index}`);
    });
    assert.equal(model.columns[columnCount - 1].rightBoundary || '', '',
      `${label}: the rightmost column must not claim a boundary`);

    placeHeaderRows(model.headerRows, columnCount).forEach((row, rowIndex) => {
      row.forEach(({ cell, isRowEnd }, index) => {
        assert.equal(cell.atRightEdge, isRowEnd,
          `${label}: header row ${rowIndex} cell ${index} (${cell.type})`);
      });
      const last = row[row.length - 1];
      if (last && !last.isRowEnd) earlyEndingRows += 1;
      row.forEach(({ cell }, index) => {
        const next = row[index + 1]?.cell;
        assert.ok(!(cell.rightBoundary && next?.leftBoundary),
          `${label}: header row ${rowIndex} claims one edge twice at ${index}`);
      });
    });
  }

  assert.equal(combinations, 256);
  assert.ok(earlyEndingRows > 0, 'the early-ending header rows must actually be covered');
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
