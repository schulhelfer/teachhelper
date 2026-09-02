import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cssSource = await readFile(
  new URL('../src/app/shell.css', import.meta.url),
  'utf8',
);

function extractRule(selectorPattern) {
  const match = new RegExp(`${selectorPattern}[^{]*\\{[^}]*\\}`).exec(cssSource);
  assert.ok(match, `rule for ${selectorPattern} must exist`);
  return match[0];
}

test('warning tone rows override the global button hover instead of losing to it', () => {
  const hoverRule = extractRule('\\.tone-toggle-button:hover:not\\(:disabled\\)\\s*\\{');
  assert.ok(hoverRule.includes('transform: none'));
  assert.ok(hoverRule.includes('background: transparent'));
  assert.ok(hoverRule.includes('box-shadow: none'));
  assert.equal(hoverRule.includes('translateY('), false);
  assert.equal(/\.tone-toggle-button:hover\s*\{/.test(cssSource), false);
});

test('warning tone rows highlight through a rounded pseudo element', () => {
  const highlightRule = extractRule('\\.tone-toggle-button::before\\s*\\{');
  assert.ok(highlightRule.includes('border-radius: 10px'));
  assert.ok(highlightRule.includes('pointer-events: none'));

  const hoverHighlight = extractRule(
    '\\.tone-toggle-button:hover:not\\(:disabled\\)::before\\s*\\{',
  );
  assert.ok(hoverHighlight.includes('var(--surface-segment-hover)'));

  const focusHighlight = extractRule(
    '\\.tone-toggle-button:focus-visible::before\\s*\\{',
  );
  assert.ok(focusHighlight.includes('var(--focus-ring)'));
});

test('work phase action tiles hover without lifting', () => {
  const hoverRule = extractRule('#monitor-mic-start:hover:not\\(:disabled\\),');
  assert.ok(hoverRule.includes('#timer-work-order-stop:hover:not(:disabled)'));
  assert.ok(hoverRule.includes('transform: none'));
  assert.ok(hoverRule.includes('var(--button-bg-hover)'));
  assert.equal(hoverRule.includes('translateY('), false);
});

test('running work phase action tiles keep their active color on hover', () => {
  const runningHoverRule = extractRule(
    '#monitor-mic-start\\.is-running:hover:not\\(:disabled\\),',
  );
  assert.ok(runningHoverRule.includes('#1d4ed8'));
  assert.ok(runningHoverRule.includes('#1e3a8a'));
});
