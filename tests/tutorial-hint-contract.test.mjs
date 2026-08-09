import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  tutorialSource,
  moduleHintSource,
  tutorialStateSource,
  tooltipSource,
  tooltipStyles,
  shellSource,
  mainSource,
  ...moduleDocuments
] = await Promise.all([
  readFile(new URL('../src/app/first-run-tutorial.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/tutorial-entry-hint.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/tutorial-entry-state.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/app-tooltips.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/app-tooltips.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ...[
    'planning',
    'grades',
    'merger',
    'duplicate-check',
    'qr',
    'seatplan',
  ].map((moduleName) => readFile(
    new URL(`../src/modules/${moduleName}/app.html`, import.meta.url),
    'utf8',
  )),
]);

test('merkt gestartete Einführungen dauerhaft und modulübergreifend', () => {
  assert.match(tutorialStateSource, /TUTORIAL_ENTRY_HINT_SEEN_STORAGE_KEY = 'teachhelper:tutorial-entry-hint-seen:v1'/);
  assert.match(tutorialStateSource, /hasTutorialEntryHintBeenSeen/);
  assert.match(tutorialStateSource, /markTutorialEntryHintSeen/);
  assert.match(tutorialStateSource, /teachhelper:tutorial-started-tabs:v1/);
  assert.match(tutorialStateSource, /teachhelper:module-sidebar-tutorial-started-tabs:v1/);
  assert.match(tutorialSource, /function startFromEntry\(\) \{\s+return start\(\{ markStarted: true \}\);/);
  assert.match(tutorialSource, /if \(markStarted\) markTutorialStarted\(\);/);
  assert.match(moduleHintSource, /hasTutorialEntryHintBeenSeen\(\)/);
  assert.match(moduleHintSource, /markTutorialEntryHintSeen\(\)/);
});

test('zeigt den Hinweis nur bis ein Tutorial in einem beliebigen Modul gestartet wurde', () => {
  assert.match(tutorialSource, /!prompt \|\| active \|\| !activeTab \|\| hasTutorialEntryHintBeenSeen\(\)/);
  assert.match(tutorialSource, /persistUntilInteraction: true/);
  assert.match(tooltipSource, /show: \(anchor, options\) => showTooltip\(anchor, options\)/);
  assert.match(tooltipSource, /function handlePointerOver\(event\) \{\s+if \(persistentAnchor\) return;/);
  assert.match(tooltipSource, /if \(persistentAnchor\) return;\s+if \(anchor\) showTooltip\(anchor\);/);
  assert.match(tooltipSource, /function handleKeyDown\(event\) \{\s+if \(persistentAnchor\) \{\s+return;/);
  assert.match(tooltipSource, /function handleFocusOut\(event\) \{[\s\S]*?if \(persistentAnchor === anchor\) return;/);
});

test('fordert den Hinweis nur nach nutzerinitiierten Tabwechseln an', () => {
  assert.match(shellSource, /onActiveTabChange/);
  assert.match(shellSource, /if \(options\.showTutorialHint\) \{\s+notifyActiveTabChange\(state\.activeTab\)/);
  assert.match(mainSource, /setActiveTab\(tabKey, \{ showTutorialHint: true \}\)/);
  assert.match(mainSource, /onActiveTabChange: \(\) => firstRunTutorial\?\.showContextHelp\?\.\(\{ prompt: true \}\)/);
  assert.match(mainSource, /firstRunTutorial\.showContextHelp\(\{ prompt: true \}\)/);
});

test('lädt die Pulsanimation CSP-konform in allen iframe-Modulen', () => {
  assert.match(moduleHintSource, /classList\.add\('tutorial-attention-pulse'\)/);
  assert.doesNotMatch(moduleHintSource, /createElement\(['"]style['"]\)/);
  assert.match(tooltipStyles, /\.tutorial-attention-pulse\s*\{/);
  assert.match(tooltipStyles, /@keyframes tutorialEntryAttentionPulse/);
  const pulseKeyframes = tooltipStyles.match(
    /@keyframes tutorialEntryAttentionPulse\s*\{[\s\S]*?\n\}/,
  )?.[0] || '';
  assert.doesNotMatch(pulseKeyframes, /!important/);
  assert.match(pulseKeyframes, /border-color:/);
  assert.match(pulseKeyframes, /box-shadow:/);
  moduleDocuments.forEach((source) => {
    assert.match(source, /href=["']\.\.\/\.\.\/shared\/app-tooltips\.css["']/);
  });
});
