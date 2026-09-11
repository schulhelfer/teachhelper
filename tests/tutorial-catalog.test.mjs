import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tutorialFiles = [
  'duplicate-check.js',
  'grades.js',
  'groups.js',
  'merger.js',
  'name-learning.js',
  'planning.js',
  'qr.js',
  'random-picker.js',
  'seatplan.js',
  'work-phase.js',
];

const tutorialSources = new Map(await Promise.all(tutorialFiles.map(async (filename) => [
  filename,
  await readFile(new URL(`../src/app/tutorials/${filename}`, import.meta.url), 'utf8'),
])));
const tabsSource = await readFile(new URL('../src/shell/tabs.js', import.meta.url), 'utf8');
let catalogSource = await readFile(new URL('../src/app/tutorials/catalog.js', import.meta.url), 'utf8');
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
tutorialSources.forEach((source, filename) => {
  catalogSource = catalogSource.replace(`'./${filename}'`, `'${dataUrl(source)}'`);
});
catalogSource = catalogSource.replace("'../../shell/tabs.js'", `'${dataUrl(tabsSource)}'`);

const [{ createTutorialCatalog }, tabs] = await Promise.all([
  import(dataUrl(catalogSource)),
  import(dataUrl(tabsSource)),
]);

const tabEntries = [
  [tabs.TAB_GRADES, 'Noten', 38],
  [tabs.TAB_PLANNING, 'Planung', 41],
  [tabs.TAB_MERGER, 'PDF-Tools', 24],
  [tabs.TAB_SEATPLAN, 'Sitzplan', 19],
  [tabs.TAB_GROUPS, 'Gruppen', 19],
  [tabs.TAB_RANDOM_PICKER, 'Picker', 10],
  [tabs.TAB_DUPLICATE_CHECK, 'DuplikatCheck', 15],
  [tabs.TAB_WORK_PHASE, 'Arbeitsphase', 21],
  [tabs.TAB_QR, 'QR', 17],
  [tabs.TAB_NAME_LEARNING, 'Namen lernen', 12],
];

function createHarness({ externalFileSync = false, seatplanDataset = {}, seatplanDemo = false } = {}) {
  const calls = [];
  const frame = { contentDocument: { getElementById: () => ({ dataset: seatplanDataset }) } };
  const frameGetters = Object.fromEntries([
    'Planning',
    'Grades',
    'Merger',
    'DuplicateCheck',
    'Qr',
    'Seatplan',
    'NameLearning',
  ].map((name) => [`get${name}Frame`, () => frame]));
  const action = (name) => (...args) => calls.push([name, ...args]);
  const demo = (name) => (...args) => {
    calls.push([name, ...args]);
    return { steps: [] };
  };
  const catalog = createTutorialCatalog({
    shellSupportsExternalFileSync: externalFileSync,
    getComputedStyle: (node) => node.styleState || { display: 'block', visibility: 'visible' },
    frames: frameGetters,
    actions: {
      preparePlanningTutorialSurface: action('planning-surface'),
      prepareGradesTutorialSurface: action('grades-surface'),
      openMergerToolForTutorial: action('merger-tool'),
      openQrToolForTutorial: action('qr-tool'),
      prepareNameLearningTutorialSurface: action('name-learning-surface'),
    },
    demos: {
      activateGradesTutorialDemo: demo('grades-demo'),
      activatePlanningTutorialDemo: demo('planning-demo'),
      activateSeatplanTutorialDemo: demo('seatplan-demo'),
      activateClassroomTutorialDemo: demo('classroom-demo'),
      activateDuplicateCheckTutorialDemo: demo('duplicate-demo'),
      activateWorkPhaseTutorialDemo: demo('work-phase-demo'),
      activateQrTutorialDemo: demo('qr-demo'),
      activateNameLearningTutorialDemo: demo('name-learning-demo'),
      isSeatplanTutorialDemoActive: () => seatplanDemo,
    },
  });
  return { calls, catalog, frame, frameGetters };
}

function definitionSteps(definition) {
  return Array.isArray(definition) ? definition : definition.steps;
}

function getStep(definition, title) {
  return definitionSteps(definition).find((step) => step.title === title);
}

