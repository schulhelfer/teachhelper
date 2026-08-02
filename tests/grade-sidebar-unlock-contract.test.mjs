import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/planning/app.js', import.meta.url),
  'utf8',
);

function extractClassMethod(name) {
  const matcher = new RegExp(`\\n  (?:async )?${name}\\(`, 'g');
  const match = matcher.exec(appSource);
  assert.ok(match, `method ${name} must exist`);
  const start = match.index + 1;
  const signatureEnd = appSource.indexOf(') {', start);
  assert.ok(signatureEnd > start, `method ${name} must have a body`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    const char = appSource[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`method ${name} is incomplete`);
}

const { navigateToGradesOverviewCourse } = Function(
  `"use strict"; return ({${extractClassMethod('navigateToGradesOverviewCourse')}});`,
)();

test('öffnet beim Sidebar-Kurswechsel den Entsperrdialog vor dem Laden des Notenkurses', async () => {
  let queuedAction = null;
  let dialogMode = '';
  const result = await navigateToGradesOverviewCourse.call({
    canAccessGradeVault() { return false; },
    queueGradeVaultContinuation(action) { queuedAction = action; },
    isGradeVaultConfigured() { return true; },
    openGradeVaultDialog(mode) { dialogMode = mode; },
    async resolveUnsavedGradesEntryNavigation() {
      assert.fail('a locked vault must prompt before resolving or loading navigation');
    },
    beginGradeCourseNavigationLoad() {
      assert.fail('a locked vault must not start a course load');
    },
  }, 42, {
    assessmentId: 7,
    lessonId: 13,
    lessonDate: '2026-07-31',
  });

  assert.equal(result, false);
  assert.equal(dialogMode, 'unlock');
  assert.deepEqual(queuedAction, {
    type: 'grades-navigation',
    detail: {
      courseId: 42,
      assessmentId: 7,
      lessonId: 13,
      lessonDate: '2026-07-31',
      subview: 'overview',
    },
  });
});
