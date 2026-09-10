import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [shell, main, workPhase] = await Promise.all([
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/work-phase/app.js', import.meta.url), 'utf8'),
]);

test('the shell binds both fullscreen controls and restores chrome with Escape', () => {
  assert.match(shell, /els\.chromeToggle\?\.addEventListener\('click', toggleChromeCollapsed\);/);
  assert.match(shell, /els\.chromeOverlayToggle\?\.addEventListener\('click', toggleChromeCollapsed\);/);

  const handlerStart = shell.indexOf("document.addEventListener('keydown', (event) => {");
  assert.ok(handlerStart >= 0, 'the shell must listen for Escape');
  const handler = shell.slice(handlerStart, shell.indexOf('\n  });', handlerStart) + 6);
  assert.match(handler, /if \(event\.key !== 'Escape'\) return;/);
  assert.match(handler, /if \(!state\.chromeCollapsed \|\| state\.chromeTransitionState !== 'idle'\) return;/);
  assert.match(handler, /if \(document\.querySelector\('dialog\[open\]'\)\) return;/);
  assert.match(handler, /setChromeCollapsed\(false\);/);
});

test('shell-wide navigation, keyboard, and viewport responsibilities stay outside Work Phase', () => {
  assert.match(shell, /function setActiveTab\(tab, options = \{\}\) \{[\s\S]*?const nextTab = normalizeTab\(tab\);/);
  assert.match(shell, /state\.activeTab = nextTab;\s+ensureTabInitialized\(state\.activeTab\);\s+renderTabs\(\);\s+refreshLayouts\(\);/);
  assert.match(shell, /document\.addEventListener\('pointerdown', \(event\) => \{[\s\S]*?setMoreToolsMenuOpen\(false\);/);
  assert.match(shell, /document\.addEventListener\('keydown', \(event\) => \{[\s\S]*?els\.moreToolsTrigger\?\.focus\(\);/);
  assert.match(shell, /window\.addEventListener\('resize', handleViewportResize\);/);
  assert.match(shell, /document\.addEventListener\('fullscreenchange', handleViewportResize\);/);
  assert.match(shell, /document\.addEventListener\('webkitfullscreenchange', handleViewportResize\);/);
  assert.doesNotMatch(workPhase, /(?:chromeToggle|chromeOverlayToggle|setChromeCollapsed|toggleChromeCollapsed)/);
});

test('app-wide theme and module-overlay dismissal remain explicit shell adapters', () => {
  assert.match(main, /themeController\.subscribe\(\(detail\) => \{\s*document\.querySelectorAll\('iframe'\)\.forEach/);
  assert.match(main, /document\.addEventListener\('load', \(event\) => \{[\s\S]*?applyThemeToFrame\(frame/);
  assert.match(main, /const dismissModuleContextMenus = \(\) => \{[\s\S]*?type: MODULE_CONTEXT_MENU_DISMISS_EVENT/);
  assert.match(main, /document\.addEventListener\('pointerdown', dismissModuleContextMenus, true\);/);
  assert.match(main, /if \(event\.key === 'Escape'\) dismissModuleContextMenus\(\);/);
});
