import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (path) => (
  await readFile(new URL(path, import.meta.url), 'utf8')
).replace(/\r\n/g, '\n');

const [tabs, shell, tabController, workspaceStatus, appBridge, gradesIndex, gradesBridge, gradesApp] = await Promise.all([
  read('../src/shell/tabs.js'),
  read('../src/app/shell.js'),
  read('../src/app/shell/tab-controller.js'),
  read('../src/app/shell/workspace-status.js'),
  read('../src/app/planning-seatplan-bridge.js'),
  read('../src/modules/grades/index.js'),
  read('../src/modules/grades/bridge.js'),
  read('../src/modules/grades/app.js'),
]);

test('leaving a dirty grades tab delegates to the grades three-way dialog', () => {
  assert.match(tabs, /GRADES_TAB_LEAVE_REQUEST_EVENT/);
  assert.match(tabs, /GRADES_TAB_LEAVE_RESULT_EVENT/);
  assert.match(shell, /onResolveGradesTabLeave/);
  assert.match(tabController, /workspaceStatus\?\.getLeaveGuard\?\.\(nextTab, options\)/);
  assert.match(shell, /onResolveGradesTabLeave: resolveGradesTabLeave,/);
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
  const start = workspaceStatus.indexOf('function getLeaveGuard');
  const end = workspaceStatus.indexOf('\n  function shouldPromptVaultUnlock', start);
  const method = workspaceStatus.slice(start, end);

  assert.match(method, /nextTab !== gradesTabTarget/);
  assert.match(method, /unsavedState\.gradesDirty \|\| unsavedState\.gradesSettingsDirty/);
  assert.ok(method.indexOf("return 'grades'") < method.indexOf('planningTargets.has(activeTab)'));
});

test('the three-way dialog also protects the transition from grades to planning', () => {
  const start = tabController.indexOf('function setActiveTab');
  const end = tabController.indexOf('\n  function setActiveTabImmediate', start);
  const method = tabController.slice(start, end);

  assert.match(method, /leaveGuard === 'grades' \|\| leaveGuard === 'planning'/);
});

test('the navigation flush never references a message payload outside its message handler', () => {
  const start = gradesBridge.indexOf('function flushNavigations');
  const end = gradesBridge.indexOf("\n\n  window.addEventListener('message'", start);
  const method = gradesBridge.slice(start, end);

  assert.ok(start >= 0 && end > start, 'navigation flush must be present');
  assert.doesNotMatch(method, /\bdata\b/);
});
