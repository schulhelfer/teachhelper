import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [css, picker, main] = await Promise.all([
  readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/random-picker/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
]);

test('the fullscreen picker enlarges names and recalculates their fitted width', () => {
  const fullscreenStart = css.indexOf('.app.is-collapsing.app-tab-random-picker .random-picker-stage');
  const fullscreenEnd = css.indexOf('.app.is-collapsing.app-tab-random-picker .random-picker-button', fullscreenStart);
  assert.ok(fullscreenStart >= 0 && fullscreenEnd > fullscreenStart);
  const fullscreenRules = css.slice(fullscreenStart, fullscreenEnd);
  assert.match(fullscreenRules, /width: min\(100%, 1080px\);/);
  assert.match(fullscreenRules, /min-height: min\(620px, calc\(100dvh - 180px\)\);/);
  assert.match(fullscreenRules, /min-height: clamp\(64px, 9vh, 96px\);/);
  assert.match(fullscreenRules, /font-size: clamp\(24px, 3\.2vw, 46px\);/);
  assert.match(picker, /function refreshLayout\(\) \{[\s\S]*?refreshWheelWidth\(labels\);/);
  assert.match(main, /if \(getActiveTab\(\) === TAB_RANDOM_PICKER\) \{\s*randomPickerController\?\.refreshLayout\?\.\(\);\s*\}/);
});

test('the winner arrows remain visible long enough to register the selection', () => {
  assert.match(css, /animation: random-picker-winner-arrow 2200ms cubic-bezier\(0\.18, 0\.82, 0\.24, 1\) both;/);
  assert.match(css, /animation: random-picker-winner-glow 2400ms cubic-bezier\(0\.18, 0\.82, 0\.24, 1\);/);
});
