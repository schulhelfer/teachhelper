import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const [html, source] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

const TARGET_ORIGIN = 'https://gruppen.beispiel.test';

function getGroupPopulateBookmarkletCode() {
  const match = source.match(
    /const GROUP_POPULATE_BOOKMARKLET_CODE = String\.raw`([\s\S]*?)`;/,
  );
  assert.ok(match, 'GROUP_POPULATE_BOOKMARKLET_CODE should be defined');
  return match[1].replace(/^javascript:/, '');
}

function createOption(label, onPick) {
  const option = {
    textContent: label,
    isConnected: true,
    getBoundingClientRect: () => ({ width: 120, height: 24 }),
    dispatchEvent() {},
    click() {
      onPick(label);
      option.isConnected = false;
    },
  };
  return option;
}

async function runGroupPopulateBookmarklet(options = {}) {
  const {
    clipboard = 'Anna Meyer;Ben Schulz',
    candidates = ['Meyer, Anna', 'Schulz, Ben'],
    confirmResult = true,
    hasInput = true,
    noResultsMarkup = false,
  } = options;

  const picked = [];
  const alerts = [];
  let query = '';

  const optionCache = new Map();
  const dropdown = {
    get textContent() {
      return noResultsMarkup && !dropdown.querySelectorAll('[data-selectable]').length
        ? 'Keine Ergebnisse'
        : '';
    },
    querySelector(selector) {
      assert.match(selector, /no-results/);
      return noResultsMarkup && !dropdown.querySelectorAll('[data-selectable]').length
        ? { className: 'no-results' }
        : null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-selectable]');
      const needles = query
        .toLowerCase()
        .split(' ')
        .filter(Boolean);
      if (!needles.length) {
        return [];
      }
      return candidates
        .filter((label) => !picked.includes(label))
        .filter((label) => needles.every((needle) => label.toLowerCase().includes(needle)))
        .map((label) => {
          if (!optionCache.has(label)) {
            optionCache.set(label, createOption(label, (value) => picked.push(value)));
          }
          return optionCache.get(label);
        });
    },
  };

  const input = {
    focus() {},
    value: '',
    getAttribute(name) {
      assert.equal(name, 'aria-owns');
      return 'dropdown';
    },
    dispatchEvent() {},
  };

  const context = {
    navigator: {
      clipboard: {
        async readText() {
          return clipboard;
        },
        async writeText() {},
      },
    },
    document: {
      querySelector(selector) {
        assert.equal(selector, '#manage_group_users_add-selectized');
        return hasInput ? input : null;
      },
      getElementById(id) {
        assert.equal(id, 'dropdown');
        return dropdown;
      },
    },
    location: { origin: TARGET_ORIGIN },
    HTMLInputElement: {
      prototype: {
        get value() {
          return query;
        },
        set value(next) {
          query = next;
        },
      },
    },
    Object,
    Date,
    Promise,
    Error,
    setTimeout(callback) {
      return setTimeout(callback, 0);
    },
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    KeyboardEvent: class KeyboardEvent {
      constructor(type) {
        this.type = type;
      }
    },
    MouseEvent: class MouseEvent {
      constructor(type) {
        this.type = type;
      }
    },
    confirm(message) {
      alerts.push({ kind: 'confirm', message });
      return confirmResult;
    },
    alert(message) {
      alerts.push({ kind: 'alert', message });
    },
  };
  context.window = context;

  await runInNewContext(getGroupPopulateBookmarkletCode(), context);
  return { picked, alerts, confirms: alerts.filter((entry) => entry.kind === 'confirm') };
}

test('the group-populate bookmarklet reads the names from the clipboard, not from a file', () => {
  const code = getGroupPopulateBookmarkletCode();
  assert.match(code, /navigator\.clipboard\.readText\(\)/);
  assert.doesNotMatch(code, /type='file'/);
  assert.doesNotMatch(code, /prompt\(/);
  assert.doesNotMatch(code, /accept=/);
});

test('the group-populate bookmarklet adds every clipboard name to the group', async () => {
  const { picked, confirms, alerts } = await runGroupPopulateBookmarklet();
  assert.deepEqual(picked, ['Meyer, Anna', 'Schulz, Ben']);
  assert.equal(confirms.length, 1);
  assert.match(confirms[0].message, /2 Namen aus TeachHelper/);
  assert.match(confirms[0].message, new RegExp(TARGET_ORIGIN));
  assert.match(alerts.at(-1).message, /Fertig: 2 Einträge hinzugefügt\./);
});

test('the group-populate bookmarklet reports an empty clipboard instead of adding anyone', async () => {
  const { picked, alerts } = await runGroupPopulateBookmarklet({ clipboard: '   ' });
  assert.deepEqual(picked, []);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].message, /Fehler: Die TeachHelper-Namensliste ist leer\./);
});

test('the group-populate bookmarklet stops on the first name without a match', async () => {
  const { picked, alerts } = await runGroupPopulateBookmarklet({
    clipboard: 'Anna Meyer;Carla Unbekannt',
    candidates: ['Meyer, Anna'],
  });
  assert.deepEqual(picked, ['Meyer, Anna']);
  assert.match(alerts.at(-1).message, /Kein Treffer für: Carla Unbekannt/);
  assert.match(alerts.at(-1).message, /Erfolgreich: 1 von 2/);
});

