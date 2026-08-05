import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [index, app] = await Promise.all([
  readFile(new URL('../src/modules/grades/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('course seatplan navigation keeps the entry route while crossing the grades frame boundary', () => {
  assert.match(
    index,
    /const subview = source\.action === 'seatplan'\s*\|\|\s*source\.subview === 'entry'/,
  );
});

test('a locked course seatplan request shows the vault dialog as an overlay before resuming', () => {
  const navigation = app.match(/\n  async navigateGrades\(detail = null\) \{([\s\S]*?)\n  notifyParentGradesViewRequest\(/)?.[1] || '';
  assert.match(navigation, /navigation\.action === "seatplan"[\s\S]*?notifyParentGradeVaultOverlay\(true\)/);
  assert.match(navigation, /queueGradeVaultContinuation\(\{ type: "grades-navigation", detail: navigation \}\)/);
});
