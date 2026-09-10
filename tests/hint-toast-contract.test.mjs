import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');

const [
  messagesSource,
  mainSource,
  groupsSource,
  seatplanSource,
  gradesSource,
  gradesDocument,
  planningSource,
  planningDocument,
  qrSource,
  qrDocument,
  mergerSource,
  mergerDocument,
] = await Promise.all([
  read('../src/shared/messages.js'),
  read('../src/main.js'),
  read('../src/modules/groups/app.js'),
  read('../src/modules/seatplan/app.js'),
  read('../src/modules/grades/app.js'),
  read('../src/modules/grades/app.html'),
  read('../src/modules/planning/app.js'),
  read('../src/modules/planning/app.html'),
  read('../src/modules/qr/app.js'),
  read('../src/modules/qr/app.html'),
  read('../src/modules/merger/app.js'),
  read('../src/modules/merger/app.html'),
]);

test('der Sitzplan-Fork stellt Erfolgsmeldungen wie die geteilte API als Toast dar', () => {
  assert.match(
    seatplanSource,
    /const presentation = options\.presentation \|\| \(variant === 'success' \? 'toast' : 'modal'\);/,
  );
  assert.match(
    seatplanSource,
    /showMessage\(\s*`Sitzplan aus „\$\{courseName\}“ übernommen[^`]*`,\s*'success',\s*\);/,
  );
});

test('keine wirkungslose duration-Option mehr - der Toast liest ausschliesslich durationMs', () => {
  assert.match(messagesSource, /const durationMs = Number\(options\.durationMs\);/);
  [mainSource, seatplanSource].forEach((source) => {
    assert.doesNotMatch(source, /showMessage\([^;]*\{[^}]*\bduration:/);
  });
  assert.match(
    seatplanSource,
    /Es bestehen noch \$\{confAfter\} Konflikte\.`, 'warn', \{ presentation: 'toast', durationMs: 7000 \}\)/,
  );
});

test('folgenlose Hinweise erscheinen als Toast statt als blockierendes Overlay', () => {
  const toastHints = [
    [mainSource, 'Keine Daten gefunden.'],
    [mainSource, 'Nur leere Zeilen gefunden.'],
    [groupsSource, 'Keine aktiven Gruppenfelder vorhanden.'],
    [mainSource, 'Importiere zuerst die Namensliste!'],
    [groupsSource, 'Maximale Anzahl an Gruppen erreicht.'],
    [groupsSource, 'Keine freien Gruppen verfügbar (alle gesperrt).'],
    [mainSource, 'Demo: Downloads sind für Beispieldaten deaktiviert.'],
    [mainSource, 'Demo: Dateiimporte verändern die Beispieldaten nicht.'],
    [seatplanSource, 'Keine aktiven Sitzplätze vorhanden.'],
    [seatplanSource, 'Keine aktiven Sitzplätze zum Minimieren.'],
    [seatplanSource, 'Keine Lernenden für den Geschlechtervorschlag vorhanden.'],
    [seatplanSource, 'Keine Daten gefunden.'],
    [seatplanSource, 'Importiere zuerst die Namensliste!'],
    [seatplanSource, 'Keine freien aktiven Plätze verfügbar.'],
    [seatplanSource, 'Die Namensliste kommt in diesem Kurs-Sitzplan aus dem Notenmodul.'],
  ];
  toastHints.forEach(([source, hint]) => {
    const pattern = new RegExp(
      `${hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[^;\\n]*presentation: 'toast'`,
    );
    assert.match(source, pattern, `"${hint}" sollte als Toast erscheinen`);
  });
});

test('Meldungen mit Konsequenz bleiben blockierende Modals', () => {
  const modalHints = [
    [mainSource, 'Vor dem Tutorial konnte kein Backup erstellt werden.'],
    [seatplanSource, 'Wenn „weit vorne“ aktiviert ist'],
  ];
  modalHints.forEach(([source, hint]) => {
    const index = source.indexOf(hint);
    assert.notEqual(index, -1, `"${hint}" nicht gefunden`);
    assert.doesNotMatch(
      source.slice(index, index + 220),
      /presentation: 'toast'/,
      `"${hint}" muss ein Modal bleiben`,
    );
  });
  const retryIndex = seatplanSource.indexOf('enqueue: true');
  assert.notEqual(retryIndex, -1);
});

test('alle Module mit Toast-Aufrufen laden auch das Toast-Stylesheet', () => {
  [
    [gradesDocument, gradesSource],
    [planningDocument, planningSource],
    [qrDocument, qrSource],
    [mergerDocument, mergerSource],
  ].forEach(([document, source]) => {
    assert.match(document, /<link rel="stylesheet" href="\.\.\/\.\.\/shared\/toast\.css">/);
    assert.match(source, /import \{ createMessageApi \} from ['"]\.\.\/\.\.\/shared\/messages\.js['"];/);
  });
});

test('Noten und Planung behalten den Modal-Pfad als Standard von showInfoMessage', () => {
  [gradesSource, planningSource].forEach((source) => {
    assert.match(source, /async showInfoMessage\(message, title = "Hinweis", options = \{\}\) \{\n\s*if \(options\.toast\) \{/);
    assert.match(source, /await this\.showMessageDialog\(\{\n\s*mode: "alert",/);
  });
});

test('Meldungen aus geöffneten Dialogen bleiben Modals, weil ein Toast im Top Layer verdeckt wäre', () => {
  const dialogBoundHints = [
    'Bookmarklet-Code wurde in die Zwischenablage kopiert.',
    'Für diesen Kurs sind keine Teilnehmenden vorhanden.',
    'Alle benannten Teilnehmenden dieses Kurses haben bereits ein Bild.',
  ];
  dialogBoundHints.forEach((hint) => {
    const index = gradesSource.indexOf(hint);
    assert.notEqual(index, -1, `"${hint}" nicht gefunden`);
    assert.doesNotMatch(
      gradesSource.slice(Math.max(0, index - 200), index + 200),
      /toast: true/,
      `"${hint}" erscheint im offenen Kursdialog und muss ein Modal bleiben`,
    );
  });
});

test('der PDF-Ergebnisdialog bleibt erhalten, wenn er einen Öffnen-Button trägt', () => {
  assert.match(mergerSource, /showResultToast\(`\$\{outputs\.length\} PDFs als ZIP-Download erstellt\.`, "success"\)/);
  assert.match(mergerSource, /showResultDialog\(successMessage, "ok", "", \{ bytes, name: outputName \}\)/);
});
