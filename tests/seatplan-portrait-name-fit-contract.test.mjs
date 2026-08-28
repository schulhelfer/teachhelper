import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [app, css] = await Promise.all([
  read('../src/modules/seatplan/app.js'),
  read('../src/modules/seatplan/app.css'),
]);

test('portrait grade seats render the full name on one fitted line', () => {
  assert.match(
    app,
    /function createSeatNameLines\(student, fallbackLabel = '', options = \{\}\) \{[\s\S]*?const singleLine = options\.singleLine === true;[\s\S]*?seat-name-lines-single-line[\s\S]*?singleLine \? \[parts\.join\(' '\)\] : parts/,
  );
  assert.match(
    app,
    /let hasGradePortrait = false;[\s\S]*?hasGradePortrait = true;[\s\S]*?createSeatNameLines\(s, label, \{ singleLine: hasGradePortrait \}\)/,
  );
  assert.match(css, /\.seat-name-lines-single-line \{[\s\S]*?flex-direction: row;[\s\S]*?white-space: nowrap;/);
});

test('the shared seat-name size reserves vertical room for grade portraits', () => {
  assert.match(
    app,
    /const portrait = content\.querySelector\([\s\S]*?seat-grade-student-portrait-placeholder[\s\S]*?const portraitHeight = [\s\S]*?const availableHeight = Math\.max\(1, name\.clientHeight - 4 - portraitHeight - portraitGap\);/,
  );
  assert.match(
    app,
    /const maxHeightLimitedSize = portraitHeight > 0\s*\? availableHeight\s*:\s*availableHeight \* 0\.5;/,
  );
  assert.match(app, /const sharedSize = Math\.min\(\.\.\.fitted\.map\(item => item\.size\)\);/);
});
