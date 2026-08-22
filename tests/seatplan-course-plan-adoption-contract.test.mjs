import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [seatplanApp, seatplanHtml, gradesApp] = await Promise.all([
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

function extractBody(source, markers, label) {
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index !== -1) ?? -1;
  assert.notEqual(start, -1, `${label} muss existieren`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${label} ist unvollständig`);
}

const seatplanFunction = (name) => extractBody(
  seatplanApp,
  [`\n          function ${name}(`, `\n          async function ${name}(`],
  name,
);
const gradesMethod = (name) => extractBody(gradesApp, [`\n  ${name}(`], name);

test('ein fremder Kurs fragt nach, statt gesperrt zu sein', () => {
  const pills = seatplanFunction('renderGradeRosterPills');
  assert.match(pills, /void chooseCourseRosterAction\(course\?\.id\)/);
  assert.doesNotMatch(pills, /Bitte zuerst den aktuellen Kurs zurücksetzen/);
  assert.match(pills, /isCourseSeatplanMode\(\) && !canSwitchCourseRoster\(\)/);

  const choose = seatplanFunction('chooseCourseRosterAction');
  assert.match(choose, /choice === 'switch'[\s\S]*?importGradeRosterCourse\(targetCourseId\)/);
  assert.match(choose, /choice === 'adopt'[\s\S]*?requestCourseSeatplanAdoption\(targetCourseId\)/);
});

test('der Dialog benennt beide Kurse und den Speicherhinweis', () => {
  assert.match(seatplanHtml, /id="course-roster-action-dialog"/);
  assert.match(seatplanHtml, /id="course-roster-action-current"/);
  assert.match(seatplanHtml, /id="course-roster-action-target"/);
  assert.match(seatplanHtml, /id="course-roster-action-switch"/);
  assert.match(seatplanHtml, /id="course-roster-action-adopt"/);
  assert.match(seatplanHtml, /Teilnehmendenliste unverändert/);
  assert.match(seatplanHtml, /Danach noch speichern/);
  assert.match(seatplanHtml, /id="course-roster-action-unsaved"[^>]*hidden/);

  const chip = seatplanFunction('renderCourseRosterActionChip');
  assert.match(chip, /getGradeRosterPillTextColor\(color\)/);

  const dialog = seatplanFunction('openCourseRosterActionDialog');
  assert.match(dialog, /courseRosterActionUnsaved\.hidden = !hasUnsavedCourseSeatplanChanges\(\)/);
});

test('die Übernahme holt nur den Plan und behält die eigene Kursbindung', () => {
  const request = seatplanFunction('requestCourseSeatplanAdoption');
  assert.match(request, /mode: 'plan'/);
  assert.match(request, /courseId: sourceId/);
  assert.match(request, /targetCourseId: targetId/);

  const apply = seatplanFunction('applyAdoptedCourseSeatplan');
  assert.match(apply, /targetCourseId !== Number\(state\.courseContext\?\.courseId \|\| 0\)/);
  assert.match(apply, /applyCoursePlanData\(/);
  assert.match(apply, /markUnsavedAction\(\)/);
  assert.doesNotMatch(apply, /applyCourseSeatplanContext/);
  assert.doesNotMatch(apply, /setCourseSeatplanBaseline/);
  assert.doesNotMatch(apply, /state\.courseContext\s*=[^=]/);
});

test('das Notenmodul spiegelt den Modus und schickt keine fremde Namensliste', () => {
  const request = gradesMethod('async handleGradeRosterImportRequest');
  assert.match(request, /detail\?\.mode === "plan" \? "plan" : "roster"/);
  assert.match(request, /const responseContext = \{\s*mode,/);
  assert.match(request, /respondWithAdoptedCourseSeatPlan\(\{/);

  const respond = gradesMethod('async respondWithAdoptedCourseSeatPlan');
  assert.match(respond, /remapCourseSeatPlan\(\{/);
  assert.doesNotMatch(respond, /\bstudents:/);
  assert.doesNotMatch(respond, /contextToken/);
  assert.doesNotMatch(respond, /rosterToken/);
});
