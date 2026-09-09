import { readFile } from 'node:fs/promises';

const APP_URL = new URL('../../src/modules/grades/app.js', import.meta.url);
const TOP_LEVEL_BOUNDARY = '\ninstallAppTooltips(document);';
const inlined = new Map();

function stubElement() {
  const classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  return {
    style: {}, dataset: {}, classList, attributes: {},
    setAttribute() {}, removeAttribute() {}, append() {}, appendChild() {},
    replaceChildren() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
  };
}

function installDomStubs() {
  if (globalThis.document) return;
  globalThis.document = {
    createElement: stubElement,
    createElementNS: stubElement,
    createDocumentFragment: stubElement,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    documentElement: stubElement(),
    body: stubElement(),
    readyState: 'complete',
  };
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}

async function inlineModule(url) {
  const key = url.href;
  if (inlined.has(key)) return inlined.get(key);
  let source = (await readFile(url, 'utf8')).replaceAll('import.meta.url', JSON.stringify(key));
  for (const match of [...source.matchAll(/from ["']([.][^"']+)["']/g)]) {
    source = source.replace(match[0], `from "${await inlineModule(new URL(match[1], url))}"`);
  }
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  inlined.set(key, dataUrl);
  return dataUrl;
}

export async function loadGradesInternals(names) {
  installDomStubs();
  const full = await readFile(APP_URL, 'utf8');
  const boundary = full.indexOf(TOP_LEVEL_BOUNDARY);
  if (boundary < 0) {
    throw new Error('Grades module boundary "installAppTooltips(document);" not found; update tests/helpers/grades-module.mjs.');
  }
  let source = `${full.slice(0, boundary)}\nexport { ${names.join(', ')} };`;
  source = source.replaceAll('import.meta.url', JSON.stringify(APP_URL.href));
  for (const match of [...source.matchAll(/from ["']([.][^"']+)["']/g)]) {
    source = source.replace(match[0], `from "${await inlineModule(new URL(match[1], APP_URL))}"`);
  }
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
