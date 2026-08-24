import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [
  tabs,
  main,
  shell,
  planningApp,
  planningBridge,
  planningIndex,
  gradesApp,
  gradesBridge,
  gradesIndex,
] = await Promise.all([
  read('../src/shell/tabs.js'),
  read('../src/main.js'),
  read('../src/app/shell.js'),
  read('../src/modules/planning/app.js'),
  read('../src/modules/planning/bridge.js'),
  read('../src/modules/planning/index.js'),
  read('../src/modules/grades/app.js'),
  read('../src/modules/grades/bridge.js'),
  read('../src/modules/grades/index.js'),
]);

test('both modules own a course context event without aliasing the other module', () => {
  assert.match(tabs, /PLANNING_COURSE_CONTEXT_EVENT = 'classroom:planning-course-context'/);
  assert.match(tabs, /GRADES_COURSE_CONTEXT_EVENT = 'classroom:grades-course-context'/);
  assert.doesNotMatch(planningApp, /classroom:grades-course-context/);
  assert.doesNotMatch(gradesApp, /classroom:planning-course-context/);
});

test('an explicit course pick in planning is reported to the shell', () => {
  assert.match(planningApp, /notifyParentCourseContext\(courseId, courseViewOpen = true\) \{[\s\S]*?type: "classroom:planning-course-context"/);
  const notifyCalls = planningApp.match(/this\.notifyParentCourseContext\(/g) || [];
  assert.equal(notifyCalls.length, 6);
  assert.match(planningApp, /this\.selectedCourseId = courseId;\s*this\.notifyParentCourseContext\(courseId\);\s*await this\.switchView\("course"\)/);
  assert.match(planningApp, /this\.selectedCourseId = courseId;\s*this\.notifyParentCourseContext\(courseId, this\.currentView === "course"\);\s*this\.openCourseContextMenu\(/);
  assert.match(planningBridge, /COURSE_CONTEXT_EVENT = 'classroom:planning-course-context'/);
  assert.match(planningBridge, /outgoingEvents = new Set\(\[[\s\S]*?COURSE_CONTEXT_EVENT,[\s\S]*?\]\)/);
  assert.match(planningIndex, /FORWARDED_FRAME_EVENTS = new Set\(\[[\s\S]*?PLANNING_COURSE_CONTEXT_EVENT,[\s\S]*?\]\)/);
});

test('planning reports whether its course view is still open', () => {
  assert.match(planningApp, /detail: \{\s*courseId: normalizedCourseId,\s*courseViewOpen: normalizedCourseViewOpen,/);
  assert.match(
    planningApp,
    /const courseViewCourseId = viewName === "course" \? Number\(this\.selectedCourseId \|\| 0\) : 0;\s*this\.notifyParentCourseContext\(courseViewCourseId, courseViewCourseId > 0\);/,
  );
});

test('an explicit course pick in grades is reported to the shell', () => {
  assert.match(gradesApp, /notifyParentCourseContext\(courseId\) \{[\s\S]*?type: "classroom:grades-course-context"/);
  assert.match(
    gradesApp,
    /this\.selectedCourseId = normalizedCourseId;\s*if \(options\.shareCourseContext !== false\) \{\s*this\.notifyParentCourseContext\(normalizedCourseId\);/,
  );
  assert.match(gradesApp, /this\.selectedCourseId = nextCourseId;\s*this\.notifyParentCourseContext\(nextCourseId\)/);
  assert.match(gradesBridge, /COURSE_CONTEXT_EVENT = 'classroom:grades-course-context'/);
  assert.match(gradesBridge, /window\.addEventListener\(COURSE_CONTEXT_EVENT[\s\S]*?postMessage\(\{ type: COURSE_CONTEXT_EVENT/);
  assert.match(gradesIndex, /\[GRADES_COURSE_CONTEXT_EVENT, GRADES_COURSE_CONTEXT_EVENT\]/);
});

test('the shell remembers the last course and pushes it before the tab transition starts', () => {
  assert.match(main, /window\.addEventListener\(PLANNING_COURSE_CONTEXT_EVENT, rememberSharedCourseContext\)/);
  assert.match(main, /window\.addEventListener\(GRADES_COURSE_CONTEXT_EVENT, rememberSharedCourseContext\)/);
  assert.match(
    main,
    /function applySharedCourseContext\(nextTab\) \{[\s\S]*?nextTab === TAB_GRADES[\s\S]*?dispatchGradesNavigation\?\.\([\s\S]*?courseId: planningCourseViewCourseId,\s*source: 'course-context'/,
  );
  assert.match(
    main,
    /function applySharedCourseContext\(nextTab\) \{[\s\S]*?nextTab === TAB_PLANNING && sharedCourseContextId[\s\S]*?dispatchPlanningViewRequest\?\.\(\{[\s\S]*?view: 'course'[\s\S]*?source: 'course-context'/,
  );
  assert.match(main, /onTabActivating: \(tab\) => applySharedCourseContext\(tab\)/);
  assert.match(
    shell,
    /if \(shouldPromptGradeVaultUnlockOnGradesNavigation\(nextTab\)\) \{[\s\S]*?\}\s*if \(nextTab !== state\.activeTab\) \{\s*notifyTabActivating\(nextTab, state\.activeTab\);/,
  );
  assert.match(
    shell,
    /function setActiveTabImmediate\(tab, options = \{\}\) \{\s*const nextTab = normalizeTab\(tab\);\s*if \(nextTab !== state\.activeTab\) \{\s*notifyTabActivating\(/,
  );
});

test('a tab switch never opens the vault or the unsaved entry dialog to adopt a course', () => {
  const guard = gradesApp.match(/\n  prepareSharedCourseContextNavigation\(navigation\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(guard, /contextCourseId === Number\(this\.selectedCourseId \|\| 0\)/);
  assert.match(guard, /this\.locked/);
  assert.match(guard, /this\.currentView === "settings"/);
  assert.match(guard, /this\.gradesEntryDraftDirty/);
  assert.match(guard, /!this\.courseAllowsGrades\(course\)/);
  assert.match(guard, /navigation\.subview = this\.normalizeGradesSubView\(this\.gradesSubView\)/);
  assert.doesNotMatch(guard, /openGradeVaultDialog/);
  assert.match(
    gradesApp,
    /navigation\.source === "course-context" && !this\.prepareSharedCourseContextNavigation\(navigation\)/,
  );
});

test('a course adopted while the vault is locked is applied after the unlock', () => {
  const guard = gradesApp.match(/\n  prepareSharedCourseContextNavigation\(navigation\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(
    guard,
    /if \(!this\.canAccessGradeVault\(\)\) \{[\s\S]*?canReplaceGradeVaultContinuationWithCourseContext\(\)[\s\S]*?type: "course-context"[\s\S]*?return false;/,
  );
  assert.match(gradesApp, /if \(type === "grades-navigation" \|\| type === "course-context"\)/);
  assert.match(
    gradesApp,
    /if \(action\.type === "grades-navigation" \|\| action\.type === "course-context"\) \{\s*void this\.navigateGrades\(action\.detail\)/,
  );
});

test('the shared course beats a plain restore but yields to lesson bound work', () => {
  const replace = gradesApp.match(/\n  canReplaceGradeVaultContinuationWithCourseContext\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(replace, /if \(!pending\) \{\s*return true;/);
  assert.match(replace, /pending\.type !== "grades-navigation" && pending\.type !== "course-context"[\s\S]*?return false;/);
  assert.match(replace, /!Number\(detail\.lessonId \|\| 0\)/);
  assert.match(replace, /!Number\(detail\.assessmentId \|\| 0\)/);
  assert.match(replace, /detail\.action !== "seatplan"/);

  const startupPrompt = gradesApp.match(/\n  promptGradeVaultUnlockForInitialCourse\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(
    startupPrompt,
    /if \(!this\.pendingGradeVaultContinuation\) \{\s*this\.queueGradeVaultContinuation\(/,
  );
  assert.match(startupPrompt, /this\.openGradeVaultDialog\("unlock"\)/);
});

test('cancelling the unlock after a tab switch does not bounce the user back to planning', () => {
  // Der Rücksprung hängt am Typ "grades-navigation"; ein Kurskontext nutzt bewusst einen
  // eigenen Typ, damit ein abgebrochenes Entsperren den Tab nicht wechselt.
  const close = gradesApp.match(/\n  closeGradeVaultDialog\(\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(close, /cancelledLockedGradesNavigation = continuation\?\.type === "grades-navigation"/);
  assert.doesNotMatch(close, /continuation\?\.type === "course-context"/);
});

test('adopting a course keeps the entry view on that course instead of the timetable course', () => {
  assert.match(gradesApp, /navigation\.autoSelectCourse = false/);
  assert.match(
    gradesApp,
    /this\.pendingGradesEntryCourseAutoSelect = options\.autoSelectCourse !== false/,
  );
  assert.match(
    gradesApp,
    /switchGradesSubView\("entry", \{\s*commit: false,\s*resetEntry: true,\s*autoSelectCourse: navigation\.autoSelectCourse\s*\}\)/,
  );
});

test('planning adopts a shared course only from a course context request', () => {
  const handler = planningApp.match(/window\.addEventListener\("classroom:planning-view-request", async \(event\) => \{([\s\S]*?)\n      \}\);/)?.[1] || '';
  assert.match(handler, /detail\?\.source === "course-context"/);
  assert.match(handler, /contextCourseId === Number\(this\.selectedCourseId \|\| 0\)/);
  assert.match(handler, /this\.currentView === "settings"/);
  assert.match(handler, /this\.selectedCourseId = contextCourseId/);
  assert.match(handler, /this\.selectedCourseId = contextCourseId;\s*\}\s*await this\.switchView\(requestedView\)/);
});
