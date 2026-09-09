import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGradesInternals } from './helpers/grades-module.mjs';

const {
  normalizeGradeStructureWeight,
  normalizeGradeStructureWeights,
  getGradeStructurePeriodWeight,
  buildGradeStructureForPeriod,
  createDefaultGradeStructureDraft,
  normalizeGradeHalfYear,
} = await loadGradesInternals([
  'normalizeGradeStructureWeight',
  'normalizeGradeStructureWeights',
  'getGradeStructurePeriodWeight',
  'buildGradeStructureForPeriod',
  'createDefaultGradeStructureDraft',
  'normalizeGradeHalfYear',
]);

test('Gewichte werden als nichtnegative Zahlen übernommen', () => {
  assert.equal(normalizeGradeStructureWeight(50, 1), 50);
  assert.equal(normalizeGradeStructureWeight('30', 1), 30);
  assert.equal(normalizeGradeStructureWeight(0, 1), 0, 'ein Gewicht von 0 ist zulässig');
  assert.equal(normalizeGradeStructureWeight(2.5, 1), 2.5);
});

test('unbrauchbare Gewichte fallen auf den Ersatzwert zurück', () => {
  assert.equal(normalizeGradeStructureWeight(-5, 7), 7, 'negative Gewichte sind unzulässig');
  assert.equal(normalizeGradeStructureWeight('abc', 7), 7);
  assert.equal(normalizeGradeStructureWeight(undefined, 7), 7);
  assert.equal(normalizeGradeStructureWeight(Number.NaN, 7), 7);
  assert.equal(normalizeGradeStructureWeight(Number.POSITIVE_INFINITY, 7), 7);
});

test('null und leerer Text ergeben das Gewicht 0 statt des Ersatzwerts', () => {
  assert.equal(normalizeGradeStructureWeight(null, 7), 0);
  assert.equal(normalizeGradeStructureWeight('', 7), 0);
  assert.deepEqual(normalizeGradeStructureWeights({ h1: null, h2: 40 }, 25), { h1: 0, h2: 40 });
});

test('ein unbrauchbarer Ersatzwert endet bei 1 statt bei null', () => {
  assert.equal(normalizeGradeStructureWeight('abc', -1), 1);
  assert.equal(normalizeGradeStructureWeight('abc', 'xyz'), 1);
});

test('beide Halbjahre erhalten eigene Gewichte', () => {
  assert.deepEqual(normalizeGradeStructureWeights({ h1: 60, h2: 40 }, 1), { h1: 60, h2: 40 });
});

test('fehlt ein Halbjahresgewicht, greift das allgemeine Gewicht', () => {
  assert.deepEqual(normalizeGradeStructureWeights({ h1: 60 }, 25), { h1: 60, h2: 25 });
  assert.deepEqual(normalizeGradeStructureWeights(null, 25), { h1: 25, h2: 25 });
  assert.deepEqual(normalizeGradeStructureWeights({}, 25), { h1: 25, h2: 25 });
});

test('das Halbjahr entscheidet, welches Gewicht gilt', () => {
  const category = { weight: 10, weights: { h1: 70, h2: 30 } };
  assert.equal(getGradeStructurePeriodWeight(category, 'h1'), 70);
  assert.equal(getGradeStructurePeriodWeight(category, 'h2'), 30);
});

test('ein unbekanntes Halbjahr wird als erstes Halbjahr gelesen', () => {
  assert.equal(normalizeGradeHalfYear('h2'), 'h2');
  assert.equal(normalizeGradeHalfYear('H2'), 'h2');
  assert.equal(normalizeGradeHalfYear('h1'), 'h1');
  assert.equal(normalizeGradeHalfYear('unsinn'), 'h1');
  assert.equal(normalizeGradeHalfYear(null), 'h1');
  assert.equal(normalizeGradeHalfYear('year'), 'h1');
});

test('die Struktur eines Halbjahres übernimmt dessen Gewichte bis in die Unterkategorien', () => {
  const categories = [{
    id: 1,
    name: 'Schriftlich',
    weight: 1,
    weights: { h1: 60, h2: 40 },
    subcategories: [{ id: 2, name: 'Arbeiten', weight: 1, weights: { h1: 80, h2: 20 } }],
  }];

  const first = buildGradeStructureForPeriod(categories, 'h1');
  assert.equal(first[0].weight, 60);
  assert.equal(first[0].subcategories[0].weight, 80);

  const second = buildGradeStructureForPeriod(categories, 'h2');
  assert.equal(second[0].weight, 40);
  assert.equal(second[0].subcategories[0].weight, 20);
});

test('das Aufbauen einer Halbjahresstruktur verändert die Vorlage nicht', () => {
  const categories = [{
    id: 1,
    name: 'Schriftlich',
    weight: 1,
    weights: { h1: 60, h2: 40 },
    subcategories: [{ id: 2, name: 'Arbeiten', weight: 1, weights: { h1: 80, h2: 20 } }],
  }];
  const snapshot = JSON.stringify(categories);
  buildGradeStructureForPeriod(categories, 'h2');
  assert.equal(JSON.stringify(categories), snapshot, 'die Eingabe muss unangetastet bleiben');
});

test('die Standardstruktur gewichtet schriftlich und mündlich gleich', () => {
  const draft = createDefaultGradeStructureDraft();
  const total = draft.reduce((sum, category) => sum + category.weight, 0);
  assert.equal(total, 100, 'die Hauptkategorien müssen zusammen 100 % ergeben');
  for (const category of draft) {
    const subtotal = category.subcategories.reduce((sum, item) => sum + item.weight, 0);
    assert.equal(subtotal, 100, `die Unterkategorien von ${category.name} müssen 100 % ergeben`);
  }
});

test('die Standardstruktur gilt in beiden Halbjahren gleich', () => {
  const draft = createDefaultGradeStructureDraft();
  const first = buildGradeStructureForPeriod(draft, 'h1');
  const second = buildGradeStructureForPeriod(draft, 'h2');
  assert.deepEqual(
    first.map((category) => category.weight),
    second.map((category) => category.weight),
  );
});

test('eine leere Struktur bleibt leer statt zu erfinden', () => {
  assert.deepEqual(buildGradeStructureForPeriod([], 'h1'), []);
  assert.deepEqual(buildGradeStructureForPeriod(null, 'h1'), []);
});
