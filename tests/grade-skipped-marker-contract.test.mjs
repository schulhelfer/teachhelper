import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
  .then((text) => text.replace(/\r\n/g, '\n'));

const [seatplan, seatplanCss, grades] = await Promise.all([
  read('../src/modules/seatplan/app.js'),
  read('../src/modules/seatplan/app.css'),
  read('../src/modules/grades/app.js'),
]);

const sliceBetween = (source, startNeedle, endNeedle, label) => {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `${label}: start marker missing`);
  const end = source.indexOf(endNeedle, start);
  assert.ok(end > start, `${label}: end marker missing`);
  return source.slice(start, end);
};

test('the seatplan tracks skipped students separately from handled ones', () => {
  assert.match(seatplan, /courseGradeHandledStudentIds: new Set\(\),\n\s*courseGradeSkippedStudentIds: new Set\(\),/);

  // Both places that reset the handled set must reset the skipped set too.
  const resets = seatplan.match(/state\.courseGradeHandledStudentIds = new Set\(\);\n\s*state\.courseGradeSkippedStudentIds = new Set\(\);/g) || [];
  assert.equal(resets.length, 2, 'resetCourseGradeMode and startCourseGradeMode must both clear the skipped set');

  assert.match(seatplan, /function markCourseGradeStudentSkipped\(studentId\) \{[\s\S]*?state\.courseGradeSkippedStudentIds\.add\(sid\);/);
  assert.match(seatplan, /function isCourseGradeStudentSkipped\(studentId\) \{[\s\S]*?return Boolean\(state\.courseGradeSkippedStudentIds\?\.has\(sid\)\);/);
});

test('only the seatplan skip button marks a student as skipped', () => {
  assert.match(
    seatplan,
    /skipButton\.addEventListener\('click', event => \{\n\s*event\.stopPropagation\(\);\n\s*markCourseGradeStudentHandled\(input\.dataset\.studentId \|\| ''\);\n\s*markCourseGradeStudentSkipped\(input\.dataset\.studentId \|\| ''\);\n\s*applyCourseGradeSkippedState\(input\);\n\s*state\.courseGradeCompletionPromptArmed = true;\n\s*advanceCourseGradeInput\(input, \{ closePicker: true \}\);/,
  );
  assert.equal(
    seatplan.split('markCourseGradeStudentSkipped(').length - 1,
    2,
    'markCourseGradeStudentSkipped may only be defined once and called from the skip button',
  );
});

test('only a real seatplan grade drops the skipped marker, never an empty value', () => {
  const setter = sliceBetween(
    seatplan,
    'function setCourseGradeEntry(studentId, value, options = {}) {',
    'function applyCourseGradeSkippedState(',
    'setCourseGradeEntry',
  );

  // Skipping blurs the input one frame later, which runs setCourseGradeEntry(sid, '').
  // If the empty branch cleared the marker, it would erase itself on every skip.
  const emptyBranch = sliceBetween(
    setter,
    'if (parsed.value === null) {',
    '} else {',
    'empty-value branch',
  );
  assert.doesNotMatch(emptyBranch, /clearCourseGradeStudentSkipped/);

  assert.match(
    setter,
    /\} else \{\n\s*state\.courseGradeEntries\[sid\] = parsed\.value;\n\s*state\.courseGradeDeletedStudentIds\.delete\(sid\);\n[\s\S]*?clearCourseGradeStudentSkipped\(sid\);\n\s*\}/,
  );
  assert.equal(
    setter.split('clearCourseGradeStudentSkipped(').length - 1,
    1,
    'the marker may only be dropped on an actual grade assignment',
  );

  // The central refresh runs on every path, so an empty blur restores the marker.
  assert.match(setter, /updateCourseGradeSkippedInputsForStudent\(sid\);\n[\s\S]*?syncCourseGradeOverlay\(\);/);
});

test('the seatplan renders the skipped marker as a placeholder, never as a value', () => {
  assert.match(seatplan, /const COURSE_GRADE_SKIPPED_PLACEHOLDER = '--';/);

  const helper = sliceBetween(
    seatplan,
    'function applyCourseGradeSkippedState(input) {',
    'function updateCourseGradeSkippedInputsForStudent(',
    'applyCourseGradeSkippedState',
  );
  assert.match(helper, /const skipped = Boolean\(sid\) && !input\.value && isCourseGradeStudentSkipped\(sid\);/);
  assert.match(helper, /input\.placeholder = skipped \? COURSE_GRADE_SKIPPED_PLACEHOLDER : '';/);
  assert.doesNotMatch(helper, /input\.value =/, 'the marker must never be written into the input value');

  // Survives a full renderSeats(), and the picker path re-applies it after it
  // rewrites input.value (which the central refresh could not have seen yet).
  assert.match(seatplan, /input\.value = state\.courseGradeEntries\[sid\] === undefined \? '' : formatCourseGradeValue\(state\.courseGradeEntries\[sid\]\);\n\s*applyCourseGradeSkippedState\(input\);/);
  assert.match(seatplan, /input\.classList\.remove\('invalid'\);\n\s*applyCourseGradeSkippedState\(input\);/);
});

test('the seatplan placeholder stays readable in every browser', () => {
  assert.match(
    seatplanCss,
    /\.course-grade-input::placeholder \{\s+color: var\(--text-muted\);\s+-webkit-text-fill-color: var\(--text-muted\);\s+opacity: 1;/,
  );
});

test('the grades table marks skipped entries per assessment and student', () => {
  assert.match(grades, /const GRADE_SKIPPED_PLACEHOLDER = "--";/);
  assert.match(grades, /this\.skippedGradeEntries = new Set\(\);/);
  // Draft rows of a not-yet-created assessment carry no assessment id, so the key
  // must fall back to the course instead of silently collapsing to "".
  assert.match(grades, /getSkippedGradeEntryKey\(assessmentId, studentId, courseId = 0\) \{[\s\S]*?return `a\$\{assessment\}:\$\{student\}`;[\s\S]*?return course \? `c\$\{course\}:\$\{student\}` : "";/);
  assert.match(grades, /getSkippedGradeEntryKeyForInput\(input\) \{[\s\S]*?input\.dataset\.assessmentId,\s+input\.dataset\.studentId,\s+input\.dataset\.courseId/);

  const advance = sliceBetween(
    grades,
    'advanceGradePickerToNextStudent() {',
    'advanceGradePickerToNextOverrideTarget() {',
    'advanceGradePickerToNextStudent',
  );
  assert.match(advance, /this\.markGradeEntrySkipped\(input\);/);
  assert.match(advance, /this\.applyGradeSkippedPlaceholder\(input\);/);

  // "Nächste errechnete Note" is not a student skip.
  const overrideAdvance = sliceBetween(
    grades,
    'advanceGradePickerToNextOverrideTarget() {',
    'openGradePickerForInput(input, options = {}) {',
    'advanceGradePickerToNextOverrideTarget',
  );
  assert.doesNotMatch(overrideAdvance, /markGradeEntrySkipped/);
});

test('only a real grades table entry drops the skipped marker, never an empty value', () => {
  // Same trap as the seatplan: skipping blurs the cell, which runs commitGradeCellInput
  // with an empty value. Clearing unconditionally would erase the marker on every skip.
  assert.match(
    grades,
    /input\.value = parsed\.value === null \? "" : this\.formatCurrentGradeInput\(parsed\.value\);\n[\s\S]*?if \(parsed\.value !== null\) \{\n\s*this\.clearGradeEntrySkipped\(assessmentId, studentId, courseId\);\n\s*\}\n\s*this\.applyGradeSkippedPlaceholder\(input\);/,
  );
  assert.equal(
    grades.split('this.clearGradeEntrySkipped(').length - 1,
    1,
    'the marker may only be dropped on an actual grade assignment',
  );
});

test('the grades table marker never overwrites the existing-value placeholder', () => {
  assert.match(
    grades,
    /const showSkippedPlaceholder = !showExistingValueAsPlaceholder\s+&& !existingInputValue\s+&& this\.isGradeEntrySkipped\(assessment\.id, student\.id, assessment\.courseId\);/,
  );
  // The draft-entry row is a second template and needs the marker too.
  assert.match(
    grades,
    /const draftSkippedPlaceholder = draftEntry\.value === null \|\| draftEntry\.value === undefined\s+\? \(this\.isGradeEntrySkipped\(assessment\?\.id, student\.id, course\.id\)/,
  );
  assert.match(grades, /\}"\$\{draftSkippedPlaceholder\} aria-label="Einzelnote für /);
  assert.match(
    grades,
    /\$\{showSkippedPlaceholder \? `placeholder="\$\{escapeHtml\(GRADE_SKIPPED_PLACEHOLDER\)\}"` : ""\}/,
  );

  const helper = sliceBetween(
    grades,
    'applyGradeSkippedPlaceholder(input) {',
    'advanceGradePickerToNextStudent() {',
    'applyGradeSkippedPlaceholder',
  );
  assert.match(helper, /if \(Object\.prototype\.hasOwnProperty\.call\(input\.dataset, "gradeOriginalValue"\)\) \{\s+return;/);
  assert.match(helper, /const key = this\.getSkippedGradeEntryKeyForInput\(input\);\s+const skipped = !input\.value && Boolean\(key\) && this\.skippedGradeEntries\.has\(key\);/);
  assert.match(helper, /input\.placeholder = skipped \? GRADE_SKIPPED_PLACEHOLDER : "";/);
});

test('a new grade entry pass starts without stale skip markers', () => {
  const clears = grades.match(/this\.skippedGradeEntries\.clear\(\);/g) || [];
  assert.equal(clears.length, 2, 'both assessment activation paths must clear the skipped set');
  assert.match(grades, /if \(Number\(this\.activeGradeAssessmentId \|\| 0\) !== Number\(id \|\| 0\)\) \{\s+this\.skippedGradeEntries\.clear\(\);\s+\}\s+this\.activeGradeAssessmentId = id;/);
  assert.match(grades, /if \(Number\(this\.activeGradeAssessmentId \|\| 0\) !== id\) \{\s+this\.skippedGradeEntries\.clear\(\);\s+\}\s+this\.activeGradeAssessmentId = id;/);
});
