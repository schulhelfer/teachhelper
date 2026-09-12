import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [shell, chromeController, tabController, runtime, serviceWorker, audit] = await Promise.all([
  read('../src/app/shell.js'),
  read('../src/app/shell/chrome-controller.js'),
  read('../src/app/shell/tab-controller.js'),
  read('../src/app/app-runtime.js'),
  read('../sw.js'),
  read('../scripts/audit.py'),
]);

test('shell delegates chrome state while retaining tutorial orchestration', () => {
  assert.match(shell, /import \{ createChromeController \} from '\.\/shell\/chrome-controller\.js';/);
  assert.equal((shell.match(/createChromeController\(\{/g) || []).length, 1);
  assert.ok(
    shell.indexOf('createChromeController({') < shell.indexOf('createTabNavLayoutController({'),
    'chrome listeners must stay ahead of tab-layout listeners',
  );
  assert.match(shell, /onTutorialEntryVisibilityChange: setTutorialEntryVisibility,/);
  assert.match(shell, /onResetSidebarWidth: \(\) => sidebarResize\.resetActiveWidth\(\),/);
  assert.match(shell, /onRefreshLayouts: refreshLayouts,/);
  assert.match(shell, /createTabController\(\{/);
  assert.match(tabController, /function setActiveTab\(tab, options = \{\}\) \{/);
  assert.match(shell, /function setTutorialEntryVisibility\(visible\) \{/);
  assert.match(shell, /setChromeCollapsed: \(collapsed, options\) => chromeController\.setCollapsed\(collapsed, options\),/);
  assert.match(shell, /toggleChromeCollapsed: \(\) => chromeController\.toggle\(\),/);
  assert.match(shell, /syncChromeState: \(\) => chromeController\.sync\(\),/);
  assert.doesNotMatch(shell, /state\.chromeTransition(?:State|Timer)/);
  assert.doesNotMatch(shell, /function (?:finalizeChromeTransition|queueChromeTransition|moveFocusOutOfChrome)/);
  assert.doesNotMatch(shell, /classList\.(?:add|remove|toggle)\('(?:chrome-collapsed|is-collapsing|is-expanding|is-chrome-layout-settling)'/);
});

test('chrome controller owns state, transitions, visibility, focus and cleanup', () => {
  assert.match(chromeController, /export function createChromeController\(\{/);
  assert.match(chromeController, /let collapsed = Boolean\(initialCollapsed\);/);
  assert.match(chromeController, /let transitionState = 'idle';/);
  assert.match(chromeController, /function setCollapsed\(nextValue, \{ resetSidebarWidth = true \} = \{\}\) \{/);
  assert.match(chromeController, /function toggle\(\) \{/);
  assert.match(chromeController, /function sync\(\) \{/);
  assert.match(chromeController, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(chromeController, /function moveFocusOutBeforeHide\(\) \{/);
  assert.match(chromeController, /bind\(headerToggle, 'click', toggle\);/);
  assert.match(chromeController, /bind\(overlayToggle, 'click', toggle\);/);
  assert.match(chromeController, /bind\(documentRef, 'keydown', handleDocumentKeydown\);/);
  assert.match(chromeController, /scheduledFrames\.forEach\(\(\{ id \}\) => \{/);
  assert.match(chromeController, /scheduledTimers\.forEach\(\(\{ id \}\) => \{/);
  assert.match(chromeController, /bindings\.splice\(0\)\.forEach/);
  assert.doesNotMatch(chromeController, /src\/modules|modules\/|sidebar-resize|tab-nav-layout|workspace-status/);
});

test('runtime cleanup and offline protection include the chrome controller', () => {
  const shellState = runtime.slice(
    runtime.indexOf('const shellState = {'),
    runtime.indexOf('\n  let bridgeController', runtime.indexOf('const shellState = {')),
  );
  assert.doesNotMatch(shellState, /chromeCollapsed|chromeTransitionState|chromeTransitionTimer/);
  assert.match(runtime, /shellController \? shellController\.isChromeCollapsed\(\) : false/);
  assert.match(runtime, /shellController \? shellController\.getChromeTransitionState\(\) : 'idle'/);
  assert.match(shell, /registerCleanup\(\(\) => chromeController\.dispose\(\)\);/);
  assert.match(serviceWorker, /'\.\/src\/app\/shell\/chrome-controller\.js'/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'shell' \/ 'chrome-controller\.js'/);
});
