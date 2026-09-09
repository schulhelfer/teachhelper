import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGradesInternals } from './helpers/grades-module.mjs';

const {
  calculateGradeTestRatio,
  calculateGradeTestValue,
  calculateGradeTestValueFromRatio,
  calculateGradeTestMaxBeSum,
  GRADE_TEST_SCALE_THRESHOLDS,
} = await loadGradesInternals([
  'calculateGradeTestRatio',
  'calculateGradeTestValue',
  'calculateGradeTestValueFromRatio',
  'calculateGradeTestMaxBeSum',
  'GRADE_TEST_SCALE_THRESHOLDS',
]);

const task = (id, maxBe) => ({ id, maxBe });
const gradeFor = (earned, max, scale = 'sek2') =>
  calculateGradeTestValue([task('a', max)], { a: earned }, scale);

test('jede Sek-II-Schwelle vergibt genau die dokumentierte Punktzahl', () => {
  for (const [threshold, grade] of GRADE_TEST_SCALE_THRESHOLDS.sek2) {
    assert.equal(
      calculateGradeTestValueFromRatio({ ratio: threshold, maxSum: 100 }, 'sek2'),
      grade,
      `Schwelle ${threshold} muss ${grade} Punkte ergeben`,
    );
  }
});

test('jede Sek-I-Schwelle vergibt genau die dokumentierte Punktzahl', () => {
  for (const [threshold, grade] of GRADE_TEST_SCALE_THRESHOLDS.sek1) {
    assert.equal(
      calculateGradeTestValueFromRatio({ ratio: threshold, maxSum: 100 }, 'sek1'),
      grade,
      `Schwelle ${threshold} muss ${grade} Punkte ergeben`,
    );
  }
});

test('knapp unter einer Schwelle fällt die Note eine Stufe tiefer', () => {
  for (const scale of ['sek1', 'sek2']) {
    for (const [threshold, grade] of GRADE_TEST_SCALE_THRESHOLDS[scale]) {
      if (threshold <= 0) continue;
      const below = calculateGradeTestValueFromRatio({ ratio: threshold - 0.001, maxSum: 100 }, scale);
      assert.ok(
        below < grade,
        `${scale}: knapp unter ${threshold} muss weniger als ${grade} Punkte ergeben, war ${below}`,
      );
    }
  }
});

test('die Notenskala fällt über den gesamten Prozentbereich monoton', () => {
  for (const scale of ['sek1', 'sek2']) {
    let previous = 16;
    for (let percent = 100; percent >= 0; percent -= 1) {
      const grade = calculateGradeTestValueFromRatio({ ratio: percent / 100, maxSum: 100 }, scale);
      assert.ok(
        grade <= previous,
        `${scale}: ${percent}% ergab ${grade}, mehr als die höhere Prozentzahl davor (${previous})`,
      );
      previous = grade;
    }
  }
});

test('volle und leere Punktzahl liefern die Randnoten', () => {
  assert.equal(gradeFor(100, 100), 15);
  assert.equal(gradeFor(0, 100), 0);
  assert.equal(gradeFor(50, 100), 6);
});

test('Rundungsfehler bei Drittel-Verhältnissen kippen die Note nicht', () => {
  assert.equal(calculateGradeTestValue([task('a', 3)], { a: 3 }, 'sek2'), 15);
  assert.equal(calculateGradeTestValue([task('a', 30)], { a: 27 }, 'sek2'), 14);
  assert.equal(calculateGradeTestValue([task('a', 7)], { a: 7 }, 'sek1'), 15);
});

test('das Verhältnis summiert über mehrere Aufgaben', () => {
  const ratio = calculateGradeTestRatio(
    [task('a', 10), task('b', 20), task('c', 20)],
    { a: 10, b: 10, c: 5 },
  );
  assert.deepEqual(ratio, { earnedSum: 25, maxSum: 50, ratio: 0.5, percent: 50 });
});

test('fehlende Bewertungen zählen als null Punkte, nicht als fehlende Aufgabe', () => {
  const ratio = calculateGradeTestRatio([task('a', 10), task('b', 10)], { a: 10 });
  assert.equal(ratio.maxSum, 20, 'die unbewertete Aufgabe bleibt im Nenner');
  assert.equal(ratio.earnedSum, 10);
  assert.equal(ratio.ratio, 0.5);
});

test('Punktzahlen über dem Maximum werden gekappt statt hochgerechnet', () => {
  const ratio = calculateGradeTestRatio([task('a', 10)], { a: 99 });
  assert.equal(ratio.earnedSum, 10);
  assert.equal(ratio.ratio, 1);
  assert.equal(calculateGradeTestValueFromRatio(ratio, 'sek2'), 15);
});

test('negative Punktzahlen senken die Summe nicht unter null', () => {
  const ratio = calculateGradeTestRatio([task('a', 10), task('b', 10)], { a: -5, b: 10 });
  assert.equal(ratio.earnedSum, 10);
  assert.equal(ratio.ratio, 0.5);
});

test('ohne Bewertungen oder ohne bewertbare Aufgaben entsteht keine Note', () => {
  assert.equal(calculateGradeTestRatio([task('a', 10)], {}), null);
  assert.equal(calculateGradeTestRatio([], { a: 5 }), null);
  assert.equal(calculateGradeTestRatio([task('a', 0)], { a: 5 }), null);
  assert.equal(calculateGradeTestValue([task('a', 10)], {}, 'sek2'), null);
});

test('Aufgaben ohne Maximalpunkte verwässern das Ergebnis nicht', () => {
  const ratio = calculateGradeTestRatio([task('a', 10), task('b', 0)], { a: 10, b: 3 });
  assert.equal(ratio.maxSum, 10);
  assert.equal(ratio.ratio, 1);
});

test('die Maximalpunktsumme rundet auf halbe Punkte', () => {
  assert.equal(calculateGradeTestMaxBeSum([task('a', 10), task('b', 5.5)]), 15.5);
  assert.equal(calculateGradeTestMaxBeSum([task('a', 0)]), 0);
  assert.equal(calculateGradeTestMaxBeSum([]), 0);
});

test('Sek I verlangt im oberen Bereich mehr Prozent als Sek II', () => {
  for (const percent of [95, 90, 85, 80, 75, 70, 60, 50, 40]) {
    assert.ok(
      gradeFor(percent, 100, 'sek1') <= gradeFor(percent, 100, 'sek2'),
      `bei ${percent} % darf Sek I nicht mehr Punkte geben als Sek II`,
    );
  }
  assert.equal(gradeFor(95, 100, 'sek1'), 14);
  assert.equal(gradeFor(95, 100, 'sek2'), 15);
});

test('Sek I erreicht die Mindestpunktzahl ab einem tieferen Prozentwert', () => {
  assert.equal(gradeFor(32, 100, 'sek1'), 2);
  assert.equal(gradeFor(32, 100, 'sek2'), 2);
  assert.equal(gradeFor(44, 100, 'sek1'), 4);
  assert.equal(gradeFor(44, 100, 'sek2'), 4);
});
