import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('the seatplan receives a course grade context only after its tab is active', () => {
  assert.match(
    source,
    /const deliverPendingCourseSeatplanContext = \(\) => \{[\s\S]*?getActiveTab\(\) !== TAB_SEATPLAN[\s\S]*?sendCourseSeatplanContext\(detail\)/,
  );
  assert.match(
    source,
    /const openCourseSeatplan = \(event\) => \{[\s\S]*?pendingCourseSeatplanContext = detail;[\s\S]*?if \(getActiveTab\(\) === TAB_SEATPLAN\) \{[\s\S]*?setActiveTab\(TAB_SEATPLAN\);/,
  );
  assert.match(
    source,
    /onTabActivating: \(tab\) => \{[\s\S]*?if \(tab === TAB_SEATPLAN\) \{[\s\S]*?schedulePendingCourseSeatplanContext\(\)/,
  );
});
