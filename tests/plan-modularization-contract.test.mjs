import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [main, format, persistence, groups, picker, workPhase, serviceWorker, audit] = await Promise.all([
  read('../src/app/app-runtime.js'),
  read('../src/app/plan-format.js'),
  read('../src/app/plan-persistence.js'),
  read('../src/modules/groups/app.js'),
  read('../src/modules/random-picker/app.js'),
  read('../src/modules/work-phase/app.js'),
  read('../sw.js'),
  read('../scripts/audit.py'),
]);

test('main delegates plan formatting and persistence without retaining old implementations', () => {
  assert.match(main, /from '\.\/plan-format\.js'/);
  assert.match(main, /from '\.\/plan-persistence\.js'/);
  assert.doesNotMatch(main, /function (?:stripJsonWarning|createPlanSnapshot|savePlanWithPicker|triggerPlanDownload|pickPlanFileWithPicker)\s*\(/);
  assert.match(main, /const plan = await loadPlan\(file\);\s*if \(handle\)/);
  assert.match(main, /applyPlan\(plan, \{ restoreSeatAssignments: true \}\)/);
  assert.match(main, /groupsController\?\.restorePlanState\(groupsPlanState, \{ restoreSeatAssignments \}\)/);
  assert.match(main, /workPhaseController\?\.restorePlanState\(workPhasePlanState\)/);
});

test('plan format is DOM-independent and feature modules remain unaware of the full format', () => {
  assert.doesNotMatch(format, /\b(?:document|window|Blob|FileReader|showOpenFilePicker|showSaveFilePicker)\b/);
  assert.doesNotMatch(format, /modules\/(?:groups|random-picker|work-phase)/);
  for (const featureSource of [groups, picker, workPhase]) {
    assert.doesNotMatch(featureSource, /plan-(?:format|persistence)\.js/);
  }
  assert.match(persistence, /from '\.\.\/shared\/file-io\.js'/);
  assert.match(persistence, /from '\.\/plan-format\.js'/);
});

test('plan modules are required offline app-shell assets', () => {
  assert.match(serviceWorker, /'\.\/src\/app\/plan-format\.js'/);
  assert.match(serviceWorker, /'\.\/src\/app\/plan-persistence\.js'/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'plan-format\.js'/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'plan-persistence\.js'/);
});
