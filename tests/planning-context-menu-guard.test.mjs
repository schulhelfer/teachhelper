import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/planning/app.js', import.meta.url),
  'utf8',
);

function extractClassMethod(name) {
  const match = new RegExp(`\\n  ${name}\\(`).exec(appSource);
  assert.ok(match, `method ${name} must exist`);
  const start = match.index + 1;
  const bodyStart = appSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`method ${name} is incomplete`);
}

class FakeNode {
  constructor(parent = null) {
    this.parent = parent;
  }

  contains(candidate) {
    for (let current = candidate; current; current = current.parent) {
      if (current === this) return true;
    }
    return false;
  }
}

globalThis.Node = FakeNode;

const method = Function(
  `"use strict"; return ({${extractClassMethod('isContextMenuOpeningTarget')}}).isContextMenuOpeningTarget;`,
)();

test('the synthetic click following a contextmenu remains guarded', () => {
  const trigger = new FakeNode();
  const triggerChild = new FakeNode(trigger);
  const harness = {
    contextMenuClickGuard: {
      target: triggerChild,
      expiresAt: Date.now() + 750,
    },
  };

  assert.equal(method.call(harness, trigger), true);
  assert.ok(harness.contextMenuClickGuard, 'pointerdown detection must not clear the click guard');
});

test('unrelated and expired contextmenu interactions are not guarded', () => {
  const trigger = new FakeNode();
  const unrelated = new FakeNode();
  const harness = {
    contextMenuClickGuard: { target: trigger, expiresAt: Date.now() + 750 },
  };

  assert.equal(method.call(harness, unrelated), false);
  harness.contextMenuClickGuard = { target: trigger, expiresAt: Date.now() - 1 };
  assert.equal(method.call(harness, trigger), false);
  assert.equal(harness.contextMenuClickGuard, null);
});

test('pointerdown checks the guard before clearing or hiding the menu', () => {
  const pointerdown = appSource.match(
    /document\.addEventListener\("pointerdown", \(event\) => \{([\s\S]*?)\n    \}, true\);/,
  )?.[1] || '';
  const guardIndex = pointerdown.indexOf('this.isContextMenuOpeningTarget(event.target)');
  const clearIndex = pointerdown.indexOf('this.contextMenuClickGuard = null');
  const hideIndex = pointerdown.indexOf('this.hideContextMenu()');
  assert.ok(guardIndex >= 0);
  assert.ok(clearIndex > guardIndex);
  assert.ok(hideIndex > guardIndex);
});

test('planning lesson context menu opens before clipboard access completes', () => {
  const methodSource = extractClassMethod('openWeekBlockContextMenu');
  const openIndex = methodSource.indexOf('const menuGeneration = this.showContextMenu(');
  const clipboardRefreshIndex = methodSource.indexOf('void this.readClipboardText().then(');

  assert.ok(openIndex >= 0, 'the context menu must be rendered synchronously');
  assert.ok(
    clipboardRefreshIndex > openIndex,
    'clipboard access may only refresh the already visible menu',
  );
});

test('workspace renders do not implicitly close an open planning context menu', () => {
  const renderAllSource = extractClassMethod('renderAll');
  assert.equal(renderAllSource.includes('this.hideContextMenu()'), false);
});

test('fresh context menus survive incidental opening scroll and resize events', () => {
  const isFreshContextMenu = Function(
    `"use strict"; return ({${extractClassMethod('isFreshContextMenu')}}).isFreshContextMenu;`,
  )();
  const harness = {
    refs: { contextMenu: { hidden: false } },
    contextMenuOpenedAt: Date.now(),
  };

  assert.equal(isFreshContextMenu.call(harness), true);
  harness.contextMenuOpenedAt = Date.now() - 1000;
  assert.equal(isFreshContextMenu.call(harness), false);
});
