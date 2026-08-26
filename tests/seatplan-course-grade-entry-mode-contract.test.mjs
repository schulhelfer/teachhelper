import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [seatplanHtml, seatplanApp, seatplanCss, gradesApp, integritySource] = await Promise.all([
  read('../src/modules/seatplan/app.html'),
  read('../src/modules/seatplan/app.js'),
  read('../src/modules/seatplan/app.css'),
  read('../src/modules/grades/app.js'),
  read('../src/shared/school-data/grade-integrity.js'),
]);

const integrity = await import(
  `data:text/javascript;base64,${Buffer.from(integritySource).toString('base64')}`
);

test('the seatplan offers an entry-mode overlay and dialog while grading', () => {
  assert.match(seatplanHtml, /id="course-grade-overlay"[\s\S]*?hidden/);
  assert.match(seatplanHtml, /id="course-grade-entry-mode-button"/);
  assert.match(seatplanHtml, /id="course-grade-overlay-save"[\s\S]*?aria-label="Eingaben speichern"[\s\S]*?data-tooltip="Eingaben speichern"/);
  assert.match(seatplanHtml, /<dialog id="course-grade-entry-mode-dialog"/);
  assert.match(seatplanHtml, /id="course-grade-entry-mode-options"[\s\S]*?role="radiogroup"/);
  assert.match(seatplanHtml, /id="course-grade-entry-mode-unsaved"[\s\S]*?hidden/);
  assert.match(seatplanHtml, /id="course-grade-entry-mode-discard"/);
  assert.match(seatplanHtml, /id="course-grade-entry-mode-save"/);
  assert.match(seatplanHtml, /id="course-grade-entry-mode-apply"/);

  assert.doesNotMatch(seatplanCss, /\.course-grade-bar \{[^}]*position: absolute/);
  const beforeGrid = seatplanHtml.slice(
    seatplanHtml.indexOf('<main class="main">'),
    seatplanHtml.indexOf('<div class="grid-wrap">'),
  );
  assert.match(beforeGrid, /id="course-grade-overlay"/);
});