test('maps every module to its complete tutorial and prepends its intro', () => {
  const { catalog } = createHarness();
  const actualCounts = [];
  tabEntries.forEach(([activeTab, introTitle, expectedCount]) => {
    const definition = catalog.getDefinition({ activeTab });
    const steps = definitionSteps(definition);
    assert.equal(steps[0].title, introTitle);
    assert.equal(steps[0].section, 'Überblick');
    assert.equal(steps[0].tab, activeTab);
    actualCounts.push([activeTab, steps.length, expectedCount]);
  });
  assert.deepEqual(actualCounts.map(([activeTab, actual]) => [activeTab, actual]), tabEntries.map(([activeTab, , expected]) => [activeTab, expected]));
});

test('returns the unchanged fallback definition for unknown tabs', () => {
  const { catalog } = createHarness();
  const definition = catalog.getDefinition({ activeTab: 'unknown' });
  assert.ok(Array.isArray(definition));
  assert.equal(definition.length, 1);
  assert.equal(definition[0].title, 'Detailtour wählen');
  assert.equal(definition[0].tab, tabs.TAB_GROUPS);
  assert.equal(definition[0].placement, 'top');
});

test('keeps section order and automatic demo adapters', () => {
  const { calls, catalog } = createHarness();
  const expectedSections = new Map([
    [tabs.TAB_GRADES, ['Überblick', 'Einrichten', 'Kurs aufbauen', 'Leistungen eingeben', 'Auswerten', 'Anzeige und Abschluss']],
    [tabs.TAB_PLANNING, ['Überblick', 'Einrichten', 'Kurse anlegen', 'Woche planen', 'Stunde ausarbeiten', 'Auswerten und Abschluss']],
    [tabs.TAB_MERGER, ['Überblick', 'Werkzeuge', 'Seiten aufs Blatt', 'Zusammenführen', 'Drehen', 'Aufteilen']],
    [tabs.TAB_SEATPLAN, ['Überblick', 'Namen laden', 'Raum bauen', 'Verteilen', 'Nachbearbeiten', 'Sichern und Drucken']],
    [tabs.TAB_GROUPS, ['Überblick', 'Namen laden', 'Gruppen bilden', 'Anpassen', 'Sichern und Drucken']],
    [tabs.TAB_RANDOM_PICKER, ['Überblick', 'Vorbereiten', 'Ziehen', 'Sichern']],
    [tabs.TAB_DUPLICATE_CHECK, ['Überblick', 'Regeln wählen', 'Abgaben prüfen', 'Ergebnis lesen']],
    [tabs.TAB_WORK_PHASE, ['Überblick', 'Arbeitsauftrag', 'Timer', 'Lautstärkeampel', 'Präsentieren']],
    [tabs.TAB_QR, ['Überblick', 'Erstellen', 'Lesen']],
    [tabs.TAB_NAME_LEARNING, ['Überblick', 'Voraussetzungen', 'Lernmodus', 'Abfragen', 'Wiederholung']],
  ]);
  const demoTabs = tabEntries.map(([activeTab]) => activeTab).filter((activeTab) => activeTab !== tabs.TAB_MERGER);
  expectedSections.forEach((sections, activeTab) => {
    const actual = [...new Set(definitionSteps(catalog.getDefinition({ activeTab })).map((step) => step.section))];
    assert.deepEqual(actual, sections);
  });
  demoTabs.forEach((activeTab) => {
    const definition = catalog.getDefinition({ activeTab });
    assert.equal(definition.demo.auto, true);
    definition.demo.activate();
  });
  assert.deepEqual(calls.filter(([name]) => name.endsWith('-demo')).map(([name]) => name), [
    'grades-demo',
    'planning-demo',
    'seatplan-demo',
    'classroom-demo',
    'classroom-demo',
    'duplicate-demo',
    'work-phase-demo',
    'qr-demo',
    'name-learning-demo',
  ]);
  assert.deepEqual(calls.filter(([name]) => name === 'classroom-demo').map(([, activeTab]) => activeTab), [
    tabs.TAB_GROUPS,
    tabs.TAB_RANDOM_PICKER,
  ]);
});

test('delegates tutorial surface and tool preparation through explicit adapters', () => {
  const { calls, catalog } = createHarness();
  getStep(catalog.getDefinition({ activeTab: tabs.TAB_GRADES }), 'Datenbank verbinden').beforeRender();
  getStep(catalog.getDefinition({ activeTab: tabs.TAB_PLANNING }), 'Einstellungen öffnen').beforeRender();
  getStep(catalog.getDefinition({ activeTab: tabs.TAB_MERGER }), 'PDF auswählen').beforeRender();
  getStep(catalog.getDefinition({ activeTab: tabs.TAB_QR }), 'Link eingeben').beforeRender();
  getStep(catalog.getDefinition({ activeTab: tabs.TAB_QR }), 'Kamera verwenden').beforeRender();
  getStep(catalog.getDefinition({ activeTab: tabs.TAB_NAME_LEARNING }), 'Kurse auswählen').beforeRender();
  assert.deepEqual(calls, [
    ['grades-surface', 'gradesDatabase'],
    ['planning-surface', 'week'],
    ['merger-tool', 'layout'],
    ['qr-tool', 'generator'],
    ['qr-tool', 'decoder'],
    ['name-learning-surface', 'setup'],
  ]);
});

