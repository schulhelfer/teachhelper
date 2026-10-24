import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RANDOM_PICKER_SPIN_DURATION_MS,
  normalizeRandomPickerSpinDurationMs,
} from '../src/shared/random-picker-settings.js';
import { WorkspaceStore } from '../src/modules/workspace/store.js';
import { WorkspaceRuntime } from '../src/modules/workspace/runtime.js';

test('spin duration defaults to three seconds and normalizes seconds-independent millisecond values', () => {
  assert.equal(RANDOM_PICKER_SPIN_DURATION_MS, 3000);
  for (const value of [undefined, null, '', ' ', false, true, {}, NaN, Infinity, 'invalid']) {
    assert.equal(normalizeRandomPickerSpinDurationMs(value), 3000);
  }
  for (const [value, expected] of [[0, 1000], [-5, 1000], [500, 1000], [1250, 1500], [3249, 3000], [3250, 3500], ['6500', 6500], [9999, 10000], [20000, 10000]]) {
    assert.equal(normalizeRandomPickerSpinDurationMs(value), expected);
  }
});

test('course picker durations survive saving and normalization and default legacy configurations', () => {
  const store = new WorkspaceStore();
  const courseId = store.createCourse(store.getActiveSchoolYear().id, 'Pickerkurs');
  store.saveGradePickerConfig(courseId, { spinDurationMs: 6750 });
  assert.equal(store.getGradePickerConfig(courseId).spinDurationMs, 7000);
  const snapshot = store.exportGradeVaultStateSnapshot();
  store.replaceGradeVaultState(snapshot);
  assert.equal(store.getGradePickerConfig(courseId).spinDurationMs, 7000);
  delete snapshot.gradePickerConfigs[0].config.spinDurationMs;
  store.replaceGradeVaultState(snapshot);
  assert.equal(store.getGradePickerConfig(courseId).spinDurationMs, 3000);
  store.saveGradePickerConfig(courseId, { spinDurationMs: 20000 });
  assert.equal(store.getGradePickerConfig(courseId).spinDurationMs, 10000);
});

test('course durations survive an encrypted database roundtrip', async (t) => {
  const store = new WorkspaceStore();
  const runtime = new WorkspaceRuntime(store, { ephemeral: true, eventTarget: new EventTarget() });
  const restoredStore = new WorkspaceStore();
  const restored = new WorkspaceRuntime(restoredStore, { ephemeral: true, eventTarget: new EventTarget() });
  t.after(() => { runtime.disposeGradeVaultSession(); restored.disposeGradeVaultSession(); });
  const courseId = store.createCourse(store.getActiveSchoolYear().id, 'Pickerkurs');
  await runtime.setupGradeVault('sicheres-test-passwort');
  await runtime.runGradeCourseMutation(courseId, () => {
    store.saveGradePickerConfig(courseId, { spinDurationMs: 6500 });
  });
  const { bytes } = await runtime.buildContainer('picker-test');
  await restored.loadBytes(bytes);
  await restored.unlockGradeVault('sicheres-test-passwort');
  await restored.ensureGradeCourseLoaded(courseId);
  assert.equal(restoredStore.getGradePickerConfig(courseId).spinDurationMs, 6500);
});
