import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
  'utf8',
);

test('normal EWH documents number and resize task rows from the Nr. column', () => {
  const methodStart = appSource.indexOf('\n  async buildExpectationHorizonStudentRecords(');
  const methodEnd = appSource.indexOf('\n  buildExpectationHorizonZipFileName(', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  const method = appSource.slice(methodStart, methodEnd);
  const afbReplacementStart = method.indexOf('header: "AFB"');
  const afbReplacementEnd = method.indexOf('header: "BE1"', afbReplacementStart);
  assert.ok(afbReplacementStart >= 0 && afbReplacementEnd > afbReplacementStart);
  const replacement = method.slice(afbReplacementStart, afbReplacementEnd);

  assert.match(replacement, /targetRowHeader: "Nr\."/);
  assert.match(replacement, /targetSectionEndText: "∑"/);
  assert.match(replacement, /extendRows: true/);
  assert.match(replacement, /numberTargetRows: true/);
  assert.match(replacement, /removeUnusedTargetRows: true/);
});
