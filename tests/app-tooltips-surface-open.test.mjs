import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [tooltipSource, gradesSource] = await Promise.all([
  readFile(new URL('../src/shared/app-tooltips.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('unterdrückt Hover-Tooltips beim Öffnen von Dialogen bis zur nächsten Mausbewegung', () => {
  assert.match(tooltipSource, /function suppressHoverUntilPointerMove\(\) \{\s+hoverSuppressed = true;\s+hideTooltip\(\);/);
  assert.match(tooltipSource, /function handlePointerOver\(event\) \{\s+if \(persistentAnchor\) return;\s+if \(hoverSuppressed\) return;/);
  assert.match(tooltipSource, /function handlePointerMove\(event\) \{\s+if \(!hoverSuppressed\) return;\s+hoverSuppressed = false;/);
  assert.match(tooltipSource, /mutation\.attributeName === "open"[\s\S]*?mutation\.target\.matches\("dialog\[open\]"\)/);
  assert.match(tooltipSource, /suppressHoverUntilPointerMove,/);
});

test('der Noten-Minikalendar unterdrückt beim Öffnen den Tooltip unter dem ruhenden Mauszeiger', () => {
  assert.match(
    gradesSource,
    /openGradesTitleDatePicker\(input\) \{[\s\S]*?__teachhelperAppTooltipsController\?\.suppressHoverUntilPointerMove\?\.\(\)/,
  );
});

test('das eigenständige Notenmodul installiert das gemeinsame Tooltip-Design', () => {
  assert.match(
    gradesSource,
    /installAppTooltips\(document\);\s+function initializeGradesApp\(\)/,
  );
});
