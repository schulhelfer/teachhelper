import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
  'utf8',
);

test('grade HTML escaping covers both quote characters', () => {
  const escapeHtmlSource = appSource.match(
    /function escapeHtml\(value\) \{([\s\S]*?)\n\}/,
  )?.[1];

  assert.ok(escapeHtmlSource, 'escapeHtml must be defined');
  assert.match(escapeHtmlSource, /\.replace\(\/"\/g, "&quot;"\)/);
  assert.match(escapeHtmlSource, /\.replace\(\/'\/g, "&#39;"\)/);
});
