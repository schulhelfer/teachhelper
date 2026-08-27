import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, htmlSource, cssSource] = await Promise.all([
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.css', import.meta.url), 'utf8'),
]);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} muss existieren`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} ist unvollständig`);
}

const calculateGenderMixingPenalty = Function(
  'GENDER_MODE_MIXED',
  'getGenderMixWeightFactor',
  'seatId',
  '"use strict"; return (' + extractFunction(appSource, 'calculateGenderMixingPenalty') + ');',
)('durchmischt', () => 1, (row, col) => `${row}-${col}`);

const normalizeGenderMixingSliderValue = Function(
  '"use strict"; return (' + extractFunction(appSource, 'normalizeGenderMixingSliderValue') + ');',
)();
const genderSettingsFromMixingSlider = Function(
  'normalizeGenderMixingSliderValue',
  'GENDER_MODE_IGNORE',
  'GENDER_MODE_FORCED',
  'GENDER_MODE_MIXED',
  'DEFAULT_GENDER_MIX_WEIGHT',
  '"use strict"; return (' + extractFunction(appSource, 'genderSettingsFromMixingSlider') + ');',
)(normalizeGenderMixingSliderValue, 'egal', 'zwingend', 'durchmischt', 3);
const genderMixingSliderValueFromSettings = Function(
  'normalizeGenderMode',
  'GENDER_MODE_IGNORE',
  'GENDER_MODE_FORCED',
  'normalizeGenderMixWeight',
  '"use strict"; return (' + extractFunction(appSource, 'genderMixingSliderValueFromSettings') + ');',
)(
  (value) => ['egal', 'durchmischt', 'zwingend'].includes(value) ? value : 'egal',
  'egal',
  'zwingend',
  (value) => Math.min(5, Math.max(1, Number.parseInt(value, 10) || 3)),
);

function mapFromRows(rows) {
  const map = new Map();
  const activeIds = [];
  const activeHas = new Set();
  const seatCoords = new Map();
  const genderById = new Map();
  rows.forEach((row, rowIndex) => {
    row.forEach((gender, colIndex) => {
      const seat = `${rowIndex + 1}-${colIndex + 1}`;
      const studentId = gender ? `s-${rowIndex + 1}-${colIndex + 1}` : null;
      activeIds.push(seat);
      activeHas.add(seat);
      seatCoords.set(seat, { r: rowIndex + 1, c: colIndex + 1 });
      map.set(seat, studentId);
      if (studentId) genderById.set(studentId, gender);
    });
  });
  return {
    map,
    cache: {
      genderMode: 'durchmischt',
      genderMixWeight: 3,
      activeIds,
      activeHas,
      seatCoords,
      genderById,
    },
  };
}

test('MW-Dialog bietet einen gemeinsamen Slider für den Grad der Durchmischung', () => {
  assert.match(htmlSource, /id="preferences-gender-mixing"[^>]*type="range"[^>]*min="0"[^>]*max="6"[^>]*value="0"/);
  assert.match(htmlSource, /Grad der Durchmischung/);
  assert.match(htmlSource, /preferences-gender-mixing-endpoints"[^>]*><span>Egal<\/span><span>Zwingend<\/span>/);
  assert.doesNotMatch(htmlSource, /name="gender-mode"/);
  assert.doesNotMatch(htmlSource, /preferences-gender-mix-weight/);
  assert.match(htmlSource, /<div class="preferences-table-wrap"[\s\S]*?<section class="preferences-gender-settings"[\s\S]*?id="preferences-guess-gender"/);
  assert.match(cssSource, /\.preferences-gender-settings\s*\{[\s\S]*?width:\s*fit-content;[\s\S]*?max-width:\s*100%;/);
  assert.match(cssSource, /\.preferences-gender-mixing\s*\{[\s\S]*?display:\s*grid;/);
  assert.match(appSource, /genderMode: normalizeGenderMode\(state\.conditions\?\.genderMode\)/);
  assert.match(appSource, /genderMixWeight: normalizeGenderMixWeight\(state\.conditions\?\.genderMixWeight\)/);
});

test('Slider-Stufen bleiben zu bestehenden Geschlechtereinstellungen kompatibel', () => {
  const expected = [
    { genderMode: 'egal', genderMixWeight: 3 },
    { genderMode: 'durchmischt', genderMixWeight: 1 },
    { genderMode: 'durchmischt', genderMixWeight: 2 },
    { genderMode: 'durchmischt', genderMixWeight: 3 },
    { genderMode: 'durchmischt', genderMixWeight: 4 },
    { genderMode: 'durchmischt', genderMixWeight: 5 },
    { genderMode: 'zwingend', genderMixWeight: 3 },
  ];

  expected.forEach((settings, level) => {
    assert.deepEqual(genderSettingsFromMixingSlider(level), settings);
    assert.equal(
      genderMixingSliderValueFromSettings(settings.genderMode, settings.genderMixWeight),
      level,
    );
  });
});

test('Durchmischung lässt Dreierreihen zu, bestraft aber längere Reihen und Flächen', () => {
  const three = mapFromRows([['m', 'm', 'm']]);
  assert.equal(calculateGenderMixingPenalty(three.map, three.cache).total, 0);

  const four = mapFromRows([['m', 'm', 'm', 'm']]);
  assert.equal(calculateGenderMixingPenalty(four.map, four.cache).total, 1);

  const diverse = mapFromRows([['d', 'd', 'd', 'd']]);
  assert.equal(calculateGenderMixingPenalty(diverse.map, diverse.cache).total, 1);

  const cluster = mapFromRows([
    ['m', 'm', 'm', 'm'],
    ['m', 'm', 'm', 'm'],
  ]);
  assert.ok(calculateGenderMixingPenalty(cluster.map, cluster.cache).total > 1);

  const checkerboard = mapFromRows([
    ['m', 'w', 'm', 'w'],
    ['w', 'm', 'w', 'm'],
  ]);
  assert.equal(calculateGenderMixingPenalty(checkerboard.map, checkerboard.cache).total, 0);

  four.cache.genderMode = 'egal';
  assert.equal(calculateGenderMixingPenalty(four.map, four.cache).total, 0);
});
