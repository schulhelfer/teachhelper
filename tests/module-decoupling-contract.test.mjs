import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('grades has a self-contained document and no planning module dependency', async () => {
  const [html, app, bridge] = await Promise.all([
    read('../src/modules/grades/app.html'),
    read('../src/modules/grades/app.js'),
    read('../src/modules/grades/bridge.js'),
  ]);

  assert.match(html, /data-module-role="grades"/);
  assert.match(app, /class GradesApp/);
  assert.match(html, /id="grades-overview-panel"/);
  assert.match(html, /id="grades-entry-panel"/);
  assert.doesNotMatch(
    html,
    /id="(?:view-week|view-course|week-calendar-dialog|slot-dialog|free-range-dialog|special-day-dialog|topic-dialog|entfall-dialog)"/,
  );
  for (const source of [html, app, bridge]) {
    assert.doesNotMatch(source, /(?:\.\.\/planning|modules\/planning|planning\/app\.(?:html|js|css))/);
  }
  assert.doesNotMatch(app, /classroom:planning-/);
  assert.doesNotMatch(bridge, /classroom:planning-/);
  assert.doesNotMatch(app, /APP_MODULE_ROLE/);
});

test('grade document assets are owned by grades and use the shared OOXML engine', async () => {
  const app = await read('../src/modules/grades/app.js');
  assert.match(app, /shared\/docx-template\.js/);
  assert.match(app, /\.\/expectation-horizon-template\.docx/);
  assert.doesNotMatch(app, /expectation-horizon-template-gAeA\.docx/);
  assert.match(app, /\.\/competence-expectations-template\.docx/);
});

test('grade shell events are not aliases of planning events', async () => {
  const tabs = await read('../src/shell/tabs.js');
  assert.doesNotMatch(tabs, /GRADES_[A-Z0-9_]+\s*=\s*PLANNING_/);
  assert.doesNotMatch(tabs, /PLANNING_(?:GRADE|COURSE_GRADE|COURSE_SEATPLAN_SAVE)/);
});

test('planning contains no grade UI or grade document dependency', async () => {
  const [html, app, bridge] = await Promise.all([
    read('../src/modules/planning/app.html'),
    read('../src/modules/planning/app.js'),
    read('../src/modules/planning/bridge.js'),
  ]);
  assert.doesNotMatch(html, /id="(?:view-grades|grades-overview|grades-entry|grade-vault|course-students|course-structure)/);
  assert.doesNotMatch(app, /(?:docx-template|percentile-rank|\.docx)/i);
  assert.doesNotMatch(app, /(?:lesson-block|course)-grade-entry/);
  assert.doesNotMatch(app, /getWorkspaceOwnerApp|createWorkspaceSnapshot/);
  assert.match(app, /class PlanningApp/);
  assert.doesNotMatch(app, /APP_MODULE_ROLE/);
  assert.doesNotMatch(bridge, /classroom:planning-(?:grade|course-grade|course-seatplan-save)/);
  assert.doesNotMatch(app, /from "\.\.\/workspace\/store\.js"/);
});

test('workspace store is shared once and obsolete planning document assets are not cached', async () => {
  const [planning, grades, workspace, serviceWorker] = await Promise.all([
    read('../src/modules/planning/app.js'),
    read('../src/modules/grades/app.js'),
    read('../src/modules/workspace/store.js'),
    read('../sw.js'),
  ]);
  assert.match(workspace, /export class WorkspaceStore/);
  assert.doesNotMatch(workspace, /PlannerStore/);
  assert.doesNotMatch(planning, /class (?:Planner|Workspace)Store/);
  assert.doesNotMatch(grades, /class (?:Planner|Workspace)Store/);
  assert.doesNotMatch(serviceWorker, /modules\/planning\/(?:docx|percentile-rank|.*template\.docx)/);
});

test('grades controller has no planning module dependency or active planning render cycle', async () => {
  const [app, css, index] = await Promise.all([
    read('../src/modules/grades/app.js'),
    read('../src/modules/grades/app.css'),
    read('../src/modules/grades/index.js'),
  ]);
  assert.doesNotMatch(app, /(?:from|fetch\()[^\n]*(?:modules\/planning|planning\/app|planning-note-links)/);
  const renderAll = app.match(/\n  renderAll\(\{ visibleOnly = false \} = \{\}\) \{([\s\S]*?)\n  queueGradesReadySignal\(/)?.[1] || '';
  assert.doesNotMatch(renderAll, /render(?:SchoolYearSelect|WeekSection|CourseSection|SlotSection|LessonSection|DayOffSection|LessonTimesSection)/);
  assert.match(renderAll, /renderGradesView\(\)/);
  assert.doesNotMatch(css, /(?:\.week-|#week-|lesson-block|week-calendar|slot-dialog|free-range|special-day|entfall-dialog|settings-tab-dayoff|settings-tab-lesson-times|course-performance)/);
  assert.doesNotMatch(index, /PLANNING_MODULE_ALLOW/);
});

test('grades retains the interactive grade-structure and dirty-draft controllers', async () => {
  const app = await read('../src/modules/grades/app.js');
  assert.match(app, /\n  get activeSchoolYear\(\) \{[\s\S]*?this\.store\.getActiveSchoolYear\(\)/);
  assert.match(app, /\n  createGradeStructureCard\(\{/);
  assert.match(app, /\n  createGradeStructureAddSubcategoryButton\(/);
  assert.match(app, /\n  guardUnsavedGradesEntryNavigation\(\{/);
  assert.match(app, /\n  async resolveUnsavedGradesEntryNavigation\(\{/);
  assert.match(app, /\n  discardGradesEntryEditSession\(\)/);
  assert.doesNotMatch(app, /getSelectedWeekLessonTitle/);
});

test('planning and grades share the reduced sidebar width scope', async () => {
  const [planningHtml, gradesHtml, sidebarResize, shell] = await Promise.all([
    read('../src/modules/planning/app.html'),
    read('../src/modules/grades/app.html'),
    read('../src/shared/sidebar-resize.js'),
    read('../src/main.js'),
  ]);
  assert.match(planningHtml, /data-sidebar-width-scope="planning"/);
  assert.match(gradesHtml, /data-sidebar-width-scope="grades"/);
  assert.match(
    sidebarResize,
    /declaredScope === 'planning' \|\| declaredScope === 'grades'[\s\S]*?\? 'planning'/,
  );
  assert.match(sidebarResize, /scope === 'planning' \? 220 : DEFAULT_WIDTH/);
  assert.match(shell, /\[getPlanningFrame\(\), getGradesFrame\(\)\]/);
});

test('the workspace creates its store before a feature service can attach', async () => {
  const workspace = await read('../src/modules/workspace/index.js');
  assert.match(workspace, /let store = new WorkspaceStore\(\)/);
  assert.match(workspace, /serviceAttached/);
  assert.doesNotMatch(workspace, /store = nextStore/);
});

test('combined archive chrome is owned by the neutral workspace component', async () => {
  const [planningHtml, gradesHtml, components] = await Promise.all([
    read('../src/modules/planning/app.html'),
    read('../src/modules/grades/app.html'),
    read('../src/modules/workspace/components.js'),
  ]);
  assert.doesNotMatch(planningHtml, /id="archive-dialog"/);
  assert.doesNotMatch(gradesHtml, /id="archive-dialog"/);
  assert.match(components, /id="archive-dialog"/);
  assert.doesNotMatch(planningHtml, /id="settings-tab-database"/);
  assert.doesNotMatch(gradesHtml, /id="settings-tab-database"/);
  assert.match(components, /id="settings-tab-database"/);
});