test('the seatplan defaults to single grades and only switches on demand', () => {
  assert.match(seatplanApp, /courseGradeEntryMode: 'grade'/);
  assert.match(seatplanApp, /const COURSE_GRADE_ENTRY_MODE_OCCURRENCE = 'occurrence'/);
  assert.match(
    seatplanApp,
    /function normalizeCourseGradeEntryMode\(value\) \{[\s\S]*?=== COURSE_GRADE_ENTRY_MODE_OCCURRENCE[\s\S]*?: COURSE_GRADE_ENTRY_MODE_GRADE;/,
  );
  assert.match(
    seatplanApp,
    /function resetCourseGradeMode\(\) \{[\s\S]*?state\.courseGradeEntryMode = COURSE_GRADE_ENTRY_MODE_GRADE;/,
  );
});

test('the first grade picker waits for the seat input to be visible', () => {
  assert.match(seatplanApp, /const COURSE_GRADE_INITIAL_PICKER_RETRY_LIMIT = 90;/);
  assert.match(
    seatplanApp,
    /function openFirstCourseGradePicker\(attempt = 0\) \{[\s\S]*?const hasUsableInputRect = inputRect\.width >= 1 && inputRect\.height >= 1;[\s\S]*?if \(!hasUsableInputRect\) \{[\s\S]*?attempt < COURSE_GRADE_INITIAL_PICKER_RETRY_LIMIT[\s\S]*?requestAnimationFrame\(\(\) => openFirstCourseGradePicker\(attempt \+ 1\)\);[\s\S]*?return;[\s\S]*?\}\s*input\.focus/,
  );
});

test('saving without changes closes the completion dialog before showing the notice', () => {
  assert.match(
    seatplanApp,
    /if \(delta\.changes\.length === 0\) \{\s+closeCourseGradeCompleteDialog\(\);\s+showMessage\([\s\S]*?'Es wurden keine Noten geändert\.',\s+'warn',\s+\{ presentation: 'toast' \},/,
  );
});

test('grade entry advances reliably after a confirmed value', () => {
  assert.match(
    seatplanApp,
    /function advanceCourseGradeInput\(currentInput, options = \{\}\) \{[\s\S]*?if \(options\.closePicker\) \{\s+hideCourseGradePicker\(\);[\s\S]*?requestAnimationFrame\(moveFocus\)/,
  );
  assert.match(
    seatplanApp,
    /function focusNextCourseGradeInput\(currentInput\) \{[\s\S]*?checkCourseGradeCompletionPrompt\(\{ allowOpen: true \}\)[\s\S]*?\|\| state\.courseGradeCompletionPromptShown[\s\S]*?return;/,
  );
  assert.match(
    seatplanApp,
    /setCourseGradeEntry\(studentId, value, \{ prompt: true \}\);\s+updateCourseGradeInputsForStudent\(studentId\);\s+advanceCourseGradeInput\(input, \{ closePicker: true \}\);/,
  );
  assert.match(
    seatplanApp,
    /skipButton\.addEventListener\('click', event => \{[\s\S]*?advanceCourseGradeInput\(input, \{ closePicker: true \}\);/,
  );
});

test('keyboard grade entry advances only after an unambiguous confirmation', () => {
  assert.match(
    seatplanApp,
    /if \(!isCourseGradeSchoolDisplay\(\) && parsed\.value !== null\) \{\s+advanceCourseGradeInput\(input, \{ closePicker: true \}\);/,
  );
  assert.match(
    seatplanApp,
    /if \(event\.key === 'Enter'\) \{\s+event\.preventDefault\(\);\s+const parsed = parseCourseGradeValue\(input\.value\);\s+if \(parsed\.valid && parsed\.value !== null\) \{\s+formatCourseGradeInputDisplay\(input, \{ checkCompletion: true \}\);\s+advanceCourseGradeInput\(input, \{ closePicker: true \}\);\s+\} else \{\s+formatCourseGradeInputDisplay\(input, \{ checkCompletion: true \}\);\s+openCourseGradePicker\(input\);/,
  );
});

test('occurrence seats toggle directly instead of opening the grade picker', () => {
  assert.match(seatplanApp, /button\.dataset\.courseGradeOccurrenceToggle = '1'/);
  assert.match(seatplanApp, /button\[data-course-grade-occurrence-toggle='1'\]/);
  assert.match(
    seatplanApp,
    /function createCourseGradeControl\(studentId, label\) \{[\s\S]*?if \(isCourseGradeOccurrenceMode\(\)\) \{[\s\S]*?createCourseGradeOccurrenceToggle\(studentId, label\)/,
  );
  assert.match(
    seatplanApp,
    /function toggleCourseGradeOccurrenceEntry\(studentId\) \{[\s\S]*?setCourseGradeOccurrenceEntry\(sid, !isCourseGradeStudentChecked\(sid\)\)/,
  );
  assert.match(seatplanApp, /indicator\.className = 'course-grade-occurrence-indicator';/);
  assert.match(seatplanApp, /button\.classList\.toggle\('is-positive-occurrence', isCourseGradePositiveOccurrence\(\)\)/);
  assert.doesNotMatch(seatplanApp, /getCourseGradeOccurrenceMarker/);
  assert.match(
    seatplanCss,
    /\.course-grade-occurrence-indicator::before \{\s+transform: translate\(-50%, -50%\) rotate\(45deg\);/,
  );
  assert.match(
    seatplanCss,
    /\.course-grade-occurrence-toggle\.is-positive-occurrence\.is-checked \.course-grade-occurrence-indicator::after \{\s+content: "✔";/,
  );
  assert.match(
    seatplanApp,
    /function checkCourseGradeCompletionPrompt\(options = \{\}\) \{\s+if \(!isCourseGradeMode\(\) \|\| isCourseGradeOccurrenceMode\(\)\) return false;/,
  );
});

test('switching the entry mode is blocked while entries are unsaved', () => {
  assert.match(
    seatplanApp,
    /function hasCourseGradeUnsavedChanges\(\) \{[\s\S]*?isCourseGradeOccurrenceMode\(\)\s*\?\s*buildCourseGradeOccurrenceChanges\(\)\s*:\s*buildCourseGradeChanges\(\)/,
  );
  assert.match(seatplanApp, /const dirty = hasCourseGradeUnsavedChanges\(\);/);
  assert.match(
    seatplanApp,
    /if \(choice\.action === 'save'\) \{[\s\S]*?state\.pendingCourseGradeModeSwitch = \{[\s\S]*?requestCourseGradeSave\(\)/,
  );
  assert.match(
    seatplanApp,
    /if \(choice\.action === 'discard'\) \{[\s\S]*?state\.courseGradeCheckedEntries = \{ \.\.\.state\.courseGradeOriginalCheckedEntries \}/,
  );
  assert.match(
    seatplanApp,
    /if \(pendingModeSwitch\) \{\s+requestCourseGradeConfig\('', \{\s+entryMode: pendingModeSwitch\.entryMode/,
  );
});

test('the seatplan announces the entry mode in both grade requests', () => {
  assert.match(
    seatplanApp,
    /type: SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT,[\s\S]*?entryMode,\s+occurrenceCategoryId: occurrenceCategoryId \|\| null,/,
  );
  assert.match(
    seatplanApp,
    /type: SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT,[\s\S]*?entryMode: occurrenceMode \? COURSE_GRADE_ENTRY_MODE_OCCURRENCE : COURSE_GRADE_ENTRY_MODE_GRADE,[\s\S]*?occurrenceCategoryId: occurrenceMode \? Number\(state\.courseGradeOccurrenceCategoryId \|\| 0\) : null,/,
  );
});

test('the grades module serves occurrence categories and stores checkmarks as Vorkommnis', () => {
  assert.match(gradesApp, /occurrenceCategories: this\.getGradeOccurrenceCategories\(\)\.map\(/);
  assert.match(gradesApp, /buildCourseSeatplanGradeConfig\(courseId, lessonDate = "", students = null, options = \{\}\)/);
  assert.match(
    gradesApp,
    /findCourseSeatplanOccurrenceAssessmentByLessonDate\(courseId, lessonDate = "", occurrenceCategoryId = null\)/,
  );
  assert.match(
    gradesApp,
    /normalizeGradeAssessmentMode\(assessment\?\.mode\) === "homework"[\s\S]*?normalizeGradeTextPart\(assessment\?\.title\) === expectedTitle/,
  );
  assert.match(
    gradesApp,
    /mode: isOccurrenceMode \? "homework" : "grade",\s+occurrenceCategoryId: isOccurrenceMode \? occurrenceCategoryId : null,/,
  );
  assert.match(
    gradesApp,
    /const normalizedChanges = isOccurrenceMode\s+\? validateGradeOccurrenceDelta\(changes, \{/,
  );
  assert.match(
    gradesApp,
    /if \(isOccurrenceMode\) \{[\s\S]*?this\.store\.setGradeEntry\(change\.studentId, assessmentId, change\.checked\)/,
  );
  assert.match(
    gradesApp,
    /buildCourseSeatplanContextToken\([\s\S]*?occurrences: this\.buildCourseSeatplanOccurrenceContextSnapshot\(courseKey, lessonDate\)/,
  );
});

test('occurrence deltas are validated as booleans with optimistic locking', () => {
  const { validateGradeOccurrenceDelta } = integrity;
  assert.equal(typeof validateGradeOccurrenceDelta, 'function');

  assert.deepEqual(
    validateGradeOccurrenceDelta(
      [
        { studentId: 1, expectedChecked: false, checked: true },
        { studentId: 2, expectedChecked: true, checked: false },
      ],
      { studentIds: [1, 2, 3], currentCheckedForStudent: (studentId) => studentId === 2 },
    ),
    [
      { studentId: 1, expectedChecked: false, checked: true },
      { studentId: 2, expectedChecked: true, checked: false },
    ],
  );

  assert.throws(
    () => validateGradeOccurrenceDelta(
      [{ studentId: 1, expectedChecked: false, checked: true }],
      { studentIds: [1], currentCheckedForStudent: () => true },
    ),
    /zwischenzeitlich geändert/,
  );
  assert.throws(
    () => validateGradeOccurrenceDelta(
      [{ studentId: 1, expectedChecked: true, checked: true }],
      { studentIds: [1], currentCheckedForStudent: () => true },
    ),
    /keinen geänderten Wert/,
  );
  assert.throws(
    () => validateGradeOccurrenceDelta(
      [{ studentId: 1, expectedChecked: 0, checked: 1 }],
      { studentIds: [1], currentCheckedForStudent: () => false },
    ),
    /kein gültiger Vorkommnis-Wert/,
  );
  assert.throws(
    () => validateGradeOccurrenceDelta(
      [{ studentId: 9, expectedChecked: false, checked: true }],
      { studentIds: [1], currentCheckedForStudent: () => false },
    ),
    /fremde oder doppelte Teilnehmende/,
  );
  assert.throws(
    () => validateGradeOccurrenceDelta([], { studentIds: [1], currentCheckedForStudent: () => false }),
    /Vorkommnisänderungen fehlen/,
  );
});
