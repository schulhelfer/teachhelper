import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [shell, shellCss] = (await Promise.all([
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8'),
])).map((source) => source.split('\r\n').join('\n'));

function extractFunction(name) {
  const openings = [
    `\n  function ${name}(`,
    `\nexport function ${name}(`,
    `\nfunction ${name}(`,
  ];
  const found = openings
    .map((opening) => shell.indexOf(opening))
    .find((index) => index >= 0);
  assert.ok(typeof found === 'number', `${name} muss existieren`);
  const matchBalanced = (from, open, close) => {
    let depth = 0;
    for (let index = from; index < shell.length; index += 1) {
      if (shell[index] === open) depth += 1;
      else if (shell[index] === close) {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    return -1;
  };
  const paramsEnd = matchBalanced(shell.indexOf('(', found), '(', ')');
  assert.ok(paramsEnd > found, `${name} muss eine Parameterliste haben`);
  const bodyEnd = matchBalanced(shell.indexOf('{', paramsEnd), '{', '}');
  assert.ok(bodyEnd > paramsEnd, `${name} muss geschlossen werden`);
  return shell.slice(found + 1, bodyEnd + 1);
}

function extractRule(selector) {
  const index = shellCss.indexOf(selector);
  assert.ok(index >= 0, `${selector} muss existieren`);
  const end = shellCss.indexOf('\n    }', index);
  assert.ok(end > index, `${selector} muss geschlossen werden`);
  return shellCss.slice(index, end);
}

test('die Tab-Leiste animiert keine Layout-Eigenschaft, die sie selbst vermisst', () => {
  const tabNav = extractRule('\n    .tab-nav {');
  const transition = tabNav.match(/transition:([^;]+);/)?.[1] || '';
  assert.ok(transition, '.tab-nav muss eine Transition definieren');
  const animated = transition.split(',').map((part) => part.trim().split(/\s+/)[0]);
  for (const property of ['gap', 'column-gap', 'width', 'padding', 'padding-left', 'padding-right', 'all']) {
    assert.ok(!animated.includes(property), `.tab-nav darf ${property} nicht animieren`);
  }
});

test('der Messzustand friert Übergänge ein, damit die Zielbreite gemessen wird', () => {
  assert.match(
    shellCss,
    /\.tab-nav\.is-measuring-full-tabs,\s+\.tab-nav\.is-measuring-full-tabs \.tab-button,\s+\.tab-nav\.is-measuring-full-tabs \.tab-unlock-button \{\s+transition: none !important;/,
  );
});

test('während einer Fenstergrößenänderung folgt die Kopfzeile ohne Nachlauf', () => {
  assert.match(
    shellCss,
    /\.app\.is-viewport-resizing \.app-header,\s+\.app\.is-viewport-resizing \.app-header-title,\s+\.app\.is-viewport-resizing \.app-header-actions,\s+\.app\.is-viewport-resizing \.tab-nav,\s+\.app\.is-viewport-resizing \.tab-indicator \{\s+transition: none !important;/,
  );
});

test('die Messung läuft vollständig innerhalb des eingefrorenen Zustands', () => {
  const sync = extractFunction('syncMoreToolsNavigation');
  const measuringOn = sync.indexOf("classList.add('is-measuring-full-tabs')");
  const cleared = sync.indexOf('clearTabNavOverflowMarkers(');
  const measured = sync.indexOf('measureTabNavFit(');
  const applied = sync.indexOf('applyTabNavOverflow(');
  const measuringOff = sync.indexOf("classList.remove('is-measuring-full-tabs')");
  assert.ok(measuringOn >= 0 && cleared > measuringOn, 'zuerst einfrieren, dann Marker lösen');
  assert.ok(measured > cleared, 'gemessen wird die aufgefaltete Leiste');
  assert.ok(applied > measured, 'der Endzustand wird nach der Messung gesetzt');
  assert.ok(measuringOff > applied, 'erst nach dem Endzustand wird wieder aufgetaut');
});

test('die Breitenmessung liest die tatsächlichen Elementbreiten in einem Durchgang', () => {
  const measure = extractFunction('measureTabNavFit');
  assert.doesNotMatch(shell, /scrollWidth/);
  assert.match(measure, /child\.offsetParent !== null/);
  assert.match(measure, /child !== els\.tabIndicator/);
  assert.match(measure, /child !== els\.moreTools/);
  assert.match(measure, /getBoundingClientRect\(\)\.width/);
  assert.match(measure, /els\.tabNav\.clientWidth - paddingLeft - paddingRight/);
  assert.match(measure, /Number\.parseFloat\(navStyle\.columnGap\)/);
  assert.doesNotMatch(measure, /classList|setAttribute|removeAttribute/);
});

test('die Hysterese bremst nur die Rückkehr eines Tabs, nicht sein Verschwinden', () => {
  const fit = extractFunction('fitTabNavItems');
  assert.match(fit, /visibleCount > previousVisibleCount/);
  assert.match(fit, /fitRow\(available - hysteresis\)/);
  assert.match(shell, /const TAB_NAV_MODE_HYSTERESIS = \d+;/);
  const sync = extractFunction('syncMoreToolsNavigation');
  assert.match(sync, /hysteresis: TAB_NAV_MODE_HYSTERESIS/);
});

test('ein Resize ohne neue Fenstermaße unterbricht den Tabwechsel nicht', () => {
  const handle = extractFunction('handleViewportResize');
  assert.match(handle, /const signature = readViewportSignature\(\);/);
  assert.match(handle, /lastViewportSignature = signature;/);
  const guard = handle.indexOf('if (!viewportChanged)');
  const session = handle.indexOf("classList.add('is-viewport-resizing')");
  assert.ok(guard >= 0 && session > guard, 'ohne Maßänderung wird kein Resize-Modus gestartet');
  assert.match(handle.slice(guard, session), /queueMoreToolsNavigationSync\(\);\s+return;/);
  assert.match(handle, /queueMoreToolsNavigationSync\(\{ immediate: true \}\)/);

  const signature = extractFunction('readViewportSignature');
  assert.match(signature, /window\.innerWidth/);
  assert.match(signature, /window\.innerHeight/);
});

test('der Tab-Indikator wird im selben Frame wie die Tableiste gesetzt', () => {
  const run = extractFunction('runMoreToolsNavigationSync');
  assert.match(run, /positionActiveTabIndicator\(\{/);
  assert.doesNotMatch(run, /queueSettledActiveTabIndicatorUpdate/);
  assert.doesNotMatch(run, /requestAnimationFrame/);
});
