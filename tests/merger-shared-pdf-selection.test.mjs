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

test('merge selections collect files while single-file selections share their first PDF', () => {
  const mergeLoading = extractFunction('appendMergeFiles');
  const singleLoading = extractFunction('setSingleToolFileFromSelection');

  assert.match(mergeLoading, /const combined = \[\.\.\.mergeState\.files, \.\.\.added\];/);
  assert.match(mergeLoading, /mergeState\.files = combined;/);
  assert.match(mergeLoading, /if \(!mergeState\.files\.length\) \{\s*await setSharedPdfFiles\(added\);/);
  assert.doesNotMatch(mergerSource, /replaceMergeFiles/);

  assert.match(mergeLoading, /assertTotalSizeAtMost\(\s*combined,/);
  assert.match(singleLoading, /await setSharedPdfFiles\(\[accepted\[0\]\]\);/);
});

test('adding an already listed PDF is skipped instead of duplicated', () => {
  const sameFile = extractFunction('isSameMergeFile');
  const mergeLoading = extractFunction('appendMergeFiles');
  assert.match(sameFile, /a\.name === b\.name && a\.size === b\.size && a\.lastModified === b\.lastModified/);
  assert.match(mergeLoading, /if \(known\) duplicateCount \+= 1;/);
  assert.match(mergeLoading, /maybeShowFileSelectionWarning\(\{[^}]*duplicateCount[^}]*\}\)/);
  assert.match(mergerSource, /function maybeShowFileSelectionWarning\(\{[^)]*duplicateCount = 0/);
  assert.match(mergerSource, /if \(duplicateCount > 0\) \{/);
});

test('the row delete button removes only its own PDF', () => {
  const removeFile = extractFunction('removeMergeFileAt');

  assert.match(removeFile, /mergeState\.files\.splice\(index, 1\)/);
  assert.match(removeFile, /mergeState\.pageCountByFile\.delete\(removed\);/);
  assert.match(removeFile, /if \(!mergeState\.files\.length\) \{\s*clearSharedPdfFiles\(\);/);
  assert.match(removeFile, /if \(index === 0\) \{[\s\S]*?await setSharedPdfFiles\(mergeState\.files\);/);
  assert.match(mergerSource, /void removeMergeFileAt\(index\);/);
});

test('clearing a shared selection resets every subtool', () => {
  const clearSharedSelection = extractFunction('clearSharedPdfFiles');
  const clearSelection = extractFunction('clearSingleToolFile');

  assert.match(clearSharedSelection, /mergeState\.files = \[\];/);
  assert.match(clearSharedSelection, /mergeState\.pageCountByFile\.clear\(\);/);
  assert.match(clearSharedSelection, /\[TOOL_LAYOUT, TOOL_ROTATE, TOOL_SPLIT\]\.forEach\(clearSingleToolFile\);/);
  assert.match(clearSelection, /state\.file = null;/);
  assert.equal((mergerSource.match(/clearSharedPdfFiles\(\);/g) || []).length, 2);
});
