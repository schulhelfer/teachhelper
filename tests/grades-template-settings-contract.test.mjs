import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, css, appSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('der Vorlagen-Tab gliedert Erwartungshorizont und Kompetenzerwartungen klar', () => {
  assert.match(html, /id="expectation-horizon-settings-title" class="settings-panel-title">Erwartungshorizont</);
  assert.match(html, /id="competence-expectations-settings-title" class="settings-panel-title">Kompetenzerwartungen</);
  assert.match(html, /Ort \(Platzhalter[\s\S]*?&lt;&lt;Ort&gt;&gt;\)/);
  assert.match(html, /Kommentar[\s\S]*?\(Platzhalter[\s\S]*?&lt;&lt;Aufgabenliste&gt;&gt;\)/);
  assert.doesNotMatch(html, /Aufgabenlabel/);
  assert.doesNotMatch(html, /Lege fest, welche/);
  assert.doesNotMatch(html, /<h3 class="settings-panel-title">Angaben</);
  assert.doesNotMatch(html, /<h3 class="settings-panel-title">Standardvorlage</);
});

test('alle Vorlagenaktionen behalten ihre IDs und sprechen einheitlich von Word-Vorlagen', () => {
  for (const id of [
    'expectation-horizon-template-settings-file',
    'expectation-horizon-template-settings-file-name',
    'expectation-horizon-template-settings-download',
    'expectation-horizon-template-settings-upload',
    'expectation-horizon-template-settings-reset',
    'competence-expectations-template-settings-file',
    'competence-expectations-template-settings-file-name',
    'competence-expectations-template-settings-download',
    'competence-expectations-template-settings-upload',
    'competence-expectations-template-settings-reset',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Word-Vorlage herunterladen/);
  assert.match(html, /Eigene[\s\S]*?Word-Vorlage hochladen/);
  assert.match(html, /Eingebaute Vorlage wiederherstellen/);
});

test('Dateinamen bleiben sichtbar, während generische Aktiv-Hinweise ausbleiben', () => {
  assert.match(appSource, /Eigene Word-Vorlage für den Erwartungshorizont gespeichert\./);
  assert.match(appSource, /Eigene Word-Vorlage für Kompetenzerwartungen gespeichert\./);
  assert.doesNotMatch(html, /Word-Standardvorlage/);
  assert.doesNotMatch(appSource, /(?:Eigene|Eingebaute) Word-Vorlage aktiv\./);
  assert.match(appSource, /Vorlagendatei: \$\{fileName\}/);
  assert.match(appSource, /expectationHorizonTemplateSettingsFileName/);
  assert.match(appSource, /competenceExpectationsTemplateSettingsFileName/);
});

test('die zwei Bereiche bleiben luftig und ohne Trennlinien', () => {
  assert.match(css, /#settings-tab-expectation-horizon\s*\{[\s\S]*?gap:\s*1\.5rem/);
  assert.match(css, /\.expectation-horizon-template-settings-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.doesNotMatch(css, /\.expectation-horizon-settings-section\+\.expectation-horizon-settings-section\s*\{[^}]*border-top:/);
});
