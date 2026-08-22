import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [shell, shellCss, index, tutorial] = (await Promise.all([
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/first-run-tutorial.js', import.meta.url), 'utf8'),
])).map((source) => source.split('\r\n').join('\n'));

function loadFitTabNavItems() {
  const start = shell.indexOf('export function fitTabNavItems(');
  assert.ok(start >= 0, 'fitTabNavItems muss exportiert werden');
  let depth = 0;
  let bodyEnd = -1;
  for (let i = shell.indexOf('{', shell.indexOf(')', start)); i < shell.length; i += 1) {
    if (shell[i] === '{') depth += 1;
    else if (shell[i] === '}') {
      depth -= 1;
      if (depth === 0) { bodyEnd = i; break; }
    }
  }
  assert.ok(bodyEnd > start, 'fitTabNavItems muss geschlossen werden');
  const source = shell.slice(start, bodyEnd + 1).replace('export function', 'function');
  return new Function(`${source}\nreturn fitTabNavItems;`)();
}

const fitTabNavItems = loadFitTabNavItems();

const WIDTHS = [34, 100, 100, 100, 100, 100];
const GAP = 8;
const TRIGGER = 120;
const BASE = { widths: WIDTHS, gap: GAP, triggerWidth: TRIGGER, minimumVisibleCount: 3 };
const rowWidth = (count) => (
  WIDTHS.slice(0, count).reduce((sum, width) => sum + width, 0) + (count - 1) * GAP
);

test('passt alles in die Zeile, kostet der Trigger keinen Platz', () => {
  assert.equal(fitTabNavItems({ ...BASE, available: rowWidth(6) }), 6);
  assert.equal(fitTabNavItems({ ...BASE, available: rowWidth(6) + 500 }), 6);
});

test('ein Pixel zu wenig kostet den letzten Tab und zusaetzlich die Triggerbreite', () => {
  const tight = fitTabNavItems({ ...BASE, available: rowWidth(6) - 1 });
  assert.ok(tight < 6, 'der letzte Tab muss weichen');
  assert.equal(tight, 4);
  assert.ok(rowWidth(tight) + GAP + TRIGGER <= rowWidth(6) - 1, 'die Zeile bleibt einzeilig');
  assert.ok(rowWidth(tight + 1) + GAP + TRIGGER > rowWidth(6) - 1, 'mehr passt nicht');
});

test('ein breiter Trigger nimmt notfalls einen zweiten Tab mit', () => {
  const available = rowWidth(6) - 1;
  const narrow = fitTabNavItems({ ...BASE, triggerWidth: 20, available });
  const wide = fitTabNavItems({ ...BASE, triggerWidth: 260, available });
  assert.ok(wide < narrow, 'der breitere Trigger verdraengt mehr Tabs');
});

test('Noten und Planung koennen niemals ins Menue wandern', () => {
  for (const available of [rowWidth(3), 200, 60, 0, -500]) {
    assert.equal(
      fitTabNavItems({ ...BASE, available }),
      3,
      `bei ${available}px muessen Schloss, Noten und Planung stehen bleiben`,
    );
  }
});

const THRESHOLD_FOR_FOUR = rowWidth(4) + GAP + TRIGGER;

test('die Hysterese bremst die Rueckkehr, nicht das Verschwinden', () => {
  assert.ok(THRESHOLD_FOR_FOUR < rowWidth(6));
  assert.equal(
    fitTabNavItems({ ...BASE, available: THRESHOLD_FOR_FOUR - 1, previousVisibleCount: 4, hysteresis: 8 }),
    3,
    'zu eng wird sofort enger',
  );
  assert.equal(
    fitTabNavItems({ ...BASE, available: THRESHOLD_FOR_FOUR + 4, previousVisibleCount: 3, hysteresis: 8 }),
    3,
    'vier Pixel Luft holen den Tab noch nicht zurueck',
  );
  assert.equal(
    fitTabNavItems({ ...BASE, available: THRESHOLD_FOR_FOUR + 12, previousVisibleCount: 3, hysteresis: 8 }),
    4,
    'ab der vollen Hysterese kommt der Tab zurueck',
  );
});

test('ohne bekannten Vorzustand wird ohne Hysterese neu eingepasst', () => {
  assert.equal(
    fitTabNavItems({
      ...BASE, available: THRESHOLD_FOR_FOUR + 4, previousVisibleCount: null, hysteresis: 8,
    }),
    4,
  );
});

