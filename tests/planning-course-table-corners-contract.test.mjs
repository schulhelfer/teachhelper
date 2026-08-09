import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8');

test('die oberen Ecken der Kurs-Tabelle zeichnen keinen Hintergrundüberstand', () => {
  const firstCorner = source.match(/#course-table thead th:first-child \{([\s\S]*?)\n        \}/)?.[1] || '';
  const lastCorner = source.match(/#course-table thead th:last-child \{([\s\S]*?)\n        \}/)?.[1] || '';

  assert.match(firstCorner, /border-top-left-radius: 12px;/);
  assert.match(lastCorner, /border-top-right-radius: 12px;/);
  assert.doesNotMatch(firstCorner, /box-shadow:/);
  assert.doesNotMatch(lastCorner, /box-shadow:/);
});

test('die obere Tabellenkante erhält nur den äußeren abgerundeten Rahmen', () => {
  const courseHead = source.match(/#course-table thead \{([\s\S]*?)\n        \}/)?.[1] || '';
  const courseHeadCell = source.match(/#course-table thead th \{([\s\S]*?)\n        \}/)?.[1] || '';

  assert.match(
    source,
    /#course-table \{\s+border: 1px solid var\(--border-table-outer\);\s+border-radius: 12px;\s+overflow: hidden;\s+clip-path: inset\(0 round 12px\);/,
  );
  assert.doesNotMatch(courseHead, /border:/);
  assert.match(courseHeadCell, /border-top: none;/);
  assert.match(courseHeadCell, /border-left: none;/);
});
