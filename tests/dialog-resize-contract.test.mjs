import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const resizeScript = await read('../src/shared/dialog-resize.js');
const resizeStyles = await read('../src/shared/dialog-resize.css');
const serviceWorker = await read('../sw.js');

const documents = await Promise.all([
  ['Hauptansicht', '../index.html', './src/shared/dialog-resize'],
  ['Noten', '../src/modules/grades/app.html', '../../shared/dialog-resize'],
  ['Planung', '../src/modules/planning/app.html', '../../shared/dialog-resize'],
  ['Sitzplan', '../src/modules/seatplan/app.html', '../../shared/dialog-resize'],
  ['Zusammenführen', '../src/modules/merger/app.html', '../../shared/dialog-resize'],
  ['QR-Codes', '../src/modules/qr/app.html', '../../shared/dialog-resize'],
].map(async ([name, path, prefix]) => [name, await read(path), prefix]));

test('jedes Dokument mit Dialogen lädt Stil und Skript zur Größenänderung', () => {
  for (const [name, source, prefix] of documents) {
    assert.match(source, new RegExp(`href="${prefix}\.css"`), name);
    assert.match(source, new RegExp(`src="${prefix}\.js"`), name);
  }
});

test('der Service Worker legt beide Dateien zur Größenänderung im Cache ab', () => {
  assert.match(serviceWorker, /'\.\/src\/shared\/dialog-resize\.js'/);
  assert.match(serviceWorker, /'\.\/src\/shared\/dialog-resize\.css'/);
});

test('der Griff wird ohne Änderung am Markup in jeden Dialog eingesetzt', () => {
  assert.match(resizeScript, /attributeFilter: \['open'\]/);
  assert.match(resizeScript, /new MutationObserver/);
  assert.match(resizeScript, /dialog\.append\(grip\)/);
  assert.match(resizeScript, /document\.querySelectorAll\('dialog\[open\]'\)/);
  for (const [name, source] of documents) {
    assert.doesNotMatch(source, /dialog-resize-grip/, name);
  }
});

test('der Griff bleibt außerhalb der Kopfzeilen-Aktionsgruppe', () => {
  assert.doesNotMatch(resizeScript, /dialog-header/);
  assert.doesNotMatch(resizeScript, /app-action-group/);
});

test('der Griff ist eine Schaltfläche mit deutscher Beschriftung und Tastaturbedienung', () => {
  assert.match(resizeScript, /grip\.type = 'button'/);
  assert.match(resizeScript, /setAttribute\('aria-label', 'Dialoggröße ändern'\)/);
  assert.match(resizeScript, /ArrowRight: \[RESIZE_STEP, 0\]/);
  assert.match(resizeScript, /ArrowUp: \[0, -RESIZE_STEP\]/);
});

test('das Ziehen verdoppelt den Weg, weil showModal den Dialog zentriert', () => {
  assert.match(resizeScript, /const dx = moveEvent\.clientX - startX/);
  assert.match(resizeScript, /const dy = moveEvent\.clientY - startY/);
  assert.match(resizeScript, /size\.width = startWidth \+ \(dx \* 2\)/);
  assert.match(resizeScript, /size\.height = startHeight \+ \(dy \* 2\)/);
});

test('einzelne Achsen lassen sich unabhängig ändern', () => {
  assert.match(resizeScript, /const AXIS_LOCK_RATIO = 0\.34/);
  assert.match(resizeScript, /function resolveAxis\(dx, dy\)/);
  assert.match(resizeScript, /if \(axis !== 'y'\) size\.width/);
  assert.match(resizeScript, /if \(axis !== 'x'\)/);
});

test('der Griff trägt keinen Kurzhinweis, aber eine Beschriftung', () => {
  assert.doesNotMatch(resizeScript, /data-tooltip/);
  assert.match(resizeScript, /setAttribute\('aria-label', 'Dialoggröße ändern'\)/);
});

