import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, css, appSource, mainSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
]);

test('die Standard-Notenstruktur zeigt beide Halbjahre gleichzeitig', () => {
  assert.match(html, /id="settings-grade-structure-periods" class="settings-grade-structure-periods"/);
  assert.match(html, /data-default-grade-structure-period-section="h1"[\s\S]*?1\. Halbjahr/);
  assert.match(html, /data-default-grade-structure-list="h1"/);
  assert.match(html, /data-default-grade-structure-add-category="h1"/);
  assert.match(html, /data-default-grade-structure-period-section="h2"[\s\S]*?2\. Halbjahr/);
  assert.match(html, /data-default-grade-structure-list="h2"/);
  assert.match(html, /data-default-grade-structure-add-category="h2"/);
  assert.match(html, /id="settings-grade-structure-copy-h1-to-h2"[\s\S]*?Aus 1\. Halbjahr übernehmen/);
  assert.doesNotMatch(html, /id="settings-grade-structure-period-toggle"/);
  assert.doesNotMatch(html, /data-default-grade-structure-period="1"/);
});

test('Bearbeitung und Rendering bleiben nach Halbjahr getrennt', () => {
  assert.match(appSource, /settingsGradeStructureLists: \[\.\.\.document\.querySelectorAll\("\[data-default-grade-structure-list\]"\)\]/);
  assert.match(appSource, /\["h1", "h2"\]\.forEach\(\(period\) =>/);
  assert.match(appSource, /getDefaultGradeStructureSettingsCategories\(period\)/);
  assert.match(appSource, /input\.closest\("\[data-default-grade-structure-period-section\]"\)/);
  assert.match(appSource, /addDefaultGradeStructureCategoryDraft\(period = "h1"\)/);
  assert.doesNotMatch(appSource, /settingsDefaultGradeStructurePeriod/);
  assert.doesNotMatch(appSource, /handleDefaultGradeStructurePeriodChange/);
});

test('Abschnitte und Tutorial verweisen auf den gemeinsamen Halbjahrescontainer', () => {
  assert.match(css, /\.settings-grade-structure-periods\s*\{[\s\S]*?display:\s*grid/);
  assert.match(css, /\.settings-grade-structure-period \+ \.settings-grade-structure-period\s*\{[^}]*padding-top:\s*1rem/);
  assert.doesNotMatch(css, /\.settings-grade-structure-period \+ \.settings-grade-structure-period\s*\{[^}]*border-top:/);
  assert.match(css, /\.settings-grade-structure-period-head\s*\{[^}]*justify-content:\s*flex-start/);
  assert.match(mainSource, /\['#settings-grade-structure-periods', '#settings-tab-grade-structure'\]/);
});
