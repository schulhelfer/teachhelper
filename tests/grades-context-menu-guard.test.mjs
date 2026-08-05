import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
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

const isContextMenuOpeningTarget = Function(
  `"use strict"; return ({${extractClassMethod('isContextMenuOpeningTarget')}}).isContextMenuOpeningTarget;`,
)();

test('the click following a course contextmenu is ignored', () => {
  const courseTile = new FakeNode();
  const courseName = new FakeNode(courseTile);
  const harness = {
    contextMenuClickGuard: {
      target: courseName,
      expiresAt: Date.now() + 750,
    },
  };

  assert.equal(isContextMenuOpeningTarget.call(harness, courseTile), true);
  assert.ok(harness.contextMenuClickGuard);
});

test('unrelated and expired contextmenu guards do not block clicks', () => {
  const courseTile = new FakeNode();
  const unrelated = new FakeNode();
  const harness = {
    contextMenuClickGuard: { target: courseTile, expiresAt: Date.now() + 750 },
  };

  assert.equal(isContextMenuOpeningTarget.call(harness, unrelated), false);
  harness.contextMenuClickGuard = { target: courseTile, expiresAt: Date.now() - 1 };
  assert.equal(isContextMenuOpeningTarget.call(harness, courseTile), false);
  assert.equal(harness.contextMenuClickGuard, null);
});

test('the contextmenu guard is installed before click handling', () => {
  const guardIndex = appSource.indexOf('this.contextMenuClickGuard = {');
  const clickIndex = appSource.indexOf(
    'document.addEventListener("click", (event) => {',
    guardIndex,
  );

  assert.ok(guardIndex >= 0);
  assert.ok(clickIndex > guardIndex);
});
