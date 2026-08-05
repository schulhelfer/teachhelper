import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, cssSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

test('the occurrence mode has a category-aware table marker', () => {
  assert.match(appSource, /entryMode === "homework"[\s\S]*?this\.getGradeOccurrenceCategoryDisplayName\(draft\?\.occurrenceCategoryId \|\| assessment\?\.occurrenceCategoryId\)/);
  assert.match(appSource, /data-grades-entry-occurrence-category="1"/);
  assert.match(appSource, /if \(cell\.type === "subcategory-homework"\) \{[\s\S]*?th\.textContent = this\.getGradeOccurrenceCategoryMarker\(cell\.occurrenceCategoryId\);[\s\S]*?const occurrenceCategoryName = this\.getGradeOccurrenceCategoryName\(cell\.occurrenceCategoryId\);[\s\S]*?th\.setAttribute\("aria-label", occurrenceCategoryName\);[\s\S]*?th\.title = occurrenceCategoryName;/);
  assert.match(appSource, /occurrenceCategoryId: occurrenceCategory\.id/);
  assert.match(appSource, /if \(normalized === "homework"\) \{\s+return "Vorkommnis";/);
});

test('the occurrence assessment header shows its configured category emoji only when available', () => {
  assert.match(appSource, /function buildGradeAssessmentOccurrenceEmojiMarkup\(mode, emoji\) \{[\s\S]*?normalizeGradeAssessmentMode\(mode\) !== "homework"[\s\S]*?const normalizedEmoji = normalizeGradeOccurrenceCategoryEmoji\(emoji\);[\s\S]*?if \(!normalizedEmoji\) \{\s+return "";[\s\S]*?grade-assessment-occurrence-icon/);
  assert.match(appSource, /buildGradeAssessmentOccurrenceEmojiMarkup\(cell\.assessment\.mode, this\.getGradeOccurrenceCategoryEmoji\(cell\.assessment\.occurrenceCategoryId\)\)/);
  assert.match(cssSource, /\.grade-assessment-weight-icon,\s+\.grade-assessment-occurrence-icon \{\s+font-size: 1\.08rem;\s+line-height: 1;/);
});
