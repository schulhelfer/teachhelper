import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
  .then((source) => source.split('\r\n').join('\n'));

const [moduleWindow, tearOff, bootstrap, main, shell, shellCss, serviceWorker, tabsSource] = await Promise.all([
  read('../src/app/module-window.js'),
  read('../src/app/tab-tear-off.js'),
  read('../src/app/bootstrap.js'),
  read('../src/main.js'),
  read('../src/app/shell.js'),
  read('../src/app/shell.css'),
  read('../sw.js'),
  read('../src/shell/tabs.js'),
]);

const toModuleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const tabsUrl = toModuleUrl(tabsSource);
const moduleWindowUrl = toModuleUrl(
  moduleWindow.replace("'../shell/tabs.js'", JSON.stringify(tabsUrl)),
);
const {
  TEAR_OFF_TABS,
  buildModuleWindowUrl,
  computeModuleWindowPlacement,
  getModuleWindowName,
  isTearOffTab,
  readModuleWindowRequest,
} = await import(moduleWindowUrl);
const { resolveTearNameFontSize } = await import(
  toModuleUrl(tearOff.replace("'./module-window.js'", JSON.stringify(moduleWindowUrl)))
);

test('nur datenbankfreie Werkzeuge lassen sich ausklinken', () => {
  assert.deepEqual(
    [...TEAR_OFF_TABS].sort(),
    ['duplicate-check', 'groups', 'merger', 'qr', 'random-picker', 'work-phase'],
  );
  for (const tab of ['grades', 'planning', 'seatplan', 'name-learning']) {
    assert.equal(isTearOffTab(tab), false, `${tab} darf nicht ausklinkbar sein`);
  }
});

test('der Bootparameter wird streng validiert und nicht normalisiert', () => {
  assert.doesNotMatch(moduleWindow, /normalizeTab/);

  assert.deepEqual(
    readModuleWindowRequest({ search: '?tab=qr&window=module' }),
    { tab: 'qr', isModuleWindow: true },
  );
  assert.deepEqual(
    readModuleWindowRequest({ search: '?tab=grades&window=module' }),
    { tab: '', isModuleWindow: true },
    'gesperrte Tabs kommen auch per URL nicht durch',
  );
  assert.deepEqual(
    readModuleWindowRequest({ search: '?tab=voellig-unbekannt' }),
    { tab: '', isModuleWindow: false },
    'Unbekanntes faellt nicht auf Gruppen zurueck',
  );
  assert.deepEqual(
    readModuleWindowRequest(null),
    { tab: '', isModuleWindow: false },
  );
});

test('die Fenster-URL bleibt im App-Scope und traegt beide Parameter', () => {
  const url = new URL(buildModuleWindowUrl('merger', 'https://example.test/app/index.html?tab=qr'));
  assert.equal(url.pathname, '/app/');
  assert.equal(url.searchParams.get('tab'), 'merger');
  assert.equal(url.searchParams.get('window'), 'module');
  assert.equal(getModuleWindowName('merger'), 'teachhelper-tab-merger');
});

const SIDEBAR_STACK_BREAKPOINT = 980;
const SIDEBAR_NARROW_BREAKPOINT = 1100;

test('das Fenster startet breit genug fuer das zweispaltige Layout', () => {
  const screen = { availLeft: 0, availTop: 0, availWidth: 2560, availHeight: 1440 };
  for (const tab of TEAR_OFF_TABS) {
    const { width } = computeModuleWindowPlacement(tab, { screenX: 1280, screenY: 400, ...screen });
    assert.ok(
      width > SIDEBAR_NARROW_BREAKPOINT,
      `${tab}: ${width}px klappt die Sidebar nach oben oder quetscht sie`,
    );
  }
  assert.ok(
    computeModuleWindowPlacement('merger', { screenX: 1280, screenY: 400, ...screen }).width
      > computeModuleWindowPlacement('qr', { screenX: 1280, screenY: 400, ...screen }).width,
    'die Werkzeuge mit Dateilisten bekommen mehr Platz',
  );
});

test('nur ein zu kleiner Bildschirm darf unter den Umbruchpunkt zwingen', () => {
  const narrow = computeModuleWindowPlacement('qr', {
    screenX: 400,
    screenY: 300,
    availLeft: 0,
    availTop: 0,
    availWidth: 900,
    availHeight: 700,
  });
  assert.equal(narrow.width, 900, 'auf einem 900px-Schirm bleibt nur die volle Breite');
  assert.ok(narrow.width < SIDEBAR_STACK_BREAKPOINT);
});

