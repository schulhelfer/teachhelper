import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGradesInternals } from './helpers/grades-module.mjs';

const {
  normalizeGradeTestScale,
  normalizeGradeTestThresholds,
  normalizeGradeTestScaleSettings,
  buildDefaultGradeTestScaleSettings,
  getGradeTestScaleTemplate,
  listVisibleGradeTestScaleTemplates,
  buildGradeTestScaleSnapshot,
  normalizeGradeTestScaleSnapshot,
  gradeTestScaleSettingsEqual,
  calculateGradeTestValueFromRatio,
  getGradeTestScaleDefaultLabel,
  getGradeDeficitThresholdDefaultForScale,
  GRADE_TEST_SCALE_THRESHOLDS,
  GRADE_TEST_SCALE_GRADES,
} = await loadGradesInternals([
  'normalizeGradeTestScale',
  'normalizeGradeTestThresholds',
  'normalizeGradeTestScaleSettings',
  'buildDefaultGradeTestScaleSettings',
  'getGradeTestScaleTemplate',
  'listVisibleGradeTestScaleTemplates',
  'buildGradeTestScaleSnapshot',
  'normalizeGradeTestScaleSnapshot',
  'gradeTestScaleSettingsEqual',
  'calculateGradeTestValueFromRatio',
  'getGradeTestScaleDefaultLabel',
  'getGradeDeficitThresholdDefaultForScale',
  'GRADE_TEST_SCALE_THRESHOLDS',
  'GRADE_TEST_SCALE_GRADES',
]);

const thresholdFor = (thresholds, grade) =>
  thresholds.find(([, candidate]) => candidate === grade)?.[0];

test('nur die bekannten Skalen werden akzeptiert, alles andere wird Sek II', () => {
  assert.equal(normalizeGradeTestScale('sek1'), 'sek1');
  assert.equal(normalizeGradeTestScale('sek2'), 'sek2');
  assert.equal(normalizeGradeTestScale('custom'), 'custom');
  assert.equal(normalizeGradeTestScale('SEK1'), 'sek1');
  assert.equal(normalizeGradeTestScale('  custom  '), 'custom');
  assert.equal(normalizeGradeTestScale('sek3'), 'sek2');
  assert.equal(normalizeGradeTestScale(''), 'sek2');
  assert.equal(normalizeGradeTestScale(null), 'sek2');
});

test('die Defizitschwelle folgt der Skala', () => {
  assert.equal(getGradeDeficitThresholdDefaultForScale('sek1'), 3);
  assert.equal(getGradeDeficitThresholdDefaultForScale('sek2'), 4);
  assert.equal(getGradeDeficitThresholdDefaultForScale('custom'), 4);
});

test('eine Schwellentabelle deckt immer alle 16 Punktstufen ab', () => {
  const normalized = normalizeGradeTestThresholds([[0.9, 15]]);
  assert.equal(normalized.length, 16);
  assert.deepEqual(normalized.map(([, grade]) => grade), GRADE_TEST_SCALE_GRADES);
});

test('gesetzte Schwellen überschreiben nur die genannte Punktstufe', () => {
  const normalized = normalizeGradeTestThresholds(
    [[0.99, 15]],
    GRADE_TEST_SCALE_THRESHOLDS.sek2,
  );
  assert.equal(thresholdFor(normalized, 15), 0.99, 'die gesetzte Stufe gilt');
  assert.equal(thresholdFor(normalized, 14), 0.9, 'die übrigen Stufen behalten den Rückfallwert');
  assert.equal(thresholdFor(normalized, 8), 0.6);
});

test('Schwellen werden auch als Objekte mit threshold und grade gelesen', () => {
  const normalized = normalizeGradeTestThresholds([{ threshold: 0.97, grade: 15 }]);
  assert.equal(thresholdFor(normalized, 15), 0.97);
});

test('fehlt die Punktangabe, ergibt sich die Stufe aus der Reihenfolge', () => {
  const normalized = normalizeGradeTestThresholds([[0.97], [0.93]]);
  assert.equal(thresholdFor(normalized, 15), 0.97);
  assert.equal(thresholdFor(normalized, 14), 0.93);
});

test('Schwellen außerhalb von 0 bis 1 werden auf den Bereich begrenzt', () => {
  const normalized = normalizeGradeTestThresholds([[5, 15], [-2, 14]]);
  assert.equal(thresholdFor(normalized, 15), 1);
  assert.equal(thresholdFor(normalized, 14), 0);
});

