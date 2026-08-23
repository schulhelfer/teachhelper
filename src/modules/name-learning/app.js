import { applyReview, buildDueQueue, buildRandomQueue, nextReviewMessage } from './session.js';
import { installTutorialEntryHint } from '../../shared/tutorial-entry-hint.js';

const ORIGIN = window.location.origin === 'null' ? new URL(import.meta.url).origin : window.location.origin;
const MODULE_FRAME_NONCE = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';
const DATA_REQUEST = 'classroom:name-learning-data-request';
const DATA_RESULT = 'classroom:name-learning-data-result';
const REVIEW_REQUEST = 'classroom:name-learning-review-request';
const REVIEW_RESULT = 'classroom:name-learning-review-result';
const TUTORIAL_START_REQUEST = 'classroom:tutorial-start-request';
const TUTORIAL_COMMAND_EVENT = 'classroom:name-learning-tutorial-command';
const TUTORIAL_TARGET_RECT_REQUEST_EVENT = 'classroom:tutorial-target-rect-request';
const TUTORIAL_TARGET_RECT_RESPONSE_EVENT = 'classroom:tutorial-target-rect-response';
const REVIEW_FEEDBACK_DISPLAY_MS = 2250;
const refs = {
  status: document.getElementById('status'), setup: document.getElementById('setup'), courses: document.getElementById('courses'),
  startDue: document.getElementById('start-due'), startDueLabel: document.getElementById('start-due-label'), startRandom: document.getElementById('start-random'),
  practice: document.getElementById('practice'), portrait: document.getElementById('portrait'), portraitReverse: document.getElementById('portrait-reverse'),
  flashcard: document.getElementById('flashcard'), flipCard: document.getElementById('flip-card'), flashcardBack: document.getElementById('flashcard-back'),
  answer: document.getElementById('answer'), course: document.getElementById('course'), known: document.getElementById('known'), unknown: document.getElementById('unknown'),
  empty: document.getElementById('empty'), emptyTitle: document.getElementById('empty-title'), emptyCopy: document.getElementById('empty-copy'), emptyRandom: document.getElementById('empty-random'),
  reviewFeedback: document.getElementById('review-feedback'),
  tutorialButton: document.getElementById('tutorialButton'),
};
let cards = [];
let selectedCourses = new Set();
let queue = [];
let mode = 'due';
let objectUrl = '';
let reviewFeedbackTimer = 0;
let reviewFeedbackActive = false;
let tutorialDemoActive = false;
let tutorialPreviousState = null;

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
  refs.practice.classList.remove('is-awaiting-next-card');
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
  refs.practice.classList.add('is-awaiting-next-card');
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
  refs.practice.classList.add('is-ready-to-reveal');
  refs.flashcard.classList.remove('is-revealed');
  refs.flashcardBack.setAttribute('aria-hidden', 'true');
  refs.flipCard.disabled = false;
  refs.answer.textContent = card.name;
  refs.course.textContent = courseName(card);
  refs.course.style.setProperty('--course-color', String(card.courseColor || '#334155'));
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
  refs.practice.classList.remove('is-ready-to-reveal');
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
  if (!tutorialDemoActive) {
    post(REVIEW_REQUEST, { courseId: card.courseId, studentId: card.studentId, progress });
  }
  renderModeControls();
  renderSidebarStatus();
}

function tutorialDemoPortrait(initials, color) {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">',
    `<rect width="240" height="240" rx="24" fill="${color}"/>`,
    '<circle cx="120" cy="94" r="46" fill="rgba(255,255,255,0.92)"/>',
    '<path d="M34 240c0-47 38-78 86-78s86 31 86 78z" fill="rgba(255,255,255,0.92)"/>',
    `<text x="120" y="110" font-family="sans-serif" font-size="46" font-weight="700" text-anchor="middle" fill="${color}">${initials}</text>`,
    '</svg>',
  ].join('');
  return { data: btoa(svg), mime: 'image/svg+xml' };
}

function buildTutorialDemoCards(now = Date.now()) {
  return [
    ['Mara Beispiel', 'MB', '#2563eb', 900001],
    ['Jonas Muster', 'JM', '#0f766e', 900002],
    ['Lea Probe', 'LP', '#b45309', 900003],
  ].map(([name, initials, color, studentId]) => ({
    courseId: 900100,
    courseName: 'Tutorial-Beispielkurs',
    courseColor: '#2563eb',
    studentId,
    name,
    progress: { stage: 0, dueAt: now - 1000 },
    portrait: tutorialDemoPortrait(initials, color),
  }));
}

function activateTutorialDemo() {
  if (tutorialDemoActive) return;
  tutorialPreviousState = {
    cards,
    selectedCourses: new Set(selectedCourses),
    queue: queue.slice(),
    mode,
  };
  tutorialDemoActive = true;
  cards = buildTutorialDemoCards();
  selectedCourses = new Set(cards.map((card) => Number(card.courseId)));
  mode = 'due';
  queue = [];
  renderSetup();
}