test('das Fenster bleibt auch bei Randwuerfen auf dem Bildschirm', () => {
  const screen = { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1080 };
  const centered = computeModuleWindowPlacement('qr', { screenX: 960, screenY: 400, ...screen });
  assert.equal(centered.width, 1280);
  assert.equal(centered.left, 960 - 640);

  for (const [screenX, screenY] of [[0, 0], [1920, 1080], [-500, -500], [4000, 4000]]) {
    const placement = computeModuleWindowPlacement('merger', { screenX, screenY, ...screen });
    assert.ok(placement.left >= 0, `left ${placement.left}`);
    assert.ok(placement.top >= 0, `top ${placement.top}`);
    assert.ok(placement.left + placement.width <= screen.availWidth, 'rechter Rand');
    assert.ok(placement.top + placement.height <= screen.availHeight, 'unterer Rand');
  }
});

test('ein kleiner Bildschirm verkleinert das Fenster statt es hinauszuschieben', () => {
  const placement = computeModuleWindowPlacement('merger', {
    screenX: 600,
    screenY: 400,
    availLeft: 0,
    availTop: 0,
    availWidth: 800,
    availHeight: 600,
  });
  assert.equal(placement.width, 800);
  assert.equal(placement.height, 600);
  assert.equal(placement.left, 0);
  assert.equal(placement.top, 0);
});

test('ein Mehrmonitor-Offset wird beruecksichtigt', () => {
  const placement = computeModuleWindowPlacement('qr', {
    screenX: -1500,
    screenY: 200,
    availLeft: -1920,
    availTop: 0,
    availWidth: 1920,
    availHeight: 1080,
  });
  assert.ok(placement.left >= -1920, `left ${placement.left}`);
  assert.ok(placement.left + placement.width <= 0, 'bleibt auf dem linken Monitor');
});

