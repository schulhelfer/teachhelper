import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [runtimeSource, mainSource, serviceWorkerSource, auditSource] = await Promise.all([
  read('../src/app/app-runtime.js'),
  read('../src/main.js'),
  read('../sw.js'),
  read('../scripts/audit.py'),
]);

function createLifecycleHarness() {
  const factorySource = runtimeSource.slice(runtimeSource.indexOf('export function createAppRuntime'))
    .replace('export function createAppRuntime', 'function createAppRuntime');
  const calls = [];
  const load = new Function('calls', `
    const initializeApplication = ({ documentRef, registerCleanup }) => {
      calls.push('initialize');
      if (!documentRef?.hasApp) return false;
      registerCleanup(() => calls.push('cleanup-first'));
      registerCleanup(() => calls.push('cleanup-second'));
      return true;
    };
    ${factorySource}
    return createAppRuntime;
  `);
  return { calls, createAppRuntime: load(calls) };
}

test('startet eine Runtime nur einmal und räumt registrierte Ressourcen idempotent auf', () => {
  const { calls, createAppRuntime } = createLifecycleHarness();
  const runtime = createAppRuntime({ documentRef: { hasApp: true }, view: {}, appVersion: 'test' });
  assert.equal(runtime.start(), true);
  assert.equal(runtime.start(), false);
  assert.deepEqual(calls, ['initialize']);
  runtime.dispose();
  runtime.dispose();
  assert.deepEqual(calls, ['initialize', 'cleanup-second', 'cleanup-first']);
  assert.equal(runtime.start(), false);
});

test('behandelt einen fehlenden App-Root als einmaligen erfolglosen Start', () => {
  const { calls, createAppRuntime } = createLifecycleHarness();
  const runtime = createAppRuntime({ documentRef: {}, view: {}, appVersion: 'test' });
  assert.equal(runtime.start(), false);
  assert.equal(runtime.start(), false);
  assert.deepEqual(calls, ['initialize']);
  runtime.dispose();
  assert.deepEqual(calls, ['initialize']);
});

test('bindet Runtime-Lifecycle und bestehende Controller-Cleanups ohne BFCache-Abbau', () => {
  assert.match(runtimeSource, /if \(!appEl\) \{\s*return false;/);
  assert.match(runtimeSource, /bindRuntime\(window, 'pagehide', \(event\) => \{\s*if \(event\.persisted !== true\) disposeRuntime\(\);/);
  assert.match(runtimeSource, /const runtimeTimeouts = new Set\(\);[\s\S]*?runtimeTimeouts\.forEach\(\(timeoutId\) => window\.clearTimeout\(timeoutId\)\)/);
  assert.match(runtimeSource, /const runtimeFrames = new Set\(\);[\s\S]*?runtimeFrames\.forEach\(\(frameId\) => window\.cancelAnimationFrame\?\.\(frameId\)\)/);
  for (const expression of [
    'themeController.dispose()',
    'appTooltips?.dispose?.()',
    'courseContext?.dispose?.()',
    'moduleMessageRouter?.dispose?.()',
    'classroomState?.dispose?.()',
    'gradeRosterCoordinator?.dispose?.()',
    'groupsController?.dispose?.()',
    'randomPickerController?.dispose?.()',
    'workPhaseController?.dispose?.()',
    'firstRunTutorial?.finish?.()',
  ]) {
    assert.ok(runtimeSource.includes(expression), `${expression} must be owned by the runtime cleanup`);
  }
  assert.equal((runtimeSource.match(/mountGroups\(\{/g) || []).length, 1);
  assert.equal((runtimeSource.match(/mountRandomPicker\(\{/g) || []).length, 1);
  assert.equal((runtimeSource.match(/mountWorkPhase\(\{/g) || []).length, 1);
});

test('hält main als schlanken Entry-Point und die Runtime offline verfügbar', () => {
  assert.match(mainSource, /^import \{ createAppRuntime \} from '\.\/app\/app-runtime\.js';/);
  assert.equal((mainSource.match(/^import /gm) || []).length, 1);
  assert.equal((mainSource.match(/createAppRuntime\(\{/g) || []).length, 1);
  assert.equal((mainSource.match(/appRuntime\.start\(\)/g) || []).length, 1);
  assert.doesNotMatch(mainSource, /mountGroups|mountRandomPicker|mountWorkPhase|addEventListener|createModuleMessageRouter/);
  assert.match(serviceWorkerSource, /'\.\/src\/app\/app-runtime\.js'/);
  assert.match(auditSource, /ROOT \/ 'src' \/ 'app' \/ 'app-runtime\.js'/);
  assert.match(auditSource, /unsandboxed_module_frame_allowed_paths = \{\s*bridge_path,\s*app_runtime_path,/);
});
