import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const themeSource = await readFile(new URL('../src/shared/theme.js', import.meta.url), 'utf8');
const {
  createThemeController,
  normalizeThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_PREFERENCE_STORAGE_KEY,
  writeThemePreference,
} = await import(`data:text/javascript;base64,${Buffer.from(themeSource).toString('base64')}`);

test('normalisiert Theme-Präferenzen und löst System passend auf', () => {
  assert.equal(normalizeThemePreference('light'), 'light');
  assert.equal(normalizeThemePreference('unknown'), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

test('speichert die Theme-Präferenz defensiv im lokalen Speicher', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(writeThemePreference('light', storage), 'light');
  assert.equal(values.get(THEME_PREFERENCE_STORAGE_KEY), 'light');
  assert.equal(readThemePreference(storage), 'light');
  assert.equal(readThemePreference({ getItem() { throw new Error('blocked'); } }), 'dark');
});

test('System aktualisiert das effektive Theme bei einer Medienänderung', () => {
  let changeHandler = null;
  let addCalls = 0;
  let removeCalls = 0;
  const mediaQuery = {
    matches: false,
    addEventListener(_name, listener) { addCalls += 1; changeHandler = listener; },
    removeEventListener() { removeCalls += 1; },
  };
  const values = new Map([[THEME_PREFERENCE_STORAGE_KEY, 'system']]);
  const root = { dataset: {}, style: {} };
  const meta = {};
  const windowRef = {
    localStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) },
    matchMedia: () => mediaQuery,
    dispatchEvent() {},
  };
  const documentRef = { documentElement: root, querySelector: () => meta };
  const controller = createThemeController({ windowRef, documentRef });
  assert.equal(addCalls, 1);
  assert.equal(controller.getTheme(), 'light');
  mediaQuery.matches = true;
  changeHandler();
  assert.equal(controller.getTheme(), 'dark');
  assert.equal(root.dataset.theme, 'dark');
  controller.setPreference('dark');
  assert.equal(removeCalls, 1);
  controller.dispose();
});

test('stellt Theme-Control, Light-Tokens, frühen Start und Frame-Brücke bereit', async () => {
  const [indexHtml, planningHtml, gradesHtml, css, gradesCss, mainSource, manifest] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/planning/app.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared/theme.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'),
  ]);
  for (const source of [planningHtml, gradesHtml]) {
    assert.match(source, /data-theme-preference/);
    assert.match(source, /segment-control--three/);
    assert.match(source, /theme-bridge\.js/);
  }
  assert.match(css, /:root\[data-theme="light"\]/);
  assert.match(css, /color-scheme: light/);
  assert.match(css, /--surface-page:/);
  assert.match(css, /--nav-active: #007aff/);
  assert.match(css, /--text-dialog: #3a3a3c/);
  assert.doesNotMatch(css, /data-theme="light"\] \.segment-control/);
  assert.match(gradesCss, /\.message-dialog-text\s*\{[\s\S]*?color: var\(--text-dialog\)/);
  assert.match(mainSource, /THEME_PREFERENCE_CHANGE_EVENT/);
  for (const source of [indexHtml, planningHtml, gradesHtml]) {
    assert.match(source, /theme-preload\.js/);
    assert.match(source, /theme-color" content="#f5f5f7/);
  }
  assert.match(manifest, /"theme_color": "#f5f5f7"/);
});
