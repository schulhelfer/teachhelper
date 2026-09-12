import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [shellSource, shellResizeSource, moduleResizeSource] = await Promise.all([
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell/sidebar-resize.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/sidebar-resize.js', import.meta.url), 'utf8'),
]);

test('ein Doppeltipp auf dem Sidebar-Resize-Griff setzt die Breite zurück', () => {
  assert.match(shellResizeSource, /SIDEBAR_TOUCH_DOUBLE_TAP_DELAY_MS = 350/);
  assert.match(shellResizeSource, /function handleTouchTap\(event, wasTap\)/);
  assert.match(shellResizeSource, /event\?\.pointerType !== 'touch'/);
  assert.match(shellResizeSource, /Math\.hypot\(tap\.clientX - previousTap\.clientX, tap\.clientY - previousTap\.clientY\)/);
  assert.match(shellResizeSource, /resetActiveWidth\(\);/);
});

test('Doppelklick und Doppeltipp verwenden denselben Zurücksetzen-Pfad', () => {
  assert.match(shellResizeSource, /const wasTap = !resizeState\.hasMoved;[\s\S]*?finishResize\(event\);[\s\S]*?handleTouchTap\(event, wasTap\);/);
  assert.match(shellResizeSource, /function handleDoubleClick\(event\) \{[\s\S]*?resetActiveWidth\(\);/);
  assert.match(shellSource, /createSidebarResizeController\(\{/);
});

test('Modul-Sidebars bleiben ab einer sinnvollen Mindestbreite per Touch verstellbar', () => {
  assert.match(moduleResizeSource, /const MIN_RESIZE_VIEWPORT_WIDTH = 320/);
  assert.match(moduleResizeSource, /function isResizableViewport\(\)/);
  assert.match(moduleResizeSource, /event\?\.pointerType !== 'touch'/);
  assert.match(moduleResizeSource, /const wasTap = !resizeState\.hasMoved;[\s\S]*?handleTouchTap\(event, wasTap\);/);
  assert.match(moduleResizeSource, /const resetWidth = \(\) =>/);
});
