import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGradesInternals } from './helpers/grades-module.mjs';

const {
  normalizeGradeTestPredicateSuffixes,
  applyGradeTestPredicateSuffixes,
  getDefaultGradeTestPredicateSuffixes,
  getGradeTestScaleTooltipRows,
  calculateGradeTestValueFromRatio,
  isGradeTestRatioNearBetterGrade,
  calculateGradeTestRatio,
  formatGradeDisplayForSystem,
  GRADE_TEST_SCALE_THRESHOLDS,
} = await loadGradesInternals([
  'normalizeGradeTestPredicateSuffixes',
  'applyGradeTestPredicateSuffixes',
  'getDefaultGradeTestPredicateSuffixes',
  'getGradeTestScaleTooltipRows',
  'calculateGradeTestValueFromRatio',
  'isGradeTestRatioNearBetterGrade',
  'calculateGradeTestRatio',
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

const nearBetterGradeScales = [
  { scale: 'sek1', thresholds: GRADE_TEST_SCALE_THRESHOLDS.sek1 },
  { scale: 'sek2', thresholds: GRADE_TEST_SCALE_THRESHOLDS.sek2 },
  {
    scale: {
      id: 'custom',
      thresholds: GRADE_TEST_SCALE_THRESHOLDS.sek2.map(([threshold, grade]) => [
        grade >= 13 ? threshold + 0.03 : threshold,
        grade,
      ]),
    },
    get thresholds() { return this.scale.thresholds; },
  },
];

function createGradeTestRatioState(ratio, maxSum = 1000) {
  return { ratio, maxSum, earnedSum: ratio * maxSum };
}

test('15 Punkte erhalten auch bis 100 Prozent keine orange Markierung', () => {
  for (const { scale, thresholds } of nearBetterGradeScales) {
    const topThreshold = thresholds.find(([, grade]) => grade === 15)[0];
    for (const ratio of [topThreshold, (topThreshold + 1) / 2, 1]) {
      for (const maxSum of [20, 1000]) {
        assert.equal(isGradeTestRatioNearBetterGrade(createGradeTestRatioState(ratio, maxSum), scale, null, true), false);
      }
    }
  }
});

test('ohne Tendenzen erhält die gesamte Note 1 keine orange Markierung', () => {
  for (const { scale, thresholds } of nearBetterGradeScales) {
    const topThreshold = thresholds.find(([, grade]) => grade === 13)[0];
    for (const ratio of [topThreshold, (topThreshold + 1) / 2, 0.99, 1]) {
      for (const maxSum of [20, 1000]) {
        assert.equal(isGradeTestRatioNearBetterGrade(createGradeTestRatioState(ratio, maxSum), scale, null, false), false);
      }
    }
  }
});

test('das obere Viertel markiert auch bei mehr als 1 BE Abstand zur besseren Note', () => {
  for (const { scale, thresholds } of nearBetterGradeScales) {
    for (const predicateSuffixes of [true, false]) {
      const upperGrade = predicateSuffixes ? 15 : 13;
      const lowerGrade = predicateSuffixes ? 14 : 10;
      const upper = thresholds.find(([, grade]) => grade === upperGrade)[0];
      const lower = thresholds.find(([, grade]) => grade === lowerGrade)[0];
      const orangeFrom = lower + (upper - lower) * 3 / 4;
      assert.ok((upper - orangeFrom) * 1000 > 1);
      for (const [ratio, expected] of [[orangeFrom - 0.001, false], [orangeFrom, true], [upper - 0.001, true], [upper, false]]) {
        assert.equal(isGradeTestRatioNearBetterGrade(createGradeTestRatioState(ratio), scale, null, predicateSuffixes), expected);
      }
    }
  }
});

test('höchstens 1 BE Abstand markiert auch unterhalb des oberen Viertels', () => {
  for (const { scale, thresholds } of nearBetterGradeScales) {
    for (const predicateSuffixes of [true, false]) {
      const upperGrade = predicateSuffixes ? 15 : 13;
      const lowerGrade = predicateSuffixes ? 14 : 10;
      const upper = thresholds.find(([, grade]) => grade === upperGrade)[0];
      const lower = thresholds.find(([, grade]) => grade === lowerGrade)[0];
      const maxSum = 2 / (upper - lower);
      for (const [missingBe, expected] of [[1.001, false], [1, true], [0.999, true], [0.1, true], [0, false]]) {
        const ratio = upper - missingBe / maxSum;
        assert.equal(isGradeTestRatioNearBetterGrade(createGradeTestRatioState(ratio, maxSum), scale, null, predicateSuffixes), expected);
      }
    }
  }
});

test('Notenbereiche unter 1 BE werden vollständig markiert und die Bestnote bleibt ausgenommen', () => {
  for (const { scale, thresholds } of nearBetterGradeScales) {
    for (const predicateSuffixes of [true, false]) {
      const upper = thresholds.find(([, grade]) => grade === (predicateSuffixes ? 15 : 13))[0];
      const lower = thresholds.find(([, grade]) => grade === (predicateSuffixes ? 14 : 10))[0];
      const maxSum = 0.8 / (upper - lower);
      assert.equal(isGradeTestRatioNearBetterGrade(createGradeTestRatioState(lower, maxSum), scale, null, predicateSuffixes), true);
      assert.equal(isGradeTestRatioNearBetterGrade(createGradeTestRatioState(upper, maxSum), scale, null, predicateSuffixes), false);
    }
  }
});

test('die 1-BE-Regel verwendet ungerundete Prozentgrenzen', () => {
  for (const [earnedBe, expected] of [[6.299, false], [6.3, true]]) {
    const ratioState = createGradeTestRatioState(earnedBe / 10, 10);
    assert.equal(isGradeTestRatioNearBetterGrade(ratioState, 'sek1', null, false), expected);
  }
});

test('nach einem Notensprung wird die neue Stufe geprüft', () => {
  assert.equal(isGradeTestRatioNearBetterGrade(createGradeTestRatioState(0.699, 100), 'sek2', null, false), true);
  assert.equal(isGradeTestRatioNearBetterGrade(createGradeTestRatioState(0.7, 100), 'sek2', null, false), false);
});

test('fehlende und nicht berechenbare BE-Ergebnisse werden nicht markiert', () => {
  const tasks = [{ id: '1', maxBe: 30 }];
  const invalidStates = [
    null,
    undefined,
    {},
    calculateGradeTestRatio(tasks, {}),
    calculateGradeTestRatio([], { 1: 5 }),
    { ratio: 0.7, earnedSum: 7, maxSum: 0 },
    { ratio: NaN, earnedSum: 7, maxSum: 10 },
    { ratio: 0.7, earnedSum: Infinity, maxSum: 10 },
    { ratio: 0.7, earnedSum: 7, maxSum: Infinity },
  ];
  for (const state of invalidStates) {
    assert.equal(isGradeTestRatioNearBetterGrade(state, 'sek1', null, false), false);
  }
});
