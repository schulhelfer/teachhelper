import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [shell, tabController, runtime, serviceWorker, audit] = await Promise.all([
  read('../src/app/shell.js'),
  read('../src/app/shell/tab-controller.js'),
  read('../src/app/app-runtime.js'),
  read('../sw.js'),
  read('../scripts/audit.py'),
]);

test('shell composes and delegates tab activation through the tab controller', () => {
  assert.match(shell, /import \{ createTabController \} from '\.\/shell\/tab-controller\.js';/);
  assert.equal((shell.match(/createTabController\(\{/g) || []).length, 1);
  assert.match(shell, /getActiveTab,/);
  assert.match(shell, /getTabTransitionState,/);
  assert.match(shell, /renderTabs: \(\) => tabController\.render\(\),/);
  assert.match(shell, /setActiveTab: \(tab, options\) => tabController\.setActiveTab\(tab, options\),/);
  assert.match(shell, /setActiveTabImmediate: \(tab, options\) => tabController\.setActiveTabImmediate\(tab, options\),/);
  assert.match(shell, /registerCleanup\(\(\) => tabController\.dispose\(\)\);/);
  assert.doesNotMatch(shell, /function (?:finishTabTransition|collectRenderedTabRegions|clearTabTransitionTimer)\(/);
  assert.doesNotMatch(shell, /tab-switch-enter|tab-switch-leave|is-tab-switching/);
  assert.doesNotMatch(shell, /state\.(?:tabTransitionState|tabTransitionTimer|pendingTabTransitionTarget)/);
});

test('tab controller owns state, guards, rendering, transitions and cleanup', () => {
  assert.match(tabController, /export function createTabController\(\{/);
  assert.match(tabController, /let activeTab = initialActiveTab;/);
  assert.match(tabController, /let transitionState = 'idle';/);
  assert.match(tabController, /let pendingTransitionTarget = null;/);
  assert.match(tabController, /function render\(\) \{/);
  assert.match(tabController, /function setActiveTab\(tab, options = \{\}\) \{/);
  assert.match(tabController, /function setActiveTabImmediate\(tab, options = \{\}\) \{/);
  assert.match(tabController, /workspaceStatus\?\.getLeaveGuard\?\.\(nextTab, options\)/);
  assert.match(tabController, /pendingTransitionTarget = nextTab;/);
  assert.match(tabController, /onEnsureTabInitialized\(activeTab\);/);
  assert.match(tabController, /tabNavLayout\?\.syncAfterTabRender\?\.\(\);/);
  assert.match(tabController, /function dispose\(\) \{/);
  assert.match(tabController, /scheduledFrames\.forEach/);
  assert.match(tabController, /scheduledTimers\.forEach/);
  assert.doesNotMatch(tabController, /src\/modules|modules\/planning|modules\/grades/);
});

test('runtime state and offline contracts include the extracted tab controller', () => {
  const shellState = runtime.slice(
    runtime.indexOf('const shellState = {'),
    runtime.indexOf('\n  let bridgeController', runtime.indexOf('const shellState = {')),
  );
  assert.match(shellState, /activeTab: TAB_PLANNING/);
  assert.doesNotMatch(shellState, /tabTransitionState|tabTransitionTimer|pendingTabTransitionTarget/);
  assert.match(serviceWorker, /'\.\/src\/app\/shell\/tab-controller\.js'/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'shell' \/ 'tab-controller\.js'/);
});
