import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mergerSource = await readFile(
  new URL('../src/modules/merger/app.js', import.meta.url),
  'utf8',
);

function extractFunction(name) {
  const match = new RegExp(`\\n\\s*(?:async )?function ${name}\\(`).exec(mergerSource);
  assert.ok(match, `${name} must exist`);
  const bodyStart = mergerSource.indexOf('{', match.index);
  let depth = 0;
  for (let index = bodyStart; index < mergerSource.length; index += 1) {
    if (mergerSource[index] === '{') depth += 1;
    if (mergerSource[index] === '}') depth -= 1;
    if (depth === 0) return mergerSource.slice(match.index, index + 1);
  }
  throw new Error(`${name} is incomplete`);
}

test('shared PDF loading replaces all targets and initializes every single-file tool', () => {
  const sharedLoading = extractFunction('setSharedPdfFiles');

  assert.match(sharedLoading, /const \[singleToolFile\] = mergeFiles;/);
  assert.match(sharedLoading, /mergeState\.files = mergeFiles;/);
  assert.match(sharedLoading, /applyValidatedSingleToolFile\(TOOL_LAYOUT, singleToolFile\)/);
  assert.match(sharedLoading, /applyValidatedSingleToolFile\(TOOL_ROTATE, singleToolFile\)/);
  assert.match(sharedLoading, /applyValidatedSingleToolFile\(TOOL_SPLIT, singleToolFile\)/);
});

test('merge selections retain every valid file while single-file selections share their first PDF', () => {
  const mergeLoading = extractFunction('replaceMergeFiles');
  const singleLoading = extractFunction('setSingleToolFileFromSelection');

  assert.match(mergeLoading, /assertTotalSizeAtMost\(\s*accepted,/);
  assert.match(mergeLoading, /await setSharedPdfFiles\(accepted\);/);
  assert.match(singleLoading, /await setSharedPdfFiles\(\[accepted\[0\]\]\);/);
});

test('removing a PDF clears every shared subtool selection', () => {
  const clearSharedSelection = extractFunction('clearSharedPdfFiles');
  const clearSelection = extractFunction('clearSingleToolFile');

  assert.match(clearSharedSelection, /mergeState\.files = \[\];/);
  assert.match(clearSharedSelection, /mergeState\.pageCountByFile\.clear\(\);/);
  assert.match(clearSharedSelection, /\[TOOL_LAYOUT, TOOL_ROTATE, TOOL_SPLIT\]\.forEach\(clearSingleToolFile\);/);
  assert.match(clearSelection, /state\.file = null;/);
  assert.equal((mergerSource.match(/clearSharedPdfFiles\(\);/g) || []).length, 2);
});
