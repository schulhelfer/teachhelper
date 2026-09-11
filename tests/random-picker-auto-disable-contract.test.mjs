import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [mainSource, htmlSource, domSource, pickerSource, planFormatSource] = await Promise.all([
  readFile(new URL('../src/app/app-runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/dom.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/random-picker/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/plan-format.js', import.meta.url), 'utf8'),
]);

const {
  RANDOM_PICKER_MIN_WEIGHT,
  normalizeRandomPickerAutoDisableSelected,
  pickWeightedRandomPickerCandidate,
} = await import(`data:text/javascript;base64,${Buffer.from(pickerSource).toString('base64')}`);

test('picker defaults to retaining selected names and exposes an accessible switch', () => {
  assert.match(mainSource, /randomPickerAutoDisableSelected:\s*false/);
  assert.match(htmlSource, /id="random-picker-auto-disable-selected" type="checkbox" role="switch"/);
  assert.match(htmlSource, /Namen, die bei einem Picker-Lauf ausgewählt wurden, anschließend automatisch auf unmöglich schalten/);
  assert.match(domSource, /randomPickerAutoDisableSelected: doc\.getElementById\('random-picker-auto-disable-selected'\)/);
});

test('picker JSON persists the option and legacy plans default it to false', () => {
  assert.match(planFormatSource, /autoDisableSelected: pickerState\.autoDisableSelected === true/);
  assert.match(mainSource, /state\.randomPickerAutoDisableSelected = normalizeRandomPickerAutoDisableSelected\(\s*randomPickerPlanState\.autoDisableSelected\s*\)/);
  assert.equal(normalizeRandomPickerAutoDisableSelected(true), true);
  assert.equal(normalizeRandomPickerAutoDisableSelected(false), false);
  assert.equal(normalizeRandomPickerAutoDisableSelected('true'), false);
});

test('an enabled switch makes only the spin winner impossible', () => {
  const certain = { id: '02', weight: 4 };
  assert.equal(pickWeightedRandomPickerCandidate([
    { id: '01', weight: 3 },
    certain,
    { id: '03', weight: 3 },
  ], () => 0), certain);
  assert.match(pickerSource, /const shouldDisableWinner = getAutoDisableSelected\(\) && winner\?\.id;/);
  assert.match(pickerSource, /setStudentWeight\(winnerStudent, RANDOM_PICKER_MIN_WEIGHT\);/);
  assert.equal(RANDOM_PICKER_MIN_WEIGHT, 0);
});
