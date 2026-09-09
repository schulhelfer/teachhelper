import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/modules/random-picker/app.js', import.meta.url), 'utf8');
const {
  RANDOM_PICKER_CERTAIN_WEIGHT,
  RANDOM_PICKER_DEFAULT_WEIGHT,
  RANDOM_PICKER_MAX_WEIGHT,
  RANDOM_PICKER_MIN_WEIGHT,
  RANDOM_PICKER_SPIN_DURATION_MS,
  normalizeRandomPickerWeight,
  pickWeightedRandomPickerCandidate,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('random picker weight normalization preserves the existing boundaries', () => {
  assert.equal(RANDOM_PICKER_MIN_WEIGHT, 0);
  assert.equal(RANDOM_PICKER_DEFAULT_WEIGHT, 1);
  assert.equal(RANDOM_PICKER_MAX_WEIGHT, 4);
  assert.equal(RANDOM_PICKER_CERTAIN_WEIGHT, 4);
  assert.equal(RANDOM_PICKER_SPIN_DURATION_MS, 4000);
  assert.equal(normalizeRandomPickerWeight(-3), 0);
  assert.equal(normalizeRandomPickerWeight(0), 0);
  assert.equal(normalizeRandomPickerWeight(1), 1);
  assert.equal(normalizeRandomPickerWeight(2), 1);
  assert.equal(normalizeRandomPickerWeight(3), 1);
  assert.equal(normalizeRandomPickerWeight(4), 4);
  assert.equal(normalizeRandomPickerWeight(9), 4);
  assert.equal(normalizeRandomPickerWeight('invalid'), 1);
});

test('weighted selection excludes impossible entries and follows the accumulated weight', () => {
  const candidates = [
    { id: 'zero', weight: 0 },
    { id: 'normal', weight: 1 },
    { id: 'double', weight: 2 },
    { id: 'triple', weight: 3 },
  ];
  assert.equal(pickWeightedRandomPickerCandidate(candidates, () => 0)?.id, 'normal');
  assert.equal(pickWeightedRandomPickerCandidate(candidates, () => 0.2)?.id, 'double');
  assert.equal(pickWeightedRandomPickerCandidate(candidates, () => 0.6)?.id, 'triple');
  assert.equal(pickWeightedRandomPickerCandidate([{ id: 'zero', weight: 0 }], () => 0), null);
});

test('the first certain entry wins independently of the random value', () => {
  const winner = { id: 'certain', weight: 4 };
  assert.equal(pickWeightedRandomPickerCandidate([
    { id: 'normal', weight: 1 },
    winner,
    { id: 'later-certain', weight: 4 },
  ], () => 0.999), winner);
});
