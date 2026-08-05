import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, htmlSource, serviceWorkerSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);

test('EWH uses only the general template and has no gAeA specialization', () => {
  for (const source of [appSource, htmlSource, serviceWorkerSource]) {
    assert.doesNotMatch(source, /expectation-horizon-template-gAeA|GK\/LK-Standardvorlage|<<gAeA>>/);
  }
  assert.doesNotMatch(appSource, /getExpectationHorizonTemplateKindForValues|getExpectationHorizonCourseLevelPlaceholderValue/);
  assert.match(appSource, /const EXPECTATION_HORIZON_TEMPLATE_URL = new URL\("\.\/expectation-horizon-template\.docx", import\.meta\.url\);/);
});
