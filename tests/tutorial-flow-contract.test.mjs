import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const flowSource = mainSource.slice(
  mainSource.indexOf('const TUTORIAL_FLOW_STEPS'),
  mainSource.indexOf('const compactTutorialSteps'),
);

const budgets = {
  TAB_GRADES: 25,
  TAB_PLANNING: 14,
  TAB_SEATPLAN: 10,
  TAB_MERGER: 6,
  TAB_GROUPS: 8,
  TAB_RANDOM_PICKER: 5,
  TAB_DUPLICATE_CHECK: 6,
  TAB_WORK_PHASE: 7,
  TAB_QR: 5,
};

test('begrenzt jede Modultour inklusive Einstieg', () => {
  assert.match(mainSource, /const TUTORIAL_STEP_BUDGETS = Object\.freeze\(\{/);
  Object.entries(budgets).forEach(([tab, budget]) => {
    assert.match(mainSource, new RegExp(`\\[${tab}\\]: ${budget},`));
  });
  assert.match(mainSource, /const compactedSteps = compactTutorialSteps\(activeTab, rawSteps\)/);
  assert.match(mainSource, /return applyTutorialStepBudget\(activeTab, \[introStep, \.\.\.compactedDefinition\]\)/);
  assert.match(mainSource, /steps\.slice\(0, budget\)/);
});

test('behält wichtige Rechts- und Doppelklicks in den gekürzten Touren', () => {
  assert.match(mainSource, /title: 'Kursmenü', copy: 'Ein Rechtsklick öffnet Kursdaten, Struktur und Teilnehmende\.'/);
  assert.match(mainSource, /title: 'Spaltenmenü',[\s\S]*?Ein Rechtsklick auf eine Spalte öffnet Bearbeiten und Übertragen\./);
  assert.match(mainSource, /title: 'Stundenmenü', copy: 'Das Stundenmenü bietet Kopieren, Verschieben, Entfall und Arbeiten\.'/);
  assert.match(mainSource, /title: 'Serie anlegen', copy: 'Ein Doppelklick auf eine freie Zelle erstellt eine Serie\.'/);
  assert.match(mainSource, /title: 'Gruppe sperren', copy: 'Ein Doppelklick sperrt eine Gruppe\.'/);
});

test('bündelt QR-Erstellen und QR-Lesen in fünf Schritten', () => {
  [
    'Werkzeug wählen',
    'QR-Code erstellen',
    'Code prüfen und speichern',
    'QR-Code lesen',
  ].forEach((title) => {
    assert.match(mainSource, new RegExp(`title: '${title}'`));
  });
  assert.match(mainSource, /\[TAB_QR\]: 5,/);
  assert.match(mainSource, /const qrFallback = \(nodes\) => nodes\.tabQr;/);
  assert.match(
    mainSource,
    /case TAB_QR:[\s\S]*?demo:\s*\{[\s\S]*?activate: activateQrTutorialDemo,[\s\S]*?auto: true/
  );
});

test('hält opake DuplikatCheck- und QR-Touren über sichtbare Host-Ziele vollständig', () => {
  assert.match(mainSource, /const TUTORIAL_OPAQUE_FRAME_TABS = new Set\(\[\s+TAB_MERGER,\s+TAB_DUPLICATE_CHECK,\s+TAB_QR,/);
  assert.match(mainSource, /if \(TUTORIAL_OPAQUE_FRAME_TABS\.has\(activeTab\)\) \{\s+compactedStep\.skipIfMissing = false;/);
  assert.match(mainSource, /skipIfMissing: !TUTORIAL_OPAQUE_FRAME_TABS\.has\(activeTab\)/);
  assert.match(mainSource, /const duplicateFallback = \(nodes\) => nodes\.tabDuplicateCheck;/);
  assert.match(mainSource, /const qrFallback = \(nodes\) => nodes\.tabQr;/);
  assert.match(
    mainSource,
    /case TAB_DUPLICATE_CHECK:[\s\S]*?title: 'Zusammenfassung'[\s\S]*?title: 'Duplikatgruppen'[\s\S]*?title: 'Originale bleiben unverändert'/
  );
  assert.match(
    mainSource,
    /case TAB_DUPLICATE_CHECK:[\s\S]*?demo:\s*\{[\s\S]*?activate: activateDuplicateCheckTutorialDemo,[\s\S]*?auto: true/
  );
  assert.doesNotMatch(
    mainSource.slice(mainSource.indexOf('case TAB_DUPLICATE_CHECK:'), mainSource.indexOf('case TAB_WORK_PHASE:')),
    /contentDocument/
  );
  assert.doesNotMatch(
    mainSource.slice(mainSource.indexOf('case TAB_QR:'), mainSource.indexOf('default:', mainSource.indexOf('case TAB_QR:'))),
    /contentDocument/
  );
});

test('erklärt die PDF-Werkzeuge an ihren Ausgabeschaltflächen', () => {
  [
    '.tool-tab-bar',
    '#layoutStartButton',
    '#mergeStartButton',
    '#rotateStartButton',
    '#splitStartButton',
  ].forEach((selector) => {
    assert.ok(
      mainSource.includes(`target: mergerFrameTarget('${selector}', (nodes) => nodes.tabMerger)`),
      `PDF-Tutorialziel fehlt: ${selector}`,
    );
  });
  assert.doesNotMatch(flowSource, /target: mergerFrameTarget\('#tool-tab-(?:layout|merge|rotate|split)'/);
  assert.doesNotMatch(flowSource, /\[TAB_MERGER\][\s\S]*?demo:/);
  assert.match(mainSource, /\[TAB_MERGER\]: 6,/);
});

test('berücksichtigt optionale Sitzplan- und DuplikatCheck-Schritte', () => {
  assert.match(mainSource, /source: \['Sitzplan speichern', 'Im Notenmodul speichern'\]/);
  assert.match(mainSource, /source: 'Noten am Sitzplatz eingeben'/);
  assert.match(mainSource, /source: 'Duplikatgruppen'/);
  assert.match(
    mainSource,
    /seatplanFrameTarget\(\['#teacher-card', '#grid \.seat-content\.teacher'\], seatplanFallback\)/
  );
  assert.match(mainSource, /if \(index < 0\) return \[\];/);
});

test('beschreibt die Tutorialschritte ohne Imperative', () => {
  assert.doesNotMatch(
    flowSource,
    /copy: '[^']*\b(?:Wähle|Lege|Trage|Erstelle|Importiere|Ziehe|Klicke|Wechsle|Drucke|Lade|Starte|Speichere|Prüfe|Öffne|Nutze|Sichere|Ergänze|Setze|Doppelklicke)\b/,
  );
  assert.match(flowSource, /Hier lassen sich Kategorien und Gewichtungen für den Kurs festlegen\./);
});

test('führt Notenstruktur und Teilnehmende vor der Leistungserfassung', () => {
  const structure = flowSource.indexOf("source: 'Notenstruktur festlegen'");
  const students = flowSource.indexOf("source: 'Teilnehmende verwalten'");
  const entry = flowSource.indexOf("source: 'Eingabe öffnen'");
  assert.ok(structure >= 0 && students > structure && entry > students);
});
