import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [main, workPhase, index, serviceWorker] = await Promise.all([
  readFile(new URL('../src/app/app-runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/work-phase/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/work-phase/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);

test('main mounts Work Phase against shared services through explicit adapters', () => {
  assert.match(main, /from '\.\.\/modules\/work-phase\/index\.js'/);
  assert.match(main, /workPhaseController = mountWorkPhase\(\{/);
  assert.match(main, /timerStore: SharedTimerStore/);
  assert.match(main, /showMessage,\s+reportError: reportAppError/);
  assert.match(main, /workPhaseController\?\.getPlanState\(\)/);
  assert.match(main, /workPhaseController\?\.restorePlanState\(workPhasePlanState\)/);
  assert.match(main, /workPhaseController\?\.reset\(\)/);
  assert.match(main, /workPhaseController\?\.activateTutorialDemo\(\)/);
  assert.doesNotMatch(main, /state\.workOrder/);
});

test('the Work Phase module owns timer, alarm, monitor, audio, events, and layout', () => {
  for (const pattern of [
    /const updateWorkOrderCountdown = \(\) => \{/,
    /const triggerTimerVisualWarning = \(/,
    /const triggerWorkOrderBell = \(\) => \{/,
    /const startMeasurement = async \(\) => \{/,
    /const monitorLevel = \(\) => \{/,
    /const updateMonitorAmpelSizing = \(\) => \{/,
    /bind\(dom\.workOrderTextarea, 'input'/,
    /\[dom\.timerWorkOrderStart, dom\.workPhaseTimerStartCollapsed\][\s\S]{0,160}?bind\(button, 'click', startWorkOrderTimer\)/,
  ]) {
    assert.match(workPhase, pattern);
  }
  assert.doesNotMatch(main, /function (?:updateWorkOrderCountdown|triggerWorkOrderBell|renderWorkOrderTimerButtonsState)\(/);
  assert.doesNotMatch(main, /const MonitorModule =/);
  assert.doesNotMatch(workPhase, /createSharedTimerStore/);
});

test('the Work Phase public surface and offline cache include the extracted module', () => {
  assert.match(index, /mountWorkPhase/);
  assert.match(index, /resolveWorkPhaseDom/);
  for (const method of [
    'render',
    'refreshLayout',
    'positionHintOverlay',
    'setActive',
    'getPlanState',
    'restorePlanState',
    'reset',
    'activateTutorialDemo',
    'dispose',
  ]) {
    assert.match(workPhase, new RegExp(`\\b${method},`));
  }
  assert.match(serviceWorker, /'\.\/src\/modules\/work-phase\/index\.js'/);
  assert.match(serviceWorker, /'\.\/src\/modules\/work-phase\/app\.js'/);
});
