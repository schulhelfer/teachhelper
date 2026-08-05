import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, cssSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

test('the assessment mode control uses compact descriptive labels', () => {
  assert.match(appSource, /value="grade" aria-label="Einzelnote"[\s\S]*?<span class="grades-entry-mode-label">Einzel&shy;note<\/span>/);
  assert.match(appSource, /value="test" aria-label="Bewertungseinheiten"[\s\S]*?<span class="grades-entry-mode-label">Bewertungs&shy;einheiten<\/span>/);
  assert.match(appSource, /value="homework" aria-label="Vorkommnis"[\s\S]*?<span class="grades-entry-mode-label">Vorkommnis<\/span>/);
  assert.match(cssSource, /\.grades-entry-mode-field \.assessment-mode-option \.grades-entry-mode-label \{[\s\S]*?font-size: 0\.76rem;[\s\S]*?hyphens: manual;/);
  const modeControl = appSource.slice(
    appSource.indexOf('<fieldset class="grades-entry-field grades-entry-mode-field'),
    appSource.indexOf('</fieldset>', appSource.indexOf('<fieldset class="grades-entry-field grades-entry-mode-field')),
  );
  assert.doesNotMatch(modeControl, /\btitle=/);
});