test('die Punktstufe 0 bleibt immer bei Schwelle 0', () => {
  const normalized = normalizeGradeTestThresholds([[0.5, 0]]);
  assert.equal(thresholdFor(normalized, 0), 0, 'die 0 darf keine Mindestschwelle bekommen');
});

test('nicht lesbare Schwellenwerte fallen auf den Rückfallwert zurück', () => {
  const normalized = normalizeGradeTestThresholds(
    [[Number.NaN, 15], ['abc', 14], [undefined, 13]],
    GRADE_TEST_SCALE_THRESHOLDS.sek2,
  );
  assert.equal(thresholdFor(normalized, 15), 0.95);
  assert.equal(thresholdFor(normalized, 14), 0.9);
  assert.equal(thresholdFor(normalized, 13), 0.85);
});

test('null als Schwelle setzt die Stufe auf 0 statt auf den Rückfallwert', () => {
  const normalized = normalizeGradeTestThresholds(
    [[null, 13]],
    GRADE_TEST_SCALE_THRESHOLDS.sek2,
  );
  assert.equal(
    thresholdFor(normalized, 13),
    0,
    'Number(null) ist 0 und gilt damit als gültige Schwelle',
  );
});

test('ohne Schwellen und ohne Rückfall entsteht eine Tabelle aus Nullen', () => {
  const normalized = normalizeGradeTestThresholds(null, []);
  assert.equal(normalized.length, 16);
  assert.ok(normalized.every(([threshold]) => threshold === 0));
});

test('Punktstufen außerhalb der Skala werden hineingezogen statt ergänzt', () => {
  const normalized = normalizeGradeTestThresholds([[0.5, 99], [0.4, -5]]);
  assert.equal(normalized.length, 16, 'es entstehen keine zusätzlichen Stufen');
  assert.equal(thresholdFor(normalized, 15), 0.5, 'die 99 landet auf der 15');
});

test('die Standardeinstellungen enthalten die dokumentierten Skalen', () => {
  const defaults = buildDefaultGradeTestScaleSettings();
  assert.deepEqual(Object.keys(defaults).sort(), ['custom', 'sek1', 'sek2']);
  assert.equal(defaults.sek1.label, 'Sek I');
  assert.equal(defaults.sek2.label, 'Sek II');
  assert.equal(defaults.custom.label, '', 'die eigene Skala ist zunächst unbenannt');
  assert.deepEqual(defaults.sek1.thresholds, GRADE_TEST_SCALE_THRESHOLDS.sek1);
  assert.deepEqual(defaults.sek2.thresholds, GRADE_TEST_SCALE_THRESHOLDS.sek2);
});

test('die Standardeinstellungen sind von den Konstanten entkoppelt', () => {
  const defaults = buildDefaultGradeTestScaleSettings();
  defaults.sek2.thresholds[0][0] = 0.01;
  assert.equal(
    GRADE_TEST_SCALE_THRESHOLDS.sek2[0][0],
    0.95,
    'ein Ändern der Einstellungen darf die Konstanten nicht berühren',
  );
});

test('die eigene Skala startet als Kopie von Sek II', () => {
  const defaults = buildDefaultGradeTestScaleSettings();
  assert.deepEqual(defaults.custom.thresholds, GRADE_TEST_SCALE_THRESHOLDS.sek2);
});

test('die Namen der festen Skalen lassen sich nicht überschreiben', () => {
  const settings = normalizeGradeTestScaleSettings({
    sek1: { label: 'Eigener Name' },
    sek2: { label: 'Anderer Name' },
  });
  assert.equal(settings.sek1.label, 'Sek I');
  assert.equal(settings.sek2.label, 'Sek II');
});

test('die eigene Skala darf benannt werden', () => {
  const settings = normalizeGradeTestScaleSettings({ custom: { label: 'IB-Skala' } });
  assert.equal(settings.custom.label, 'IB-Skala');
});

test('der Name der eigenen Skala wird auf 40 Zeichen begrenzt', () => {
  const settings = normalizeGradeTestScaleSettings({ custom: { label: 'x'.repeat(80) } });
  assert.equal(settings.custom.label.length, 40);
});

test('unbrauchbare Einstellungen ergeben die Standardskalen', () => {
  for (const input of [null, undefined, 'unsinn', 42, []]) {
    const settings = normalizeGradeTestScaleSettings(input);
    assert.deepEqual(settings.sek2.thresholds, GRADE_TEST_SCALE_THRESHOLDS.sek2);
    assert.equal(settings.sek1.label, 'Sek I');
  }
});

