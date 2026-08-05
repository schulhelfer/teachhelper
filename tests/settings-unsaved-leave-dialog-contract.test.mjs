import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [tabs, shell, bridge, planningIndex, planningBridge, planningApp, planningHtml, gradesApp] = await Promise.all([
  readFile(new URL('../src/shell/tabs.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/planning-seatplan-bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

for (const [name, source] of [['Planung', planningApp], ['Noten', gradesApp]]) {
  test(`${name} resolves a dirty settings draft with the three-way dialog`, () => {
    assert.match(source, /async resolveUnsavedSettingsNavigation\(\)/);
    assert.match(source, /title: "Ungespeicherte Änderungen"/);
    assert.match(source, /alternateText: "Verwerfen & Wechseln"/);
    assert.match(source, /choice === "ok"[\s\S]*?applySettingsDraftToStore\(\)/);
    assert.match(source, /choice === "discard"[\s\S]*?cancelSettingsDraftChanges\(\)/);
  });
}

test('the grades view switch also resolves a dirty settings draft before leaving settings', () => {
  const methodStart = gradesApp.indexOf('\n  switchView(viewName)');
  const methodEnd = gradesApp.indexOf('\n  renderViewState()', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart, 'grades switchView method must exist');
  const method = gradesApp.slice(methodStart, methodEnd);

  assert.match(method, /this\.currentView === "settings"/);
  assert.match(method, /this\.settingsDirty/);
  assert.match(method, /this\.resolveUnsavedSettingsNavigation\(\)/);
});

test('the planning view switch resolves a dirty settings draft before leaving settings', () => {
  const methodStart = planningApp.indexOf('\n  async switchView(viewName)');
  const methodEnd = planningApp.indexOf('\n  renderViewState()', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart, 'planning switchView method must exist');
  const method = planningApp.slice(methodStart, methodEnd);

  assert.match(method, /viewName !== "settings"/);
  assert.match(method, /await this\.resolveUnsavedSettingsNavigation\(\)/);
});

test('planning exposes the same discard action and tab-leave round trip as grades', () => {
  assert.match(planningHtml, /id="message-dialog-cancel-top"[^>]*>❌<\/button>[\s\S]*id="message-dialog-ok-top"[^>]*>💾<\/button>[\s\S]*id="message-dialog-discard-top"[^>]*>🗑️<\/button>/);
  assert.match(planningApp, /showChoiceMessage\(message, options = \{\}\)/);
  assert.match(planningApp, /classroom:planning-tab-leave-request/);
  assert.match(planningApp, /classroom:planning-tab-leave-result/);
  assert.match(tabs, /PLANNING_TAB_LEAVE_REQUEST_EVENT/);
  assert.match(tabs, /PLANNING_TAB_LEAVE_RESULT_EVENT/);
  assert.match(planningIndex, /requestTabLeave/);
  assert.match(planningBridge, /TAB_LEAVE_REQUEST_EVENT/);
  assert.match(planningBridge, /TAB_LEAVE_RESULT_EVENT/);
  assert.match(bridge, /requestPlanningTabLeaveConfirmation/);
  assert.match(shell, /onResolvePlanningTabLeave/);
  assert.match(shell, /resolvePlanningTabLeave\(\)/);
});

test('the shell routes settings drafts to their active module instead of its generic leave dialog', () => {
  const planningStart = shell.indexOf('function shouldConfirmPlanningTabLeave');
  const gradesStart = shell.indexOf('function shouldResolveGradesTabLeave');
  const genericStart = shell.indexOf('function showUnsavedTabLeaveDialog');
  const planningMethod = shell.slice(planningStart, gradesStart);
  const gradesMethod = shell.slice(gradesStart, genericStart);

  assert.match(planningMethod, /planningSettingsDirty/);
  assert.match(gradesMethod, /gradesSettingsDirty/);
  assert.match(shell, /Promise\.resolve\(resolvePlanningTabLeave\(\)\)/);
});
