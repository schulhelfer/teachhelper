import { applyReview, buildDueQueue, buildRandomQueue, nextReviewMessage } from './session.js';
import { installTutorialEntryHint } from '../../shared/tutorial-entry-hint.js';
import { MODULE_CONTEXT_MENU_DISMISS_EVENT, NAME_LEARNING_SHELL_LAYOUT_EVENT } from '../../shell/tabs.js';
import { createLearnerSearchDialog, LEARNER_SEARCH_MESSAGES } from '../../shared/learner-search-dialog.js';

const ORIGIN = window.location.origin === 'null' ? new URL(import.meta.url).origin : window.location.origin;
const MODULE_FRAME_NONCE = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';
const DATA_REQUEST = 'classroom:name-learning-data-request';
const DATA_RESULT = 'classroom:name-learning-data-result';
const REVIEW_REQUEST = 'classroom:name-learning-review-request';
const REVIEW_RESULT = 'classroom:name-learning-review-result';
const COURSE_VISIBILITY_REQUEST = 'classroom:name-learning-course-visibility-request';
const MANAGE_STUDENTS_REQUEST = 'classroom:name-learning-manage-students-request';
const STUDENT_SEARCH_REQUEST = 'classroom:name-learning-student-search-request';
const STUDENT_SEARCH_RESULT = 'classroom:name-learning-student-search-result';
const ACCESS_STATE = 'classroom:name-learning-access-state';
const TUTORIAL_START_REQUEST = 'classroom:help-entry-request';
const TUTORIAL_COMMAND_EVENT = 'classroom:name-learning-tutorial-command';
const TUTORIAL_TARGET_RECT_REQUEST_EVENT = 'classroom:tutorial-target-rect-request';
const TUTORIAL_TARGET_RECT_RESPONSE_EVENT = 'classroom:tutorial-target-rect-response';
const REVIEW_FEEDBACK_DISPLAY_MS = 2250;
const CARD_FLIP_FALLBACK_MS = 550;
const refs = {
  root: document.querySelector('.app'), side: document.querySelector('.side'),
  status: document.getElementById('status'), setup: document.getElementById('setup'), courses: document.getElementById('courses'),
  startDue: document.getElementById('start-due'), startDueLabel: document.getElementById('start-due-label'), startRandom: document.getElementById('start-random'),
  practice: document.getElementById('practice'), portrait: document.getElementById('portrait'), portraitReverse: document.getElementById('portrait-reverse'),
  flashcard: document.getElementById('flashcard'), flashcardInner: document.querySelector('.flashcard-inner'), flipCard: document.getElementById('flip-card'), flashcardBack: document.getElementById('flashcard-back'),
  answer: document.getElementById('answer'), course: document.getElementById('course'), known: document.getElementById('known'), unknown: document.getElementById('unknown'),
  empty: document.getElementById('empty'), emptyTitle: document.getElementById('empty-title'), emptyCopy: document.getElementById('empty-copy'), emptyRandom: document.getElementById('empty-random'),
  reviewFeedback: document.getElementById('review-feedback'),
  courseContextMenu: document.getElementById('course-context-menu'), sidebarContextMenu: document.getElementById('sidebar-context-menu'),
  learnerSearchBtn: document.getElementById('learner-search-btn'),
  tutorialButton: document.getElementById('tutorialButton'),
};
let cards = [];
let courses = [];
let selectedCourses = new Set();
let queue = [];
let mode = 'due';
let objectUrl = '';
let reviewFeedbackTimer = 0;
let nextCardTransitionTimer = 0;
let cancelNextCardTransition = null;
let reviewFeedbackActive = false;
let tutorialDemoActive = false;
let tutorialPreviousState = null;
let gradeVaultLocked = false;
let hasReceivedData = false;
let contextMenuCourseId = 0;
let visibilityRequestSequence = 0;
let showHiddenCourses = false;
let learnerSearchRequestSequence = 0;

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
function clearNextCardTransitionTimer() {
  if (nextCardTransitionTimer) window.clearTimeout(nextCardTransitionTimer);
  nextCardTransitionTimer = 0;
  cancelNextCardTransition?.();
  cancelNextCardTransition = null;
}
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
  renderNextCardAfterFlip();
}
function hideAll() { refs.practice.hidden = true; refs.empty.hidden = true; }
function courseName(card) { return String(card.courseName || 'Kurs'); }
function cardsForSelection() { return cards.filter((card) => selectedCourses.has(Number(card.courseId))); }
function renderSidebarStatus() {
  if (gradeVaultLocked) {
    refs.status.hidden = true;
    return;
  }
  refs.status.hidden = true;
}