function cleanupTutorialDemo() {
  if (!tutorialDemoActive) return;
  tutorialDemoActive = false;
  const previous = tutorialPreviousState;
  tutorialPreviousState = null;
  revokePortrait();
  cards = Array.isArray(previous?.cards) ? previous.cards : [];
  selectedCourses = new Set(previous?.selectedCourses || []);
  queue = Array.isArray(previous?.queue) ? previous.queue : [];
  mode = previous?.mode || 'due';
  if (!cards.length) {
    mode = 'random';
    showEmpty();
    return;
  }
  renderSetup();
}

function showTutorialTargetFeedback() {
  const card = queue[0];
  resetReviewFeedback();
  refs.reviewFeedback.hidden = false;
  refs.reviewFeedback.textContent = nextReviewMessage(applyReview(card?.progress, true, Date.now()), Date.now());
  requestAnimationFrame(() => refs.reviewFeedback.classList.add('is-visible'));
}

function showTutorialSurface(surface = 'setup') {
  if (surface === 'setup') {
    renderSetup();
    return;
  }
  if (surface === 'empty') {
    mode = 'due';
    showEmpty();
    return;
  }
  if (!queue.length) {
    mode = 'due';
    queue = buildDueQueue(cards, [...selectedCourses]);
  }
  if (!queue.length) {
    showEmpty();
    return;
  }
  renderCard();
  if (surface === 'revealed' || surface === 'feedback') {
    reveal();
  }
  if (surface === 'feedback') {
    showTutorialTargetFeedback();
  }
}

function respondWithTutorialTargetRect(detail) {
  const requestId = String(detail?.requestId || '');
  const selectors = Array.isArray(detail?.selectors) ? detail.selectors : [];
  const element = selectors
    .map((selector) => (typeof selector === 'string' ? document.querySelector(selector) : null))
    .find((candidate) => {
      if (!(candidate instanceof HTMLElement) || candidate.hidden) return false;
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
  if (element && detail?.reveal) {
    const rect = element.getBoundingClientRect();
    if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    }
  }
  const rect = element?.getBoundingClientRect();
  post(TUTORIAL_TARGET_RECT_RESPONSE_EVENT, {
    requestId,
    rect: rect ? {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    } : null,
  });
}

function handleTutorialCommand(detail) {
  const command = String(detail?.command || '');
  if (command === 'activateDemo') {
    activateTutorialDemo();
    return;
  }
  if (command === 'cleanupDemo') {
    cleanupTutorialDemo();
    return;
  }
  if (command === 'showSurface') {
    showTutorialSurface(String(detail?.detail?.surface || 'setup'));
  }
}

refs.startDue.addEventListener('click', () => start('due')); refs.startRandom.addEventListener('click', () => start('random')); refs.emptyRandom.addEventListener('click', () => start('random')); refs.flipCard.addEventListener('click', reveal);
refs.practice.addEventListener('click', () => {
  if (reviewFeedbackActive) {
    advanceAfterReviewFeedback();
    return;
  }
  reveal();
});
refs.known.addEventListener('click', (event) => { event.stopPropagation(); review(true); });
refs.unknown.addEventListener('click', (event) => { event.stopPropagation(); review(false); });
refs.tutorialButton?.addEventListener('click', () => post(TUTORIAL_START_REQUEST, { source: 'iframe', module: 'name-learning' }));
installTutorialEntryHint(refs.tutorialButton, 'name-learning', 'Namen lernen');
window.addEventListener('beforeunload', () => { revokePortrait(); clearReviewFeedbackTimer(); });
window.addEventListener('message', (event) => {
  if (
    event.source !== window.parent
    || event.origin !== ORIGIN
    || !event.data
    || typeof event.data !== 'object'
    || (MODULE_FRAME_NONCE && event.data.frameNonce !== MODULE_FRAME_NONCE)
  ) return;
  if (event.data.type === TUTORIAL_TARGET_RECT_REQUEST_EVENT) {
    respondWithTutorialTargetRect(event.data.detail && typeof event.data.detail === 'object' ? event.data.detail : {});
    return;
  }
  if (event.data.type === TUTORIAL_COMMAND_EVENT) {
    handleTutorialCommand(event.data.detail && typeof event.data.detail === 'object' ? event.data.detail : {});
    return;
  }
  if (event.data.type === DATA_RESULT) {
    const nextCards = Array.isArray(event.data.detail?.cards) ? event.data.detail.cards : [];
    if (tutorialDemoActive) {
      tutorialPreviousState = {
        ...tutorialPreviousState,
        cards: nextCards,
        selectedCourses: new Set(nextCards.map((card) => Number(card.courseId)).filter((id) => id > 0)),
        queue: [],
      };
      return;
    }
    cards = nextCards;
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
