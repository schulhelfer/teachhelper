import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [source, appSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('Gruppenheader zeichnen ihre Grenze selbst statt sie auf Kindzellen zu verlagern', () => {
  assert.match(
    source,
    /\.grades-master-table th\.grade-period-head \{[\s\S]*?padding-inline: 0\.24rem;[\s\S]*?\}/,
  );
  assert.match(
    source,
    /\.grades-master-table th\.grade-category-head \{[\s\S]*?text-align: left;[\s\S]*?\}/,
  );
  assert.match(
    source,
    /\.grades-master-table th\.grade-subcategory-head \{[\s\S]*?text-align: left;[\s\S]*?\}/,
  );
  assert.doesNotMatch(source, /--grade-collapsed-header-bottom-rule|is-final-header-rowspan|--grade-cell-shadow: inset 0 1px 0 var\(--border-control\)/);
  assert.doesNotMatch(source, /\.grades-master-table th\.grade-category-head,\s+\.grades-master-table th\.grade-category-collapsed-head \{\s+border-top:/);
  assert.doesNotMatch(appSource, /is-final-header-rowspan/);
});
