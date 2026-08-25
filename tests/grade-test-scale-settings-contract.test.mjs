import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [app, css] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

test('the custom percent-boundary mode uses a placeholder input aligned with the predefined modes', () => {
  const renderStart = app.indexOf('  renderGradeTestScaleSettingsSection() {');
  const renderEnd = app.indexOf('\n  readGradeTestScaleSettingsFromDom()', renderStart);
  const render = app.slice(renderStart, renderEnd);

  assert.match(render, /class="grade-test-scale-custom-name-input"[\s\S]*?placeholder="Eigener Modus"/);
  assert.match(render, /class="settings-panel-title grade-test-scale-settings-card-title"/);
  assert.doesNotMatch(render, /grade-test-scale-name-field/);
  assert.match(css, /\.grade-test-scale-settings-card-title\s*\{[\s\S]*?font-size:\s*1\.15rem/);
  assert.match(css, /\.grade-test-scale-custom-name-input\s*\{[\s\S]*?min-height:\s*2\.1rem/);
});
