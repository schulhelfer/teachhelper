import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sources = await Promise.all([
  ['Arbeitsphase', '../src/app/shell.css', '.side-timer-settings-controls .duration-stepper'],
  ['Planung', '../src/modules/planning/app.css', '.number-stepper'],
  ['PDF-Tools', '../src/modules/merger/app.css', '.number-stepper'],
].map(async ([name, path, selector]) => ({
  name,
  selector,
  source: await readFile(new URL(path, import.meta.url), 'utf8'),
})));

test('zeigt alle vorhandenen +/- Eingaben als verbundenen Drei-Spalten-Stepper', () => {
  sources.forEach(({ name, selector, source }) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(source, new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]{0,520}?display:\\s*(?:inline-)?grid;[\\s\\S]{0,240}?grid-template-columns:\\s*(?:36px|auto)\\s+minmax\\(0,\\s*1fr\\)\\s+(?:36px|auto);[\\s\\S]{0,240}?min-height:\\s*44px;`), name);
  });
});

test('verwendet einheitliche Plus- und Minusflächen mit Fokus und Finger-Cursor', () => {
  sources.forEach(({ name, source }) => {
    assert.match(source, /width:\s*36px;[\s\S]{0,100}?height:\s*42px;/, name);
    assert.match(source, /cursor:\s*pointer;/, name);
    assert.match(source, /:focus-within\s*\{[\s\S]{0,200}?box-shadow:\s*var\(--focus-ring\);/, name);
  });
});

test('verwendet in PDF-Tools keine überlagerten +/- Buttons mehr', () => {
  const merger = sources.find(({ name }) => name === 'PDF-Tools').source;
  assert.doesNotMatch(merger, /\.number-stepper-btn\s*\{[\s\S]{0,180}?position:\s*absolute;/);
  assert.match(merger, /\.number-stepper-btn\.minus\s*\{[\s\S]{0,160}?grid-column:\s*1;/);
  assert.match(merger, /\.number-stepper-btn\.plus\s*\{[\s\S]{0,160}?grid-column:\s*3;/);
  assert.doesNotMatch(merger, /\.split-range-field \.number-stepper-btn\s*\{/);
});
