import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [seatplanSource, shellSource] = await Promise.all([
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
]);

test('a successful seatplan grade save returns to the planning course view', () => {
  assert.match(
    seatplanSource,
    /returnToPlanningAfterCourseGradeSave\(detail\.message \|\| 'Noten im Notenmodul gespeichert\.'\);/,
  );
  assert.match(
    seatplanSource,
    /function returnToPlanningAfterCourseGradeSave\(message\) \{[\s\S]*?type: 'classroom:planning-view-request',[\s\S]*?view: 'course',[\s\S]*?returnNotice: String\(message \|\| ''\)/,
  );
});

test('the shell accepts this request only from the seatplan frame and presents its success toast', () => {
  assert.match(
    shellSource,
    /if \(data\.type === PLANNING_VIEW_REQUEST_EVENT\) \{[\s\S]*?if \(frame !== getSeatplanFrame\(\)\) return;[\s\S]*?window\.dispatchEvent\(new CustomEvent\(PLANNING_VIEW_REQUEST_EVENT, \{ detail \}\)\);/,
  );
  assert.match(
    shellSource,
    /setActiveTab\(TAB_PLANNING\);[\s\S]*?if \(detail\.returnNotice\) \{[\s\S]*?showMessage\(String\(detail\.returnNotice\), 'success', \{ presentation: 'toast' \}\);/,
  );
});
