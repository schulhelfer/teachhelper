import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [storeSource, appSource, runtimeSource, htmlSource, cssSource] = await Promise.all([
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

test('occurrence categories have a stable default and migrate legacy occurrences', () => {
  assert.match(storeSource, /function normalizeGradeOccurrenceCategories[\s\S]*?\{ id: 1, name: 'Vorkommnis', emoji: '', polarity: 'negative' \}/);
  assert.match(storeSource, /function normalizeGradeOccurrenceCategoryEmoji/);
  assert.match(storeSource, /function normalizeGradeOccurrenceCategoryPolarity/);
  assert.match(storeSource, /occurrenceCategoryId: mode === "homework"[\s\S]*?defaultOccurrenceCategoryId/);
  assert.match(storeSource, /calculateHomeworkSummaryForStudentInSubcategoryPeriod\([\s\S]*?occurrenceCategoryId = null/);
});

test('positive categories invert counters and use a green check mark', () => {
  assert.match(appSource, /const maxCheckedByCategory = nodes\.reduce/);
  assert.match(appSource, /polarity === "positive" \? "is-homework-danger" : "is-homework-good"/);
  assert.match(appSource, /polarity === "positive" \? "is-homework-good" : "is-homework-danger"/);
  assert.match(appSource, /is-positive-occurrence/);
  assert.match(cssSource, /is-positive-occurrence\.is-checked[\s\S]*?content: "✔";[\s\S]*?color: rgba\(74, 222, 128, 0\.98\);/);
});

test('suggested occurrence categories add complete optional presets exactly once', () => {
  for (const [emoji, name, polarity] of [
    ['🏠', 'Hausaufgaben fehlen', 'negative'],
    ['🎒', 'Material fehlt', 'negative'],
    ['🕒', 'Verspätung', 'negative'],
    ['📱', 'Gerätenutzung unpassend', 'negative'],
    ['🤫', 'Störung', 'negative'],
    ['🙋', 'Gutes Arbeitsverhalten', 'positive'],
    ['👥', 'Gutes Sozialverhalten', 'positive'],
  ]) {
    assert.match(appSource, new RegExp(`\\{ emoji: "${emoji}", name: "${name}", polarity: "${polarity}" \\}`));
  }
  assert.match(htmlSource, /id="settings-grade-occurrence-suggestions"/);
  assert.match(appSource, /handleGradeOccurrenceCategorySuggestionClick\(event\)/);
  assert.match(appSource, /if \(categories\.some\(\(category\).*=== nameKey\)\) return;/);
});

test('settings provide complete category management and protected deletion', () => {
  assert.match(htmlSource, /data-tab="occurrences"[\s\S]*?>Vorkommnisse</);
  assert.match(appSource, /validateGradeOccurrenceCategoriesDraft[\s\S]*?eindeutige Namen/);
  assert.match(appSource, /dataset\.gradeOccurrenceCategoryEmoji = "1"/);
  assert.match(appSource, /dataset\.gradeOccurrenceCategoryPolarity = "1"/);
  assert.match(appSource, /settings-grade-occurrence-polarity-control assessment-mode-toggle segment-control/);
  assert.match(appSource, /settings-grade-occurrence-polarity-option assessment-mode-option segment-control__option/);
  assert.match(appSource, /this\.syncSegmentControlSlideStates\(root\);/);
  assert.match(cssSource, /settings-grade-occurrence-polarity-control\.assessment-mode-toggle[\s\S]*?--liquid-segment-count: 2/);
  assert.match(appSource, /getGradeOccurrenceCategoryMarker\(value\)[\s\S]*?\|\| "#"/);
  assert.match(appSource, /getGradeOccurrenceCategoryPolarity\(value\)/);
  assert.match(appSource, /commitVisibleGradesEntryMetadataInputs[\s\S]*?occurrenceCategorySelect[\s\S]*?occurrenceCategoryId: mode === "homework"/);
  assert.match(appSource, /getGradesEntryDraft[\s\S]*?mode,[\s\S]*?occurrenceCategoryId: this\.resolveGradeOccurrenceCategoryId\(previous\.occurrenceCategoryId\)/);
  assert.match(appSource, /WORKSPACE_COMMAND_DELETE_OCCURRENCE_CATEGORY/);
  assert.match(runtimeSource, /async deleteOccurrenceCategoryData\(categoryId\)[\s\S]*?gradeEntries = this\.store\.gradeVaultState\.gradeEntries[\s\S]*?filter/);
  assert.match(runtimeSource, /WORKSPACE_ERROR_VAULT_LOCKED/);
});
