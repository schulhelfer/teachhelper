import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, appHtml, storeSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
]);

test('BE comments are retained as comment-only grade entries and through score updates', () => {
  assert.match(appSource, /expectationHorizonComment: normalizeGradeExpectationHorizonComment\(value\.expectationHorizonComment\)/);
  assert.match(appSource, /hasGradeTestScores\(normalizedEntry\.testScores\)\s*\|\| normalizedEntry\.expectationHorizonComment/);
  assert.match(appSource, /setGradeTestEntry\(studentKey, assessmentKey, normalizedEntry\.testScores, \{\s*expectationHorizonComment:/);
  assert.match(storeSource, /setGradeTestEntry\(studentId, assessmentId, scores = \{\}, options = \{\}\)/);
  assert.match(storeSource, /if \(!hasGradeTestScores\(normalizedScores\) && !expectationHorizonComment\)/);
  assert.match(storeSource, /existing\.expectationHorizonComment = expectationHorizonComment/);
});

test('the BE student name and its comment indicator open an individual expectation-horizon comment dialog', () => {
  assert.match(appSource, /expectationHorizonComment: !isPlaceholderRow/);
  assert.match(appSource, /hasExpectationHorizonComment: Boolean\(entry\?\.expectationHorizonComment\)/);
  assert.match(appSource, /dataset\.gradeExpectationHorizonComment/);
  assert.match(appSource, /gradeExpectationHorizonCommentIndicator/);
  assert.match(appSource, /Kommentar für Erwartungshorizont bearbeiten/);
  assert.match(appSource, /openGradeExpectationHorizonCommentDialog\(/);
  assert.match(appSource, /submitGradeExpectationHorizonCommentDialog\(/);
  assert.match(appSource, /navigateGradeExpectationHorizonCommentDialog\(-1\)/);
  assert.match(appSource, /navigateGradeExpectationHorizonCommentDialog\(1\)/);
  assert.match(appSource, /getGradeExpectationHorizonCommentDialogStudents\(courseId\)/);
  assert.match(appSource, /submitGradeExpectationHorizonCommentDialog\(\{ closeOnSuccess: false \}\)/);
  assert.match(appHtml, /id="grade-expectation-horizon-comment-previous"/);
  assert.match(appHtml, /id="grade-expectation-horizon-comment-next"/);
  assert.match(appHtml, /grade-expectation-horizon-comment-cancel"[\s\S]*aria-label="Übernehmen"[\s\S]*data-tooltip="Übernehmen">✔️/);
  assert.match(appHtml, /id="grade-expectation-horizon-comment-dialog"/);
  assert.match(appHtml, /id="grade-expectation-horizon-comment-input"[^>]*maxlength="500"/);
});

test('the BE comment dialog always keeps changes in the grades entry draft', () => {
  const methodStart = appSource.indexOf('\n  async submitGradeExpectationHorizonCommentDialog(');
  const methodEnd = appSource.indexOf('\n  getExpectationHorizonCourseContext(', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  const method = appSource.slice(methodStart, methodEnd);

  assert.match(method, /this\.gradesEntryDraft = \{[\s\S]*entries/);
  assert.match(method, /this\.markGradesEntryDraftDirty\(\)/);
  assert.doesNotMatch(method, /runGradeCourseMutation|saveGradeVaultChanges|setGradeTestEntry/);
});

test('saving an individual comment does not reject an otherwise unchanged BE entry as stale', () => {
  const methodStart = appSource.indexOf('\n  async submitGradeExpectationHorizonCommentDialog(');
  const methodEnd = appSource.indexOf('\n  getExpectationHorizonCourseContext(', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  const method = appSource.slice(methodStart, methodEnd);

  assert.match(method, /this\.markGradesEntryDraftDirty\(\)/);
  assert.doesNotMatch(method, /runGradeCourseMutation|saveGradeVaultChanges|setGradeTestEntry/);
  assert.doesNotMatch(method, /Die BE-Leistung wurde zwischenzeitlich geändert/);
});

test('the EWH comment placeholder combines individual text before follow-up guidance', () => {
  const methodStart = appSource.indexOf('\n  buildExpectationHorizonStudentComment(');
  const methodEnd = appSource.indexOf('\n  getExpectationHorizonStudentEntry(', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  const method = appSource.slice(methodStart, methodEnd);

  assert.match(method, /\[individual, followUp\]\.filter\(Boolean\)\.join\("\\n\\n"\)/);
  assert.match(appSource, /entry\?\.expectationHorizonComment,\s*deficitFollowUpTaskNumbers/);
});
