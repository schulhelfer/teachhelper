import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkspaceStore } from '../src/modules/workspace/store.js';

function createStore() {
  const store = new WorkspaceStore();
  store._saveGradeVault = () => {};
  return store;
}

test('legacy course seatplan becomes the current plan', () => {
  const store = createStore();
  const state = store.normalizeGradeVaultState({
    gradeSeatPlans: [{ courseId: 7, plan: { activeSeats: ['a1'] }, updatedAt: '2026-01-01T10:00:00.000Z' }]
  });
  store.gradeVaultState = state;
  const plans = store.listGradeSeatPlans(7);
  assert.equal(plans.length, 1);
  assert.ok(plans[0].id);
  assert.equal(plans[0].isCurrent, true);
  assert.deepEqual(store.getGradeSeatPlan(7), { activeSeats: ['a1'] });
});

test('creating, activating and deleting plans keeps exactly one current plan', () => {
  const store = createStore();
  store.gradeVaultState = store.normalizeGradeVaultState(null);
  const first = store.createGradeSeatPlan(7, { activeSeats: ['a1'], students: [{ id: 1 }] });
  const second = store.createGradeSeatPlan(7, { activeSeats: ['b1'] });
  assert.notEqual(first.id, second.id);
  assert.equal(first.isCurrent, true);
  assert.equal(second.isCurrent, false);
  assert.equal(Object.hasOwn(store.listGradeSeatPlans(7)[1].plan, 'students'), false);
  assert.deepEqual(store.getGradeSeatPlan(7), { activeSeats: ['a1'] });
  store.setCurrentGradeSeatPlan(7, second.id);
  assert.deepEqual(store.getGradeSeatPlan(7), { activeSeats: ['b1'] });
  store.deleteGradeSeatPlan(7, second.id);
  assert.equal(store.listGradeSeatPlans(7)[0].id, first.id);
  assert.equal(store.listGradeSeatPlans(7)[0].isCurrent, true);
  store.deleteGradeSeatPlan(7, first.id);
  assert.deepEqual(store.listGradeSeatPlans(7), []);
  assert.equal(store.getGradeSeatPlan(7), null);
});

test('deleting the current plan selects the most recently saved remaining plan', () => {
  const store = createStore();
  store.gradeVaultState = store.normalizeGradeVaultState(null);
  const first = store.createGradeSeatPlan(7, { activeSeats: ['a1'] });
  const second = store.createGradeSeatPlan(7, { activeSeats: ['b1'] });
  const third = store.createGradeSeatPlan(7, { activeSeats: ['c1'] });
  store.setCurrentGradeSeatPlan(7, first.id);
  store.deleteGradeSeatPlan(7, first.id);
  assert.equal(store.listGradeSeatPlans(7).find((plan) => plan.isCurrent)?.id, third.id);
  assert.equal(store.listGradeSeatPlans(7).some((plan) => plan.id === second.id), true);
});
