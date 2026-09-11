import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const seatplan = await readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8')
  .then((text) => text.replace(/\r\n/g, '\n'));

test('ein abgeschlossenes Speichern-und-Zurück löst die Kursbindung', () => {
  assert.match(
    seatplan,
    /returnToPlanningAfterCourseGradeSave\(detail\.message \|\| 'Noten im Notenmodul gespeichert\.'\);\n\s*clearCourseRosterForPlanningReturn\(\);/,
  );
  assert.match(
    seatplan,
    /function clearCourseRosterForPlanningReturn\(\) \{[\s\S]*?state\.courseContext = null;[\s\S]*?resetCourseGradeMode\(\);[\s\S]*?resetCourseSeatplanForStudents\(\[\]\);/,
  );
});

test('das automatische Leeren läuft ungefragt und ohne Seiteneffekte', () => {
  const start = seatplan.indexOf('function clearCourseRosterForPlanningReturn()');
  assert.ok(start >= 0, 'die automatische Leerfunktion muss vorhanden sein');
  const body = seatplan.slice(start, seatplan.indexOf('\n          }', start));
  assert.doesNotMatch(body, /chooseCourseRosterReset|canResetCourseRoster/);
  assert.doesNotMatch(body, /publishStudentsUpdatedFromSeatplan/);
  assert.doesNotMatch(body, /requestShellChromeCollapsed/);
});

test('ein Wechsel des Eingabemodus speichert ohne die Bindung zu lösen', () => {
  const start = seatplan.indexOf('function handleCourseGradeSaveResult(');
  assert.ok(start >= 0, 'der Speicherergebnis-Handler muss vorhanden sein');
  const handler = seatplan.slice(start, seatplan.indexOf('function returnToPlanningAfterCourseGradeSave(', start));
  const modeSwitch = handler.indexOf('if (pendingModeSwitch) {');
  const clear = handler.indexOf('clearCourseRosterForPlanningReturn()');
  assert.ok(modeSwitch >= 0 && clear > modeSwitch, 'das Leeren muss hinter dem Moduswechsel-Abbruch stehen');
  assert.equal(handler.split('clearCourseRosterForPlanningReturn(').length - 1, 1);
});
