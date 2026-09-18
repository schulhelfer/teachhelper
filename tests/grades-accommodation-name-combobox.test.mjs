import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appJs = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');
const appCss = await readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8');

function readAccommodationRender() {
  const start = appJs.indexOf('renderGradeAccommodationDialog() {');
  const end = appJs.indexOf('getGradeAccommodationSelectedName(row) {', start);
  assert.ok(start >= 0 && end > start, 'renderGradeAccommodationDialog must exist');
  return appJs.slice(start, end);
}

test('the accommodation name picker is a searchable combobox instead of a select', () => {
  const render = readAccommodationRender();
  assert.ok(!render.includes('createElement("select")'), 'name picker must not build a <select>');
  assert.match(render, /setAttribute\("role", "combobox"\)/);
  assert.match(render, /setAttribute\("role", "listbox"\)/);
  assert.match(render, /setAttribute\("aria-expanded"/);
  assert.match(render, /setAttribute\("aria-controls", listId\)/);
  assert.match(render, /dataset\.gradeAccommodationStudent = "1"/);
});

test('the accommodation dialog focuses the combobox input rather than a select', () => {
  assert.ok(
    !/grade-accommodation-card:last-child select/.test(appJs),
    'add-card focus must not target a select',
  );
  assert.match(appJs, /grade-accommodation-card:last-child input\[data-grade-accommodation-student='1'\]/);
  assert.match(appJs, /querySelector\("input, textarea, button"\)/);
});

test('the combobox filters through the shared learner search normalizer', () => {
  assert.match(appJs, /import \{ normalizeLearnerSearchText \} from "\.\.\/\.\.\/shared\/learner-search\.js"/);
  assert.match(appJs, /function filterGradeAccommodationStudents\(students, query, nameOrder\)/);
  assert.match(appJs, /function foldGradeAccommodationName\(value\)/, 'German ue/oe/ae spellings fold together');
});

test('already assigned names stay visible but are marked as taken', () => {
  assert.match(appJs, /bereits vergeben/);
  assert.match(appJs, /setAttribute\("aria-disabled", "true"\)/);
});

test('accommodation inputs are rendered larger than their field labels', () => {
  const start = appCss.indexOf('.grade-accommodation-student-field,');
  const end = appCss.indexOf('.grade-accommodation-delete {', start);
  assert.ok(start >= 0 && end > start, 'accommodation field styles must exist');
  const block = appCss.slice(start, end);
  assert.match(block, /font-size: 0\.84rem/, 'field labels use the smaller size');
  assert.match(
    block,
    /\.grade-accommodation-student-field input,\s*\.grade-accommodation-text-field textarea \{\s*font-size: 0\.95rem/,
    'inputs override the inherited label size',
  );
  assert.ok(!/font-size: 0\.76rem/.test(block), 'the old cramped label size is gone');
});