test('das Ergebnis ist eine Anzahl, die Reihenfolge kann sich also nicht aendern', () => {
  const source = shell.slice(shell.indexOf('export function fitTabNavItems('));
  assert.doesNotMatch(source.slice(0, source.indexOf('\n}')), /sort|reverse|splice/);
  for (let available = -50; available <= rowWidth(6) + 50; available += 7) {
    const count = fitTabNavItems({ ...BASE, available });
    assert.ok(Number.isInteger(count) && count >= 3 && count <= WIDTHS.length);
  }
});

test('jeder ueberlaufbare Tab hat einen Menueeintrag in gleicher Reihenfolge', () => {
  const nav = index.slice(index.indexOf('<nav class="tab-nav"'), index.indexOf('</nav>'));
  const bar = nav.slice(0, nav.indexOf('<div id="more-tools"'));
  const menu = nav.slice(nav.indexOf('<div id="more-tools-menu"'));

  const tabs = Array.from(bar.matchAll(/data-tab-target="([^"]+)"[^>]*>\s*([^<]*?)\s*</g))
    .map(([, target, label]) => ({ target, label }));
  const menuItems = Array.from(menu.matchAll(/data-more-tools-target="([^"]+)"[^>]*>\s*([^<]*?)\s*</g))
    .map(([, target, label]) => ({ target, label }));

  assert.ok(tabs.length >= 10, 'die Leiste muss alle Tabs enthalten');
  const eligible = tabs.filter(({ target }) => target !== 'grades' && target !== 'planning');
  assert.deepEqual(
    menuItems.map(({ target }) => target),
    eligible.map(({ target }) => target),
    'das Menue spiegelt die Tabreihenfolge ohne Noten und Planung',
  );
  menuItems.forEach((item, position) => {
    assert.equal(item.label, eligible[position].label, `Beschriftung von ${item.target}`);
  });

  const entryTags = menu.match(/<button[^>]*data-more-tools-target[^>]*>/g) || [];
  assert.equal(entryTags.length, menuItems.length);
  entryTags.forEach((tag) => assert.match(tag, /\shidden\b/));
});

test('die feste Tool-Gruppe ist restlos verschwunden', () => {
  for (const source of [shell, shellCss, index]) {
    assert.doesNotMatch(source, /data-more-tools-tab/);
    assert.doesNotMatch(source, /is-tabs-compact/);
  }
  assert.doesNotMatch(shell, /isMoreToolsTab/);
  assert.match(shell, /function isOverflowedTab\(tab\) \{\s+return tabNavOverflowTargets\.has\(tab\);/);
});

test('die Ueberlaufregeln stehen im Stylesheet', () => {
  assert.match(shellCss, /\.tab-nav \.tab-button\[data-tab-overflow\] \{\s+display: none;/);
  assert.match(shellCss, /\.tab-nav \.more-tools-menu button\[hidden\] \{\s+display: none;/);
  assert.match(shellCss, /\.tab-nav\.is-measuring-full-tabs \.more-tools \{\s+display: block;/);
  assert.match(shellCss, /\.tab-nav\.is-measuring-full-tabs[\s\S]{0,220}transform: none !important;/);
  assert.doesNotMatch(shellCss, /flex: 0 1 auto;\s+min-width: 0;\s+white-space: nowrap;/);
});

test('das Tutorial weicht auf den Weitere-Tools-Button aus', () => {
  assert.match(tutorial, /const resolveOverflowedTabTarget = \(element\) => \{/);
  assert.match(tutorial, /hasAttribute\?\.\('data-tab-overflow'\)/);
  assert.match(tutorial, /isElementVisible\(els\.moreToolsTrigger\) \? els\.moreToolsTrigger : null/);
  const resolve = tutorial.slice(
    tutorial.indexOf('const resolveTarget = (step) =>'),
    tutorial.indexOf('const resolveContextualDefinition'),
  );
  assert.doesNotMatch(resolve, /target\.fallback\) \{\s+return /);
  assert.match(resolve, /return resolveOverflowedTabTarget\(element\) \|\| element;/);
  assert.match(tutorial, /attributeFilter: \['class', 'hidden', 'style', 'data-tab-overflow'\]/);
});
