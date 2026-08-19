import { applyReview, buildDueQueue, buildRandomQueue, nextReviewMessage } from './session.js';

const ORIGIN = window.location.origin === 'null' ? new URL(import.meta.url).origin : window.location.origin;
const MODULE_FRAME_NONCE = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';
const DATA_REQUEST = 'classroom:name-learning-data-request';
const DATA_RESULT = 'classroom:name-learning-data-result';
const REVIEW_REQUEST = 'classroom:name-learning-review-request';
const REVIEW_RESULT = 'classroom:name-learning-review-result';
const REVIEW_FEEDBACK_DISPLAY_MS = 2250;
const refs = {
  status: document.getElementById('status'), setup: document.getElementById('setup'), courses: document.getElementById('courses'),
  startDue: document.getElementById('start-due'), startDueLabel: document.getElementById('start-due-label'), startRandom: document.getElementById('start-random'),
  practice: document.getElementById('practice'), portrait: document.getElementById('portrait'), portraitReverse: document.getElementById('portrait-reverse'),
  flashcard: document.getElementById('flashcard'), flipCard: document.getElementById('flip-card'), flashcardBack: document.getElementById('flashcard-back'),
  answer: document.getElementById('answer'), known: document.getElementById('known'), unknown: document.getElementById('unknown'),
  empty: document.getElementById('empty'), emptyTitle: document.getElementById('empty-title'), emptyCopy: document.getElementById('empty-copy'), emptyRandom: document.getElementById('empty-random'),
  reviewFeedback: document.getElementById('review-feedback'),
};
let cards = [];
let selectedCourses = new Set();
let queue = [];
let mode = 'due';
let objectUrl = '';
let reviewFeedbackTimer = 0;
let reviewFeedbackActive = false;

function post(type, detail = {}) {
  window.parent?.postMessage({
    type,
    detail,
    ...(MODULE_FRAME_NONCE ? { frameNonce: MODULE_FRAME_NONCE } : {}),
  }, ORIGIN);
}
function selected() { return [...selectedCourses]; }
function revokePortrait() { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = ''; }
function clearReviewFeedbackTimer() { if (reviewFeedbackTimer) window.clearTimeout(reviewFeedbackTimer); reviewFeedbackTimer = 0; }
function resetReviewFeedback() {
  clearReviewFeedbackTimer();
  reviewFeedbackActive = false;
  refs.flashcard.classList.remove('is-awaiting-next-card');
  refs.reviewFeedback.classList.remove('is-visible');
  refs.reviewFeedback.hidden = true;
  refs.reviewFeedback.textContent = '';
}
function hideReviewFeedback(afterHidden = null) {
  clearReviewFeedbackTimer();
  refs.reviewFeedback.classList.remove('is-visible');
  reviewFeedbackTimer = window.setTimeout(() => {
    refs.reviewFeedback.hidden = true;
    refs.reviewFeedback.textContent = '';
    reviewFeedbackTimer = 0;
    afterHidden?.();
  }, 180);
}
function finishReviewFeedback(afterHidden = null) {
  if (!reviewFeedbackActive) return;
  reviewFeedbackActive = false;
  refs.flashcard.classList.remove('is-awaiting-next-card');
  hideReviewFeedback(afterHidden);
}
function showReviewFeedback(progress, now, afterHidden) {
  resetReviewFeedback();
  refs.reviewFeedback.hidden = false;
  refs.reviewFeedback.textContent = nextReviewMessage(progress, now);
  reviewFeedbackActive = true;
  refs.flashcard.classList.add('is-awaiting-next-card');
  requestAnimationFrame(() => refs.reviewFeedback.classList.add('is-visible'));
  reviewFeedbackTimer = window.setTimeout(() => finishReviewFeedback(afterHidden), REVIEW_FEEDBACK_DISPLAY_MS);
}
function advanceAfterReviewFeedback() {
  if (!reviewFeedbackActive) return;
  resetReviewFeedback();
  renderCard();
}
function hideAll() { refs.practice.hidden = true; refs.empty.hidden = true; }
function courseName(card) { return String(card.courseName || 'Kurs'); }
function cardsForSelection() { return cards.filter((card) => selectedCourses.has(Number(card.courseId))); }
function renderSidebarStatus() {
  refs.status.hidden = true;
}

function renderCourses() {
  refs.courses.textContent = '';
  const courses = new Map();
  cards.forEach((card) => {
    const id = Number(card.courseId);
    if (!courses.has(id)) {
      courses.set(id, { name: courseName(card), color: String(card.courseColor || '') });
    }
  });
  [...courses.entries()].forEach(([id, course]) => {
    const label = document.createElement('label');
    if (course.color) label.style.setProperty('--course-color', course.color);
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selectedCourses.has(id);
    input.addEventListener('change', () => { if (input.checked) selectedCourses.add(id); else selectedCourses.delete(id); renderSetup(); });
    label.append(input, document.createTextNode(course.name)); refs.courses.append(label);
  });
}

function renderSetup() {
  resetReviewFeedback(); hideAll(); refs.setup.hidden = false; renderCourses();
  renderModeControls();
  renderSidebarStatus();
}

