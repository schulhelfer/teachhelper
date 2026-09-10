import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/modules/random-picker/app.js', import.meta.url), 'utf8');
const {
  normalizeRandomPickerWeight,
  RANDOM_PICKER_WINNER_HIGHLIGHT_MS,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('der Picker erhält alle unterstützten Gewichtsstufen', () => {
  assert.equal(normalizeRandomPickerWeight(0), 0);
  assert.equal(normalizeRandomPickerWeight(1), 1);
  assert.equal(normalizeRandomPickerWeight(2), 2);
  assert.equal(normalizeRandomPickerWeight(3), 3);
  assert.equal(normalizeRandomPickerWeight(4), 4);
});

test('die automatische Deaktivierung wartet auf die Gewinner-Hervorhebung', () => {
  assert.equal(RANDOM_PICKER_WINNER_HIGHLIGHT_MS, 2200);
  assert.match(source, /await waitForWinnerHighlight\(\);[\s\S]*?setStudentWeight\(winnerStudent, RANDOM_PICKER_MIN_WEIGHT\)/);
});
