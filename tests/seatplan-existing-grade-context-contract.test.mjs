import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [mainSource, courseContextSource] = await Promise.all([
  readFile(new URL('../src/app/app-runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/course-context.js', import.meta.url), 'utf8'),
]);

test('the seatplan receives a course grade context only after its tab is active', () => {
  assert.match(
    courseContextSource,
    /const deliverPendingSeatplanContext = \(\) => \{[\s\S]*?getActiveTab\(\) !== TAB_SEATPLAN[\s\S]*?sendCourseSeatplanContext\(detail\)/,
  );
  assert.match(
    courseContextSource,
    /const openCourseSeatplan = \(event\) => \{[\s\S]*?pendingSeatplanContext = detail;[\s\S]*?if \(getActiveTab\(\) === TAB_SEATPLAN\) \{[\s\S]*?setActiveTab\(TAB_SEATPLAN\);/,
  );
  assert.match(
    courseContextSource,
    /if \(tab === TAB_SEATPLAN\) schedulePendingSeatplanContext\(\)/,
  );
  assert.match(mainSource, /onTabActivating: \(tab\) => \{\s*courseContext\.handleTabActivating\(tab\);/);
});
