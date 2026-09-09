import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGradesInternals } from './helpers/grades-module.mjs';

const {
  normalizeGradeTestPredicateSuffixes,
  applyGradeTestPredicateSuffixes,
  getDefaultGradeTestPredicateSuffixes,
  getGradeTestScaleTooltipRows,
  calculateGradeTestValueFromRatio,
  formatGradeDisplayForSystem,
  GRADE_TEST_SCALE_THRESHOLDS,
} = await loadGradesInternals([
  'normalizeGradeTestPredicateSuffixes',
  'applyGradeTestPredicateSuffixes',
  'getDefaultGradeTestPredicateSuffixes',
  'getGradeTestScaleTooltipRows',
  'calculateGradeTestValueFromRatio',
  'formatGradeDisplayForSystem',
  'GRADE_TEST_SCALE_THRESHOLDS',
]);

test('Tendenzen sind in Sek II an und in Sek I aus', () => {
  assert.equal(getDefaultGradeTestPredicateSuffixes('sek2'), true);
  assert.equal(getDefaultGradeTestPredicateSuffixes('custom'), true);
  assert.equal(getDefaultGradeTestPredicateSuffixes('sek1'), false);
});

test('die Tendenz-Einstellung liest die gängigen Ja-Nein-Schreibweisen', () => {
  for (const value of [true, 1, '1', 'true', 'yes', 'ja', 'on', 'JA', ' On ']) {
    assert.equal(normalizeGradeTestPredicateSuffixes(value, false), true, `${value} muss wahr sein`);
  }
  for (const value of [false, 0, '0', 'false', 'no', 'nein', 'off', 'NEIN']) {
    assert.equal(normalizeGradeTestPredicateSuffixes(value, true), false, `${value} muss falsch sein`);
  }
});

test('unlesbare Tendenz-Einstellungen behalten den Vorgabewert', () => {
  assert.equal(normalizeGradeTestPredicateSuffixes('unsinn', true), true);
  assert.equal(normalizeGradeTestPredicateSuffixes('unsinn', false), false);
  assert.equal(normalizeGradeTestPredicateSuffixes(null, true), true);
  assert.equal(normalizeGradeTestPredicateSuffixes(undefined, false), false);
});

test('mit Tendenzen bleibt die Punktzahl unverändert', () => {
  for (let grade = 0; grade <= 15; grade += 1) {
    assert.equal(applyGradeTestPredicateSuffixes(grade, true), grade);
  }
});

test('ohne Tendenzen rastet jede Punktzahl auf die Mitte ihrer Notenstufe', () => {
  const expected = {
    15: 14, 14: 14, 13: 14,
    12: 11, 11: 11, 10: 11,
    9: 8, 8: 8, 7: 8,
    6: 5, 5: 5, 4: 5,
    3: 2, 2: 2, 1: 2,
    0: 0,
  };
  for (const [grade, target] of Object.entries(expected)) {
    assert.equal(
      applyGradeTestPredicateSuffixes(Number(grade), false),
      target,
      `${grade} Punkte müssen ohne Tendenz zu ${target} werden`,
    );
  }
});

test('ohne Tendenzen bleibt die Null eine Null', () => {
  assert.equal(applyGradeTestPredicateSuffixes(0, false), 0, 'ungenügend darf nicht angehoben werden');
});

test('ohne Tendenzen entstehen nur die sechs Notenstufen', () => {
  const results = new Set();
  for (let grade = 0; grade <= 15; grade += 1) {
    results.add(applyGradeTestPredicateSuffixes(grade, false));
  }
  assert.deepEqual([...results].sort((a, b) => a - b), [0, 2, 5, 8, 11, 14]);
});

test('ohne Tendenzen bleibt die Zuordnung monoton', () => {
  let previous = -1;
  for (let grade = 0; grade <= 15; grade += 1) {
    const mapped = applyGradeTestPredicateSuffixes(grade, false);
    assert.ok(mapped >= previous, `${grade} Punkte fielen unter den vorherigen Wert`);
    previous = mapped;
  }
});

