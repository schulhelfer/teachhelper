import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, appSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('der Kompetenz-Import nimmt Textdateien statt LaTeX an', () => {
  assert.match(html, /id="competence-expectations-text-file"[\s\S]*?accept="[^"]*\.txt[^"]*"/);
  assert.match(html, /id="competence-expectations-text-dropzone"/);
  assert.match(html, /Aus Textdatei Kompetenzerwartung übernehmen/);
  assert.match(html, /class="competence-expectations-import-hint"/);

  assert.doesNotMatch(html, /competence-expectations-latex/);
  assert.doesNotMatch(appSource, /competenceExpectationsLatex/);
  assert.doesNotMatch(appSource, /parseCompetenceExpectationsLatexBlock/);
  assert.doesNotMatch(appSource, /extractCompetenceExpectationsLatexPreamble/);
  assert.doesNotMatch(appSource, /importCompetenceExpectationsLatexFile/);
  assert.doesNotMatch(appSource, /%KOMPETENZERWARTUNG/);
});

test('der Import prüft Dateityp und Größe über eigene Textdatei-Helfer', () => {
  assert.match(appSource, /isCompetenceExpectationsTextFile\(file\)/);
  assert.match(appSource, /readValidatedCompetenceExpectationsFileText/);
  assert.match(appSource, /COMPETENCE_EXPECTATIONS_TEXT_BYTES/);
  assert.match(
    appSource,
    /async importCompetenceExpectationsTextFile\(file\) \{\s*if \(!this\.isCompetenceExpectationsTextFile\(file\)\)/
  );
});

test('die Statusmeldungen des Kompetenz-Imports sprechen von der Textdatei', () => {
  assert.match(appSource, /Bitte eine Textdatei auswählen\. Die Kompetenzerwartungen bleiben unverändert\./);
  assert.match(appSource, /Lese Textdatei\.\.\./);
  assert.match(appSource, /aus der Textdatei \$\{modeText\}/);
  assert.match(appSource, /Die Kompetenzerwartungen konnten nicht aus der Textdatei übernommen werden\./);
});

test('Übernehmen schließt den Dialog nur nach erfolgreichem Speichern', () => {
  const save = appSource.slice(appSource.indexOf('  saveCompetenceExpectationsDialog() {'));
  const body = save.slice(0, save.indexOf('\n  }\n') + 5);
  assert.match(body, /this\.closeCompetenceExpectationsDialog\(\);\s*\n\s*return true;/);
  assert.equal(body.match(/closeCompetenceExpectationsDialog/g).length, 1);
  assert.ok(body.indexOf('return false;') < body.indexOf('closeCompetenceExpectationsDialog'));
});

test('der LaTeX-Import für den Erwartungshorizont bleibt erhalten', () => {
  assert.match(html, /id="expectation-horizon-latex-file"/);
  assert.match(appSource, /isExpectationHorizonLatexFile\(file\)/);
  assert.match(appSource, /readValidatedLatexFileText/);
  assert.match(appSource, /addExpectationHorizonLatexFileToTemplate/);
  assert.match(appSource, /LATEX_BYTES/);
});
