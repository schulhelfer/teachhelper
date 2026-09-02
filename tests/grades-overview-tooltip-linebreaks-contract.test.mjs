import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, tooltipCss, planningSource, seatplanSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/app-tooltips.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
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

test('sidebar and seatplan interaction tooltips list every alternative on its own line', () => {
  const sidebarCourseTooltip = /Linksklick: Kursansicht\\nRechtsklick: Kursaktionen\\nZiehen: Reihenfolge in Randleiste/;
  assert.match(appSource, sidebarCourseTooltip);
  assert.match(planningSource, sidebarCourseTooltip);
  assert.match(appSource, /Unterrichtsfrei-Kurs\\nRechtsklick: Kursaktionen/);
  assert.match(appSource, /Kurs ohne Noten\\nRechtsklick: Kursaktionen/);
  assert.match(seatplanSource, /Ziehen: Zweiertisch verschieben\\nKlicken: Verbindung lösen/);
});

test('no tooltip assignment separates alternatives with a slash or middot', () => {
  const inlineSeparator = /\.title\s*=\s*(["'])[^"'\n]*\s[/·]\s[^"'\n]*\1/g;
  for (const [name, source] of [
    ['grades', appSource],
    ['planning', planningSource],
    ['seatplan', seatplanSource],
  ]) {
    assert.deepEqual(source.match(inlineSeparator) ?? [], [], `${name} tooltip uses an inline separator`);
  }
});
