import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/planning/app.js', import.meta.url),
  'utf8',
);
const cssSource = await readFile(
  new URL('../src/modules/planning/app.css', import.meta.url),
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

const handlePointerDown = Function(
  `"use strict"; return ({${extractClassMethod('handleWeekEmptySlotPointerDown')}}).handleWeekEmptySlotPointerDown;`,
)();

function createPointerEvent(day = 2, hour = 3) {
  const calls = { preventDefault: 0, stopPropagation: 0 };
  return {
    button: 0,
    target: {
      closest: () => ({ dataset: { day: String(day), hour: String(hour) } }),
    },
    preventDefault: () => { calls.preventDefault += 1; },
    stopPropagation: () => { calls.stopPropagation += 1; },
    calls,
  };
}

test('empty planning slots recognize a double press even if the table DOM is replaced', () => {
  const opened = [];
  const harness = {
    locked: false,
    lastWeekEmptySlotPointerDown: null,
    weekEmptySlotDialogOpenedAt: 0,
    openSlotDialogForCreate: (day, hour) => { opened.push([day, hour]); },
  };

  const firstEvent = createPointerEvent();
  assert.equal(handlePointerDown.call(harness, firstEvent), false);

  // The second event deliberately uses a new target object, just as it does after
  // renderWeekTable replaced the first event target.
  const secondEvent = createPointerEvent();
  assert.equal(handlePointerDown.call(harness, secondEvent), true);
  assert.deepEqual(opened, [[2, 3]]);
  assert.equal(secondEvent.calls.preventDefault, 1);
  assert.equal(secondEvent.calls.stopPropagation, 1);
});

test('lesson hover styling does not move the pointer target', () => {
  const hoverRule = cssSource.match(
    /\.lesson-block:hover:not\(:disabled\):not\(\.not-selectable\),[\s\S]*?\n\s*\}/,
  )?.[0] || '';
  assert.ok(hoverRule.includes('transform: none'));
  assert.equal(hoverRule.includes('translateY('), false);
});

test('week layout scaling batches reads before writes and has no search loop', () => {
  const methodSource = extractClassMethod('syncWeekLayoutScale');
  const batchingComment = methodSource.indexOf('Read every layout metric before changing styles');
  const lastMetricRead = methodSource.indexOf('block.clientHeight / block.scrollHeight');
  const firstBatchedWrite = methodSource.indexOf(
    'header.style.setProperty("--week-header-scale", headerScale.toFixed(2))',
  );

  assert.ok(batchingComment >= 0);
  assert.ok(lastMetricRead > batchingComment);
  assert.ok(firstBatchedWrite > lastMetricRead);
  assert.equal(methodSource.includes('while ('), false);
  assert.equal(methodSource.includes('getBoundingClientRect();\n      '), false);
});
