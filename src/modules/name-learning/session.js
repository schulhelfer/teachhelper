export const STAGES = Object.freeze([0, 1, 2, 4, 7, 14, 21, 30, 45, 60, 90]);
export const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeProgress(progress = null, now = Date.now()) {
  const stage = Math.min(STAGES.length - 1, Math.max(0, Math.floor(Number(progress?.stage) || 0)));
  const dueAt = Number(progress?.dueAt);
  return { stage, dueAt: Number.isFinite(dueAt) && dueAt >= 0 ? dueAt : now };
}

export function isDue(progress, now = Date.now()) {
  return normalizeProgress(progress, now).dueAt <= now;
}

export function applyReview(progress, known, now = Date.now()) {
  if (!known) return { stage: 0, dueAt: now };
  const current = normalizeProgress(progress, now);
  const stage = Math.min(current.stage + 1, STAGES.length - 1);
  return { stage, dueAt: now + STAGES[stage] * DAY_MS };
}

export function applyHintedReview(progress, correct, now = Date.now()) {
  if (!correct) return applyReview(progress, false, now);
  const current = normalizeProgress(progress, now);
  const stage = Math.max(0, current.stage - 1);
  return { stage, dueAt: now + STAGES[stage] * DAY_MS };
}

export function nextReviewMessage(progress, now = Date.now()) {
  const days = Math.max(0, Math.round((normalizeProgress(progress, now).dueAt - now) / DAY_MS));
  if (days === 0) return 'Nächste Abfrage: sofort';
  return `Nächste Abfrage: in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
}

function filterCards(cards = [], courseIds = []) {
  const selected = new Set((courseIds || []).map((id) => Number(id)).filter((id) => id > 0));
  return (Array.isArray(cards) ? cards : []).filter((card) => (
    selected.has(Number(card?.courseId)) && card?.portrait && Number(card?.studentId) > 0
  ));
}

function shuffle(cards = [], random = Math.random) {
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

export function buildHintChoices(card, pool = [], count = 4, random = Math.random) {
  const answer = String(card?.name || '').trim();
  if (!answer) return [];
  const seen = new Set([answer]);
  const distractors = [];
  for (const candidate of shuffle(Array.isArray(pool) ? pool : [], random)) {
    if (distractors.length >= Math.max(0, count - 1)) break;
    if (Number(candidate?.studentId) === Number(card?.studentId)) continue;
    const name = String(candidate?.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    distractors.push(name);
  }
  return shuffle([answer, ...distractors], random);
}

export function buildDueQueue(cards = [], courseIds = [], now = Date.now(), random = Math.random) {
  const tieBreakers = new Map();
  return filterCards(cards, courseIds)
    .filter((card) => isDue(card.progress, now))
    .slice()
    .sort((left, right) => {
      const delta = normalizeProgress(left.progress, now).dueAt - normalizeProgress(right.progress, now).dueAt;
      if (delta) return delta;
      if (!tieBreakers.has(left)) tieBreakers.set(left, random());
      if (!tieBreakers.has(right)) tieBreakers.set(right, random());
      return tieBreakers.get(left) - tieBreakers.get(right);
    });
}

export function buildRandomQueue(cards = [], courseIds = [], random = Math.random) {
  return shuffle(filterCards(cards, courseIds), random);
}
