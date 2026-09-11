import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  mainSource,
  catalogSource,
  tutorialSource,
  shellStyles,
  gradesSource,
  planningSource,
  mergerSource,
  seatplanSource,
  groupsSource,
  pickerSource,
  duplicateSource,
  workPhaseSource,
  qrSource,
  nameLearningSource,
] = await Promise.all([
  readFile(new URL('../src/app/app-runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/catalog.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/first-run-tutorial.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/grades.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/planning.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/merger.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/seatplan.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/groups.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/random-picker.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/duplicate-check.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/work-phase.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/qr.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/tutorials/name-learning.js', import.meta.url), 'utf8'),
]);

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

function sectionsOf(source) {
  return [...new Set([...source.matchAll(/withSection\('([^']+)'/g)].map((match) => match[1]))];
}

const cases = {
  grades: gradesSource,
  planning: planningSource,
  merger: mergerSource,
  seatplan: seatplanSource,
  groups: groupsSource,
  picker: pickerSource,
  duplicate: duplicateSource,
  workPhase: workPhaseSource,
  qr: qrSource,
  nameLearning: nameLearningSource,
};

test('liefert die ausführlichen Definitionen ohne Budgets oder Komprimierung aus', () => {
  const catalogFiles = [catalogSource, ...Object.values(cases)].join('\n');
  assert.doesNotMatch(catalogFiles, /TUTORIAL_STEP_BUDGETS|TUTORIAL_FLOW_STEPS|compactTutorialSteps|applyTutorialStepBudget/);
  assert.match(catalogSource, /const steps = Array\.isArray\(definition\) \? definition : definition\?\.steps;/);
  assert.match(catalogSource, /return \[introStep, \.\.\.definition\];/);
  assert.match(catalogSource, /steps: \[introStep, \.\.\.\(Array\.isArray\(steps\) \? steps : \[\]\)\]/);

  const minimumStepDefinitions = {
    grades: [36, /gradesStep\(/g],
    planning: [39, /planningStep\(/g],
    merger: [23, /createModuleTutorialStep\(/g],
    seatplan: [21, /createModuleTutorialStep\(/g],
    groups: [18, /createModuleTutorialStep\(/g],
    picker: [9, /createModuleTutorialStep\(/g],
    duplicate: [14, /createModuleTutorialStep\(/g],
    workPhase: [20, /createModuleTutorialStep\(/g],
    qr: [16, /createModuleTutorialStep\(/g],
    nameLearning: [11, /nameLearningStep\(/g],
  };
  Object.entries(minimumStepDefinitions).forEach(([module, [minimum, pattern]]) => {
    assert.ok(count(cases[module], pattern) >= minimum, `${module} ist nicht vollständig`);
  });
});

test('gliedert jede Tour in Arbeitsphasen und zeigt den Fortschritt an', () => {
  assert.match(catalogSource, /const withSection = \(section, steps\) => \{/);
  assert.match(catalogSource, /createModuleTutorialStep\(\{\s+tab: activeTab,\s+section: 'Überblick',/);

  const expectedSections = {
    grades: ['Einrichten', 'Kurs aufbauen', 'Leistungen eingeben', 'Auswerten', 'Anzeige und Abschluss'],
    planning: ['Einrichten', 'Kurse anlegen', 'Woche planen', 'Stunde ausarbeiten', 'Auswerten und Abschluss'],
    merger: ['Werkzeuge', 'Seiten aufs Blatt', 'Zusammenführen', 'Drehen', 'Aufteilen'],
    seatplan: ['Namen laden', 'Raum bauen', 'Verteilen', 'Nachbearbeiten', 'Sichern und Drucken'],
    groups: ['Namen laden', 'Gruppen bilden', 'Anpassen', 'Sichern und Drucken'],
    picker: ['Vorbereiten', 'Ziehen', 'Sichern'],
    duplicate: ['Regeln wählen', 'Abgaben prüfen', 'Ergebnis lesen'],
    workPhase: ['Arbeitsauftrag', 'Timer', 'Lautstärkeampel', 'Präsentieren'],
    qr: ['Erstellen', 'Lesen'],
    nameLearning: ['Voraussetzungen', 'Lernmodus', 'Abfragen', 'Wiederholung'],
  };
  Object.entries(expectedSections).forEach(([module, sections]) => {
    assert.deepEqual(sectionsOf(cases[module]), sections, `Kapitel von ${module} stimmen nicht`);
  });

  assert.match(tutorialSource, /sectionNode\.className = 'tutorial-section'/);
  assert.match(tutorialSource, /progressNode\.className = 'tutorial-progress'/);
  assert.match(tutorialSource, /function getSectionProgress\(index\)/);
  assert.match(tutorialSource, /sectionNode\.hidden = !sectionProgress;/);
  assert.match(tutorialSource, /progressNode\.style\.setProperty\('--tutorial-progress'/);
  assert.match(shellStyles, /\.tutorial-section\s*\{/);
  assert.match(shellStyles, /\.tutorial-progress-fill\s*\{[\s\S]*?var\(--tutorial-progress/);
});

test('ordnet Noten und Planung entlang der realen Arbeitsabläufe', () => {
  assertOrdered(cases.grades, [
    "'Datenbank verbinden'", "'Noten verschlüsseln'", "'Daten sichern'", "'Kurs anlegen'",
    "'Notenstruktur festlegen'", "'Prozentgrenzen festlegen'", "'Teilnehmende verwalten'", "'Eingabe öffnen'",
    "'Modus wählen'", "'Leistung einordnen'", "'Ergebnisse erfassen'", "'Erwartungshorizont erstellen'",
    "'Leistung speichern'", "'Notenübersicht lesen'", "'Spalten per Rechtsklick verwalten'",
    "'Warnungen simulieren'", "'Datenschutzmodus'", "'Fotos und Namen lernen'", "'Übersicht drucken'",
    "'Schuljahr archivieren'",
  ]);
  assertOrdered(cases.planning, [
    "'Einstellungen öffnen'", "'Datenbank'", "'Backup'", "'Ferien eintragen'", "'Unterrichtszeiten pflegen'",
    "'Einstellungen übernehmen'", "'Kurs hinzufügen'", "'Kurse bedienen'", "'Serie per Doppelklick anlegen'",
    "'Wochenrhythmus'", "'Thema direkt eintragen'", "'Detailplanung'", "'Sitzplan öffnen'",
    "'Noteneingabe verknüpfen'", "'Stunde per Rechtsklick steuern'", "'Kursverlauf öffnen'",
    "'Archiv vorbereiten'", "'Speichern und weiterarbeiten'",
  ]);
});

test('ordnet die weiteren Touren vollständig und aufgabenorientiert', () => {
  assertOrdered(cases.seatplan, [
    "'Namensliste importieren'", "'Rastergröße anpassen'", "'Raumform auswählen'", "'Lehrkraft platzieren'",
    "'Sitzkriterien eingeben'", "'Vorschlag oder Zufall'", "'Kriterien auswerten'", "'Sitzplan nachbearbeiten'",
    "'Perspektive umdrehen'", "'Belegung zurücksetzen'", "'Sitzplan laden'", "'Sitzplan drucken'",
  ]);
  assertOrdered(cases.merger, [
    "'Werkzeugauswahl'", "'PDF auswählen'", "'Seiten pro Blatt'", "'Layout erstellen'", "'Dateien verbinden'",
    "'Dateireihenfolge'", "'Dateien zusammenführen'", "'PDF drehen'", "'Einzelne Seiten drehen'",
    "'Gedrehte PDF erstellen'", "'PDF aufteilen'", "'Seitenauswahl'", "'Ausgabeformat'", "'Seitengruppen'",
    "'Aufteilung starten'",
  ]);
  assertOrdered(cases.groups, ["'Namensliste importieren'", "'Aus dem Notenmodul übernehmen'", "'Gruppenkriterien öffnen'", "'Vorschlag erzeugen'", "'Einteilung manuell anpassen'", "'Gruppen sperren'", "'Gruppenthemen eintragen'", "'Gruppeneinteilung laden'", "'Gruppen drucken'"]);
  assertOrdered(cases.picker, ["'Gemeinsame Namensliste'", "'Auswahlbedingungen öffnen'", "'Nach der Ziehung deaktivieren'", "'Picker-Rad'", "'Auswahl starten'", "'Ergebnis erkennen'", "'Erneut auswählen'", "'Pickerstand speichern'"]);
  assertOrdered(cases.duplicate, ["'Prüfkriterien auswählen'", "'Abgaben als ZIP prüfen'", "'Zusammenfassung'", "'Duplikatgruppen'", "'Treffergründe'", "'Bilder vergleichen'", "'Ergebnis neu auswerten'", "'Originale bleiben unverändert'"]);
  assertOrdered(cases.workPhase, ["'Arbeitsphase im Überblick'", "'Arbeitsauftrag eingeben'", "'Arbeitsdauer festlegen'", "'Zwischenwarnungen konfigurieren'", "'Zeitliche Warnungen'", "'Arbeitszeit starten'", "'Timer stoppen'", "'Ampelschwellen festlegen'", "'Lautstärkeüberwachung starten'", "'Ampelfarben verstehen'", "'Überwachung stoppen'", "'Präsentationsansicht'", "'Vollbild verlassen'"]);
  assertOrdered(cases.qr, ["'QR-Werkzeuge auswählen'", "'Link eingeben'", "'QR-Code erstellen'", "'QR-Code kontrollieren'", "'Ziel-Link prüfen'", "'QR-Code herunterladen'", "'QR-Bild kopieren'", "'QR-Code aus Bild lesen'", "'Bild aus der Zwischenablage'", "'Kamera verwenden'", "'Kamerascan beenden'", "'Gelesenes Ergebnis'", "'Ergebnis kopieren'", "'Wenn das Lesen nicht klappt'"]);
  assertOrdered(cases.nameLearning, ["'Karten aus dem Notenmodul'", "'Kurse auswählen'", "'Fällige Karten abfragen'", "'Zufällig üben'", "'Foto ansehen'", "'Namen aufdecken'", "'Name und Kurs'", "'Gewusst oder nicht'", "'Nächste Abfrage'", "'Keine Karten fällig'", "'Trotzdem weiterüben'"]);
});

test('benennt Gesten, Berechtigungen und Sicherheitsfolgen eindeutig', () => {
  assert.match(cases.grades, /Andere Inhalte der Datenbank werden nicht verschlüsselt\./);
  assert.match(cases.grades, /Ohne Passwort lassen sich die geschützten Daten nicht wiederherstellen\./);
  assert.match(cases.grades, /Rechtsklick auf eine Leistungsspalte/);
  assert.match(cases.planning, /Doppelklicke eine freie Zelle/);
  assert.match(cases.groups, /Doppelklick sperrt eine Gruppe/);
  assert.match(cases.merger, /Per Drag-and-drop legst du die Reihenfolge fest/);
  assert.match(cases.duplicate, /deine Abgaben werden nicht verändert/);
  assert.match(cases.workPhase, /Mikrofonfreigabe/);
  assert.match(cases.qr, /Kamerafreigabe/);
  assert.match(cases.nameLearning, /ohne den Lernstand zu verändern/);
  assert.match(cases.nameLearning, /Ein Klick irgendwo auf die Karte/);
});

test('erklärt die sonst unauffindbaren Bedienwege', () => {
  assert.match(cases.grades, /data-tutorial-anchor="grades-sidebar-visibility"/);
  assert.match(cases.grades, /data-tutorial-anchor="grades-entry-config"/);
  assert.match(cases.grades, /data-tutorial-anchor="grades-competence-expectations"/);
  assert.match(cases.grades, /#show-grade-student-portraits/);
  assert.match(cases.planning, /#theme-preference-label/);
  assert.match(cases.planning, /#slot-dialog-parity/);
  assert.match(cases.planning, /#topic-dialog-rich-text-toolbar/);
  assert.match(cases.planning, /#course-dialog-no-lesson/);
  assert.match(cases.seatplan, /#grade-roster-import-trigger/);
  assert.match(cases.seatplan, /#template-link/);
  assert.match(cases.groups, /nodes\.gradeRosterImportTrigger/);
  assert.match(cases.groups, /nodes\.templateLink/);
  assert.match(cases.picker, /nodes\.preferencesRandomPickerAutoDisable/);
  assert.match(cases.workPhase, /nodes\.workOrderDurationRange/);
  assert.match(cases.workPhase, /nodes\.chromeOverlayToggle/);
});

test('behält isolierte Beispieldaten und zustandsabhängige Varianten', () => {
  for (const [source, activation] of [
    [cases.grades, 'activateGradesTutorialDemo'], [cases.planning, 'activatePlanningTutorialDemo'],
    [cases.seatplan, 'activateSeatplanTutorialDemo'], [cases.groups, 'activateClassroomTutorialDemo'],
    [cases.picker, 'activateClassroomTutorialDemo'], [cases.duplicate, 'activateDuplicateCheckTutorialDemo'],
    [cases.workPhase, 'activateWorkPhaseTutorialDemo'], [cases.qr, 'activateQrTutorialDemo'],
    [cases.nameLearning, 'activateNameLearningTutorialDemo'],
  ]) {
    assert.match(source, new RegExp(`activate: (?:\\(\\) => )?${activation}`));
    assert.match(source, /auto: true/);
  }
  assert.match(cases.seatplan, /if \(isCourseGradeMode\)/);
  assert.match(cases.seatplan, /\.\.\.\(!isCourseSeatplan \? \[createModuleTutorialStep\(\{/);
  assert.match(cases.seatplan, /\.\.\.\(isCourseSeatplan \? \[createModuleTutorialStep\(\{/);
});

test('verankert opake Module an konkreten sichtbaren Modulzielen', () => {
  assert.match(catalogSource, /const OPAQUE_FRAME_TABS = new Set\(\[\s+TAB_MERGER,\s+TAB_DUPLICATE_CHECK,\s+TAB_QR,\s+TAB_NAME_LEARNING,/);
  for (const selector of ['.tool-tab-bar', '#layoutStartButton', '#mergeStartButton', '#rotateStartButton', '#splitStartButton']) {
    assert.ok(cases.merger.includes(`target: mergerFrameTarget('${selector}')`), `PDF-Tutorialziel fehlt: ${selector}`);
  }
  assert.match(cases.merger, /#mergeFileListShell:not\(\.hidden\)[\s\S]*?#mergeDropZone/);
  assert.match(cases.merger, /\.rotate-page-card[\s\S]*?#rotateDropZone/);
  assert.match(cases.merger, /\.split-page-card[\s\S]*?#splitDropZone/);
  assert.doesNotMatch(cases.duplicate, /contentDocument/);
  assert.doesNotMatch(cases.qr, /contentDocument/);
  assert.doesNotMatch(cases.nameLearning, /contentDocument/);
  assert.match(catalogSource, /nameLearningFrameTarget: createFrameTarget\(frames\.getNameLearningFrame\)/);
});

test('hält Katalog, Engine und Laufzeit-Orchestrierung getrennt', () => {
  assert.match(mainSource, /import \{ createTutorialCatalog \} from '\.\/tutorials\/catalog\.js';/);
  assert.match(mainSource, /const tutorialCatalog = createTutorialCatalog\(\{/);
  assert.match(mainSource, /const getCurrentModuleTutorialSteps = tutorialCatalog\.getDefinition;/);
  assert.doesNotMatch(mainSource, /const createModuleTutorialStep|const withSection|Noten verschlüsseln|#layoutStartButton/);
  assert.doesNotMatch(catalogSource, /\bdocument\b|\bwindow\b|first-run-tutorial|src\/modules/);
  Object.values(cases).forEach((source) => {
    assert.doesNotMatch(source, /^\s*import\s/m);
    assert.doesNotMatch(source, /main\.js|first-run-tutorial|src\/modules/);
  });
  assert.match(mainSource, /createFirstRunTutorial\(\{/);
  assert.match(mainSource, /getContextualSteps: getCurrentModuleTutorialSteps/);
});
