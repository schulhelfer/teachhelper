import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, htmlSource] = await Promise.all([
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.html', import.meta.url), 'utf8'),
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

test('MW-Dialog bietet die drei Modi und die deaktivierbare Gewichtung', () => {
  assert.match(htmlSource, /name="gender-mode" value="zwingend"/);
  assert.match(htmlSource, /name="gender-mode" value="egal"/);
  assert.match(htmlSource, /name="gender-mode" value="durchmischt"/);
  assert.match(htmlSource, /id="preferences-gender-mix-weight"[^>]*disabled/);
  assert.match(appSource, /genderMode: normalizeGenderMode\(state\.conditions\?\.genderMode\)/);
  assert.match(appSource, /genderMixWeight: normalizeGenderMixWeight\(state\.conditions\?\.genderMixWeight\)/);
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