test('die Zeigerverfolgung wird eingefangen und vollständig wieder gelöst', () => {
  assert.match(resizeScript, /setPointerCapture/);
  assert.match(resizeScript, /'pointercancel', finish/);
  assert.match(resizeScript, /'lostpointercapture', finish/);
});

test('die Mindestgröße stammt aus der natürlichen Größe des Dialogs', () => {
  assert.match(resizeScript, /minWidth: Math\.min\(Math\.max\(MIN_FLOOR, base\.width\), maxWidth\)/);
  assert.doesNotMatch(resizeScript, /MIN_WIDTH = 380/);
});

test('die Breite überschreibt auch die Höchstbreite des Stylesheets', () => {
  assert.match(resizeScript, /dialog\.style\.maxWidth = `\$\{next\.width\}px`/);
});

test('feste Höhen entstehen durch Kennzeichnung oder ausdrückliches Ziehen', () => {
  assert.match(resizeScript, /dataset\.dialogResizeHeight === 'fixed'/);
  assert.match(resizeScript, /if \(usesFixedHeight\(dialog\) \|\| explicitHeights\.has\(dialog\)\) dialog\.style\.height/);
  assert.match(resizeScript, /dialog\.style\.maxHeight = `\$\{next\.height\}px`/);
  assert.match(resizeScript, /explicitHeights\.delete\(dialog\)/);
});

test('die Größe überlebt das Schließen, aber nicht das Neuladen', () => {
  assert.match(resizeScript, /const sizes = new Map\(\)/);
  assert.doesNotMatch(resizeScript, /localStorage|sessionStorage|postMessage/);
});

test('die Größe wird beim Ändern des Fensters neu begrenzt', () => {
  assert.match(resizeScript, /window\.addEventListener\('resize'/);
  assert.match(resizeScript, /dialog\[open\]\.is-dialog-resized/);
});

test('der Griff zeigt sich bei Annäherung und dauerhaft auf Tastaturfokus', () => {
  assert.match(resizeStyles, /\.dialog-resize-grip \{[\s\S]*?opacity: 0;/);
  assert.match(resizeStyles, /dialog\.has-dialog-resize:hover \.dialog-resize-grip/);
  assert.match(resizeStyles, /\.dialog-resize-grip:focus-visible/);
  assert.match(resizeStyles, /@media \(hover: none\)[\s\S]*?opacity: 0\.55;/);
  assert.match(resizeStyles, /\.dialog-resize-grip:focus-visible \{[\s\S]*?box-shadow: none;/);
  assert.match(resizeStyles, /\.dialog-resize-grip:focus-visible::after \{[\s\S]*?border-color: var\(--border-focus\)/);
});

test('der Griff übernimmt keine Schaltflächenoptik beim Überfahren', () => {
  assert.match(resizeStyles, /\.dialog-resize-grip \{[\s\S]*?border-radius: 0;/);
  assert.match(resizeStyles, /\.dialog-resize-grip \{[\s\S]*?box-shadow: none;/);
  assert.match(resizeStyles, /\.dialog-resize-grip:hover:not\(:disabled\)/);
  assert.match(resizeStyles, /\.dialog-resize-grip:active:not\(:disabled\)/);
});

test('der Griff trägt nur den runden Bogen ohne Kreis- oder Kastenfläche', () => {
  assert.doesNotMatch(resizeStyles, /\.dialog-resize-grip::before/);
  assert.match(resizeStyles, /\.dialog-resize-grip::after \{[\s\S]*?border-bottom-right-radius: 16px;/);
  assert.match(resizeStyles, /border-right: 2\.5px solid currentColor;/);
  assert.match(resizeStyles, /cursor: nwse-resize;/);
  assert.match(resizeStyles, /touch-action: none;/);
});

test('der Griff bewegt sich nicht bei reduzierter Bewegung', () => {
  assert.match(resizeStyles, /@media \(prefers-reduced-motion: reduce\)/);
});