test('preserves seatplan variants for free, linked, grading, and demo plans', () => {
  const free = createHarness().catalog.getDefinition({ activeTab: tabs.TAB_SEATPLAN });
  assert.ok(getStep(free, 'Namensliste importieren'));
  assert.ok(getStep(free, 'Aus dem Notenmodul übernehmen'));
  assert.equal(getStep(free, 'Kursbindung lösen'), undefined);
  assert.equal(getStep(free, 'Bewertung erfassen'), undefined);

  const linked = createHarness({ seatplanDataset: { courseSeatplan: '1' } }).catalog.getDefinition({ activeTab: tabs.TAB_SEATPLAN });
  assert.ok(getStep(linked, 'Kursliste aus dem Notenmodul'));
  assert.ok(getStep(linked, 'Kursbindung lösen'));
  assert.equal(getStep(linked, 'Aus dem Notenmodul übernehmen'), undefined);

  const grading = createHarness({ seatplanDataset: { courseSeatplan: '1', courseGradeMode: '1' } }).catalog.getDefinition({ activeTab: tabs.TAB_SEATPLAN });
  assert.ok(getStep(grading, 'Noten am Sitzplatz eingeben'));

  const demo = createHarness({
    seatplanDataset: { courseSeatplan: '1', courseGradeMode: '1' },
    seatplanDemo: true,
  }).catalog.getDefinition({ activeTab: tabs.TAB_SEATPLAN });
  assert.ok(getStep(demo, 'Namensliste importieren'));
  assert.equal(getStep(demo, 'Kursbindung lösen'), undefined);
  assert.equal(getStep(demo, 'Noten am Sitzplatz eingeben'), undefined);
});

test('resolves frame targets and visible shell fallbacks without hidden DOM dependencies', () => {
  const { catalog, frameGetters } = createHarness();
  const mergerTarget = getStep(catalog.getDefinition({ activeTab: tabs.TAB_MERGER }), 'PDF auswählen').target({});
  assert.equal(mergerTarget.frame, frameGetters.getMergerFrame);
  assert.equal(mergerTarget.selector, '#layoutDropZone');
  assert.equal(mergerTarget.fallback, null);

  const visible = {
    getBoundingClientRect: () => ({ width: 20, height: 10 }),
    styleState: { display: 'block', visibility: 'visible' },
  };
  const hidden = {
    getBoundingClientRect: () => ({ width: 20, height: 10 }),
    styleState: { display: 'none', visibility: 'visible' },
  };
  const grades = createHarness().catalog.getDefinition({ activeTab: tabs.TAB_GRADES });
  assert.equal(getStep(grades, 'Manuell speichern').target({ sidebarManualSaveBtn: visible }), visible);
  assert.equal(getStep(grades, 'Manuell speichern').target({ sidebarManualSaveBtn: hidden }), null);
});

test('keeps external-file-sync variants and offline registration complete', async () => {
  const manual = createHarness().catalog.getDefinition({ activeTab: tabs.TAB_GRADES });
  const synced = createHarness({ externalFileSync: true }).catalog.getDefinition({ activeTab: tabs.TAB_GRADES });
  assert.ok(getStep(manual, 'Manuell speichern'));
  assert.equal(getStep(synced, 'Manuell speichern'), undefined);
  assert.match(getStep(manual, 'Daten sichern').copy, /Speichere die Datenbank regelmäßig/);
  assert.match(getStep(synced, 'Daten sichern').copy, /Backup-Ordner und Intervall/);

  const [serviceWorker, audit] = await Promise.all([
    readFile(new URL('../sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/audit.py', import.meta.url), 'utf8'),
  ]);
  ['catalog.js', ...tutorialFiles].forEach((filename) => {
    assert.ok(serviceWorker.includes(`./src/app/tutorials/${filename}`));
    assert.ok(audit.includes(`'tutorials' / '${filename}'`));
  });
});
