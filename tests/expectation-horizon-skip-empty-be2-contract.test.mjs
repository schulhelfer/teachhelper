import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');

test('EWH records skip students without any BE2 entry for the current tasks, even with a comment', () => {
  const methodStart = appSource.indexOf('\n  async buildExpectationHorizonStudentRecords(');
  const methodEnd = appSource.indexOf('\n  buildExpectationHorizonZipFileName(', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  const method = appSource.slice(methodStart, methodEnd);

  const skipPattern = /const scores = normalizeGradeTestScores\(entry\?\.testScores\);\s*if \(!tasks\.some\(\(task\) => Object\.prototype\.hasOwnProperty\.call\(scores, task\.id\)\)\) \{\s*continue;\s*\}/;
  assert.match(method, skipPattern);
  assert.ok(method.search(skipPattern) < method.indexOf('buildExpectationHorizonStudentComment('));
});

test('EWH generation reports missing BE2 entries when no student remains', () => {
  const methodStart = appSource.indexOf('\n  async generateExpectationHorizons(');
  assert.ok(methodStart >= 0);
  const method = appSource.slice(methodStart, appSource.indexOf('\n  }\n', methodStart));

  assert.match(method, /if \(!records\.length\) \{\s*this\.setExpectationHorizonStatus\("Für diesen Kurs sind noch keine BE2-Einträge vorhanden\.", "error"\);/);
});
