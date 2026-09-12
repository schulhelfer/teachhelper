import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [shell, sidebarResize, tabController, runtime, serviceWorker, audit] = await Promise.all([
  read('../src/app/shell.js'),
  read('../src/app/shell/sidebar-resize.js'),
  read('../src/app/shell/tab-controller.js'),
  read('../src/app/app-runtime.js'),
  read('../sw.js'),
  read('../scripts/audit.py'),
]);

test('shell delegates sidebar resizing and width persistence to the dedicated controller', () => {
  assert.match(shell, /import \{ createSidebarResizeController \} from '\.\/shell\/sidebar-resize\.js';/);
  assert.equal((shell.match(/createSidebarResizeController\(\{/g) || []).length, 1);
  assert.match(shell, /getActiveScope: getSidebarWidthScope,/);
  assert.match(shell, /isActiveTabResizable: isShellSidebarResizableTab,/);
  assert.match(shell, /onCollapseRequest: \(\) => chromeController\?\.setCollapsed\(true\),/);
  assert.match(shell, /onWidthChange: notifySidebarWidthChange,/);
  assert.match(tabController, /sidebarResize\?\.applyActiveWidth\?\.\(\);/);
  assert.match(shell, /getSidebarWidth: \(scope\) => sidebarResize\.getWidth\(scope\),/);
  assert.match(shell, /setSidebarWidth: \(scope, width\) => sidebarResize\.setWidth\(scope, width\),/);
  assert.match(shell, /onResetSidebarWidth: \(\) => sidebarResize\.resetActiveWidth\(\),/);
  assert.doesNotMatch(shell, /teachhelper:sidebar-width|teachhelper:shell-sidebar-width|localStorage/);
  assert.doesNotMatch(shell, /SIDEBAR_TOUCH_DOUBLE_TAP|sidebarResizeState|handleSidebarResizeTouchTap/);
});

test('sidebar controller owns persistence, pointer interaction, observers and cleanup', () => {
  assert.match(sidebarResize, /export function createSidebarResizeController\(\{/);
  assert.match(sidebarResize, /teachhelper:sidebar-width:planning/);
  assert.match(sidebarResize, /teachhelper:sidebar-width:other/);
  assert.match(sidebarResize, /teachhelper:shell-sidebar-width/);
  assert.match(sidebarResize, /bind\(handle, 'pointerdown', handlePointerDown\)/);
  assert.match(sidebarResize, /bind\(view, 'storage', handleStorage\)/);
  assert.match(sidebarResize, /handlePositionObserver = new ResizeObserverClass\(scheduleHandlePositionSync\)/);
  assert.match(sidebarResize, /function dispose\(\) \{/);
  assert.match(sidebarResize, /target\.removeEventListener\?\.\(type, listener\)/);
  assert.match(sidebarResize, /handlePositionObserver\?\.disconnect\?\.\(\)/);
  assert.match(sidebarResize, /view\?\.cancelAnimationFrame\?\.\(id\)/);
});

test('runtime owns sidebar cleanup and the new app-shell module is precached and audited', () => {
  assert.match(shell, /onRegisterCleanup,/);
  assert.match(shell, /registerCleanup\(\(\) => sidebarResize\.dispose\(\)\);/);
  assert.match(runtime, /onRegisterCleanup: registerCleanup,/);
  assert.match(serviceWorker, /'\.\/src\/app\/shell\/sidebar-resize\.js'/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'shell' \/ 'sidebar-resize\.js'/);
});
