import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [tabs, shell, appBridge, gradesIndex, gradesBridge, gradesApp] = await Promise.all([
  readFile(new URL('../src/shell/tabs.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/planning-seatplan-bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('leaving a dirty grades tab delegates to the grades three-way dialog', () => {
  assert.match(tabs, /GRADES_TAB_LEAVE_REQUEST_EVENT/);
  assert.match(tabs, /GRADES_TAB_LEAVE_RESULT_EVENT/);
  assert.match(shell, /onResolveGradesTabLeave/);
  assert.match(shell, /shouldResolveGradesTabLeave\(nextTab, options\)/);
  assert.match(shell, /resolveGradesTabLeave\(\)/);
  assert.match(appBridge, /requestGradesTabLeaveConfirmation/);
  assert.match(appBridge, /requestTabLeave\(\{ requestId \}\)/);
  assert.match(gradesIndex, /requestTabLeave/);
  assert.match(gradesBridge, /TAB_LEAVE_REQUEST_EVENT/);
  assert.match(gradesBridge, /TAB_LEAVE_RESULT_EVENT/);
  assert.match(
    gradesBridge,
    /if \(data\.type === TAB_LEAVE_REQUEST_EVENT\) \{\s+window\.dispatchEvent\(new CustomEvent\(TAB_LEAVE_REQUEST_EVENT/,
  );
  assert.match(gradesApp, /classroom:grades-tab-leave-request/);
  assert.match(gradesApp, /resolveUnsavedGradesEntryNavigation\(\)/);
  assert.match(gradesApp, /classroom:grades-tab-leave-result/);
});

test('the shell delegates dirty grade entries and settings to the grades dialog', () => {
  const start = shell.indexOf('function shouldResolveGradesTabLeave');
  const end = shell.indexOf('\n  function showUnsavedTabLeaveDialog', start);
  const method = shell.slice(start, end);

  assert.match(method, /unsaved\.gradesDirty \|\| unsaved\.gradesSettingsDirty/);
  assert.doesNotMatch(method, /isPlanningTab\(nextTab\)/);
});

test('the three-way dialog also protects the transition from grades to planning', () => {
  const start = shell.indexOf('function setActiveTab');
  const end = shell.indexOf('\n  function setActiveTabImmediate', start);
  const method = shell.slice(start, end);

  assert.match(method, /if \(shouldResolveGradesTabLeave\(nextTab, options\)\) \{/);
  assert.match(method, /if \(shouldConfirmPlanningTabLeave\(nextTab, options\)\) \{/);
});

test('the navigation flush never references a message payload outside its message handler', () => {
  const start = gradesBridge.indexOf('function flushNavigations');
  const end = gradesBridge.indexOf("\n\n  window.addEventListener('message'", start);
  const method = gradesBridge.slice(start, end);

  assert.ok(start >= 0 && end > start, 'navigation flush must be present');
  assert.doesNotMatch(method, /\bdata\b/);
});
