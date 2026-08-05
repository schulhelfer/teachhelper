import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
  'utf8',
);
const appHtml = await readFile(
  new URL('../src/modules/grades/app.html', import.meta.url),
  'utf8',
);

test('the participant dialog step reports the current non-empty participant count', () => {
  const start = appSource.indexOf('\n  renderCourseDialogStudents()');
  const bodyStart = appSource.indexOf(') {', start) + 2;
  let depth = 0;
  let end = bodyStart;
  for (; end < appSource.length; end += 1) {
    if (appSource[end] === '{') depth += 1;
    if (appSource[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  const method = appSource.slice(start, end + 1);

  assert.ok(start >= 0 && end > bodyStart, 'renderCourseDialogStudents must exist');
  assert.match(method, /const participantCount = students\.filter/);
  assert.match(method, /!student\?\.isPlaceholder/);
  assert.match(appHtml, /<h3 id="course-students-dialog-title" class="dialog-title">Teilnehmende verwalten<\/h3>/);
  assert.match(appHtml, /<strong id="course-students-dialog-step-title">3\. Verwalte die Teilnehmenden \(Anzahl: 0\)<\/strong>/);
  assert.match(method, /3\. Verwalte die Teilnehmenden \(Anzahl: \$\{participantCount\}\)/);
});
