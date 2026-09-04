import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
  .then((text) => text.replace(/\r\n/g, '\n'));

const [seatplan, main, shell] = await Promise.all([
  read('../src/modules/seatplan/app.js'),
  read('../src/main.js'),
  read('../src/app/shell.js'),
]);

test('the seatplan posts chrome requests only to a trusted parent and never accepts them back', () => {
  assert.match(seatplan, /const SEATPLAN_CHROME_REQUEST_EVENT = 'classroom:seatplan-chrome-request';/);

  const start = seatplan.indexOf('function requestShellChromeCollapsed(collapsed) {');
  assert.ok(start >= 0, 'requestShellChromeCollapsed must exist');
  const helper = seatplan.slice(start, seatplan.indexOf('\n          }', start));
  assert.match(helper, /if \(TUTORIAL_DEMO_MODE \|\| !window\.parent \|\| window\.parent === window\) return;/);
  assert.match(helper, /type: SEATPLAN_CHROME_REQUEST_EVENT,/);
  assert.match(helper, /detail: \{ collapsed: Boolean\(collapsed\), source: 'iframe' \},/);
  assert.match(helper, /\}, TRUSTED_PARENT_ORIGIN\);/);

  const allowlistStart = seatplan.indexOf('const ALLOWED_PARENT_MESSAGE_TYPES = new Set([');
  assert.ok(allowlistStart >= 0, 'the inbound allowlist must exist');
  const allowlist = seatplan.slice(allowlistStart, seatplan.indexOf(']);', allowlistStart));
  assert.doesNotMatch(allowlist, /SEATPLAN_CHROME_REQUEST_EVENT/);
});

test('entering the grade mode requests fullscreen for both entry modes', () => {
  const start = seatplan.indexOf('function startCourseGradeMode(');
  const end = seatplan.indexOf('function handleCourseGradeConfigResult(', start);
  assert.ok(start >= 0 && end > start, 'startCourseGradeMode must exist');
  const startCourseGradeMode = seatplan.slice(start, end);

  assert.match(startCourseGradeMode, /refreshUnseated\(\);\n\s*requestShellChromeCollapsed\(true\);/);
  const request = startCourseGradeMode.indexOf('requestShellChromeCollapsed(true)');
  const occurrenceReturn = startCourseGradeMode.indexOf("state.pendingCourseGradeStudentId = '';");
  assert.ok(
    request >= 0 && occurrenceReturn > request,
    'the fullscreen request must run before the occurrence-mode early return',
  );
});

test('a successful grade save leaves fullscreen before returning to the planning tab', () => {
  const start = seatplan.indexOf('function handleCourseGradeSaveResult(');
  const end = seatplan.indexOf('function returnToPlanningAfterCourseGradeSave(', start);
  assert.ok(start >= 0 && end > start, 'handleCourseGradeSaveResult must exist');
  const handler = seatplan.slice(start, end);

  assert.match(
    handler,
    /if \(pendingModeSwitch\) \{[\s\S]*?return;\n\s*\}\n\s*requestShellChromeCollapsed\(false\);\n\s*returnToPlanningAfterCourseGradeSave\(/,
  );
  assert.equal(
    handler.split('requestShellChromeCollapsed(').length - 1,
    1,
    'neither the queued entry-mode switch nor a failed save may leave fullscreen',
  );
});

test('every other way out of the grade mode also leaves fullscreen', () => {
  // "Kursbindung lösen"
  assert.match(
    seatplan,
    /if \(isCourseGradeMode\(\)\) requestShellChromeCollapsed\(false\);\n\s*resetCourseGradeMode\(\);\n\s*gradeRosterSelectedCourseId = 0;/,
  );
  // A fresh course context that does not start a new grade mode
  assert.match(
    seatplan,
    /const wasCourseGradeMode = isCourseGradeMode\(\);\n\s*resetCourseGradeMode\(\);/,
  );
  assert.match(
    seatplan,
    /if \(wasCourseGradeMode && !isCourseGradeMode\(\)\) requestShellChromeCollapsed\(false\);/,
  );
  // Returning to the seatplan tab discards the grade mode
  assert.match(
    seatplan,
    /if \(isCourseGradeMode\(\) && !preserveCourseGradeMode\) \{[\s\S]*?requestShellChromeCollapsed\(false\);\n\s*resetCourseGradeMode\(\);/,
  );
  // Leaving the seatplan tab while the grade mode is still open
  assert.match(
    seatplan,
    /\} else \{\n\s*if \(seatplanTabWasActive && isCourseGradeMode\(\)\) \{\n\s*requestShellChromeCollapsed\(false\);\n\s*\}\n\s*seatplanTabWasActive = false;/,
  );
});

test('the shell honours seatplan chrome requests only from the seatplan frame, and only collapses on the seatplan tab', () => {
  assert.match(main, /const SEATPLAN_CHROME_REQUEST_EVENT = 'classroom:seatplan-chrome-request';/);

  const start = main.indexOf('if (data.type === SEATPLAN_CHROME_REQUEST_EVENT) {');
  assert.ok(start >= 0, 'the shell must handle the seatplan chrome request');
  const handler = main.slice(start, main.indexOf('\n      }', start));
  assert.match(handler, /if \(frame !== getSeatplanFrame\(\)\) return;/);
  assert.match(handler, /if \(!detail \|\| detail\.source !== 'iframe'\) return;/);
  assert.match(handler, /if \(collapsed && getActiveTab\(\) !== TAB_SEATPLAN\) return;/);
  assert.match(handler, /requestSeatplanChromeCollapsed\(collapsed\);/);
});

test('a chrome request waits out a running chrome transition without re-checking the tab', () => {
  const start = main.indexOf('const applyPendingSeatplanChrome = (attempt = 0) => {');
  const end = main.indexOf('const requestSeatplanChromeCollapsed', start);
  assert.ok(start >= 0 && end > start, 'the deferred chrome applier must exist');
  const scheduler = main.slice(start, end);

  assert.match(scheduler, /if \(getChromeTransitionState\(\) === 'idle'\) \{/);
  assert.match(scheduler, /setChromeCollapsed\(collapsed, \{ resetSidebarWidth: false \}\);/);
  assert.match(scheduler, /if \(attempt >= \d+\) \{/);
  assert.match(scheduler, /requestAnimationFrame\(\(\) => applyPendingSeatplanChrome\(attempt \+ 1\)\)/);
  assert.doesNotMatch(
    scheduler,
    /getActiveTab\(\)/,
    'the retry loop must not drop the request once the shell has switched to the planning tab',
  );
});

test('the automatic expand keeps the persisted sidebar width', () => {
  assert.match(shell, /function setChromeCollapsed\(collapsed, \{ resetSidebarWidth = true \} = \{\}\) \{/);
  assert.match(shell, /if \(resetSidebarWidth && !nextCollapsed && state\.chromeCollapsed\) \{/);
  assert.match(main, /const setChromeCollapsed = \(collapsed, options\) => shellController\?\.setChromeCollapsed\(collapsed, options\);/);
});

test('the grade picker follows the whole chrome collapse animation instead of one frame of it', () => {
  assert.match(
    seatplan,
    /const shellCollapsedChanged = document\.documentElement\.dataset\.shellCollapsed !== nextShellCollapsed;[\s\S]*?scheduleCourseGradePickerPosition\(shellCollapsedChanged \? \{ requireStable: true \} : \{\}\);/,
  );
});
