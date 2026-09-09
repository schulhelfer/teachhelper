import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGradesInternals } from './helpers/grades-module.mjs';

const {
  calculateGradeEntryAverage,
  calculateGradeDeficitShare,
  isGradeValueBelowThreshold,
  parseGradeValue,
  parseSchoolGradeValue,
  getRoundedGradeDisplayValue,
  formatGradeDisplayForSystem,
} = await loadGradesInternals([
  'calculateGradeEntryAverage',
  'calculateGradeDeficitShare',
  'isGradeValueBelowThreshold',
  'parseGradeValue',
  'parseSchoolGradeValue',
  'getRoundedGradeDisplayValue',
  'formatGradeDisplayForSystem',
]);

test('der Durchschnitt mittelt die eingegebenen Punkte', () => {
  assert.equal(calculateGradeEntryAverage(['10', '12', '14']), 12);
  assert.equal(calculateGradeEntryAverage(['15']), 15);
  assert.equal(calculateGradeEntryAverage(['0', '15']), 7.5);
});

test('der Durchschnitt rundet nicht vorzeitig', () => {
  assert.equal(calculateGradeEntryAverage(['10', '11']), 10.5);
  assert.ok(Math.abs(calculateGradeEntryAverage(['10', '11', '13']) - 34 / 3) < 1e-12);
});

test('leere Einträge senken den Durchschnitt nicht', () => {
  assert.equal(calculateGradeEntryAverage(['12', '', '12']), 12);
  assert.equal(calculateGradeEntryAverage(['12', null, undefined, '12']), 12);
});

test('die Null als Note zählt, leere Felder dagegen nicht', () => {
  assert.equal(calculateGradeEntryAverage(['0', '10']), 5, 'die 0 muss den Schnitt senken');
  assert.equal(calculateGradeEntryAverage(['', '10']), 10, 'das leere Feld darf ihn nicht senken');
});

test('ungültige Eingaben werden verworfen statt als null gewertet', () => {
  assert.equal(calculateGradeEntryAverage(['12', 'abc', '12']), 12);
  assert.equal(calculateGradeEntryAverage(['12', '16', '12']), 12, 'über 15 ist ungültig');
  assert.equal(calculateGradeEntryAverage(['12', '-3', '12']), 12);
  assert.equal(calculateGradeEntryAverage(['12', '7,5', '12']), 12);
});

test('ohne gültige Werte entsteht kein Durchschnitt', () => {
  assert.equal(calculateGradeEntryAverage([]), null);
  assert.equal(calculateGradeEntryAverage(['', '']), null);
  assert.equal(calculateGradeEntryAverage(['abc']), null);
  assert.equal(calculateGradeEntryAverage(null), null);
});

test('Punkte werden nur als ganze Zahlen von 0 bis 15 akzeptiert', () => {
  assert.deepEqual(parseGradeValue('0', 15), { valid: true, value: 0 });
  assert.deepEqual(parseGradeValue('15', 15), { valid: true, value: 15 });
  assert.deepEqual(parseGradeValue('', 15), { valid: true, value: null });
  assert.equal(parseGradeValue('16', 15).valid, false);
  assert.equal(parseGradeValue('-1', 15).valid, false);
  assert.equal(parseGradeValue('7.5', 15).valid, false);
  assert.equal(parseGradeValue('1e1', 15).valid, false);
  assert.equal(parseGradeValue('abc', 15).valid, false);
});

test('Schulnoten werden auf die interne Punkteskala abgebildet', () => {
  assert.equal(parseSchoolGradeValue('1+').value, 15);
  assert.equal(parseSchoolGradeValue('6').value, 0);
  assert.equal(parseSchoolGradeValue('4').value, 5);
  assert.equal(parseSchoolGradeValue('').value, null);
  assert.equal(parseSchoolGradeValue('7').valid, false);
  assert.equal(parseSchoolGradeValue('0').valid, false);
});

test('Schulnoten und Punkte bilden denselben Wert aufeinander ab', () => {
  for (const label of ['1+', '1', '1-', '2+', '3', '4-', '5', '6']) {
    const parsed = parseSchoolGradeValue(label);
    assert.equal(parsed.valid, true, `${label} muss gültig sein`);
    assert.equal(
      formatGradeDisplayForSystem(parsed.value, 'school'),
      label,
      `${label} muss unverändert zurückkommen`,
    );
  }
});

test('typografische Minuszeichen in Schulnoten werden akzeptiert', () => {
  assert.equal(parseSchoolGradeValue('2\u2212').value, parseSchoolGradeValue('2-').value);
  assert.equal(parseSchoolGradeValue('2\u2013').value, parseSchoolGradeValue('2-').value);
});

test('der Defizitanteil zählt Noten auf und unter der Schwelle', () => {
  assert.equal(calculateGradeDeficitShare([4, 5, 6, 7], 4), 25);
  assert.equal(calculateGradeDeficitShare([1, 2, 3, 4], 4), 100);
  assert.equal(calculateGradeDeficitShare([5, 6, 7, 8], 4), 0);
});

test('die Defizitschwelle selbst gilt als Defizit', () => {
  assert.equal(isGradeValueBelowThreshold(4, 4), true, 'genau 4 Punkte sind ein Defizit');
  assert.equal(isGradeValueBelowThreshold(5, 4), false);
  assert.equal(isGradeValueBelowThreshold(0, 4), true);
});

test('leere Werte sind kein Defizit', () => {
  assert.equal(isGradeValueBelowThreshold(null, 4), false);
  assert.equal(isGradeValueBelowThreshold('', 4), false);
  assert.equal(isGradeValueBelowThreshold(undefined, 4), false);
  assert.equal(calculateGradeDeficitShare([null, '', 8], 4), 0);
});

test('ohne Noten entsteht kein Defizitanteil', () => {
  assert.equal(calculateGradeDeficitShare([], 4), null);
  assert.equal(calculateGradeDeficitShare([null, ''], 4), null);
  assert.equal(calculateGradeDeficitShare(null, 4), null);
});

test('der Defizitanteil ist ein gerundeter Prozentwert', () => {
  assert.equal(calculateGradeDeficitShare([1, 8, 8], 4), 33);
  assert.equal(calculateGradeDeficitShare([1, 1, 8], 4), 67);
});

test('die Anzeige rundet den Durchschnitt kaufmännisch auf ganze Punkte', () => {
  assert.equal(getRoundedGradeDisplayValue(11.5), 12);
  assert.equal(getRoundedGradeDisplayValue(11.4), 11);
  assert.equal(getRoundedGradeDisplayValue(0), 0);
  assert.equal(getRoundedGradeDisplayValue(null), null);
  assert.equal(getRoundedGradeDisplayValue(''), null);
});

test('die Anzeige begrenzt Ausreißer auf die Skala', () => {
  assert.equal(getRoundedGradeDisplayValue(99), 15);
  assert.equal(getRoundedGradeDisplayValue(-5), 0);
});
