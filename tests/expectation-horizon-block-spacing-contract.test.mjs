import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [gradesApp, docxTemplate] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/docx-template.js', import.meta.url), 'utf8'),
]);

test('EWH passes its comment, boundary, and percentile blocks to the DOCX spacing rule', () => {
  assert.match(gradesApp, /EXPECTATION_HORIZON_ADJACENT_BLOCK_PLACEHOLDER_GROUPS/);
  assert.match(gradesApp, /"<<Kommentar>>"/);
  assert.match(gradesApp, /EXPECTATION_HORIZON_PERCENT_BOUNDARY_PLACEHOLDER/);
  assert.match(gradesApp, /EXPECTATION_HORIZON_PERCENTILE_PLACEHOLDERS/);
  assert.match(gradesApp, /adjacentBlockPlaceholderGroups: EXPECTATION_HORIZON_ADJACENT_BLOCK_PLACEHOLDER_GROUPS/);
});

test('DOCX spacing only inserts a paragraph between adjacent non-empty replacement blocks', () => {
  assert.match(docxTemplate, /function insertBlankParagraphsBetweenAdjacentReplacementBlocks/);
  assert.match(docxTemplate, /paragraph\.nextElementSibling/);
  assert.match(docxTemplate, /hasAdjacentBlockReplacementContent/);
  assert.match(docxTemplate, /insertBefore\(emptyParagraph, nextParagraph\)/);
  assert.match(docxTemplate, /options\.adjacentBlockPlaceholderGroups/);
});
