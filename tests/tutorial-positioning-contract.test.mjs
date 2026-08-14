import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [tutorialSource, shellStyles] = await Promise.all([
  readFile(new URL('../src/app/first-run-tutorial.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8'),
]);

const placementSource = tutorialSource.slice(
  tutorialSource.indexOf('function choosePlacement'),
  tutorialSource.indexOf('function getTargetRect'),
);
const targetPositionSource = tutorialSource.slice(
  tutorialSource.indexOf('function applyTargetPosition'),
  tutorialSource.indexOf('function positionCurrentStep'),
);
const renderSource = tutorialSource.slice(
  tutorialSource.indexOf('function renderStep'),
  tutorialSource.indexOf('function goPrevious'),
);

test('hält die Sprechblase bei vorhandenem Ziel an einer Zielseite', () => {
  assert.match(placementSource, /placementsBySpace = \['bottom', 'top', 'right', 'left'\]/);
  assert.match(placementSource, /find\(\(placement\) => fitsPlacement\(placement\)\)[\s\S]*?\|\| placementsBySpace\[0\]/);
  assert.doesNotMatch(placementSource, /return ['"]center['"]/);
  assert.doesNotMatch(tutorialSource, /applyFallbackPosition|dataset\.placement = ['"]center['"]/);
  assert.match(targetPositionSource, /const rect = getTargetRect\(target\);\s+if \(!rect\) \{\s+highlight\.hidden = true;\s+return false;/);
  assert.match(targetPositionSource, /bubble\.dataset\.placement = placement;/);
  assert.match(targetPositionSource, /highlight\.hidden = false;/);
});

test('zeigt einen Schritt erst nach Auflösung seines sichtbaren UI-Ziels', () => {
  assert.match(renderSource, /bubble\.hidden = true;\s+highlight\.hidden = true;/);
  assert.match(renderSource, /const target = await waitForStepTarget\(/);
  assert.match(renderSource, /skipIfMissing \? TARGET_RESOLVE_ATTEMPTS : REQUIRED_TARGET_RESOLVE_ATTEMPTS/);
  assert.match(renderSource, /if \(!target\) \{[\s\S]*?removeUnavailableStep\(currentRenderToken\);[\s\S]*?return;/);
  assert.match(renderSource, /morphToPreparedStep\(previousRect, previousContent, currentRenderToken, target\)/);
});

test('begrenzt lange Tutorialtexte im schmalen Viewport', () => {
  const bubbleStyles = shellStyles.slice(
    shellStyles.indexOf('.tutorial-bubble {'),
    shellStyles.indexOf('.tutorial-demo-choice-actions'),
  );
  assert.match(bubbleStyles, /max-height: calc\(100vh - 28px\);/);
  assert.match(bubbleStyles, /max-height: calc\(100dvh - 28px\);/);
  assert.match(bubbleStyles, /overflow: visible;/);

  const contentStyles = shellStyles.slice(
    shellStyles.indexOf('.tutorial-content {'),
    shellStyles.indexOf('.tutorial-content-ghost'),
  );
  assert.match(contentStyles, /max-height: max\(72px, calc\(100dvh - 118px\)\);/);
  assert.match(contentStyles, /overflow-y: auto;/);
  assert.match(contentStyles, /overscroll-behavior: contain;/);
});

test('zeichnet den Pfeil für jede mögliche Zielseite außerhalb der Blase', () => {
  assert.match(shellStyles, /\.tutorial-bubble::before\s*\{[\s\S]*?content: '';[\s\S]*?transform: rotate\(45deg\)/);
  for (const placement of ['bottom', 'top', 'left', 'right']) {
    assert.match(shellStyles, new RegExp(`\\.tutorial-bubble\\[data-placement='${placement}'\\]::before`));
  }
  assert.doesNotMatch(shellStyles, /\.tutorial-bubble\[data-placement='center'\]::before/);
});

test('berechnet iframe-Ziele skaliert und verwirft veraltete opake Rechtecke', () => {
  assert.match(tutorialSource, /const scaleX = frameRect\.width \/ viewportWidth;/);
  assert.match(tutorialSource, /const scaleY = frameRect\.height \/ viewportHeight;/);
  assert.match(tutorialSource, /bySelector\.delete\(request\.key\);/);
  assert.match(tutorialSource, /frameDocument\?\.addEventListener\('scroll', reposition, true\)/);
  assert.match(tutorialSource, /window\.visualViewport\?\.addEventListener\('resize', positionCurrentStep\)/);
});
