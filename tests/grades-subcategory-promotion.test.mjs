import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleCache = new Map();
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

async function loadModuleUrl(fileUrl) {
  const key = fileUrl.href;
  if (moduleCache.has(key)) return moduleCache.get(key);
  if (key.includes('archive-pdf')) {
    const url = dataUrl(`
      export async function buildWorkspaceArchivePdfBytes() { return new Uint8Array(); }
      export function downloadWorkspaceArchivePdf() {}
    `);
    moduleCache.set(key, url);
    return url;
  }
  let source;
  try {
    source = await readFile(fileUrl, 'utf8');
  } catch {
    const url = dataUrl('export default {};');
    moduleCache.set(key, url);
    return url;
  }
  const specifiers = [...new Set([...source.matchAll(/["'](\.\.?\/[^"']+)["']/g)].map((match) => match[1]))]
    .sort((left, right) => right.length - left.length);
  moduleCache.set(key, 'pending');
  for (const specifier of specifiers) {
    const url = await loadModuleUrl(new URL(specifier, fileUrl));
    source = source.split(specifier).join(url);
  }
  const url = dataUrl(source);
  moduleCache.set(key, url);
  return url;
}

globalThis.window = globalThis;
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
  createElement: () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {},
    setAttribute() {},
    click() {},
  }),
  body: { appendChild() {}, removeChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const storeUrl = await loadModuleUrl(new URL('../src/modules/workspace/store.js', import.meta.url));
const { WorkspaceStore } = await import(storeUrl);

const COURSE_ID = 1;
const CATEGORY_ID = 10;
const SUB_A = 100;
const SUB_B = 200;

const GROUPED_STRUCTURE = {
  h1: [{
    id: CATEGORY_ID,
    name: 'Mitarbeit',
    weight: 100,
    subcategories: [{ id: SUB_A, name: 'Beteiligung', weight: 100 }],
  }],
  h2: [{
    id: CATEGORY_ID,
    name: 'Mitarbeit',
    weight: 100,
    subcategories: [{ id: SUB_A, name: 'Beteiligung', weight: 100 }],
  }],
};

const DIRECT_STRUCTURE = {
  h1: [{ id: CATEGORY_ID, name: 'Mitarbeit', weight: 100, subcategories: [] }],
  h2: [{ id: CATEGORY_ID, name: 'Mitarbeit', weight: 100, subcategories: [] }],
};

function createStore({ structure = GROUPED_STRUCTURE, assessments = [], overrides = [] } = {}) {
  const store = new WorkspaceStore();
  store._save = () => {};
  store._saveGradeVault = () => {};
  store.gradeVaultState.gradeStructures = [{
    courseId: COURSE_ID,
    categories: structure.h1,
    periodCategories: structure,
    performanceFlairWeightOverrides: null,
  }];
  store.gradeVaultState.gradeAssessments = assessments.map((assessment, index) => ({
    id: index + 1,
    courseId: COURSE_ID,
    halfYear: 'h1',
    categoryId: CATEGORY_ID,
    subcategoryId: SUB_A,
    title: `Leistung ${index + 1}`,
    sortOrder: index + 1,
    createdAt: `2025-01-0${index + 1}`,
    mode: 'standard',
    maxPoints: 15,
    weight: 1,
    ...assessment,
  }));
  store.gradeVaultState.gradeOverrides = overrides.map((override) => ({
    studentId: 1,
    courseId: COURSE_ID,
    scope: 'subcategory',
    period: 'h1',
    categoryId: CATEGORY_ID,
    subcategoryId: SUB_A,
    value: 2,
    ...override,
  }));
  return store;
}

const ORPHAN_MESSAGE = /Verwendete Kategorien oder Unterkategorien können nicht entfernt werden/;

test('die letzte Unterkategorie zu löschen zieht Leistungen auf die Kategorie hoch', () => {
  const store = createStore({ assessments: [{}, {}] });
  store.saveGradeStructure(COURSE_ID, DIRECT_STRUCTURE, null, { promoteOrphanedAssessments: true });
  const assessments = store.gradeVaultState.gradeAssessments;
  assert.equal(assessments.length, 2);
  assert.ok(assessments.every((assessment) => assessment.subcategoryId === null));
  assert.ok(assessments.every((assessment) => Number(assessment.categoryId) === CATEGORY_ID));
});

test('ohne Zustimmung bleibt die bisherige Fehlermeldung bestehen', () => {
  const store = createStore({ assessments: [{}] });
  assert.throws(
    () => store.saveGradeStructure(COURSE_ID, DIRECT_STRUCTURE),
    ORPHAN_MESSAGE
  );
  assert.equal(store.gradeVaultState.gradeAssessments[0].subcategoryId, SUB_A);
});

test('eine von mehreren Unterkategorien zu löschen wirft weiterhin', () => {
  const twoSubcategories = {
    h1: [{
      id: CATEGORY_ID,
      name: 'Mitarbeit',
      weight: 100,
      subcategories: [
        { id: SUB_A, name: 'Beteiligung', weight: 50 },
        { id: SUB_B, name: 'Heft', weight: 50 },
      ],
    }],
    h2: GROUPED_STRUCTURE.h2,
  };
  const store = createStore({ structure: twoSubcategories, assessments: [{}] });
  const remaining = {
    h1: [{
      id: CATEGORY_ID,
      name: 'Mitarbeit',
      weight: 100,
      subcategories: [{ id: SUB_B, name: 'Heft', weight: 100 }],
    }],
    h2: GROUPED_STRUCTURE.h2,
  };
  assert.throws(
    () => store.saveGradeStructure(COURSE_ID, remaining, null, { promoteOrphanedAssessments: true }),
    ORPHAN_MESSAGE
  );
});

test('nur Leistungen des betroffenen Halbjahres werden migriert', () => {
  const store = createStore({
    assessments: [
      { halfYear: 'h1' },
      { halfYear: 'h2' },
    ],
  });
  const h1Direct = {
    h1: DIRECT_STRUCTURE.h1,
    h2: GROUPED_STRUCTURE.h2,
  };
  store.saveGradeStructure(COURSE_ID, h1Direct, null, { promoteOrphanedAssessments: true });
  const [first, second] = store.gradeVaultState.gradeAssessments;
  assert.equal(first.subcategoryId, null, 'HJ1 wird hochgezogen');
  assert.equal(second.subcategoryId, SUB_A, 'HJ2 bleibt unverändert');
});

test('sortOrder bleibt in der Zielgruppe eindeutig und stabil', () => {
  const store = createStore({
    assessments: [
      { id: 1, subcategoryId: null, sortOrder: 1, createdAt: '2025-01-01' },
      { id: 2, subcategoryId: SUB_A, sortOrder: 1, createdAt: '2025-01-02' },
      { id: 3, subcategoryId: SUB_A, sortOrder: 2, createdAt: '2025-01-03' },
    ],
  });
  store.gradeVaultState.gradeStructures[0].periodCategories = GROUPED_STRUCTURE;
  store.saveGradeStructure(COURSE_ID, DIRECT_STRUCTURE, null, { promoteOrphanedAssessments: true });
  const order = store.gradeVaultState.gradeAssessments
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((assessment) => assessment.id);
  assert.deepEqual(order, [1, 2, 3], 'bestehende Direktleistung zuerst, dann die hochgezogenen');
  const sortOrders = store.gradeVaultState.gradeAssessments.map((assessment) => assessment.sortOrder);
  assert.equal(new Set(sortOrders).size, sortOrders.length, 'keine doppelten sortOrder-Werte');
});

test('Unterkategorie-Overrides werden verworfen, andere bleiben erhalten', () => {
  const store = createStore({
    assessments: [{}],
    overrides: [
      { studentId: 1, scope: 'subcategory', subcategoryId: SUB_A },
      { studentId: 2, scope: 'category', subcategoryId: null },
      { studentId: 3, scope: 'course', categoryId: null, subcategoryId: null },
    ],
  });
  store.saveGradeStructure(COURSE_ID, DIRECT_STRUCTURE, null, { promoteOrphanedAssessments: true });
  const scopes = store.gradeVaultState.gradeOverrides.map((override) => override.scope);
  assert.deepEqual(scopes, ['category', 'course']);
});

test('eine ganz entfernte Kategorie wirft weiterhin', () => {
  const store = createStore({ assessments: [{}] });
  const withoutCategory = {
    h1: [{ id: 11, name: 'Andere', weight: 100, subcategories: [] }],
    h2: [{ id: 11, name: 'Andere', weight: 100, subcategories: [] }],
  };
  assert.throws(
    () => store.saveGradeStructure(COURSE_ID, withoutCategory, null, { promoteOrphanedAssessments: true }),
    ORPHAN_MESSAGE
  );
});

test('countGradeAssessmentsForSubcategory zählt Leistungen und Overrides des Halbjahres', () => {
  const store = createStore({
    assessments: [
      { halfYear: 'h1' },
      { halfYear: 'h1' },
      { halfYear: 'h2' },
    ],
    overrides: [
      { studentId: 1, period: 'h1' },
      { studentId: 2, period: 'h2' },
    ],
  });
  const counts = store.countGradeAssessmentsForSubcategory(COURSE_ID, 'h1', CATEGORY_ID, SUB_A);
  assert.deepEqual(counts, { assessments: 2, overrides: 1 });
});
