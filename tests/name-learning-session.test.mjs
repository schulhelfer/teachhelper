import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/modules/name-learning/session.js', import.meta.url), 'utf8');
const session = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const NOW = 1_700_000_000_000;
const portrait = { mime: 'image/webp', data: 'AA==' };
const card = (studentId, courseId, dueAt = NOW, stage = 0) => ({
  studentId, courseId, portrait, progress: { dueAt, stage },
});

test('stage intervals and reviews use the fixed schedule', () => {
  assert.deepEqual(session.STAGES, [0, 1, 2, 4, 7, 14, 21, 30, 45, 60, 90]);
  assert.deepEqual(session.applyReview({ stage: 0, dueAt: NOW }, true, NOW), {
    stage: 1, dueAt: NOW + session.DAY_MS,
  });
  assert.deepEqual(session.applyReview({ stage: 10, dueAt: NOW }, true, NOW), {
    stage: 10, dueAt: NOW + 90 * session.DAY_MS,
  });
  assert.deepEqual(session.applyReview({ stage: 7, dueAt: NOW - 1 }, false, NOW), {
    stage: 0, dueAt: NOW,
  });
});

test('cards are due at or before now', () => {
  assert.equal(session.isDue({ stage: 1, dueAt: NOW - 1 }, NOW), true);
  assert.equal(session.isDue({ stage: 1, dueAt: NOW }, NOW), true);
  assert.equal(session.isDue({ stage: 1, dueAt: NOW + 1 }, NOW), false);
});

test('the next-review message uses the newly calculated due date', () => {
  assert.equal(session.nextReviewMessage({ stage: 0, dueAt: NOW }, NOW), 'Nächste Abfrage: sofort');
  assert.equal(session.nextReviewMessage({ stage: 1, dueAt: NOW + session.DAY_MS }, NOW), 'Nächste Abfrage: in 1 Tag');
  assert.equal(session.nextReviewMessage({ stage: 4, dueAt: NOW + 7 * session.DAY_MS }, NOW), 'Nächste Abfrage: in 7 Tagen');
});

test('due queue filters courses and puts longer overdue cards first', () => {
  const queue = session.buildDueQueue([
    card(1, 10, NOW - 500), card(2, 10, NOW - 200), card(3, 11, NOW - 999), card(4, 10, NOW + 1),
  ], [10], NOW, () => 0.5);
  assert.deepEqual(queue.map((item) => item.studentId), [1, 2]);
});

test('a missed card is absent from the current queue and returns on the next build', () => {
  const cards = [card(1, 10), card(2, 10), card(3, 10)];
  const firstRound = session.buildDueQueue(cards, [10], NOW, () => 0.5);
  const missed = firstRound.shift();
  missed.progress = session.applyReview(missed.progress, false, NOW);
  assert.deepEqual(firstRound.map((item) => item.studentId), [2, 3]);
  const nextRound = session.buildDueQueue(cards, [10], NOW, () => 0.5);
  assert.equal(nextRound.some((item) => item.studentId === 1), true);
});

test('random practice shuffles selected cards without changing progress', () => {
  const cards = [card(1, 10, NOW + 4), card(2, 10, NOW - 3), card(3, 11, NOW)];
  const before = structuredClone(cards.map((item) => item.progress));
  const queue = session.buildRandomQueue(cards, [10], () => 0);
  assert.deepEqual(queue.map((item) => item.studentId), [2, 1]);
  assert.deepEqual(cards.map((item) => item.progress), before);
});