test('das Modulfenster oeffnet ohne noopener, damit es wiederverwendet werden kann', () => {
  assert.match(moduleWindow, /windowRef\.open\(\s*buildModuleWindowUrl\(/);
  assert.doesNotMatch(moduleWindow, /noopener|noreferrer/);
  assert.match(moduleWindow, /opened\?\.focus\(\)/);
  assert.match(moduleWindow, /'popup=yes'/);
});

test('der Drag laeuft nativ, damit das Bild auch ausserhalb des Fensters folgt', () => {
  assert.match(tearOff, /button\.draggable = true/);
  assert.match(tearOff, /nav\.addEventListener\('dragstart'/);
  assert.match(tearOff, /nav\.addEventListener\('dragend'/);
  assert.match(tearOff, /document\.addEventListener\('dragover'/);
  assert.match(tearOff, /event\.dataTransfer\.setDragImage\(ghost, DRAG_IMAGE_ANCHOR_X, DRAG_IMAGE_ANCHOR_Y\)/);
  assert.doesNotMatch(tearOff, /pointerdown|pointermove|setPointerCapture/, 'der Pointer-Drag ist abgeloest');
});

test('nur ausklinkbare Tabs werden ueberhaupt ziehbar', () => {
  assert.match(
    tearOff,
    /nav\.querySelectorAll\('\.tab-button\[data-tab-target\]'\)[\s\S]*?if \(isTearOffTab\(button\.dataset\.tabTarget\)\) \{\s+button\.draggable = true;/,
  );
  assert.match(tearOff, /if \(!button \|\| !event\.dataTransfer\) \{\s+event\.preventDefault\(\);/);
});

test('die Drag-Nutzlast landet nicht als Text in fremden Zielen', () => {
  assert.match(tearOff, /const TEAR_DRAG_MIME = 'application\/x-teachhelper-tab'/);
  assert.doesNotMatch(tearOff, /setData\('text\//);
});

test('das Drag-Bild wird nach dem Rastern wieder abgeraeumt', () => {
  assert.match(tearOff, /document\.body\.append\(ghost\)/);
  assert.match(tearOff, /window\.setTimeout\(\(\) => ghost\.remove\(\), 0\)/);
  assert.doesNotMatch(tearOff, /insertBefore|append\(state\.button|\.sort\(/);
});

test('unbrauchbare dragend-Koordinaten fallen auf den letzten dragover zurueck', () => {
  const reader = tearOff.match(/const readDropPoint = \([\s\S]*?\n  \);/)?.[0] || '';
  assert.match(reader, /event\.clientX === 0 && event\.clientY === 0/);
  assert.match(reader, /state\.lastScreenX/);
  assert.match(reader, /state\.lastScreenY/);
});

test('der Modulname fuellt das Fenster und passt auch beim laengsten Label', () => {
  assert.equal(resolveTearNameFontSize('QR'), 64, 'kurze Namen laufen in die Obergrenze');
  assert.equal(resolveTearNameFontSize('Gruppen'), 49);
  assert.equal(resolveTearNameFontSize('DuplikatCheck'), 26);

  const labels = ['QR', 'Picker', 'Gruppen', 'PDF-Tools', 'Arbeitsphase', 'DuplikatCheck'];
  for (const label of labels) {
    const size = resolveTearNameFontSize(label);
    assert.ok(size >= 24 && size <= 64, `${label} -> ${size}px`);
    assert.ok(size * 0.62 * label.length <= 232, `${label} passt nicht in die Fensterbreite`);
  }
  assert.ok(
    resolveTearNameFontSize('Picker') > resolveTearNameFontSize('Arbeitsphase'),
    'kuerzere Namen werden groesser gesetzt',
  );
  assert.equal(resolveTearNameFontSize(''), 24);
  assert.equal(resolveTearNameFontSize(null), 24);
  assert.match(shellCss, /font-size: var\(--tear-name-size, \d+px\);/);
});

test('der Geist ist ein Fenster mit Titelleiste und grossem Namen', () => {
  assert.doesNotMatch(tearOff, /MODULE_PREVIEW_PARTS|data-tear-preview/, 'die stilisierte Vorschau ist weg');
  assert.doesNotMatch(shellCss, /data-tear-preview/);
  for (const className of [
    'tab-tear-ghost',
    'tab-tear-ghost-bar',
    'tab-tear-ghost-dots',
    'tab-tear-ghost-name',
  ]) {
    assert.match(tearOff, new RegExp(`'${className}'`), className);
    assert.match(shellCss, new RegExp(`\\.${className}[\\s.,>[{]`), `${className} fehlt im Stylesheet`);
  }
  const ghost = shellCss.slice(
    shellCss.indexOf('.tab-tear-ghost {'),
    shellCss.indexOf('.tab-tear-ghost-bar {'),
  );
  assert.match(ghost, /left: -10000px;/, 'das Drag-Bild muss ausserhalb des Sichtfelds gerastert werden');
  assert.doesNotMatch(ghost, /display: none|visibility: hidden/, 'sonst rastert der Browser ein leeres Bild');
});

test('die Leiste bekommt beim Ziehen keinen Rahmen, nur der Quelltab blasst ab', () => {
  assert.match(shellCss, /\.tab-button\.is-tearing \{/);
  assert.doesNotMatch(shellCss, /is-tearing-tab/, 'der gestrichelte Kasten um die Leiste ist weg');
  assert.doesNotMatch(tearOff, /is-tearing-tab/);
  assert.match(shellCss, /\.app\[data-module-window='true'\] #sidebar-manual-save-btn \{\s+display: none;/);
});

test('die Seite nimmt den Drop an, sonst zeigt der Zeiger ein Verbotsschild', () => {
  const dragover = tearOff.match(/document\.addEventListener\('dragover'[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.match(dragover, /event\.preventDefault\(\);/);
  assert.match(dragover, /event\.dataTransfer\.dropEffect = 'move';/);
  assert.match(
    tearOff,
    /document\.addEventListener\('dragenter', \(event\) => \{\s+if \(!dragState\) return;\s+event\.preventDefault\(\);/,
  );
  assert.match(
    tearOff,
    /document\.addEventListener\('drop', \(event\) => \{\s+if \(!dragState\) return;\s+event\.preventDefault\(\);/,
  );
  assert.match(dragover, /if \(!dragState\) return;/, 'fremde Datei-Drops bleiben unberuehrt');
});

test('eine Ablageschicht faengt die Drag-Events ueber den Modul-iframes ab', () => {
  assert.match(tearOff, /state\.dropLayer\?\.remove\(\);/, 'die Schicht darf den Drag nicht ueberleben');

  const dragstart = tearOff.match(/nav\.addEventListener\('dragstart'[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.match(dragstart, /dropLayer: null,/);
  assert.doesNotMatch(
    dragstart,
    /ensureDropLayer|document\.body\.append\(layer\)/,
    'Chrome bricht den Drag ab, wenn dragstart den DOM umbaut - die Schicht kommt erst beim ersten dragover',
  );
  assert.match(tearOff, /if \(!dragState\) return;\s+ensureDropLayer\(dragState\);/);

  const layer = shellCss.match(/\.tab-tear-drop-layer \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.match(layer, /position: fixed;/);
  assert.match(layer, /inset: 0;/);
  assert.doesNotMatch(
    layer,
    /pointer-events: none/,
    'ohne Trefferflaeche gingen die Events wieder an den opaken iframe',
  );

  const layerZ = Number(layer.match(/z-index: (\d+);/)?.[1]);
  const ghost = shellCss.match(/\.tab-tear-ghost \{[\s\S]*?\n    \}/)?.[0] || '';
  const ghostZ = Number(ghost.match(/z-index: (\d+);/)?.[1]);
  assert.ok(layerZ > ghostZ, `Ablageschicht ${layerZ} muss ueber allem liegen`);
});

test('das Modulfenster behaelt einen Ziehbereich fuer die Fenstersteuerung', () => {
  const header = shellCss.match(
    /\.app\[data-module-window='true'\]>\.app-header \{[\s\S]*?\n    \}/,
  )?.[0] || '';
  assert.doesNotMatch(
    header,
    /display: none/,
    'app-region: drag haengt an .app-header - ohne sie laesst sich das Fenster nicht verschieben',
  );
  assert.match(header, /height: var\(--window-controls-height, 0px\);/);
  assert.match(header, /min-height: 0;/, 'die Basisregel setzt sonst 46px Mindesthoehe');
  assert.match(shellCss, /\.app\[data-module-window='true'\]>\.app-header>\* \{\s+display: none;/);

  const wco = shellCss.slice(shellCss.indexOf('@media (display-mode: window-controls-overlay)'));
  assert.match(wco, /\.app-header \{[\s\S]*?app-region: drag;/);
  assert.match(wco, /--window-controls-height: env\(titlebar-area-height, 0px\);/);
});

test('das Modulfenster fragt beim Schliessen nie nach ungespeicherten Aenderungen', () => {
  const handler = shell.match(/function handleBeforeUnload\(event\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(
    handler,
    /if \(els\.app\?\.dataset\.moduleWindow === 'true'\) \{\s+return;/,
    'ein ephemeres Fenster hat keine Datenbank, in die es speichern koennte',
  );
  assert.ok(
    handler.indexOf('moduleWindow') < handler.indexOf('planningUnsavedState'),
    'die Abkuerzung muss vor der Dirty-Pruefung greifen',
  );
});

test('das Modulfenster haengt sich nie an die Datenbank', () => {
  assert.match(
    bootstrap,
    /const moduleWindowRequest = readModuleWindowRequest\(window\.location\);[\s\S]*?installWorkspaceController\(window, \{\s*ephemeral: moduleWindowRequest\.isModuleWindow,/,
  );
});

test('das Modulfenster startet direkt im Modul, ohne Planung zu mounten', () => {
  assert.match(
    main,
    /try \{\s+if \(moduleWindowRequest\.tab\) \{\s+setActiveTabImmediate\(moduleWindowRequest\.tab\);\s+\} else \{\s+setActiveTab\(TAB_PLANNING\);\s+\}/,
    'ein Umweg ueber Planung wuerde das Modul samt iframe unnoetig laden',
  );
  assert.match(
    main,
    /if \(moduleWindowRequest\.isModuleWindow\) \{\s+applyModuleWindowChrome\(\);/,
  );
  const chrome = main.match(/function applyModuleWindowChrome\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(chrome, /dataset\.moduleWindow = 'true'/);
  assert.doesNotMatch(
    chrome,
    /setChromeCollapsed/,
    'der Chrome-Collapse wuerde auch die Sidebar einklappen',
  );
  assert.match(shellCss, /\.app\[data-module-window='true'\]>\.app-header>\* \{\s+display: none;/);
  assert.doesNotMatch(
    shellCss,
    /\.app\[data-module-window='true'\][^{]*\.side[^{]*\{/,
    'die Sidebar bleibt im Modulfenster sichtbar',
  );
  assert.match(
    main,
    /if \(!moduleWindowRequest\.isModuleWindow\) \{\s+pwaInstallPrompt\.showIfNeeded\(\);/,
  );
});

test('Alt-Klick oeffnet das Fenster ohne Drag und nur fuer erlaubte Tabs', () => {
  assert.match(main, /if \(event\.altKey && tearOffTabToWindow\(tabKey, \{/);
  assert.match(main, /function tearOffTabToWindow\([\s\S]*?if \(!isTearOffTab\(tabKey\)\) return false;/);
});

test('beide neuen Dateien liegen im Precache', () => {
  const appShell = serviceWorker.slice(
    serviceWorker.indexOf('const APP_SHELL = ['),
    serviceWorker.indexOf('];', serviceWorker.indexOf('const APP_SHELL = [')),
  );
  assert.match(appShell, /'\.\/src\/app\/module-window\.js'/);
  assert.match(appShell, /'\.\/src\/app\/tab-tear-off\.js'/);
});
