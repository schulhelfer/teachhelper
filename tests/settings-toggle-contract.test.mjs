import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [planningHtml, gradesHtml, workspaceComponents, planningCss, gradesCss] = await Promise.all([
  readFile(new URL('../src/modules/planning/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/components.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

function assertSettingsToggle(source, id, label) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(source, new RegExp(
    `<label class="settings-form-row settings-toggle-row[^"]*"[^>]*>[\\s\\S]*?`
    + `<span class="settings-form-label">${label}</span>[\\s\\S]*?`
    + `<span class="settings-toggle-control">[\\s\\S]*?`
    + `<input id="${escapedId}" type="checkbox" role="switch">[\\s\\S]*?`
    + `<span class="settings-toggle-track" aria-hidden="true"></span>`
  ));
}

test('all settings checkboxes use labeled switch controls', () => {
  assertSettingsToggle(
    planningHtml,
    'show-hidden-sidebar-courses',
    'Ausgeblendete Kurse in Randleiste anzeigen'
  );
  assertSettingsToggle(planningHtml, 'show-half-year-boundary-markers', 'Halbjahresgrenzen hervorheben');

  assertSettingsToggle(
    gradesHtml,
    'show-hidden-sidebar-courses',
    'Ausgeblendete Kurse in Randleiste anzeigen'
  );
  assertSettingsToggle(gradesHtml, 'show-grade-student-portraits', 'Fotos anzeigen');
  assertSettingsToggle(gradesHtml, 'show-name-learning-module', 'Modul „Namen lernen“ anzeigen');
  assertSettingsToggle(gradesHtml, 'grade-vault-encryption-enabled', 'Notenbereich verschlüsseln');
  assertSettingsToggle(
    gradesHtml,
    'grade-vault-auto-lock-on-background',
    'Auch beim Verlassen oder Minimieren nach diesem Zeitraum\\s+sperren'
  );
  assertSettingsToggle(workspaceComponents, 'db-backup-auto-enabled', 'Automatisches Backup aktivieren');
});

test('settings toggle styling covers interaction states and narrow layouts in both modules', () => {
  for (const [name, css] of [['Planung', planningCss], ['Noten', gradesCss]]) {
    assert.match(css, /\.settings-toggle-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/,
      `${name}: toggle rows must keep label and control aligned`);
    assert.match(css, /input\[type="checkbox"\]:checked \+ \.settings-toggle-track/,
      `${name}: checked toggle state must be styled`);
    assert.match(css, /input\[type="checkbox"\]:focus-visible \+ \.settings-toggle-track/,
      `${name}: keyboard focus must be visible`);
    assert.match(css, /input\[type="checkbox"\]:disabled \+ \.settings-toggle-track/,
      `${name}: disabled toggles must be styled`);
    assert.match(css, /\.settings-form-row\.settings-toggle-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/,
      `${name}: narrow layouts must keep toggles right-aligned`);
  }
});
