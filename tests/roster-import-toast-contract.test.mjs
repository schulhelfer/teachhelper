import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  mainSource,
  shellCss,
  groupsDocument,
  groupsDom,
  groupsModule,
  seatplanSource,
  seatplanCss,
  seatplanDocument,
] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/dom.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/groups/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.html', import.meta.url), 'utf8'),
]);

test('removes the imported-roster scroll hint from groups, picker, and seatplan', () => {
  [
    mainSource,
    shellCss,
    groupsDocument,
    groupsDom,
    groupsModule,
    seatplanSource,
    seatplanCss,
    seatplanDocument,
  ].forEach((source) => {
    assert.doesNotMatch(source, /scroll-hint|scrollHint|bounceDown/);
  });
});

test('shows a pluralized success toast after local CSV imports', () => {
  [mainSource, seatplanSource].forEach((source) => {
    assert.match(source, /const importedCount = state\.students\.length;/);
    assert.match(source, /const importedLabel = importedCount === 1 \? 'Name' : 'Namen';/);
    assert.match(source, /showMessage\(`\$\{importedCount\} \$\{importedLabel\} importiert\.`, 'success', \{ presentation: 'toast' \}\);/);
  });
});
