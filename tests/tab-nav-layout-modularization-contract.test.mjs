import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [shell, tabController, tabNavLayout, runtime, serviceWorker, audit] = await Promise.all([
  read('../src/app/shell.js'),
  read('../src/app/shell/tab-controller.js'),
  read('../src/app/shell/tab-nav-layout.js'),
  read('../src/app/app-runtime.js'),
  read('../sw.js'),
  read('../scripts/audit.py'),
]);

test('shell composes responsive tab layout with delegated tab activation', () => {
  assert.match(shell, /import \{\s+createTabNavLayoutController,\s+fitTabNavItems,\s+\} from '\.\/shell\/tab-nav-layout\.js';/);
  assert.match(shell, /export \{ fitTabNavItems \};/);
  assert.equal((shell.match(/createTabNavLayoutController\(\{/g) || []).length, 1);
  assert.match(shell, /getActiveTab,/);
  assert.match(shell, /getTabTransitionState,/);
  assert.match(shell, /onTabRequest: \(tabTarget\) => \{[\s\S]*?originalTabButton\?\.click\(\);/);
  assert.match(tabController, /tabNavLayout\?\.syncAfterTabRender\?\.\(\);/);
  assert.match(tabController, /function setActiveTab\(tab, options = \{\}\) \{/);
  assert.match(tabController, /function finishTabTransition\(options = \{\}\) \{/);
  assert.doesNotMatch(shell, /function (?:measureFit|applyOverflow|handleViewportResize|positionActiveIndicator)\(/);
  assert.doesNotMatch(shell, /data-tab-overflow|is-viewport-resizing|visualViewport/);
});

test('tab layout controller owns overflow, menu, indicator, viewport and cleanup', () => {
  assert.match(tabNavLayout, /export function createTabNavLayoutController\(\{/);
  assert.match(tabNavLayout, /export function fitTabNavItems\(\{/);
  assert.match(tabNavLayout, /function syncNavigation\(\) \{/);
  assert.match(tabNavLayout, /function setMenuOpen\(open, options = \{\}\) \{/);
  assert.match(tabNavLayout, /function handleMoreToolsMenuKeydown\(event\) \{/);
  assert.match(tabNavLayout, /function positionActiveIndicator\(options = \{\}\) \{/);
  assert.match(tabNavLayout, /bind\(view\.visualViewport, 'resize', handleViewportResize\);/);
  assert.match(tabNavLayout, /tabNavResizeObserver = new ResizeObserverClass\(\(\) => queueLayoutSync\(\)\);/);
  assert.match(tabNavLayout, /function dispose\(\) \{/);
  assert.match(tabNavLayout, /target\.removeEventListener\?\.\(type, listener\);/);
  assert.match(tabNavLayout, /tabNavResizeObserver\?\.disconnect\?\.\(\);/);
  assert.match(tabNavLayout, /scheduledFrames\.forEach\(\(\{ id \}\) => view\?\.cancelAnimationFrame\?\.\(id\)\);/);
  assert.match(tabNavLayout, /scheduledTimers\.forEach\(\(\{ id \}\) => view\?\.clearTimeout\?\.\(id\)\);/);
});

test('runtime owns controller cleanup and the new app-shell module is precached and audited', () => {
  assert.match(shell, /registerCleanup\(\(\) => tabNavLayout\.dispose\(\)\);/);
  assert.match(runtime, /onRegisterCleanup: registerCleanup,/);
  assert.match(serviceWorker, /'\.\/src\/app\/shell\/tab-nav-layout\.js'/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'shell' \/ 'tab-nav-layout\.js'/);
});