test('leere Werte ergeben keine Punktzahl', () => {
  assert.equal(applyGradeTestPredicateSuffixes(null, true), null);
  assert.equal(applyGradeTestPredicateSuffixes(undefined, true), null);
  assert.equal(applyGradeTestPredicateSuffixes('', true), null);
});

test('Punktzahlen außerhalb der Skala werden begrenzt', () => {
  assert.equal(applyGradeTestPredicateSuffixes(99, true), 15);
  assert.equal(applyGradeTestPredicateSuffixes(-5, true), 0);
  assert.equal(applyGradeTestPredicateSuffixes(99, false), 14);
});

test('die Notenberechnung wendet die Tendenz-Einstellung an', () => {
  const ratio = { ratio: 0.95, maxSum: 100 };
  assert.equal(calculateGradeTestValueFromRatio(ratio, 'sek2', null, true), 15);
  assert.equal(
    calculateGradeTestValueFromRatio(ratio, 'sek2', null, false),
    14,
    'ohne Tendenz wird aus 15 Punkten eine glatte 1',
  );
});

test('ohne Tendenzen liefert die Notenskala nur glatte Noten', () => {
  for (let percent = 0; percent <= 100; percent += 1) {
    const grade = calculateGradeTestValueFromRatio(
      { ratio: percent / 100, maxSum: 100 },
      'sek2',
      null,
      false,
    );
    assert.ok(
      [0, 2, 5, 8, 11, 14].includes(grade),
      `${percent} % ergab ${grade}, was keine glatte Note ist`,
    );
  }
});

test('die Notenschlüssel-Übersicht zeigt mit Tendenzen alle 16 Stufen', () => {
  const rows = getGradeTestScaleTooltipRows(GRADE_TEST_SCALE_THRESHOLDS.sek2, true);
  assert.equal(rows.length, 16);
  assert.equal(rows[0].grade, 15);
  assert.equal(rows[0].label, '15');
  assert.equal(rows.at(-1).grade, 0);
});

test('die Notenschlüssel-Übersicht fasst ohne Tendenzen zu sechs Noten zusammen', () => {
  const rows = getGradeTestScaleTooltipRows(GRADE_TEST_SCALE_THRESHOLDS.sek2, false);
  assert.deepEqual(
    rows.map((row) => row.label),
    ['sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend'],
  );
});

test('die zusammengefassten Zeilen tragen die Schwelle der untersten Stufe', () => {
  const rows = getGradeTestScaleTooltipRows(GRADE_TEST_SCALE_THRESHOLDS.sek2, false);
  const byLabel = new Map(rows.map((row) => [row.label, row]));
  assert.equal(byLabel.get('sehr gut').threshold, 0.85, 'sehr gut beginnt bei 13 Punkten');
  assert.equal(byLabel.get('gut').threshold, 0.7, 'gut beginnt bei 10 Punkten');
  assert.equal(byLabel.get('ausreichend').threshold, 0.4, 'ausreichend beginnt bei 4 Punkten');
  assert.equal(byLabel.get('ungenügend').threshold, 0);
});

test('die Übersicht folgt eigenen Schwellen statt festen Werten', () => {
  const rows = getGradeTestScaleTooltipRows([[0.99, 15], [0.6, 13]], false);
  const byLabel = new Map(rows.map((row) => [row.label, row]));
  assert.equal(byLabel.get('sehr gut').threshold, 0.6, 'sehr gut folgt der eigenen 13er-Schwelle');
});

test('die Notenanzeige lässt Tendenzen auf Wunsch weg', () => {
  assert.equal(formatGradeDisplayForSystem(15, 'school'), '1+');
  assert.equal(
    formatGradeDisplayForSystem(15, 'school', { predicateSuffixes: false }),
    '1',
    'ohne Tendenz entfällt das Plus',
  );
  assert.equal(formatGradeDisplayForSystem(4, 'school', { predicateSuffixes: false }), '4');
});

test('die Punkteanzeige ist zweistellig und kennt keine Tendenzen', () => {
  assert.equal(formatGradeDisplayForSystem(5, 'points'), '05');
  assert.equal(formatGradeDisplayForSystem(15, 'points'), '15');
  assert.equal(formatGradeDisplayForSystem(null, 'points'), '—');
});
