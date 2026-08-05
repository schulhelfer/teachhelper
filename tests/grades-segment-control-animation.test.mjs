import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
  'utf8',
);

function extractMethod(name, nextName) {
  let start = app.indexOf(`\n  ${name}(`);
  if (start < 0) start = app.indexOf(`\n  async ${name}(`);
  const end = app.indexOf(`\n  ${nextName}(`, start + 1);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${name} must end before ${nextName}`);
  return app.slice(start, end);
}

test('segment controls transition directly without replaying the old index', () => {
  const change = extractMethod('handleSegmentControlSlideChange', 'runAfterSegmentControlSlide');
  assert.doesNotMatch(change, /previousIndex/);
  assert.doesNotMatch(change, /getBoundingClientRect\(\)/);
  assert.match(change, /appliedIndex !== index/);
  assert.match(change, /applySegmentControlTransform\(control, index\)/);
});

test('new controls initialize silently and existing controls animate only once', () => {
  const sync = extractMethod('syncSegmentControlSlideStates', 'handleSegmentControlSlideChange');
  assert.doesNotMatch(sync, /pendingSegmentControl|storedPreviousIndex|requestAnimationFrame/);
  assert.match(sync, /!isPositioned \|\| !Number\.isInteger\(appliedIndex\)/);
  assert.match(sync, /applySegmentControlIndexClassSilently\(control, nextIndex\)/);
  assert.match(sync, /appliedIndex !== nextIndex/);
  assert.match(sync, /applySegmentControlTransform\(control, nextIndex\)/);
});

test('segment callbacks cancel an older pending callback for the same control', () => {
  const afterSlide = extractMethod('runAfterSegmentControlSlide', 'renderAll');
  assert.match(afterSlide, /segmentControlSlideTimers\?\.get\(key\)/);
  assert.match(afterSlide, /window\.clearTimeout\(previousTimer\)/);
  assert.match(afterSlide, /segmentControlSlideTimers\?\.delete\(key\)/);
});

test('entry mode is stored before waiting for the visual slide', () => {
  const change = extractMethod('handleGradesSurfaceChange', 'ensureGradeTestScaleTooltipPortal');
  const modeBranch = change.slice(change.indexOf('const modeInput'));
  const stateWrite = modeBranch.indexOf('this.gradesEntryDraft = {');
  const animationWait = modeBranch.indexOf('this.runAfterSegmentControlSlide(event');
  assert.ok(stateWrite >= 0, 'mode branch must update its draft');
  assert.ok(animationWait > stateWrite, 'draft state must be updated before the animation callback');
});