function hideCourseContextMenu() {
  contextMenuCourseId = 0;
  refs.courseContextMenu?.setAttribute('hidden', '');
  refs.sidebarContextMenu?.setAttribute('hidden', '');
}

function openCourseContextMenu(courseId, clientX, clientY) {
  const id = Number(courseId || 0);
  if (!id || !refs.courseContextMenu || gradeVaultLocked) return;
  const course = courses.find((item) => Number(item.id) === id);
  if (!course) return;
  contextMenuCourseId = id;
  const visibilityButton = refs.courseContextMenu.querySelector('[data-course-context-action="hide"]');
  if (visibilityButton) visibilityButton.textContent = course.hidden ? 'In „Namen lernen“ einblenden' : 'Aus „Namen lernen“ ausblenden';
  refs.courseContextMenu.style.left = `${Math.round(Number(clientX) || 0)}px`;
  refs.courseContextMenu.style.top = `${Math.round(Number(clientY) || 0)}px`;
  refs.courseContextMenu.hidden = false;
  requestAnimationFrame(() => {
    if (contextMenuCourseId !== id || refs.courseContextMenu.hidden) return;
    const rect = refs.courseContextMenu.getBoundingClientRect();
    const margin = 8;
    refs.courseContextMenu.style.left = `${Math.max(margin, Math.min(window.innerWidth - rect.width - margin, Number(clientX) || 0))}px`;
    refs.courseContextMenu.style.top = `${Math.max(margin, Math.min(window.innerHeight - rect.height - margin, Number(clientY) || 0))}px`;
  });
}

function openSidebarContextMenu(clientX, clientY) {
  if (!refs.sidebarContextMenu || gradeVaultLocked) return;
  const button = refs.sidebarContextMenu.querySelector('[data-sidebar-context-action="show-hidden"]');
  if (button) {
    button.textContent = `${showHiddenCourses ? '✓ ' : ''}Ausgeblendete Kurse anzeigen`;
    button.setAttribute('aria-checked', showHiddenCourses ? 'true' : 'false');
  }
  refs.sidebarContextMenu.style.left = `${Math.round(Number(clientX) || 0)}px`;
  refs.sidebarContextMenu.style.top = `${Math.round(Number(clientY) || 0)}px`;
  refs.sidebarContextMenu.hidden = false;
  requestAnimationFrame(() => {
    if (refs.sidebarContextMenu.hidden) return;
    const rect = refs.sidebarContextMenu.getBoundingClientRect();
    const margin = 8;
    refs.sidebarContextMenu.style.left = `${Math.max(margin, Math.min(window.innerWidth - rect.width - margin, Number(clientX) || 0))}px`;
    refs.sidebarContextMenu.style.top = `${Math.max(margin, Math.min(window.innerHeight - rect.height - margin, Number(clientY) || 0))}px`;
  });
}

function requestCourseVisibility(courseId, hidden) {
  const id = Number(courseId || 0);
  if (!id || gradeVaultLocked) return;
  hideCourseContextMenu();
  if (hidden) {
    courses = courses.map((course) => Number(course.id) === id ? { ...course, hidden: true } : course);
    cards = cards.filter((card) => Number(card.courseId) !== id);
    selectedCourses.delete(id);
    queue = queue.filter((card) => Number(card.courseId) !== id);
    renderSetup();
  }
  post(COURSE_VISIBILITY_REQUEST, {
    requestId: `name-learning-course-visibility-${Date.now()}-${++visibilityRequestSequence}`,
    courseId: id,
    hidden: hidden === true,
  });
}

