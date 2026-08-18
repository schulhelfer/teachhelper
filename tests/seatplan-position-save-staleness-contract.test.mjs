import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');

function extractMethodBody(source, methodSignaturePattern) {
  const match = source.match(methodSignaturePattern);
  assert.ok(match, `method not found: ${methodSignaturePattern}`);
  return match[1];
}

test('course seatplan position save only rejects on roster changes, not on unrelated course-wide grade edits', () => {
  const body = extractMethodBody(
    app,
    /\n  async handleCourseSeatplanSaveRequest\(detail = null\) \{([\s\S]*?)\n  normalizeGradesOverviewAssessmentSpotlightTarget\(/,
  );
  const mutation = body.match(/const saved = await this\.runGradeCourseMutation\(courseId, \(\) => \{([\s\S]*?)\}, \{ preserveRoster: true \}\);/)?.[1] || '';
  assert.match(
    mutation,
    /buildCourseSeatplanContextState\(courseId, lessonDate\)/,
  );
  assert.match(
    mutation,
    /if \(contextState\.rosterToken !== rosterToken\) \{/,
  );
  assert.doesNotMatch(
    mutation,
    /contextState\.contextToken !== contextToken/,
  );
});
