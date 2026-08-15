import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  tutorialSource,
  mainSource,
  planningSource,
  planningBridgeSource,
  gradesSource,
  gradesBridgeSource,
  seatplanSource,
  duplicateSource,
  qrSource,
  frameBridgeSource,
] = await Promise.all([
  readFile(new URL('../src/app/first-run-tutorial.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/duplicate-check/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/qr/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/module-frame-bridge.js', import.meta.url), 'utf8'),
]);

test('automatic tutorial demos replace the step set and retain their cleanup', () => {
  assert.match(tutorialSource, /const activateDemoDefinition = \(definition\) => \{/);
  assert.match(tutorialSource, /setStepSet\(result\.steps \|\| definition\.demo\.steps \|\| definition\.steps\)/);
  assert.match(tutorialSource, /if \(contextualDefinition\.demo\.auto\) \{\s+activateDemoDefinition\(contextualDefinition\)/);
});

test('grades tutorial commands reach the grades tutorial presentation', () => {
  assert.match(gradesBridgeSource, /function withGradesTutorialApi\(callback, attempt = 0\)/);
  assert.match(gradesBridgeSource, /window\.__teachhelperGradesTutorial \|\| null/);
  assert.doesNotMatch(gradesBridgeSource, /__teachhelperPlanningTutorial/);
  assert.match(gradesBridgeSource, /withGradesTutorialApi\(\(api\) => api\.showSurface\?\.\(/);
});

test('planning tutorial commands reach the planning tutorial presentation', () => {
  assert.match(planningBridgeSource, /TUTORIAL_COMMAND_EVENT = 'classroom:planning-tutorial-command'/);
  assert.match(planningBridgeSource, /function withPlanningTutorialApi\(callback, attempt = 0\)/);
  assert.match(planningBridgeSource, /window\.__teachhelperPlanningTutorial \|\| null/);
  assert.match(planningBridgeSource, /withPlanningTutorialApi\(\(api\) => api\.showSurface\?\.\(/);
});

test('data-bearing module tutorials use automatic isolated examples', () => {
  [
    'activateGradesTutorialDemo',
    'activatePlanningTutorialDemo',
    'activateSeatplanTutorialDemo',
    'activateClassroomTutorialDemo\\(TAB_GROUPS\\)',
    'activateClassroomTutorialDemo\\(TAB_RANDOM_PICKER\\)',
    'activateWorkPhaseTutorialDemo',
  ].forEach((activation) => {
    assert.match(
      mainSource,
      new RegExp(`activate:\\s*(?:\\(\\) => )?${activation}[\\s\\S]{0,80}?auto:\\s*true`)
    );
  });
});

test('isolated frames restore the original module frames on cleanup', () => {
  assert.match(mainSource, /demoUrl\.searchParams\.set\('tutorial-demo', 'planning'\)/);
  assert.match(mainSource, /demoUrl\.searchParams\.set\('tutorial-demo', 'grades'\)/);
  assert.match(mainSource, /demoUrl\.searchParams\.set\('tutorial-demo', 'seatplan'\)/);
  assert.match(mainSource, /seatplanTutorialDemoFrame\?\.remove\(\)/);
  assert.match(mainSource, /realFrame\.hidden = realFrameWasHidden/);
  assert.match(mainSource, /realFrame\.style\.display = realFrameDisplay/);
});

test('seatplan tutorial data cannot sync back to the real roster', () => {
  assert.match(seatplanSource, /const TUTORIAL_DEMO_MODE = new URLSearchParams\(window\.location\.search\)/);
  assert.match(seatplanSource, /state\.csvName = 'Tutorial-Beispielklasse'/);
  assert.match(
    seatplanSource,
    /function publishStudentsUpdatedFromSeatplan\(\) \{\s+if \(TUTORIAL_DEMO_MODE \|\|/
  );
  assert.match(
    seatplanSource,
    /function requestGradeRosterCourses\([^)]*\) \{\s+if \(TUTORIAL_DEMO_MODE \|\|/
  );
});

test('planning and grades demos cannot overwrite real sync metadata', () => {
  for (const source of [planningSource, gradesSource]) {
    assert.match(source, /if \(TUTORIAL_DEMO_MODE \|\| typeof window === "undefined"/);
    assert.match(source, /getParentWorkspaceController\(\)[\s\S]{0,180}?createWorkspaceController\(\{[\s\S]{0,120}?ephemeral: Boolean\(this\.tutorialDemoMode\)/);
  }
});

test('tutorial workspaces disable persistent handle hydration', () => {
  for (const source of [planningSource, gradesSource]) {
    assert.match(source, /ephemeral: Boolean\(this\.tutorialDemoMode\)/);
  }
});

test('grades demo seeds learners, a persisted structure, and an assigned assessment', () => {
  assert.match(gradesSource, /store\.replaceGradeStudentsForCourse\(courseId, \[/);
  assert.match(
    gradesSource,
    /store\.saveGradeStructure\(\s*courseId,\s*store\.getDefaultGradeStructure\(\)\.periodCategories\s*\)/
  );
  assert.match(gradesSource, /categoryId: category\?\.id,\s+subcategoryId: subcategory\?\.id/);
});

test('work phase tutorial restores the complete previous timer snapshot', () => {
  assert.match(mainSource, /const previousTimerState = SharedTimerStore\.getState\(\)/);
  assert.match(mainSource, /replaceTimerState\(previousTimerState\)/);
  assert.match(mainSource, /if \(previousTimerState\.alarmState\) \{\s+updateWorkOrderAlert\(true\)/);
});

test('groups and picker restore both the visible roster and the shared roster store', () => {
  assert.match(mainSource, /const previousRosterState = SharedRosterStore\.getState\(\)/);
  assert.match(
    mainSource,
    /SharedRosterStore\.replace\(previousRosterState\);\s+classroomTutorialDemoActive = false;\s+state = realClassroomState;/
  );
  assert.match(mainSource, /if \(classroomTutorialDemoActive\) return SharedRosterStore\.getState\(\)/);
});

test('duplicate check demo restores records, rules, and file summary', () => {
  assert.match(duplicateSource, /tutorialPreviousState = \{\s+records: lastRecords,/);
  assert.match(duplicateSource, /enabledRules: \{ \.\.\.enabledRules \}/);
  assert.match(duplicateSource, /lastRecords = previousState\?\.records \|\| \[\];/);
  assert.match(duplicateSource, /syncRuleButtons\(\);\s+setFileSummary\(/);
  assert.match(duplicateSource, /renderResultFromLastRecords\(\);/);
  assert.doesNotMatch(
    duplicateSource.slice(
      duplicateSource.indexOf('function activateTutorialDemo()'),
      duplicateSource.indexOf('function cleanupTutorialDemo()')
    ),
    /revokeRecordObjectUrls\(lastRecords\)/
  );
});

test('QR demo restores generated, decoded, and entered values after pending rendering', () => {
  assert.match(qrSource, /tutorialPreviousState = \{\s+generatedUrl,\s+decodedValue,/);
  assert.match(qrSource, /generatorInputValue: ui\.generatorLinkInput\?\.value \|\| ''/);
  assert.match(qrSource, /decoderFileSummaryName: ui\.decoderFileSummary\?\.textContent \|\| ''/);
  assert.match(qrSource, /generatedUrl = previousState\?\.generatedUrl \|\| '';/);
  assert.match(qrSource, /renderDecodedValue\(previousState\.decodedValue\);/);
  assert.match(qrSource, /Promise\.resolve\(pendingDemoRender\)[\s\S]*?drawQrToCanvas\(restoredGeneratedUrl\)/);
});

test('opaque tutorial module sandboxes stay isolated from the shell origin', () => {
  const duplicateSandbox = frameBridgeSource.match(/DUPLICATE_CHECK_MODULE_SANDBOX = '([^']+)'/)?.[1] || '';
  const qrSandbox = frameBridgeSource.match(/QR_MODULE_SANDBOX = '([^']+)'/)?.[1] || '';
  assert.ok(duplicateSandbox.includes('allow-scripts'));
  assert.ok(qrSandbox.includes('allow-scripts'));
  assert.ok(!duplicateSandbox.includes('allow-same-origin'));
  assert.ok(!qrSandbox.includes('allow-same-origin'));
});

test('the opaque duplicate-check frame uses one fresh revision without storage access in its document', async () => {
  const [duplicateIndex, duplicateHtml] = await Promise.all([
    readFile(new URL('../src/modules/duplicate-check/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/duplicate-check/app.html', import.meta.url), 'utf8'),
  ]);
  const revision = duplicateIndex.match(/DUPLICATE_CHECK_VERSION = '([^']+)'/)?.[1] || '';

  assert.equal(revision, 'duplicate-check-r5');
  assert.match(duplicateHtml, new RegExp(`app\\.css\\?v=${revision}`));
  assert.match(duplicateHtml, new RegExp(`app\\.js\\?v=${revision}`));
  assert.doesNotMatch(duplicateHtml, /(?:local|session)Storage/);
});
