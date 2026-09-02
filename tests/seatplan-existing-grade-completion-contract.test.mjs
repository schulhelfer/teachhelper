import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/modules/seatplan/app.js', import.meta.url),
  'utf8',
);

test('opening an already completed assessment does not immediately prompt to save', () => {
  assert.match(source, /courseGradeCompletionPromptArmed: false/);
  assert.match(
    source,
    /function startCourseGradeMode\(values, options = \{\}\) \{[\s\S]*?state\.courseGradeCompletionPromptShown = false;[\s\S]*?state\.courseGradeCompletionPromptArmed = false;/,
  );
  assert.match(
    source,
    /function checkCourseGradeCompletionPrompt\(options = \{\}\) \{\s+if \(!isCourseGradeMode\(\) \|\| isCourseGradeOccurrenceMode\(\)\) return false;\s+if \(!state\.courseGradeCompletionPromptArmed\) return false;/,
  );
});

test('actual grade work arms the completion prompt', () => {
  assert.match(source, /options\.armCompletion === true \|\| options\.prompt === true/);
  assert.match(source, /setCourseGradeEntry\(sid, sanitized, \{ armCompletion: true \}\)/);
  assert.match(source, /skipButton\.addEventListener\('click',[\s\S]*?courseGradeCompletionPromptArmed = true;/);
});

test('existing grades do not replace visiting every student during the current pass', () => {
  assert.match(
    source,
    /function isCourseGradeStudentDone\(studentId\) \{[\s\S]*?if \(isCourseGradeOccurrenceMode\(\)\) \{[\s\S]*?return isCourseGradeStudentChecked\(sid\);[\s\S]*?\}\s+return Boolean\(state\.courseGradeVisitedStudentIds\?\.has\(sid\)\);/,
  );
  assert.match(
    source,
    /function openCourseGradePicker\(input\) \{[\s\S]*?markCourseGradeStudentVisited\(studentId\);/,
  );
});
