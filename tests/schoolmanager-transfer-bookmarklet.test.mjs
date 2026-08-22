import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const [html, source] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

function getBookmarkletAdapterCode(methodName, replacements = {}) {
  const match = source.match(new RegExp('  ' + methodName + '\\([^)]*\\) \\{\\r?\\n    return `([\\s\\S]*?)`;\\r?\\n  \\}'));
  assert.ok(match, `${methodName} should return bookmarklet code`);
  return Object.entries(replacements).reduce(
    (code, [search, replacement]) => code.split(search).join(replacement),
    match[1],
  );
}

const TARGET_ORIGIN = 'https://beispiel.test';

async function runSchoolmanagerAdapter(valueCount, fieldCount, startIndex = 0) {
  const fields = Array.from({ length: fieldCount }, () => ({
    offsetParent: true,
    disabled: false,
    readOnly: false,
    type: 'text',
    dispatchedEvents: [],
    dispatchEvent(event) {
      this.dispatchedEvents.push(event.type);
    },
  }));
  const confirms = [];
  const clipboardReads = [];
  const values = Array.from({ length: valueCount }, (_, index) => String(index + 1));
  const context = {
    navigator: {
      clipboard: {
        async readText() {
          clipboardReads.push(true);
          return values.join(';');
        },
        async writeText() {},
      },
    },
    document: {
      querySelectorAll(selector) {
        assert.equal(selector, 'input,textarea');
        return fields;
      },
    },
    location: { origin: TARGET_ORIGIN },
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    confirm(message) {
      confirms.push(message);
      return true;
    },
  };
  const code = getBookmarkletAdapterCode('buildSchoolmanagerTransferTargetAdapterCode', {
    '${startIndex}': String(startIndex),
  });
  let error = null;
  try {
    await runInNewContext(`(${code})`, context)();
  } catch (thrown) {
    error = thrown;
  }
  return { confirms, fields, clipboardReads, error };
}

async function runAbiWebAdapter(valueCount, fieldCount, clearClipboard = true) {
  const values = Array.from({ length: valueCount }, (_, index) => String(index + 1));
  const selectedValues = [];
  const clipboardWrites = [];
  let popup = null;
  const fields = Array.from({ length: fieldCount }, (_, fieldIndex) => ({
    click() {
      popup = {
        querySelectorAll(selector) {
          assert.equal(selector, 'td');
          return values.map((value) => ({
            textContent: value,
            click() {
              selectedValues.push({ fieldIndex, value });
              popup = null;
            },
          }));
        },
      };
    },
  }));
  const confirms = [];
  const clipboardReads = [];
  const context = {
    navigator: {
      clipboard: {
        async readText() {
          clipboardReads.push(true);
          return values.join(';');
        },
        async writeText(value) {
          clipboardWrites.push(value);
        },
      },
    },
    document: {
      querySelectorAll(selector) {
        assert.equal(selector, '.abi-fields');
        return fields;
      },
      querySelector(selector) {
        assert.equal(selector, '.points-selector-popup');
        return popup;
      },
      documentElement: {},
    },
    location: { origin: TARGET_ORIGIN },
    confirm(message) {
      confirms.push(message);
      return confirms.length === 1 || clearClipboard;
    },
  };
  const code = getBookmarkletAdapterCode('buildAbiWebTransferTargetAdapterCode', {
    '${ABIWEB_TRANSFER_GRADE_FIELD_SELECTOR}': '.abi-fields',
  });
  let error = null;
  try {
    await runInNewContext(`(${code})`, context)();
  } catch (thrown) {
    error = thrown;
  }
  return { clipboardWrites, confirms, selectedValues, clipboardReads, error };
}

test('the universal bookmarklet has a native link label for bookmark titles', () => {
  assert.match(
    html,
    /<a id="schoolmanager-transfer-bookmarklet-link"[\s\S]*?>Schulmanager\/AbiWeb-Import<\/a>/,
  );
  assert.match(source, /const SCHOOLMANAGER_TRANSFER_BOOKMARKLET_NAME = "Schulmanager\/AbiWeb-Import";/);
  assert.match(source, /link\.setAttribute\("href", code\);/);
  assert.match(source, /const startIndex = Math\.max\(0, firstFieldIndex - 1\);/);
  assert.match(source, /\.slice\(\$\{startIndex\}\)/);
});

