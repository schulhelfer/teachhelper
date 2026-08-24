import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [gradesSource, storeSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
]);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} muss vorhanden sein`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} ist unvollständig`);
}

const getGradeTestDefaultsForYearLevel = Function(
  'normalizeGradeAssessmentYearLevel',
  'getDefaultGradeTestPredicateSuffixes',
  'getGradeDeficitThresholdDefaultForScale',
  `"use strict"; return (${extractFunction(gradesSource, 'getGradeTestDefaultsForYearLevel')});`,
)(
  (value) => Number.isInteger(Number(value)) && Number(value) >= 5 && Number(value) <= 13 ? Number(value) : null,
  (scale) => scale !== 'sek1',
  (scale) => scale === 'sek1' ? 3 : 4,
);

test('Kursjahrgänge leiten die geschlossenen BE-Standardwerte ab', () => {
  assert.deepEqual(getGradeTestDefaultsForYearLevel(5), {
    yearLevel: 5, testScale: 'sek1', testPredicateSuffixes: false, deficitThreshold: 3, courseLevel: '',
  });
  assert.deepEqual(getGradeTestDefaultsForYearLevel(10), {
    yearLevel: 10, testScale: 'sek1', testPredicateSuffixes: false, deficitThreshold: 3, courseLevel: '',
  });
  assert.deepEqual(getGradeTestDefaultsForYearLevel(11), {
    yearLevel: 11, testScale: 'sek2', testPredicateSuffixes: true, deficitThreshold: 4, courseLevel: '',
  });
  assert.deepEqual(getGradeTestDefaultsForYearLevel(13), {
    yearLevel: 13, testScale: 'sek2', testPredicateSuffixes: true, deficitThreshold: 4, courseLevel: '',
  });
  assert.deepEqual(getGradeTestDefaultsForYearLevel(null), {
    yearLevel: null, testScale: 'sek2', testPredicateSuffixes: true, deficitThreshold: 4, courseLevel: '',
  });
});

test('neue BE-Entwürfe übernehmen Kurs-Defaults, gespeicherte Leistungen bleiben individuell', () => {
  assert.match(gradesSource, /getCourseGradeLevel\(courseId\)/);
  assert.match(gradesSource, /applyGradeTestDefaultsToNewDraft\(draft = \{\}, yearLevel = null\)/);
  assert.match(gradesSource, /const isFreshDraft = Object\.keys\(previous\)\.length === 0;/);
  assert.match(gradesSource, /const courseDefaults = isFreshDraft[\s\S]*?getGradeTestDefaultsForYearLevel\(this\.getCourseGradeLevel\(courseKey\)\)/);
  assert.match(gradesSource, /const applyCourseDefaults = !activeAssessment && mode === "test" && previousMode !== "test";/);
  assert.match(gradesSource, /this\.gradesEntryDraft = activeAssessment[\s\S]*?: this\.applyGradeTestDefaultsToNewDraft\(latestDraft, yearLevel\);/);
});

test('Anforderungsniveau ist ab Jahrgang 11 in App und Store verfügbar', () => {
  assert.match(gradesSource, /return normalized === null \|\| normalized < 11;/);
  assert.match(storeSource, /return normalized === null \|\| normalized < 11;/);
});