test('eigene Schwellen überleben das Normalisieren der Einstellungen', () => {
  const settings = normalizeGradeTestScaleSettings({
    custom: { label: 'Streng', thresholds: [[0.99, 15], [0.97, 14]] },
  });
  assert.equal(thresholdFor(settings.custom.thresholds, 15), 0.99);
  assert.equal(thresholdFor(settings.custom.thresholds, 14), 0.97);
  assert.equal(settings.custom.label, 'Streng');
});

test('eine Vorlage wird nach Skalenkennung ausgewählt', () => {
  const settings = normalizeGradeTestScaleSettings({ custom: { label: 'Eigen' } });
  assert.equal(getGradeTestScaleTemplate(settings, 'sek1').id, 'sek1');
  assert.equal(getGradeTestScaleTemplate(settings, 'custom').label, 'Eigen');
  assert.equal(
    getGradeTestScaleTemplate(settings, 'unbekannt').id,
    'sek2',
    'eine unbekannte Kennung fällt auf Sek II zurück',
  );
});

test('die eigene Skala erscheint erst in der Auswahl, wenn sie benannt ist', () => {
  const unnamed = listVisibleGradeTestScaleTemplates(buildDefaultGradeTestScaleSettings());
  assert.deepEqual(unnamed.map((template) => template.id), ['sek1', 'sek2']);

  const named = listVisibleGradeTestScaleTemplates(
    normalizeGradeTestScaleSettings({ custom: { label: 'Eigen' } }),
  );
  assert.deepEqual(named.map((template) => template.id), ['sek1', 'sek2', 'custom']);
});

test('ein Name aus Leerzeichen macht die eigene Skala nicht sichtbar', () => {
  const templates = listVisibleGradeTestScaleTemplates(
    normalizeGradeTestScaleSettings({ custom: { label: '   ' } }),
  );
  assert.deepEqual(templates.map((template) => template.id), ['sek1', 'sek2']);
});

test('eine Momentaufnahme hält Kennung, Namen und Schwellen fest', () => {
  const settings = normalizeGradeTestScaleSettings({
    custom: { label: 'Eigen', thresholds: [[0.99, 15]] },
  });
  const snapshot = buildGradeTestScaleSnapshot(settings, 'custom');
  assert.equal(snapshot.id, 'custom');
  assert.equal(snapshot.label, 'Eigen');
  assert.equal(thresholdFor(snapshot.thresholds, 15), 0.99);
});

test('eine Momentaufnahme ohne Namen erhält die Standardbezeichnung', () => {
  assert.equal(buildGradeTestScaleSnapshot(null, 'sek1').label, 'Sek I');
  assert.equal(buildGradeTestScaleSnapshot(null, 'sek2').label, 'Sek II');
  assert.equal(getGradeTestScaleDefaultLabel('custom'), '');
});

test('eine Momentaufnahme ist von den Einstellungen entkoppelt', () => {
  const settings = normalizeGradeTestScaleSettings(null);
  const snapshot = buildGradeTestScaleSnapshot(settings, 'sek2');
  snapshot.thresholds[0][0] = 0.01;
  assert.equal(
    thresholdFor(settings.sek2.thresholds, 15),
    0.95,
    'das Ändern der Momentaufnahme darf die Einstellungen nicht berühren',
  );
});

test('eine gespeicherte Momentaufnahme behält ihre Schwellen, wenn die Einstellungen sich ändern', () => {
  const saved = { id: 'sek2', label: 'Sek II', thresholds: [[0.99, 15], [0.97, 14]] };
  const changedSettings = normalizeGradeTestScaleSettings({
    sek2: { thresholds: [[0.5, 15], [0.4, 14]] },
  });
  const normalized = normalizeGradeTestScaleSnapshot(saved, 'sek2', changedSettings);
  assert.equal(
    thresholdFor(normalized.thresholds, 15),
    0.99,
    'die gespeicherte Arbeit muss ihren eigenen Schlüssel behalten',
  );
  assert.equal(thresholdFor(normalized.thresholds, 14), 0.97);
});

test('Lücken einer Momentaufnahme werden aus den aktuellen Einstellungen gefüllt', () => {
  const changedSettings = normalizeGradeTestScaleSettings({
    sek2: { thresholds: [[0.5, 15], [0.45, 14], [0.4, 13]] },
  });
  const normalized = normalizeGradeTestScaleSnapshot(
    { id: 'sek2', thresholds: [[0.99, 15]] },
    'sek2',
    changedSettings,
  );
  assert.equal(thresholdFor(normalized.thresholds, 15), 0.99, 'die gesetzte Stufe bleibt');
  assert.equal(thresholdFor(normalized.thresholds, 14), 0.45, 'die Lücke kommt aus den Einstellungen');
});

