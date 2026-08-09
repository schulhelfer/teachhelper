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
  const mediaQuery = {
    matches: false,
    addEventListener(_name, listener) { changeHandler = listener; },
    removeEventListener() {},
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
  assert.equal(controller.getTheme(), 'light');
  mediaQuery.matches = true;
  changeHandler();
  assert.equal(controller.getTheme(), 'dark');
  assert.equal(root.dataset.theme, 'dark');
  controller.dispose();
});

test('stellt Theme-Control, Light-Tokens und Frame-Brücke bereit', async () => {
  const [planningHtml, gradesHtml, css, mainSource] = await Promise.all([
    readFile(new URL('../src/modules/planning/app.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared/theme.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  for (const source of [planningHtml, gradesHtml]) {
    assert.match(source, /data-theme-preference/);
    assert.match(source, /segment-control--three/);
    assert.match(source, /theme-bridge\.js/);
  }
  assert.match(css, /:root\[data-theme="light"\]/);
  assert.match(css, /color-scheme: light/);
  assert.match(mainSource, /THEME_PREFERENCE_CHANGE_EVENT/);
});
