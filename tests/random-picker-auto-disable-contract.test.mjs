import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [mainSource, htmlSource, domSource] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/dom.js', import.meta.url), 'utf8'),
]);

test('picker defaults to retaining selected names and exposes an accessible switch', () => {
  assert.match(mainSource, /randomPickerAutoDisableSelected:\s*false/);
  assert.match(htmlSource, /id="random-picker-auto-disable-selected" type="checkbox" role="switch"/);
  assert.match(htmlSource, /Ausgewählten Namen auf „unmöglich“ schalten/);
  assert.match(domSource, /randomPickerAutoDisableSelected: doc\.getElementById\('random-picker-auto-disable-selected'\)/);
});

test('picker JSON persists the option and legacy plans default it to false', () => {
  assert.match(mainSource, /randomPickerAutoDisableSelected: normalizeRandomPickerAutoDisableSelected\(\s*state\.randomPickerAutoDisableSelected\s*\)/);
  assert.match(mainSource, /state\.randomPickerAutoDisableSelected = normalizeRandomPickerAutoDisableSelected\(\s*data\.randomPickerAutoDisableSelected\s*\)/);
  assert.match(mainSource, /function normalizeRandomPickerAutoDisableSelected\(value\) \{\s*return value === true;/);
});

test('an enabled switch makes only the spin winner impossible', () => {
  assert.match(mainSource, /const shouldDisableWinner = state\.randomPickerAutoDisableSelected && winner\?\.id;/);
  assert.match(mainSource, /const winnerStudent = state\.students\.find\(\(student\) => student\?\.id === winner\.id\);/);
  assert.match(mainSource, /winnerStudent\.randomWeight = RANDOM_PICKER_MIN_WEIGHT;/);
});
