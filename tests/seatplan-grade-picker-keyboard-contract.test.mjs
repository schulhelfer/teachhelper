import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
  .then((text) => text.replace(/\r\n/g, '\n'));

const seatplanApp = await read('../src/modules/seatplan/app.js');

function getCourseGradePickerSource() {
  const start = seatplanApp.indexOf('function openCourseGradePicker(input)');
  const end = seatplanApp.indexOf('\n\n          function skipCourseGradeInput', start);
  assert.ok(start >= 0 && end > start, 'der Sitzplan-Notenpicker muss vorhanden sein');
  return seatplanApp.slice(start, end);
}

test('die Picker-Tasten tragen einen Tooltip über das title-Attribut', () => {
  const picker = getCourseGradePickerSource();

  assert.match(
    picker,
    /button\.setAttribute\('aria-label', options\.label\);\s+button\.title = options\.label;/,
  );
  assert.match(
    picker,
    /skipButton\.setAttribute\('aria-label', 'Person auslassen und weiter'\);\s+skipButton\.title = 'Person auslassen und weiter';/,
  );
  assert.doesNotMatch(picker, /dataset\.tooltip/);
});

test('der Auslassen-Button nutzt dieselbe Funktion wie die Tastatur', () => {
  const picker = getCourseGradePickerSource();

  assert.match(
    picker,
    /skipButton\.addEventListener\('click', event => \{\s+event\.stopPropagation\(\);\s+skipCourseGradeInput\(input\);\s+\}\);/,
  );

  assert.match(
    seatplanApp,
    /function skipCourseGradeInput\(input\) \{[\s\S]*?markCourseGradeStudentHandled\(studentId\);[\s\S]*?markCourseGradeStudentSkipped\(studentId\);[\s\S]*?applyCourseGradeEmptyPlaceholder\(input\);[\s\S]*?state\.courseGradeCompletionPromptArmed = true;[\s\S]*?advanceCourseGradeInput\(input, \{ closePicker: true \}\);/,
  );
});

test('Pfeil runter lässt aus, Pfeil hoch geht im Besuchsverlauf zurück', () => {
  assert.match(
    seatplanApp,
    /\(event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'\)\s+&& !event\.ctrlKey\s+&& !event\.altKey\s+&& !event\.metaKey\s+\) \{\s+event\.preventDefault\(\);\s+if \(event\.key === 'ArrowDown'\) \{\s+skipCourseGradeInput\(input\);\s+\} else \{\s+focusPreviousCourseGradeInput\(\);\s+\}/,
  );
});

test('der Besuchsverlauf wird beim Vorwärtsspringen gefüllt und beim Zurücksetzen geleert', () => {
  assert.match(seatplanApp, /courseGradeVisitedInputStack: \[\],/);

  const resets = seatplanApp.match(
    /state\.courseGradeSkippedStudentIds = new Set\(\);\s+state\.courseGradeClearedStudentIds = new Set\(\);\s+state\.courseGradeVisitedInputStack = \[\];/g,
  ) || [];
  assert.equal(resets.length, 2, 'der Besuchsverlauf muss an beiden Reset-Stellen geleert werden');

  assert.match(
    seatplanApp,
    /pushCourseGradeVisitedInput\(currentInput\);\s+next\.focus\(\{ preventScroll: false \}\);/,
  );

  assert.match(
    seatplanApp,
    /function pushCourseGradeVisitedInput\(input\) \{[\s\S]*?state\.courseGradeVisitedInputStack\.push\(studentId\);/,
  );
});

test('die Rückwärtsnavigation überspringt verwaiste Einträge ohne Wrap-Around', () => {
  const start = seatplanApp.indexOf('function focusPreviousCourseGradeInput()');
  assert.ok(start >= 0, 'focusPreviousCourseGradeInput muss vorhanden sein');
  const source = seatplanApp.slice(start, seatplanApp.indexOf('\n\n          function', start + 1));

  assert.match(source, /while \(stack\.length\) \{/);
  assert.match(source, /const studentId = String\(stack\.pop\(\) \|\| ''\);/);
  assert.match(source, /if \(!previous\) continue;/);
  assert.match(source, /hideCourseGradePicker\(\);\s+previous\.focus\(\{ preventScroll: false \}\);\s+openCourseGradePicker\(previous\);/);
  assert.match(source, /return false;\s+\}/);

  assert.doesNotMatch(source, /markCourseGradeStudentSkipped|clearCourseGradeStudentSkipped/);
});
