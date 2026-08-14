import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

function moduleCase(tab, nextTab) {
  const start = mainSource.indexOf(`case ${tab}:`);
  const end = nextTab
    ? mainSource.indexOf(`case ${nextTab}:`, start + 1)
    : mainSource.indexOf('\n      default:', start + 1);
  assert.ok(start >= 0 && end > start, `Tutorialblock ${tab} fehlt`);
  return mainSource.slice(start, end);
}

function assertOrdered(source, labels) {
  let previous = -1;
  labels.forEach((label) => {
    const index = source.indexOf(label, previous + 1);
    assert.ok(index > previous, `Tutorialschritt fehlt oder steht falsch: ${label}`);
    previous = index;
  });
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

const cases = {
  grades: moduleCase('TAB_GRADES', 'TAB_PLANNING'),
  planning: moduleCase('TAB_PLANNING', 'TAB_MERGER'),
  merger: moduleCase('TAB_MERGER', 'TAB_SEATPLAN'),
  seatplan: moduleCase('TAB_SEATPLAN', 'TAB_GROUPS'),
  groups: moduleCase('TAB_GROUPS', 'TAB_RANDOM_PICKER'),
  picker: moduleCase('TAB_RANDOM_PICKER', 'TAB_DUPLICATE_CHECK'),
  duplicate: moduleCase('TAB_DUPLICATE_CHECK', 'TAB_WORK_PHASE'),
  workPhase: moduleCase('TAB_WORK_PHASE', 'TAB_QR'),
  qr: moduleCase('TAB_QR'),
};

test('liefert die ausführlichen Definitionen ohne Budgets oder Komprimierung aus', () => {
  assert.doesNotMatch(mainSource, /TUTORIAL_STEP_BUDGETS|TUTORIAL_FLOW_STEPS|compactTutorialSteps|applyTutorialStepBudget/);
  assert.match(mainSource, /const steps = Array\.isArray\(definition\) \? definition : definition\?\.steps;/);
  assert.match(mainSource, /return \[introStep, \.\.\.definition\];/);
  assert.match(mainSource, /steps: \[introStep, \.\.\.\(Array\.isArray\(steps\) \? steps : \[\]\)\]/);

  const minimumStepDefinitions = {
    grades: [26, /gradesStep\(/g],
    planning: [28, /planningStep\(/g],
    merger: [21, /createModuleTutorialStep\(/g],
    seatplan: [17, /createModuleTutorialStep\(/g],
    groups: [16, /createModuleTutorialStep\(/g],
    picker: [7, /createModuleTutorialStep\(/g],
    duplicate: [13, /createModuleTutorialStep\(/g],
    workPhase: [18, /createModuleTutorialStep\(/g],
    qr: [13, /createModuleTutorialStep\(/g],
  };
  Object.entries(minimumStepDefinitions).forEach(([module, [minimum, pattern]]) => {
    assert.ok(count(cases[module], pattern) >= minimum, `${module} ist nicht vollständig`);
  });
});

test('ordnet Noten und Planung entlang der realen Arbeitsabläufe', () => {
  assertOrdered(cases.grades, [
    "'Datenbank verbinden'", "'Noten verschlüsseln'", "'Daten sichern'", "'Kurs anlegen'",
    "'Notenstruktur festlegen'", "'Teilnehmende verwalten'", "'Eingabe öffnen'", "'Modus wählen'",
    "'Leistung einordnen'", "'Ergebnisse erfassen'", "'Leistung speichern'", "'Notenübersicht lesen'",
    "'Spalten per Rechtsklick verwalten'", "'Datenschutzmodus'", "'Schuljahr archivieren'",
  ]);
  assertOrdered(cases.planning, [
    "'Datenbank'", "'Backup'", "'Ferien eintragen'", "'Kurs hinzufügen'",
    "'Serie per Doppelklick anlegen'", "'Wochenraster'", "'Thema direkt eintragen'", "'Detailplanung'",
    "'Sitzplan öffnen'", "'Noteneingabe verknüpfen'", "'Stunde per Rechtsklick steuern'",
    "'Kursverlauf öffnen'", "'Einstellungen öffnen'", "'Archiv vorbereiten'", "'Speichern und weiterarbeiten'",
  ]);
});

test('ordnet die sieben weiteren Touren vollständig und aufgabenorientiert', () => {
  assertOrdered(cases.seatplan, [
    "'Namensliste importieren'", "'Rastergröße anpassen'", "'Raumform auswählen'", "'Lehrkraft platzieren'",
    "'Sitzkriterien eingeben'", "'Vorschlag oder Zufall'", "'Kriterien auswerten'", "'Sitzplan nachbearbeiten'",
    "'Perspektive umdrehen'", "'Sitzplan laden'", "'Sitzplan drucken'",
  ]);
  assertOrdered(cases.merger, [
    "'Werkzeugauswahl'", "'PDF auswählen'", "'Seiten pro Blatt'", "'Layout erstellen'", "'Dateien verbinden'",
    "'Dateireihenfolge'", "'Dateien zusammenführen'", "'PDF drehen'", "'Einzelne Seiten drehen'",
    "'Gedrehte PDF erstellen'", "'PDF aufteilen'", "'Seitenauswahl'", "'Ausgabeformat'", "'Seitengruppen'",
  ]);
  assertOrdered(cases.groups, ["'Namensliste importieren'", "'Gruppenkriterien öffnen'", "'Vorschlag erzeugen'", "'Einteilung manuell anpassen'", "'Gruppen sperren'", "'Gruppenthemen eintragen'", "'Gruppeneinteilung laden'", "'Gruppen drucken'"]);
  assertOrdered(cases.picker, ["'Gemeinsame Namensliste'", "'Auswahlbedingungen öffnen'", "'Picker-Rad'", "'Auswahl starten'", "'Ergebnis erkennen'", "'Erneut auswählen'", "'Pickerstand speichern'"]);
  assertOrdered(cases.duplicate, ["'Prüfkriterien auswählen'", "'Abgaben als ZIP prüfen'", "'Zusammenfassung'", "'Duplikatgruppen'", "'Treffergründe'", "'Bilder vergleichen'", "'Ergebnis neu auswerten'", "'Originale bleiben unverändert'"]);
  assertOrdered(cases.workPhase, ["'Arbeitsphase im Überblick'", "'Arbeitsauftrag eingeben'", "'Arbeitsdauer festlegen'", "'Arbeitszeit starten'", "'Timer stoppen'", "'Ampelschwellen festlegen'", "'Lautstärkeüberwachung starten'", "'Ampelfarben verstehen'", "'Überwachung stoppen'", "'Präsentationsansicht'"]);
  assertOrdered(cases.qr, ["'QR-Werkzeuge auswählen'", "'Link eingeben'", "'QR-Code erstellen'", "'QR-Code kontrollieren'", "'QR-Code herunterladen'", "'QR-Bild kopieren'", "'QR-Code aus Bild lesen'", "'Bild aus der Zwischenablage'", "'Kamera verwenden'", "'Kamerascan beenden'", "'Gelesenes Ergebnis'", "'Ergebnis kopieren'", "'Wenn das Lesen nicht klappt'"]);
});

test('benennt Gesten, Berechtigungen und Sicherheitsfolgen eindeutig', () => {
  assert.match(cases.grades, /Ohne Passwort lassen sie sich nicht wiederherstellen\./);
  assert.match(cases.grades, /Rechtsklick auf eine Leistungsspalte/);
  assert.match(cases.planning, /Doppelklicke eine freie Zelle/);
  assert.match(cases.groups, /Doppelklick sperrt eine Gruppe/);
  assert.match(cases.merger, /Per Drag-and-drop legst du die Reihenfolge fest/);
  assert.match(cases.duplicate, /deine Abgaben werden nicht verändert/);
  assert.match(cases.workPhase, /Mikrofonfreigabe/);
  assert.match(cases.qr, /Kamerafreigabe/);
});

test('behält isolierte Beispieldaten und zustandsabhängige Varianten', () => {
  for (const [source, activation] of [
    [cases.grades, 'activateGradesTutorialDemo'], [cases.planning, 'activatePlanningTutorialDemo'],
    [cases.seatplan, 'activateSeatplanTutorialDemo'], [cases.groups, 'activateClassroomTutorialDemo'],
    [cases.picker, 'activateClassroomTutorialDemo'], [cases.duplicate, 'activateDuplicateCheckTutorialDemo'],
    [cases.workPhase, 'activateWorkPhaseTutorialDemo'], [cases.qr, 'activateQrTutorialDemo'],
  ]) {
    assert.match(source, new RegExp(`activate: (?:\\(\\) => )?${activation}`));
    assert.match(source, /auto: true/);
  }
  assert.match(cases.seatplan, /if \(isCourseGradeMode\)/);
  assert.match(cases.seatplan, /!isCourseSeatplan/);
  assert.match(cases.seatplan, /if \(isCourseSeatplan\)/);
});

test('verankert opake Module an konkreten sichtbaren Modulzielen', () => {
  assert.match(mainSource, /const TUTORIAL_OPAQUE_FRAME_TABS = new Set\(\[\s+TAB_MERGER,\s+TAB_DUPLICATE_CHECK,\s+TAB_QR,/);
  for (const selector of ['.tool-tab-bar', '#layoutStartButton', '#mergeStartButton', '#rotateStartButton', '#splitStartButton']) {
    assert.ok(cases.merger.includes(`target: mergerFrameTarget('${selector}')`), `PDF-Tutorialziel fehlt: ${selector}`);
  }
  assert.match(cases.merger, /#mergeFileListShell:not\(\.hidden\)[\s\S]*?#mergeDropZone/);
  assert.match(cases.merger, /\.rotate-page-card[\s\S]*?#rotateDropZone/);
  assert.match(cases.merger, /\.split-page-card[\s\S]*?#splitDropZone/);
  assert.doesNotMatch(cases.duplicate, /contentDocument/);
  assert.doesNotMatch(cases.qr, /contentDocument/);
});
