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

class FakeElement {
  constructor(selectors = []) {
    this.selectors = new Set(selectors);
  }

  closest(selector) {
    return this.selectors.has(selector) ? this : null;
  }
}

globalThis.Element = FakeElement;

const handleOutsideClick = Function(
  `"use strict"; return ({${extractClassMethod('handleGradePrivacyOutsideTableDocumentClick')}}).handleGradePrivacyOutsideTableDocumentClick;`,
)();

function createHarness() {
  return {
    privacyFocusedGradeStudentId: 7,
    currentView: 'grades',
    gradesSubView: 'overview',
    cleared: 0,
    rendered: 0,
    isGradesTopTabActive() {
      return true;
    },
    normalizeGradesSubView() {
      return 'overview';
    },
    clearPrivacyFocusedGradeStudent() {
      this.cleared += 1;
    },
    renderGradesView() {
      this.rendered += 1;
    },
  };
}

test('dragging or clicking the privacy chart does not exit privacy mode', () => {
  const harness = createHarness();
  const chartTarget = new FakeElement(['#grades-privacy-overlay']);

  assert.equal(handleOutsideClick.call(harness, { target: chartTarget }), false);
  assert.equal(harness.cleared, 0);
  assert.equal(harness.rendered, 0);
});

test('a genuine outside click still exits privacy mode', () => {
  const harness = createHarness();
  const outsideTarget = new FakeElement();

  assert.equal(handleOutsideClick.call(harness, { target: outsideTarget }), true);
  assert.equal(harness.cleared, 1);
  assert.equal(harness.rendered, 1);
});
