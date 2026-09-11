import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [main, shell, bridge, groups, randomPicker, workPhase] = await Promise.all([
  read('../src/app/app-runtime.js'),
  read('../src/app/shell.js'),
  read('../src/app/planning-seatplan-bridge.js'),
  read('../src/modules/groups/app.js'),
  read('../src/modules/random-picker/app.js'),
  read('../src/modules/work-phase/app.js'),
]);

function extractFunction(source, name) {
  const patterns = [
    `function ${name}(`,
    `const ${name} = (`,
  ];
  const start = patterns.map(pattern => source.indexOf(pattern)).find(index => index >= 0);
  assert.ok(Number.isInteger(start), `${name} must exist`);
  const parametersStart = source.indexOf('(', start);
  let parameterDepth = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    if (source[index] === ')') {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        parametersEnd = index;
        break;
      }
    }
  }
  assert.ok(parametersEnd > parametersStart, `${name} must have complete parameters`);
  const bodyStart = source.indexOf('{', parametersEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a complete body`);
}

test('viewport refreshes preserve immediate, iOS, and settled-frame timing', () => {
  const handler = extractFunction(main, 'handleViewportChange');
  assert.equal((handler.match(/groupsController\?\.refreshLayout\(\)/g) || []).length, 3);
  assert.equal((handler.match(/workPhaseController\?\.refreshLayout\(\)/g) || []).length, 3);
  assert.match(handler, /if \(isIOSDevice\) \{[\s\S]*?requestRuntimeFrame\(\(\) => \{/);
  assert.match(handler, /requestRuntimeFrame\(\(\) => \{\s*requestRuntimeFrame\(\(\) => \{/);
  assert.match(main, /bindRuntime\(window, 'resize', handleViewportChange\)/);
  assert.match(main, /bindRuntime\(window\.visualViewport, 'resize', handleViewportChange\)/);
});

test('tab and chrome transitions retain their distinct refresh boundaries', () => {
  const chrome = extractFunction(main, 'refreshChromeDependentLayouts');
  assert.match(chrome, /handleViewportChange\([^;]*\);/);
  assert.match(chrome, /randomPickerController\?\.refreshLayout\?\.\(\)/);
  assert.match(chrome, /groupsController\?\.refreshLayout\(\{ resetViewport: true \}\)/);
  const finalizeChrome = extractFunction(shell, 'finalizeChromeTransition');
  const setChrome = extractFunction(shell, 'setChromeCollapsed');
  const setActiveTab = extractFunction(shell, 'setActiveTab');
  assert.match(finalizeChrome, /refreshLayouts\(\)/);
  assert.equal((setChrome.match(/refreshLayouts\(\)/g) || []).length, 4);
  assert.equal((setActiveTab.match(/refreshLayouts\(\)/g) || []).length, 4);
  assert.match(setChrome, /queueChromeTransition\(\(\) => \{[\s\S]*?refreshLayouts\(\)/);
});

test('feature controllers keep their own layout settling responsibilities', () => {
  assert.match(groups, /scheduleBestFitGroupGridLayout\(\);[\s\S]*?\[48, 120, 240\]\.forEach/);
  assert.match(groups, /view\.requestAnimationFrame\(\(\) => \{\s*applyBestFitGroupGridLayout\(\)/);
  assert.match(randomPicker, /function refreshLayout\(\) \{[\s\S]*?refreshWheelWidth\(labels\)/);
  assert.match(workPhase, /const refreshLayout = \(\) => \{\s*updateMonitorAmpelSizing\(\);\s*positionHintOverlay\(\)/);
  assert.match(main, /syncChromeState\(\);\s*workPhaseController\?\.refreshLayout\(\)/);
  assert.match(bridge, /if \(activeTab === TAB_SEATPLAN\)[\s\S]*?setTimeout\(trigger, 520\)/);
  assert.match(bridge, /if \(isIOSDevice\) \{[\s\S]*?requestAnimationFrame\(trigger\)/);
});