function renderModeControls() {
  const dueCount = buildDueQueue(cards, selected()).length;
  refs.startDue.disabled = dueCount === 0 || selectedCourses.size === 0;
  refs.startDueLabel.textContent = `Fällige Karten (${dueCount}) abfragen`;
  refs.startDue.setAttribute('aria-label', refs.startDueLabel.textContent);
  refs.startRandom.disabled = cardsForSelection().length === 0;
  refs.startDue.setAttribute('aria-pressed', String(mode === 'due'));
  refs.startRandom.setAttribute('aria-pressed', String(mode === 'random'));
  refs.startDue.classList.toggle('is-active', mode === 'due');
  refs.startRandom.classList.toggle('is-active', mode === 'random');
}

function showEmpty() {
  revokePortrait(); hideAll(); refs.empty.hidden = false;
  refs.emptyTitle.textContent = mode === 'due' ? 'Keine Karten fällig' : 'Keine Karten verfügbar';
  refs.emptyCopy.textContent = mode === 'due' ? 'Du kannst stattdessen zufällig mit den ausgewählten Kursen üben.' : 'Für die ausgewählten Kurse gibt es keine verwendbaren Fotos.';
  refs.emptyRandom.hidden = mode !== 'due' || cardsForSelection().length === 0;
  renderSidebarStatus();
}

function start(nextMode) {
  resetReviewFeedback();
  mode = nextMode;
  queue = mode === 'due' ? buildDueQueue(cards, selected()) : buildRandomQueue(cards, selected());
  if (!queue.length) { showEmpty(); return; }
  renderCard();
}

function renderCard() {
  const card = queue[0];
  if (!card) { if (mode === 'due') { start('due'); } else { showEmpty(); } return; }
  resetReviewFeedback(); revokePortrait(); hideAll(); refs.practice.hidden = false;
  refs.flashcard.classList.remove('is-revealed');
  refs.flashcardBack.setAttribute('aria-hidden', 'true');
  refs.flipCard.disabled = false;
  refs.answer.textContent = card.name;
  refs.known.disabled = true;
  refs.unknown.disabled = true;
  try {
    objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(atob(card.portrait.data), (char) => char.charCodeAt(0))], { type: card.portrait.mime }));
    refs.portrait.src = objectUrl;
    refs.portraitReverse.src = objectUrl;
  } catch { queue.shift(); renderCard(); return; }
  renderModeControls();
  renderSidebarStatus();
}

function reveal() {
  if (refs.flashcard.classList.contains('is-revealed')) return;
  refs.flashcard.classList.add('is-revealed');
  refs.flipCard.disabled = true;
  refs.flashcardBack.setAttribute('aria-hidden', 'false');
  refs.known.disabled = false;
  refs.unknown.disabled = false;
  requestAnimationFrame(() => refs.known.focus());
}
function review(known) {
  const card = queue.shift();
  if (!card) return;
  if (mode === 'random') { renderCard(); return; }
  const now = Date.now();
  const progress = applyReview(card.progress, known, now);
  card.progress = progress;
  refs.known.disabled = true;
  refs.unknown.disabled = true;
  showReviewFeedback(progress, now, () => renderCard());
  post(REVIEW_REQUEST, { courseId: card.courseId, studentId: card.studentId, progress });
  renderModeControls();
  renderSidebarStatus();
}

refs.startDue.addEventListener('click', () => start('due')); refs.startRandom.addEventListener('click', () => start('random')); refs.emptyRandom.addEventListener('click', () => start('random')); refs.flipCard.addEventListener('click', reveal);
refs.flashcard.addEventListener('click', (event) => {
  if (!reviewFeedbackActive || event.target.closest('button')) return;
  advanceAfterReviewFeedback();
});
refs.known.addEventListener('click', (event) => { event.stopPropagation(); review(true); });
refs.unknown.addEventListener('click', (event) => { event.stopPropagation(); review(false); });
window.addEventListener('beforeunload', () => { revokePortrait(); clearReviewFeedbackTimer(); });
window.addEventListener('message', (event) => {
  if (
    event.source !== window.parent
    || event.origin !== ORIGIN
    || !event.data
    || typeof event.data !== 'object'
    || (MODULE_FRAME_NONCE && event.data.frameNonce !== MODULE_FRAME_NONCE)
  ) return;
  if (event.data.type === DATA_RESULT) {
    cards = Array.isArray(event.data.detail?.cards) ? event.data.detail.cards : [];
    selectedCourses = new Set(cards.map((card) => Number(card.courseId)).filter((id) => id > 0));
    if (!cards.length) { mode = 'random'; showEmpty(); } else renderSetup();
  }
  if (
    event.data.type === REVIEW_RESULT
    && event.data.detail?.ok === false
    && event.data.detail?.code !== 'NAME_LEARNING_STUDENT_MISSING'
  ) {
    refs.status.textContent = event.data.detail.message || 'Lernstatus konnte nicht gespeichert werden.';
    refs.status.hidden = false;
  }
});
post(DATA_REQUEST, {});
