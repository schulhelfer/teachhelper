import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [planningCss, gradesCss] = await Promise.all([
  readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

function assertSettingsTypography(moduleName, css) {
  assert.match(css, /#view-settings\s*\{[\s\S]*?--settings-font-heading:\s*1\.2rem;[\s\S]*?--settings-font-content:\s*1rem;[\s\S]*?--settings-font-meta:\s*0\.85rem;/,
    `${moduleName}: settings typography variables must be local and complete`);
  assert.match(css, /\.settings-tab\s*\{[\s\S]*?font-size:\s*var\(--settings-font-content\)/,
    `${moduleName}: tabs must use the content size`);
  assert.match(css, /\.settings-panel-title\s*\{[\s\S]*?font-size:\s*var\(--settings-font-heading\)/,
    `${moduleName}: section titles must use the heading size`);
  assert.match(css, /\.settings-form-label\s*\{[\s\S]*?font-size:\s*var\(--settings-font-content\)/,
    `${moduleName}: form labels must use the content size`);
  assert.match(css, /#view-settings \.muted,[\s\S]*?#view-settings \.list \.meta\s*\{[\s\S]*?font-size:\s*var\(--settings-font-meta\)/,
    `${moduleName}: hints and metadata must use the compact size`);
}

test('planning and grades settings share the same three-level typography scale', () => {
  assertSettingsTypography('Planung', planningCss);
  assertSettingsTypography('Noten', gradesCss);
  assert.match(gradesCss, /\.grade-test-scale-settings-card-title\s*\{[\s\S]*?font-size:\s*var\(--settings-font-heading\)/);
  assert.match(gradesCss, /\.grade-test-scale-threshold-header\s*\{[\s\S]*?font-size:\s*var\(--settings-font-meta\)/);
});
