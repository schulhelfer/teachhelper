import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [tabs, main, gradesApp, gradesBridge, planningApp, planningBridge, seatplanApp, nameLearningApp] = await Promise.all([
  read('../src/shell/tabs.js'),
  read('../src/main.js'),
  read('../src/modules/grades/app.js'),
  read('../src/modules/grades/bridge.js'),
  read('../src/modules/planning/app.js'),
  read('../src/modules/planning/bridge.js'),
  read('../src/modules/seatplan/app.js'),
  read('../src/modules/name-learning/app.js'),
]);

test('the shell dismisses module context menus on outside clicks and Escape', () => {
  assert.match(tabs, /MODULE_CONTEXT_MENU_DISMISS_EVENT = 'classroom:module-context-menu-dismiss'/);
  assert.match(main, /const getModuleFrames = \(\) => \[[\s\S]*?getPlanningFrame\(\),[\s\S]*?getGradesFrame\(\),[\s\S]*?getSeatplanFrame\(\),[\s\S]*?getNameLearningFrame\(\),[\s\S]*?\]\.filter\(Boolean\)/);
  assert.match(main, /dismissModuleContextMenus = \(\) => \{[\s\S]*?getModuleFrames\(\)\.forEach[\s\S]*?type: MODULE_CONTEXT_MENU_DISMISS_EVENT/);
  assert.match(main, /addEventListener\('pointerdown', dismissModuleContextMenus, true\)/);
  assert.match(main, /if \(event\.key === 'Escape'\) dismissModuleContextMenus\(\)/);
});

test('every module with a context menu closes it on the shell dismiss event', () => {
  assert.match(gradesBridge, /CONTEXT_MENU_DISMISS_EVENT = 'classroom:module-context-menu-dismiss'/);
  assert.match(gradesBridge, /ALLOWED_PARENT_MESSAGE_TYPES = new Set\(\[[\s\S]*?CONTEXT_MENU_DISMISS_EVENT,[\s\S]*?\]\)/);
  assert.match(gradesBridge, /data\.type === CONTEXT_MENU_DISMISS_EVENT[\s\S]*?dispatchEvent\(new CustomEvent\(CONTEXT_MENU_DISMISS_EVENT\)\)/);
  assert.match(gradesApp, /addEventListener\("classroom:module-context-menu-dismiss", \(\) => \{[\s\S]*?this\.hideContextMenu\(\)/);

  assert.match(planningBridge, /CONTEXT_MENU_DISMISS_EVENT = 'classroom:module-context-menu-dismiss'/);
  assert.match(planningBridge, /incomingEvents = new Set\(\[[\s\S]*?CONTEXT_MENU_DISMISS_EVENT,[\s\S]*?\]\)/);
  assert.match(planningApp, /addEventListener\("classroom:module-context-menu-dismiss", \(\) => \{[\s\S]*?this\.hideContextMenu\(\)/);

  assert.match(nameLearningApp, /event\.data\.type === MODULE_CONTEXT_MENU_DISMISS_EVENT[\s\S]*?hideCourseContextMenu\(\)/);

  assert.match(seatplanApp, /ALLOWED_PARENT_MESSAGE_TYPES = new Set\(\[[\s\S]*?MODULE_CONTEXT_MENU_DISMISS_EVENT,[\s\S]*?\]\)/);
  assert.match(seatplanApp, /data\.type === MODULE_CONTEXT_MENU_DISMISS_EVENT[\s\S]*?closeGradeRosterImportMenu\(\)/);
});

test('the seatplan roster dropdown also closes on Escape inside the module', () => {
  assert.match(seatplanApp, /addEventListener\('keydown', \(event\) => \{[\s\S]*?event\.key !== 'Escape'[\s\S]*?closeGradeRosterImportMenu\(\)/);
});
