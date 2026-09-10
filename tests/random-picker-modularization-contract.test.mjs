import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [main, picker, index, serviceWorker] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/random-picker/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/random-picker/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);

test('main mounts the picker against the shared state through explicit adapters', () => {
  assert.match(main, /from '\.\/modules\/random-picker\/index\.js'/);
  assert.match(main, /randomPickerController = mountRandomPicker\(\{/);
  assert.match(main, /getStudents: \(\) => gradePickerBinding\?\.students \|\| state\.students/);
  assert.match(main, /getAutoDisableSelected: \(\) => gradePickerBinding\?\.autoDisableSelected \?\? state\.randomPickerAutoDisableSelected/);
  assert.match(main, /setStudentWeight: \(student, weight, \{ deferSave = false \} = \{\}\) => \{\s*student\.randomWeight = weight;/);
  assert.doesNotMatch(main, /function (?:getRandomPickerCandidates|pickWeightedRandomPickerCandidate|updateRandomPickerCards|startRandomPickerSpin|buildRandomPickerConditionsTable)\(/);
});

test('the random picker module owns rendering, selection, conditions, and button events', () => {
  for (const pattern of [
    /function getCandidates\(/,
    /function updateCards\(/,
    /async function start\(/,
    /function renderConditions\(/,
    /function saveConditions\(/,
    /function resetConditions\(/,
    /getStartButtons\(\)\.forEach\(\(button\) => bind\(button, 'click'/,
    /bind\(dom\.importButton, 'click', onImport\)/,
    /bind\(dom\.exportButton, 'click', onExport\)/,
  ]) {
    assert.match(picker, pattern);
  }
  assert.match(index, /mountRandomPicker/);
  assert.match(index, /normalizeRandomPickerWeight/);
});

test('the statically imported picker module is available offline', () => {
  assert.match(serviceWorker, /'\.\/src\/modules\/random-picker\/index\.js'/);
  assert.match(serviceWorker, /'\.\/src\/modules\/random-picker\/app\.js'/);
});
