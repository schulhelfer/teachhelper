import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [cssSource, appSource] = await Promise.all([
  readFile(new URL('../src/modules/seatplan/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
]);

test('seat names reserve vertical room for descenders in the grid', () => {
  const nameStyle = cssSource.match(/\.seat \.name \{[\s\S]*?\n\s*\}/)?.[0] || '';
  const nameLineStyle = cssSource.match(/\.seat-name-line \{[\s\S]*?\n\s*\}/)?.[0] || '';

  assert.match(nameStyle, /line-height:\s*1\.12/);
  assert.match(nameLineStyle, /padding-block:\s*0\.06em/);
  assert.match(appSource, /mid <= 10 \? '1\.08' : '1\.12'/);
  assert.match(appSource, /sharedSize <= 10 \? '1\.08' : '1\.12'/);
});
