import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [main, groups, index, boundaries, serviceWorker] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/groups/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/groups/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/groups/BOUNDARIES.md', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);

test('main mounts Groups against shared state and shell orchestration through explicit adapters', () => {
  assert.match(main, /from '\.\/modules\/groups\/index\.js'/);
  assert.match(main, /groupsController = mountGroups\(\{/);
  assert.match(main, /getStudents: \(\) => state\.students/);
  assert.match(main, /getPerformanceFlairCount: \(\) => state\.performanceFlairCount/);
  assert.match(main, /setPerformanceFlairCount: \(value\) => \{\s+state\.performanceFlairCount = value;/);
  assert.match(main, /groupsController\?\.getPlanState\(\)/);
  assert.match(main, /groupsController\?\.restorePlanState\(data, \{ restoreSeatAssignments \}\)/);
  assert.match(main, /groupsController\?\.handleRosterReplacement\(\{ rebuildCapacity: true \}\)/);
});

test('the Groups module owns group state, rendering, interactions, suggestions, and layout', () => {
  for (const pattern of [
    /function createGroupsState\(/,
    /function buildGrid\(/,
    /function renderSeats\(/,
    /function refreshUnseated\(/,
    /function addDragHandlers\(/,
    /function enableTouchDragSource\(/,
    /function buildSeatPreferencesTable\(/,
    /async function assignWithPreferences\(/,
    /function applyBestFitGroupGridLayout\(/,
    /new view\.ResizeObserver\(/,
    /bindBackgroundDrop\(els\.groupsGrid\)/,
  ]) {
    assert.match(groups, pattern);
  }
  assert.doesNotMatch(main, /function (?:buildGrid|renderSeats|refreshUnseated|addDragHandlers|assignWithPreferences|applyBestFitGroupGridLayout)\(/);
  assert.doesNotMatch(main, /state\.(?:seats|activeSeats|activeSeatOrder|lockedSeats|seatTopics|gridRows|gridCols|minGroupSize|maxGroupSize)/);
});

test('the Groups public surface, boundaries, and offline cache are complete', () => {
  for (const symbol of [
    'mountGroups',
    'resolveGroupsDom',
    'clampPerformanceFlairCount',
    'normalizePerformanceFlair',
    'sanitizeSharedPerformanceFlair',
  ]) {
    assert.match(index, new RegExp(`\\b${symbol}\\b`));
  }
  for (const method of [
    'render',
    'handleRosterReplacement',
    'getPlanState',
    'restorePlanState',
    'renderPreferences',
    'savePreferences',
    'handlePreferencesChange',
    'handlePerformanceFlairCountChange',
    'dispose',
  ]) {
    assert.match(groups, new RegExp(`\\b${method}\\b`));
  }
  assert.match(boundaries, /Shared State in `main\.js`/);
  assert.match(boundaries, /Shell-Verantwortung in `main\.js`/);
  assert.match(serviceWorker, /'\.\/src\/modules\/groups\/index\.js'/);
  assert.match(serviceWorker, /'\.\/src\/modules\/groups\/app\.js'/);
});