function requestShowHiddenCourses(showHidden) {
  if (gradeVaultLocked) return;
  post(COURSE_VISIBILITY_REQUEST, {
    requestId: `name-learning-show-hidden-${Date.now()}-${++visibilityRequestSequence}`,
    showHiddenCourses: showHidden === true,
  });
}

function requestManageStudents(courseId, studentId = 0) {
  const id = Number(courseId || 0);
  if (!id) return;
  hideCourseContextMenu();
  post(MANAGE_STUDENTS_REQUEST, { courseId: id, ...(Number(studentId) ? { studentId: Number(studentId) } : {}) });
}

const learnerSearch = createLearnerSearchDialog({
  onSelectCourse: (course) => requestManageStudents(course.courseId, course.studentId),
});

function openLearnerSearchDialog() {
  if (gradeVaultLocked) return;
  learnerSearch.open();
  post(STUDENT_SEARCH_REQUEST, { requestId: `name-learning-student-search-${Date.now()}-${++learnerSearchRequestSequence}` });
}

function clearSensitiveLearningState() {
  revokePortrait();
  resetReviewFeedback();
  clearNextCardTransitionTimer();
  hideCourseContextMenu();
  cards = [];
  courses = [];
  selectedCourses.clear();
  queue = [];
  mode = 'due';
  tutorialDemoActive = false;
  tutorialPreviousState = null;
  hasReceivedData = false;
  learnerSearch.close();
  refs.courses.textContent = '';
  refs.setup.hidden = true;
  refs.portrait.removeAttribute('src');
  refs.portraitReverse.removeAttribute('src');
  refs.answer.textContent = '';
  refs.course.textContent = '';
  refs.known.disabled = true;
  refs.unknown.disabled = true;
  hideAll();
}

function setGradeVaultLocked(locked) {
  const nextLocked = Boolean(locked);
  const wasLocked = gradeVaultLocked;
  gradeVaultLocked = nextLocked;
  refs.root?.classList.toggle('is-grade-vault-locked', nextLocked);
  if (refs.learnerSearchBtn) refs.learnerSearchBtn.disabled = nextLocked;
  if (nextLocked) {
    clearSensitiveLearningState();
    return;
  }
  if (wasLocked && !tutorialDemoActive) {
    post(DATA_REQUEST, {});
  }
}

function renderCourses() {
  if (gradeVaultLocked) return;
  refs.courses.textContent = '';
  const visibleCourses = courses.filter((course) => !course.hidden);
  const appendCourse = (course, hidden = false) => {
    const id = Number(course.id);
    const label = document.createElement('label');
    label.classList.toggle('is-hidden-course', hidden);
    if (course.color) label.style.setProperty('--course-color', course.color);
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !hidden && selectedCourses.has(id); input.disabled = hidden;
    input.addEventListener('change', () => { if (input.checked) selectedCourses.add(id); else selectedCourses.delete(id); renderSetup(); });
    label.addEventListener('contextmenu', (event) => openCourseContextMenu(id, event.clientX, event.clientY));
    label.append(input, document.createTextNode(course.name)); refs.courses.append(label);
  };
  visibleCourses.forEach((course) => appendCourse(course));
  const hiddenCourses = courses.filter((course) => course.hidden);
  if (showHiddenCourses && hiddenCourses.length) {
    const separator = document.createElement('div');
    separator.className = 'course-list-separator';
    separator.setAttribute('aria-hidden', 'true');
    refs.courses.append(separator);
    hiddenCourses.forEach((course) => appendCourse(course, true));
  }
}

function renderSetup() {
  if (gradeVaultLocked) return;
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
  if (gradeVaultLocked) return;
  revokePortrait(); hideAll(); refs.empty.hidden = false;
  refs.emptyTitle.textContent = mode === 'due' ? 'Keine Karten fällig' : 'Keine Karten verfügbar';
  refs.emptyCopy.textContent = mode === 'due' ? 'Du kannst stattdessen zufällig mit den ausgewählten Kursen üben.' : 'Für die ausgewählten Kurse gibt es keine verwendbaren Fotos.';
  refs.emptyRandom.hidden = mode !== 'due' || cardsForSelection().length === 0;
  renderSidebarStatus();
}