test('a missing name is reported quickly once the target page renders its no-results hint', async () => {
  const started = Date.now();
  const { picked, alerts } = await runGroupPopulateBookmarklet({
    clipboard: 'Carla Unbekannt',
    candidates: [],
    noResultsMarkup: true,
  });
  const elapsed = Date.now() - started;
  assert.deepEqual(picked, []);
  assert.match(alerts.at(-1).message, /Kein Treffer für: Carla Unbekannt/);
  assert.ok(elapsed < 1500, `should not wait for the full timeout, took ${elapsed}ms`);
});

test('a missing name falls back to a stable-empty dropdown without the full timeout', async () => {
  const started = Date.now();
  const { picked, alerts } = await runGroupPopulateBookmarklet({
    clipboard: 'Carla Unbekannt',
    candidates: [],
    noResultsMarkup: false,
  });
  const elapsed = Date.now() - started;
  assert.deepEqual(picked, []);
  assert.match(alerts.at(-1).message, /Kein Treffer für: Carla Unbekannt/);
  assert.ok(elapsed < 2500, `stable-empty fallback should exit early, took ${elapsed}ms`);
});

test('the group-populate bookmarklet caps its search at three seconds per name', () => {
  const code = getGroupPopulateBookmarkletCode();
  assert.match(code, /Date\.now\(\)-t<3000/);
  assert.doesNotMatch(code, /Date\.now\(\)-t<5000/);
});

test('the group-populate bookmarklet adds nobody when the confirmation is declined', async () => {
  const { picked } = await runGroupPopulateBookmarklet({ confirmResult: false });
  assert.deepEqual(picked, []);
});

test('the group-populate bookmarklet reports a missing search field', async () => {
  const { picked, alerts } = await runGroupPopulateBookmarklet({ hasInput: false });
  assert.deepEqual(picked, []);
  assert.match(alerts[0].message, /Fehler: IServ-Suchfeld nicht gefunden\./);
});

function buildNamesWithDraft(students) {
  const match = source.match(/ {2}buildGroupPopulateNames\(\) \{\r?\n([\s\S]*?)\r?\n {2}\}/);
  assert.ok(match, 'buildGroupPopulateNames should exist');
  const host = {
    courseDialogDraft: { students },
    getSortedGradeStudentsForNameOrder(list) {
      return [...list].sort((a, b) => String(a?.lastName || '').localeCompare(String(b?.lastName || ''), 'de'));
    },
  };
  return new Function(`return function(){${match[1]}}`)().call(host);
}

test('the copied names use "Vorname Nachname" in last-name order', () => {
  const names = buildNamesWithDraft([
    { id: 2, firstName: 'Ben', lastName: 'Schulz' },
    { id: 1, firstName: 'Anna', lastName: 'Meyer' },
  ]);
  assert.deepEqual(names, ['Anna Meyer', 'Ben Schulz']);
});

test('the copied names keep unsaved rows but drop placeholders and empty rows', () => {
  const names = buildNamesWithDraft([
    { id: 1, firstName: 'Anna', lastName: 'Meyer' },
    { id: 0, firstName: 'Neu', lastName: 'Schueler' },
    { id: 3, firstName: '', lastName: '', isPlaceholder: true },
    { id: 4, firstName: '  ', lastName: '  ' },
  ]);
  assert.deepEqual(names, ['Anna Meyer', 'Neu Schueler']);
});

test('the copied names fall back to a single name part and an empty draft', () => {
  assert.deepEqual(buildNamesWithDraft([{ id: 1, firstName: '', lastName: 'Meyer' }]), ['Meyer']);
  assert.deepEqual(buildNamesWithDraft([]), []);
});

test('populating a group never waits for the roster to be saved first', () => {
  const button = html.match(/<button id="course-students-group-populate"[\s\S]*?<\/button>/);
  assert.ok(button, 'the populate button should exist');
  assert.doesNotMatch(button[0], /disabled/);
  assert.doesNotMatch(source, /isCourseStudentsDialogPristine/);
  assert.doesNotMatch(source, /updateCourseStudentsGroupPopulateButton/);
  assert.doesNotMatch(source, /courseStudentsDialogInitialSignature/);
});

test('the copied names ignore an unsaved blank row', () => {
  const names = buildNamesWithDraft([
    { id: 1, firstName: 'Anna', lastName: 'Meyer' },
    { id: 0, firstName: '', lastName: '', rufname: '', performanceFlair: '', portrait: null },
  ]);
  assert.deepEqual(names, ['Anna Meyer']);
});

test('the group-populate dialog offers a copy button wired to the dialog form', () => {
  assert.match(
    html,
    /<button id="group-populate-submit" type="submit" class="grade-transfer-submit">/,
  );
  assert.match(source, /groupPopulateSubmit: document\.querySelector\("#group-populate-submit"\)/);
  assert.match(
    source,
    /this\.refs\.groupPopulateDialogForm\?\.addEventListener\("submit"/,
  );
});

test('the group-populate dialog no longer asks for a file, separator or cell positions', () => {
  const dialog = html.slice(
    html.indexOf('<dialog id="group-populate-dialog"'),
    html.indexOf('<dialog id="grade-transfer-dialog"'),
  );
  assert.ok(dialog.includes('Namen in'), 'dialog should mention the copy step');
  assert.doesNotMatch(dialog, /CSV|Datei|Spalte/i);
});
