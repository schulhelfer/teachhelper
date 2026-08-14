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
const syncWeekLessonBlockTopicScale = Function(
  'clamp',
  `"use strict"; return ({${extractClassMethod('syncWeekLessonBlockTopicScale')}}).syncWeekLessonBlockTopicScale;`,
)((value, min, max) => Math.min(Math.max(value, min), max));

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

test('week lesson blocks cover the hour separators', () => {
  assert.match(appSource, /colorToRgba\(tinted, 1\)/);
  assert.doesNotMatch(appSource, /colorToRgba\(tinted, 0\.88\)/);
  assert.doesNotMatch(appSource, /rgba\(120, 120, 120, 0\.82\)/);
});

test('week layout scaling batches reads before writes and has no search loop', () => {
  const methodSource = extractClassMethod('syncWeekLayoutScale');
  const lastMetricRead = methodSource.indexOf('table.tHead ? table.tHead.getBoundingClientRect().height : 0');
  const firstBatchedWrite = methodSource.indexOf(
    'header.style.setProperty("--week-header-scale", headerScale.toFixed(2))',
  );

  assert.ok(lastMetricRead >= 0);
  assert.ok(firstBatchedWrite > lastMetricRead);
  assert.equal(methodSource.includes('while ('), false);
  assert.equal(methodSource.includes('getBoundingClientRect();\n      '), false);
  assert.equal(methodSource.includes('blockFitRatio'), false);
  assert.ok(methodSource.includes('this.syncWeekLessonBlockTopicScales()'));
});

test('week topics receive an independent font scale per lesson block', () => {
  const methodSource = extractClassMethod('syncWeekLessonBlockTopicScale');
  assert.match(methodSource, /--week-topic-font-scale/);
  assert.match(methodSource, /0\.7/);
  assert.match(methodSource, /topicContent\.scrollHeight/);
  assert.doesNotMatch(methodSource, /--week-block-font-scale/);

  const topicStyle = cssSource.match(/\.lesson-block \.line \{[\s\S]*?\n\s*\}/)?.[0] || '';
  const inlineTopicStyle = cssSource.match(/\.lesson-block \.week-inline-topic-input \{[\s\S]*?\n\s*\}/)?.[0] || '';
  assert.match(topicStyle, /var\(--week-topic-font-scale, 1\)/);
  assert.match(inlineTopicStyle, /var\(--week-topic-font-scale, 1\)/);
});

test('a long topic only scales down its own lesson block to the 70 percent minimum', () => {
  const createBlock = ({ availableHeight, contentHeight }) => {
    const properties = new Map();
    const topicContent = { scrollHeight: contentHeight };
    const topicZone = {
      clientHeight: availableHeight,
      querySelector: () => topicContent,
    };
    return {
      style: { setProperty: (name, value) => properties.set(name, value) },
      querySelector: () => topicZone,
      scale: () => properties.get('--week-topic-font-scale'),
    };
  };
  const longTopicBlock = createBlock({ availableHeight: 100, contentHeight: 180 });
  const fittingTopicBlock = createBlock({ availableHeight: 100, contentHeight: 80 });

  syncWeekLessonBlockTopicScale.call({}, longTopicBlock);
  syncWeekLessonBlockTopicScale.call({}, fittingTopicBlock);

  assert.equal(longTopicBlock.scale(), '0.70');
  assert.equal(fittingTopicBlock.scale(), '1.00');
});
