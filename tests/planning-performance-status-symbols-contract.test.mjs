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
  const match = new RegExp(`\\n  (?:async )?${name}\\(`).exec(appSource);
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

const ARCHIVE_LOCKED_TOOLTIP = 'Notenmodul ist gesperrt';
const GRADE_VAULT_LOCKED_ICON = '<svg class="grade-vault-lock-icon"></svg>';
const PERFORMANCE_STATUS_SYMBOLS = {
  locked: GRADE_VAULT_LOCKED_ICON,
  'has-assessment': '✓',
  'missing-assessment': '❓',
};
const PERFORMANCE_STATUS_CLASSES = {
  locked: 'is-locked',
  'has-assessment': 'has-existing-assessment',
  'missing-assessment': 'is-missing-assessment',
};

const getPerformanceNavigationStateForLesson = Function(
  'ARCHIVE_LOCKED_TOOLTIP',
  'PERFORMANCE_STATUS_SYMBOLS',
  'PERFORMANCE_STATUS_CLASSES',
  `"use strict"; return ({${extractClassMethod('getPerformanceNavigationStateForLesson')}}).getPerformanceNavigationStateForLesson;`,
)(ARCHIVE_LOCKED_TOOLTIP, PERFORMANCE_STATUS_SYMBOLS, PERFORMANCE_STATUS_CLASSES);

const isGradeVaultLocked = Function(
  `"use strict"; return ({${extractClassMethod('isGradeVaultLocked')}}).isGradeVaultLocked;`,
)();

const buildWeekPerformanceLookup = Function(
  `"use strict"; return ({${extractClassMethod('buildWeekPerformanceLookup')}}).buildWeekPerformanceLookup;`,
)();

function createHarness({ locked = false, hasAssessment = false } = {}) {
  return {
    isGradeVaultLocked: () => locked,
    lessonSupportsPerformance: () => true,
    hasExistingPerformanceForLesson: () => hasAssessment,
  };
}

const lesson = { courseId: 7, lessonDate: '2026-01-30' };

test('eingetragene Note bleibt der Haken', () => {
  const state = getPerformanceNavigationStateForLesson.call(createHarness({ hasAssessment: true }), lesson);

  assert.equal(state.status, 'has-assessment');
  assert.equal(state.symbol, '✓');
  assert.equal(state.statusClass, 'has-existing-assessment');
  assert.equal(state.triggerMode, 'assessment');
  assert.equal(state.assessmentResolved, true);
});

test('fehlende Note zeigt das Fragezeichen-Symbol', () => {
  const state = getPerformanceNavigationStateForLesson.call(createHarness(), lesson);

  assert.equal(state.status, 'missing-assessment');
  assert.equal(state.symbol, '❓');
  assert.equal(state.statusClass, 'is-missing-assessment');
  assert.equal(state.triggerMode, 'entry');
});

test('das gesperrte Notenmodul zeigt das Schloss und behauptet keine Note', () => {
  const state = getPerformanceNavigationStateForLesson.call(
    createHarness({ locked: true, hasAssessment: true }),
    lesson,
  );

  assert.equal(state.status, 'locked');
  assert.equal(state.symbol, GRADE_VAULT_LOCKED_ICON);
  assert.equal(state.statusClass, 'is-locked');
  assert.equal(state.hasExistingAssessment, false, 'ein veralteter Index darf keinen Haken erzeugen');
  assert.equal(state.assessmentResolved, false);
  assert.equal(state.title, ARCHIVE_LOCKED_TOOLTIP);
  assert.equal(state.ariaLabel, ARCHIVE_LOCKED_TOOLTIP);
});

test('gesperrt heißt nur: Verschlüsselung an und nicht entsperrt', () => {
  const withVault = (vault) => isGradeVaultLocked.call({ getArchiveVaultStatus: () => vault });

  assert.equal(withVault({ encryptionEnabled: false, unlocked: false }), false);
  assert.equal(withVault({ encryptionEnabled: true, unlocked: true }), false);
  assert.equal(withVault({ encryptionEnabled: true, unlocked: false }), true);
  assert.match(
    extractClassMethod('shouldDisableArchiveGradeSelection'),
    /return this\.isGradeVaultLocked\(\);/,
    'der Archiv-Dialog muss dasselbe Prädikat benutzen',
  );
});

test('bei gesperrtem Tresor wird der aussichtslose Index-Abruf übersprungen', () => {
  const calls = [];
  const harness = {
    weekStartIso: '2026-01-26',
    lessonSupportsPerformance: () => true,
    getPerformanceTitleSetForCourse: () => null,
    ensureWeekPerformanceIndexLoaded: (ids) => calls.push(ids),
    isGradeVaultLocked: () => true,
  };

  buildWeekPerformanceLookup.call(harness, [lesson]);
  assert.deepEqual(calls, []);

  harness.isGradeVaultLocked = () => false;
  buildWeekPerformanceLookup.call(harness, [lesson]);
  assert.deepEqual(calls, [[7]]);
});

test('alle drei Trigger rendern aus demselben Status', () => {
  const weekCard = extractClassMethod('_createWeekLessonCard');
  const courseTimeline = extractClassMethod('renderCourseTimeline');

  assert.match(weekCard, /trigger\.classList\.add\(performanceNavigationState\.statusClass\);/);
  assert.match(weekCard, /trigger\.innerHTML = performanceNavigationState\.symbol;/);
  assert.match(weekCard, /trigger\.textContent = performanceNavigationState\.symbol;/);
  assert.match(courseTimeline, /performanceButton\.classList\.add\(performanceNavigationState\.statusClass\);/);
  assert.match(courseTimeline, /performanceButton\.innerHTML = performanceNavigationState\.symbol;/);
  assert.match(courseTimeline, /performanceButton\.textContent = performanceNavigationState\.symbol;/);

  for (const body of [weekCard, courseTimeline]) {
    assert.doesNotMatch(body, /hasExistingAssessment \? "✓" : "\?"/, 'keine literalen Symbole mehr in den Render-Stellen');
  }
  assert.doesNotMatch(
    weekCard,
    /classList\.add\("is-unresolved"\)/,
    'der Würfel kennt den unresolved-Zustand nicht mehr',
  );
});

test('die Emoji-Zustände lassen das Icon dahinter sichtbar', () => {
  assert.match(
    cssSource,
    /\.lesson-block \.lesson-block-performance-entry\.is-missing-assessment,\s+\.lesson-block \.lesson-block-performance-entry\.is-locked,\s+\.lesson-block \.lesson-block-seatplan-trigger\.is-missing-assessment,\s+\.lesson-block \.lesson-block-seatplan-trigger\.is-locked \{\s+font-size: calc\(1\.5rem \* var\(--week-table-scale, 1\)\);/,
  );
  assert.match(
    cssSource,
    /\.course-performance-entry-trigger\.is-missing-assessment,\s+\.course-performance-entry-trigger\.is-locked \{\s+font-size: 1\.05rem;/,
  );
  assert.doesNotMatch(
    cssSource,
    /\.lesson-block-performance-entry\.is-unresolved/,
    'die tote unresolved-Regel des Würfels ist entfernt',
  );
  assert.match(cssSource, /\.lesson-block \.lesson-block-seatplan-trigger\.is-unresolved \{/);
});
