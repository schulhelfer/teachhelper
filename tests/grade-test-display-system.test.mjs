import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGradesInternals } from './helpers/grades-module.mjs';
import { createWorkspaceModuleLoader } from './helpers/workspace-modules.mjs';

const { normalizeGradeTestDisplaySystem } = await loadGradesInternals(['normalizeGradeTestDisplaySystem']);
const load = createWorkspaceModuleLoader();
const { WorkspaceStore } = await import(await load('store.js'));

test('fehlende und ungültige BE-Notensysteme folgen den Prozentgrenzen', () => {
  for (const scale of ['sek1', 'sek2', 'custom']) {
    for (const value of [undefined, null, '', 'unbekannt']) {
      assert.equal(normalizeGradeTestDisplaySystem(value, scale), scale === 'sek1' ? 'school' : 'points15');
    }
    for (const value of ['school', 'points15']) {
      assert.equal(normalizeGradeTestDisplaySystem(value, scale), value);
    }
  }
});

test('alte BE-Leistungen erhalten Vorgaben und gespeicherte Werte überleben das Laden', () => {
  const store = new WorkspaceStore();
  const source = {
    gradeAssessments: [
      { id: 1, courseId: 1, mode: 'test', testScale: 'sek1' },
      { id: 2, courseId: 1, mode: 'test', testScale: 'sek2' },
      { id: 3, courseId: 1, mode: 'test', testScale: 'custom', testDisplaySystem: 'school' },
      { id: 4, courseId: 1, mode: 'test', testScale: 'sek1', testDisplaySystem: 'points15' },
      { id: 5, courseId: 1, mode: 'test', testScale: 'sek1', testDisplaySystem: 'unbekannt' },
      { id: 6, courseId: 1, mode: 'grade', testDisplaySystem: 'school' },
      { id: 7, courseId: 1, mode: 'homework', testDisplaySystem: 'points15' },
    ],
  };
  source.gradeAssessments = source.gradeAssessments.map((item) => ({ ...item, title: 'Testleistung' }));
  const normalized = store.normalizeGradeVaultState(source);
  const expected = ['school', 'points15', 'school', 'points15', 'school', null, null];
  assert.deepEqual(normalized.gradeAssessments.map((item) => item.testDisplaySystem), expected);
  const reloaded = store.normalizeGradeVaultState(JSON.parse(JSON.stringify(normalized)));
  assert.deepEqual(reloaded.gradeAssessments.map((item) => item.testDisplaySystem), expected);
});

test('Änderungen je BE-Leistung bleiben unabhängig von anderen Leistungen und Prozentgrenzen', () => {
  const store = new WorkspaceStore();
  const firstId = store.createGradeAssessment(1, { mode: 'test', testScale: 'sek1' });
  const secondId = store.createGradeAssessment(1, { mode: 'test', testScale: 'sek2' });
  assert.equal(store.getGradeAssessment(firstId).testDisplaySystem, 'school');
  assert.equal(store.getGradeAssessment(secondId).testDisplaySystem, 'points15');
  store.updateGradeAssessment(firstId, { testScale: 'sek2' });
  assert.equal(store.getGradeAssessment(firstId).testDisplaySystem, 'school');
  store.updateGradeAssessment(firstId, { testDisplaySystem: 'points15' });
  store.updateGradeAssessment(secondId, { testDisplaySystem: 'school' });
  assert.equal(store.getGradeAssessment(firstId).testDisplaySystem, 'points15');
  assert.equal(store.getGradeAssessment(secondId).testDisplaySystem, 'school');
  store.updateGradeAssessment(firstId, { mode: 'grade' });
  assert.equal(store.getGradeAssessment(firstId).testDisplaySystem, null);
  store.updateGradeAssessment(firstId, { mode: 'test', testScale: 'sek1' });
  assert.equal(store.getGradeAssessment(firstId).testDisplaySystem, 'school');
});
