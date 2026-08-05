import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, tooltipCss] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/app-tooltips.css', import.meta.url), 'utf8'),
]);

test('grade overview interaction tooltips separate left and right click instructions', () => {
  assert.match(appSource, /Linksklick: Einklappen bzw\. Ausklappen\\nRechtsklick: Weitere Optionen/);
  assert.match(appSource, /Linksklick: In Eingabemaske bearbeiten\\nRechtsklick: Weitere Optionen/);
  const portalRule = tooltipCss.slice(
    tooltipCss.indexOf('.app-tooltip-portal {'),
    tooltipCss.indexOf('}', tooltipCss.indexOf('.app-tooltip-portal {')),
  );
  assert.match(portalRule, /white-space: pre-line;/);
  assert.doesNotMatch(portalRule, /white-space: normal;/);
});
