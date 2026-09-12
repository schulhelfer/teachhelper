import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [shell, chromeController, tabController, tabNavLayout, main, workPhase] = await Promise.all([
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell/chrome-controller.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell/tab-controller.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell/tab-nav-layout.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/app-runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/work-phase/app.js', import.meta.url), 'utf8'),
]);

test('the shell binds both fullscreen controls and restores chrome with Escape', () => {
  assert.match(shell, /createChromeController\(\{/);
  assert.match(chromeController, /bind\(headerToggle, 'click', toggle\);/);
  assert.match(chromeController, /bind\(overlayToggle, 'click', toggle\);/);

  const handlerStart = chromeController.indexOf('function handleDocumentKeydown(event) {');
  assert.ok(handlerStart >= 0, 'the chrome controller must listen for Escape');
  const handler = chromeController.slice(handlerStart, chromeController.indexOf('\n  }', handlerStart) + 4);
  assert.match(handler, /if \(event\.key !== 'Escape'\) return;/);
  assert.match(handler, /if \(!collapsed \|\| transitionState !== 'idle'\) return;/);
  assert.match(handler, /if \(documentRef\?\.querySelector\?\.\('dialog\[open\]'\)\) return;/);
  assert.match(handler, /setCollapsed\(false\);/);
  assert.match(chromeController, /bind\(documentRef, 'keydown', handleDocumentKeydown\);/);
});

test('shell-wide navigation, keyboard, and viewport responsibilities stay outside Work Phase', () => {
  assert.match(tabController, /function setActiveTab\(tab, options = \{\}\) \{[\s\S]*?const nextTab = normalizeTab\(tab\);/);
  assert.match(tabController, /commitActiveTab\(nextTab\);\s+onEnsureTabInitialized\(activeTab\);\s+render\(\);\s+onRefreshLayouts\(\);/);
  assert.match(shell, /createTabNavLayoutController\(\{/);
  assert.match(tabNavLayout, /bind\(documentRef, 'pointerdown', handleDocumentPointerDown\);/);
  assert.match(tabNavLayout, /bind\(documentRef, 'keydown', handleDocumentKeydown\);/);
  assert.match(tabNavLayout, /bind\(view, 'resize', handleViewportResize\);/);
  assert.match(tabNavLayout, /bind\(documentRef, 'fullscreenchange', handleViewportResize\);/);
  assert.match(tabNavLayout, /bind\(documentRef, 'webkitfullscreenchange', handleViewportResize\);/);
  assert.doesNotMatch(workPhase, /(?:chromeToggle|chromeOverlayToggle|setChromeCollapsed|toggleChromeCollapsed)/);
});

test('app-wide theme and module-overlay dismissal remain explicit shell adapters', () => {
  assert.match(main, /themeController\.subscribe\(\(detail\) => \{\s*document\.querySelectorAll\('iframe'\)\.forEach/);
  assert.match(main, /bindRuntime\(document, 'load', \(event\) => \{[\s\S]*?applyThemeToFrame\(frame/);
  assert.match(main, /const dismissModuleContextMenus = \(\) => \{[\s\S]*?type: MODULE_CONTEXT_MENU_DISMISS_EVENT/);
  assert.match(main, /bindRuntime\(document, 'pointerdown', dismissModuleContextMenus, true\);/);
  assert.match(main, /if \(event\.key === 'Escape'\) dismissModuleContextMenus\(\);/);
});