function start(nextMode) {
  if (gradeVaultLocked) return;
  resetReviewFeedback();
  mode = nextMode;
  queue = mode === 'due' ? buildDueQueue(cards, selected()) : buildRandomQueue(cards, selected());
  if (!queue.length) { showEmpty(); return; }
  renderCard();
}

function renderCard() {
  if (gradeVaultLocked) return;
  clearNextCardTransitionTimer();
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

function renderNextCardAfterFlip() {
  if (!refs.flashcard.classList.contains('is-revealed') || !refs.flashcardInner) {
    renderCard();
    return;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearNextCardTransitionTimer();
    refs.flashcardInner.removeEventListener('transitionend', onTransitionEnd);
    renderCard();
  };
  const onTransitionEnd = (event) => {
    if (event.target === refs.flashcardInner && event.propertyName === 'transform') finish();
  };
  refs.flashcardInner.addEventListener('transitionend', onTransitionEnd);
  cancelNextCardTransition = () => refs.flashcardInner.removeEventListener('transitionend', onTransitionEnd);
  refs.flashcard.classList.remove('is-revealed');
  refs.flashcardBack.setAttribute('aria-hidden', 'true');
  nextCardTransitionTimer = window.setTimeout(finish, CARD_FLIP_FALLBACK_MS);
}

function reveal() {
  if (gradeVaultLocked) return;
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
  if (gradeVaultLocked) return;
  const card = queue.shift();
  if (!card) return;
  if (mode === 'random') { renderNextCardAfterFlip(); return; }
  const now = Date.now();
  const progress = applyReview(card.progress, known, now);
  card.progress = progress;
  refs.known.disabled = true;
  refs.unknown.disabled = true;
  showReviewFeedback(progress, now, () => renderNextCardAfterFlip());
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
  if (gradeVaultLocked) return;
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
  if (gradeVaultLocked) {
    clearSensitiveLearningState();
    return;
  }
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
refs.learnerSearchBtn?.addEventListener('click', openLearnerSearchDialog);
refs.tutorialButton?.addEventListener('click', () => post(TUTORIAL_START_REQUEST, { source: 'iframe', module: 'name-learning' }));
refs.courseContextMenu?.addEventListener('click', (event) => {
  const action = event.target instanceof Element ? event.target.closest('[data-course-context-action]')?.dataset.courseContextAction : '';
  if (action === 'hide') {
    const course = courses.find((item) => Number(item.id) === contextMenuCourseId);
    requestCourseVisibility(contextMenuCourseId, course?.hidden !== true);
  }
  if (action === 'manage-students') requestManageStudents(contextMenuCourseId);
});
refs.sidebarContextMenu?.addEventListener('click', (event) => {
  const action = event.target instanceof Element ? event.target.closest('[data-sidebar-context-action]')?.dataset.sidebarContextAction : '';
  if (action !== 'show-hidden') return;
  showHiddenCourses = !showHiddenCourses;
  hideCourseContextMenu();
  renderSetup();
  requestShowHiddenCourses(showHiddenCourses);
});
refs.side?.addEventListener('contextmenu', (event) => {
  if (event.target instanceof Element && event.target.closest('label, button, input, .sidebar-header')) return;
  openSidebarContextMenu(event.clientX, event.clientY);
});
document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('pointerdown', (event) => {
  const target = event.target instanceof Node ? event.target : null;
  const isInMenu = Boolean(target && (refs.courseContextMenu?.contains(target) || refs.sidebarContextMenu?.contains(target)));
  if (isInMenu) return;
  hideCourseContextMenu();
}, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideCourseContextMenu();
}, true);
installTutorialEntryHint(refs.tutorialButton, 'name-learning', 'Namen lernen');
window.addEventListener('beforeunload', () => { revokePortrait(); clearReviewFeedbackTimer(); clearNextCardTransitionTimer(); });
window.addEventListener('message', (event) => {
  if (
    event.source !== window.parent
    || event.origin !== ORIGIN
    || !event.data
    || typeof event.data !== 'object'
  || (MODULE_FRAME_NONCE && event.data.frameNonce !== MODULE_FRAME_NONCE)
  ) return;
  if (event.data.type === NAME_LEARNING_SHELL_LAYOUT_EVENT) {
    document.documentElement.dataset.shellCollapsed = event.data.detail?.collapsed ? 'true' : 'false';
    return;
  }
  if (event.data.type === MODULE_CONTEXT_MENU_DISMISS_EVENT) {
    hideCourseContextMenu();
    return;
  }
  if (event.data.type === TUTORIAL_TARGET_RECT_REQUEST_EVENT) {
    respondWithTutorialTargetRect(event.data.detail && typeof event.data.detail === 'object' ? event.data.detail : {});
    return;
  }
  if (event.data.type === TUTORIAL_COMMAND_EVENT) {
    handleTutorialCommand(event.data.detail && typeof event.data.detail === 'object' ? event.data.detail : {});
    return;
  }
  if (event.data.type === ACCESS_STATE) {
    const detail = event.data.detail && typeof event.data.detail === 'object' ? event.data.detail : {};
    setGradeVaultLocked(detail.locked === true);
    return;
  }
  if (event.data.type === STUDENT_SEARCH_RESULT) {
    if (event.data.detail?.unlockCancelled === true || gradeVaultLocked) {
      learnerSearch.setStatus(LEARNER_SEARCH_MESSAGES.locked);
      return;
    }
    if (event.data.detail?.ok === false) {
      learnerSearch.setStatus(event.data.detail?.message || LEARNER_SEARCH_MESSAGES.failed);
      return;
    }
    learnerSearch.setRoster(event.data.detail?.students);
    return;
  }
  if (event.data.type === DATA_RESULT) {
    if (event.data.detail?.unlockCancelled === true || gradeVaultLocked) {
      setGradeVaultLocked(true);
      return;
    }
    if (event.data.detail?.ok === false) {
      refs.status.textContent = event.data.detail?.message || 'Namenslerndaten konnten nicht geladen werden.';
      refs.status.hidden = false;
      return;
    }
    if (typeof event.data.detail?.showHiddenCourses === 'boolean') {
      showHiddenCourses = event.data.detail.showHiddenCourses;
    }
    const nextCards = Array.isArray(event.data.detail?.cards) ? event.data.detail.cards : [];
    const nextCourses = Array.isArray(event.data.detail?.courses) ? event.data.detail.courses : [];
    if (tutorialDemoActive) {
      tutorialPreviousState = {
        ...tutorialPreviousState,
        cards: nextCards,
        courses: nextCourses,
        selectedCourses: new Set(nextCards.map((card) => Number(card.courseId)).filter((id) => id > 0)),
        queue: [],
      };
      return;
    }
    const visibleCourseIds = new Set(nextCourses
      .filter((course) => course && course.hidden !== true)
      .map((course) => Number(course.id))
      .filter((id) => id > 0));
    const visibilityChange = event.data.detail?.visibilityChange;
    cards = nextCards;
    courses = nextCourses.map((course) => ({
      id: Number(course?.id) || 0,
      name: String(course?.name || 'Kurs'),
      color: String(course?.color || ''),
      hidden: course?.hidden === true,
    })).filter((course) => course.id > 0);
    if (!hasReceivedData) {
      selectedCourses = new Set(visibleCourseIds);
      hasReceivedData = true;
    } else {
      selectedCourses = new Set([...selectedCourses].filter((id) => visibleCourseIds.has(id)));
      if (visibilityChange?.hidden === false && visibleCourseIds.has(Number(visibilityChange.courseId))) {
        selectedCourses.add(Number(visibilityChange.courseId));
      }
    }
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