test('the Schoolmanager bookmarklet keeps browser-native link dragging enabled', () => {
  assert.match(
    html,
    /id="schoolmanager-transfer-bookmarklet-link"[\s\S]*?draggable="true"/,
  );
  assert.doesNotMatch(source, /setSchoolmanagerTransferBookmarkletDragData/);
});

test('the universal bookmarklet dispatches to AbiWeb before the Schoolmanager fallback', () => {
  assert.match(source, /buildSchoolmanagerTransferTargetAdapterCode\(startIndex\)/);
  assert.match(source, /buildAbiWebTransferTargetAdapterCode\(\)/);
  assert.match(
    source,
    /if\(document\.querySelector\(a\)\)await\(\$\{abiWebAdapter\}\)\(\);else await\(\$\{schoolmanagerAdapter\}\)\(\)/,
  );
  assert.match(source, /document\.querySelectorAll\('input,textarea'\)/);
  assert.match(source, /Clipboard nach erfolgreicher Übertragung leeren\?/);
});

test('both adapters warn about count mismatches and transfer only the shared amount', () => {
  assert.match(source, /Schulmanager zeigt '\+f\.length\+' Eingabefelder\. Nur '\+n\+' Punktwerte werden übertragen\. Fortfahren\?/);
  assert.match(source, /AbiWeb zeigt '\+f\.length\+' Notenfelder\. Nur '\+n\+' Punktwerte werden übertragen\. Fortfahren\?/);
  assert.match(source, /n=Math\.min\(v\.length,f\.length\)/);
  assert.match(source, /for\(let i=0;i<n;i\+\+\)\{let e=f\[i\];e\.value=v\[i\]/);
  assert.match(source, /for\(let i=0;i<n;i\+\+\)\{f\[i\]\.click\(\);await w/);
});

test('the Schoolmanager adapter transfers only the shared amount for either count mismatch', async () => {
  for (const [valueCount, fieldCount] of [[3, 2], [2, 3]]) {
    const { confirms, fields } = await runSchoolmanagerAdapter(valueCount, fieldCount);
    const sharedCount = Math.min(valueCount, fieldCount);
    assert.match(confirms[0], new RegExp(`TeachHelper enthält ${valueCount} Werte`));
    assert.match(confirms[0], new RegExp(`Schulmanager zeigt ${fieldCount} Eingabefelder`));
    assert.match(confirms[0], new RegExp(`Nur ${sharedCount} Punktwerte werden übertragen`));
    assert.deepEqual(fields.slice(0, sharedCount).map((field) => field.value), Array.from({ length: sharedCount }, (_, index) => String(index + 1)));
    assert.deepEqual(fields.slice(sharedCount).map((field) => field.value), Array(fieldCount - sharedCount).fill(undefined));
  }
});

test('the AbiWeb adapter transfers only the shared amount for either count mismatch', async () => {
  for (const [valueCount, fieldCount] of [[3, 2], [2, 3]]) {
    const { clipboardWrites, confirms, selectedValues } = await runAbiWebAdapter(valueCount, fieldCount);
    const sharedCount = Math.min(valueCount, fieldCount);
    assert.match(confirms[0], new RegExp(`TeachHelper enthält ${valueCount} Werte`));
    assert.match(confirms[0], new RegExp(`AbiWeb zeigt ${fieldCount} Notenfelder`));
    assert.deepEqual(selectedValues, Array.from({ length: sharedCount }, (_, index) => ({
      fieldIndex: index,
      value: String(index + 1),
    })));
    assert.match(confirms[1], /Clipboard nach erfolgreicher Übertragung leeren\?/);
    assert.deepEqual(clipboardWrites, ['']);
  }
});

test('the AbiWeb adapter leaves the clipboard intact when clearing is declined', async () => {
  const { clipboardWrites, selectedValues } = await runAbiWebAdapter(2, 2, false);
  assert.equal(selectedValues.length, 2);
  assert.deepEqual(clipboardWrites, []);
});

test('the AbiWeb adapter uses stable selectors and transfers points sequentially', () => {
  assert.match(
    source,
    /body > app-root > app-course-detail > div > div > div:nth-child\(2\) > table > tbody > tr > td\.text-center\.cursor-pointer/,
  );
  assert.match(source, /document\.querySelector\('\.points-selector-popup'\)/);
  assert.match(source, /p\.querySelectorAll\('td'\)\]\.find\(e=>e\.textContent\.trim\(\)===v\[i\]\)/);
  assert.match(source, /for\(let i=0;i<n;i\+\+\)\{f\[i\]\.click\(\);await w/);
  assert.match(source, /await w\(\(\)=>!document\.querySelector\('\.points-selector-popup'\)/);
  assert.doesNotMatch(source, /_ngcontent-/);
});

test('the AbiWeb adapter validates input and reports actionable transfer messages', () => {
  assert.match(source, /Die TeachHelper-Punkteliste ist leer\./);
  assert.doesNotMatch(source, /if\(f\.length!==v\.length\)throw new Error\('Schülerzahl stimmt nicht überein:/);
  assert.match(source, /v\.length===f\.length\?v\.length\+' Punktwerte nach AbiWeb übertragen\?'/);
  assert.match(source, /Punktwert '\+v\[i\]\+' für Eintrag/);
  assert.match(source, /nicht innerhalb von 5 Sekunden geöffnet\./);
  assert.match(source, /nicht innerhalb von 5 Sekunden geschlossen\./);
  assert.match(source, /setTimeout\(\(\)=>\{o\.disconnect\(\);j\(new Error\(m\)\)\},5000\)/);
});

test('the Schoolmanager adapter aborts before touching the clipboard when the page lacks fields', async () => {
  const { error, clipboardReads, confirms, fields } = await runSchoolmanagerAdapter(5, 4, 6);

  assert.ok(error, 'der Adapter muss abbrechen');
  assert.match(error.message, /Diese Seite hat 4 ausfüllbare Eingabefelder/);
  assert.match(error.message, /Abgebrochen, es wurde nichts geändert\./);
  assert.deepEqual(clipboardReads, [], 'die Zwischenablage darf gar nicht erst gelesen werden');
  assert.deepEqual(confirms, []);
  assert.deepEqual(fields.map((field) => field.value), Array(4).fill(undefined));
});

test('the Schoolmanager adapter still transfers when enough fields remain after the skip', async () => {
  const { error, confirms, fields } = await runSchoolmanagerAdapter(2, 5, 3);

  assert.equal(error, null);
  assert.equal(confirms.length, 2);
  assert.deepEqual(fields.slice(0, 3).map((field) => field.value), Array(3).fill(undefined));
  assert.deepEqual(fields.slice(3).map((field) => field.value), ['1', '2']);
});

test('the AbiWeb adapter aborts before touching the clipboard when no grade fields exist', async () => {
  const { error, clipboardReads, confirms, selectedValues } = await runAbiWebAdapter(3, 0);

  assert.ok(error, 'der Adapter muss abbrechen');
  assert.match(error.message, /keine AbiWeb-Notenfelder gefunden/);
  assert.match(error.message, /Abgebrochen, es wurde nichts geändert\./);
  assert.deepEqual(clipboardReads, [], 'die Zwischenablage darf gar nicht erst gelesen werden');
  assert.deepEqual(confirms, []);
  assert.deepEqual(selectedValues, []);
});

test('both adapters name the target page in the transfer confirmation', async () => {
  const schoolmanager = await runSchoolmanagerAdapter(2, 2);
  const abiWeb = await runAbiWebAdapter(2, 2);

  assert.match(schoolmanager.confirms[0], new RegExp(`Zielseite: ${TARGET_ORIGIN}$`));
  assert.match(abiWeb.confirms[0], new RegExp(`Zielseite: ${TARGET_ORIGIN}$`));
  assert.match(schoolmanager.confirms[0], /^2 Punktwerte nach Schulmanager übertragen\?/);
  assert.match(abiWeb.confirms[0], /^2 Punktwerte nach AbiWeb übertragen\?/);
});

test('the structural precondition runs before the clipboard read in both adapters', () => {
  for (const method of [
    'buildSchoolmanagerTransferTargetAdapterCode',
    'buildAbiWebTransferTargetAdapterCode',
  ]) {
    const code = getBookmarkletAdapterCode(method);
    const guard = code.indexOf('Abgebrochen, es wurde nichts geändert.');
    const read = code.indexOf('navigator.clipboard.readText()');
    assert.ok(guard >= 0, `${method}: Abbruchhinweis fehlt`);
    assert.ok(read >= 0, `${method}: Clipboard-Lesen fehlt`);
    assert.ok(guard < read, `${method}: die Strukturprüfung muss vor dem Clipboard-Lesen stehen`);
  }
});