test('die Kennung der Momentaufnahme schlägt die mitgegebene Skala', () => {
  const normalized = normalizeGradeTestScaleSnapshot({ id: 'sek1' }, 'sek2', null);
  assert.equal(normalized.id, 'sek1');
  assert.deepEqual(normalized.thresholds, GRADE_TEST_SCALE_THRESHOLDS.sek1);
});

test('eine leere Momentaufnahme fällt vollständig auf die Skala zurück', () => {
  const normalized = normalizeGradeTestScaleSnapshot(null, 'sek1', null);
  assert.equal(normalized.id, 'sek1');
  assert.equal(normalized.label, 'Sek I');
  assert.deepEqual(normalized.thresholds, GRADE_TEST_SCALE_THRESHOLDS.sek1);
});

test('gleiche Einstellungen gelten als gleich, unterschiedliche nicht', () => {
  assert.equal(gradeTestScaleSettingsEqual(null, null), true);
  assert.equal(
    gradeTestScaleSettingsEqual(null, buildDefaultGradeTestScaleSettings()),
    true,
    'die Standardwerte müssen dem leeren Zustand entsprechen',
  );
  assert.equal(
    gradeTestScaleSettingsEqual(null, { custom: { label: 'Eigen' } }),
    false,
  );
  assert.equal(
    gradeTestScaleSettingsEqual(
      { sek2: { thresholds: [[0.99, 15]] } },
      { sek2: { thresholds: [[0.98, 15]] } },
    ),
    false,
  );
});

test('eine unterschiedliche Reihenfolge derselben Schwellen gilt als gleich', () => {
  assert.equal(
    gradeTestScaleSettingsEqual(
      { sek2: { thresholds: [[0.9, 14], [0.95, 15]] } },
      { sek2: { thresholds: [[0.95, 15], [0.9, 14]] } },
    ),
    true,
  );
});

test('eigene Schwellen bestimmen die vergebene Note', () => {
  const settings = normalizeGradeTestScaleSettings({
    custom: { label: 'Streng', thresholds: [[0.99, 15], [0.95, 14], [0.5, 13]] },
  });
  const snapshot = buildGradeTestScaleSnapshot(settings, 'custom');
  assert.equal(calculateGradeTestValueFromRatio({ ratio: 0.99, maxSum: 100 }, snapshot, settings), 15);
  assert.equal(calculateGradeTestValueFromRatio({ ratio: 0.96, maxSum: 100 }, snapshot, settings), 14);
  assert.equal(calculateGradeTestValueFromRatio({ ratio: 0.6, maxSum: 100 }, snapshot, settings), 13);
});

test('eine strengere eigene Skala vergibt bei gleicher Leistung weniger Punkte', () => {
  const strict = buildGradeTestScaleSnapshot(
    normalizeGradeTestScaleSettings({ custom: { label: 'Streng', thresholds: [[0.99, 15]] } }),
    'custom',
  );
  assert.equal(calculateGradeTestValueFromRatio({ ratio: 0.96, maxSum: 100 }, 'sek2'), 15);
  assert.ok(
    calculateGradeTestValueFromRatio({ ratio: 0.96, maxSum: 100 }, strict) < 15,
    'bei 96 % darf die strenge Skala keine 15 Punkte geben',
  );
});

test('eine Momentaufnahme als Skala braucht keine Einstellungen', () => {
  const snapshot = { id: 'custom', label: 'Eigen', thresholds: [[0.5, 15], [0, 0]] };
  assert.equal(calculateGradeTestValueFromRatio({ ratio: 0.5, maxSum: 100 }, snapshot), 15);
  assert.equal(calculateGradeTestValueFromRatio({ ratio: 1, maxSum: 100 }, snapshot), 15);
});

test('eine lückenhafte Momentaufnahme füllt die übrigen Stufen aus Sek II', () => {
  const snapshot = { id: 'custom', label: 'Eigen', thresholds: [[0.5, 15], [0, 0]] };
  const normalized = normalizeGradeTestScaleSnapshot(snapshot, 'custom', null);
  assert.equal(thresholdFor(normalized.thresholds, 15), 0.5, 'die gesetzte Stufe gilt');
  assert.equal(
    thresholdFor(normalized.thresholds, 14),
    0.9,
    'die nicht gesetzten Stufen kommen aus der Standardskala',
  );
  assert.equal(
    calculateGradeTestValueFromRatio({ ratio: 0.49, maxSum: 100 }, snapshot),
    5,
    'unterhalb der eigenen Schwelle greifen die geerbten Stufen weiter',
  );
});
