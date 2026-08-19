import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [defaults, store, runtime, integrity, gradesHtml, gradesApp, tabs, bridge, shell, main, index, nameLearningHtml, nameLearningCss, nameLearningIndex, nameLearningApp] = await Promise.all([
  read('../src/shared/school-data/defaults.js'), read('../src/modules/workspace/store.js'), read('../src/modules/workspace/runtime.js'),
  read('../src/shared/school-data/grade-integrity.js'), read('../src/modules/grades/app.html'), read('../src/modules/grades/app.js'),
  read('../src/shell/tabs.js'), read('../src/app/planning-seatplan-bridge.js'), read('../src/app/shell.js'), read('../src/main.js'), read('../index.html'),
  read('../src/modules/name-learning/app.html'), read('../src/modules/name-learning/app.css'),
  read('../src/modules/name-learning/index.js'),
  read('../src/modules/name-learning/app.js'),
]);

test('name learning visibility requires both portrait and module settings', () => {
  assert.match(defaults, /SHOW_NAME_LEARNING_MODULE_DEFAULT = false/);
  assert.match(store, /showNameLearningModule: SHOW_NAME_LEARNING_MODULE_DEFAULT/);
  assert.match(runtime, /'showNameLearningModule'/);
  assert.match(runtime, /vault:[\s\S]*showGradeStudentPortraits:[\s\S]*showNameLearningModule:/);
  assert.match(gradesHtml, /id="show-name-learning-module"/);
  assert.match(gradesApp, /showNameLearningModule: Boolean\(this\.store\.getSetting\(/);
  assert.match(shell, /vault\.showGradeStudentPortraits && vault\.showNameLearningModule/);
});

test('the module is a registered first-level tab and uses the existing bridge', () => {
  assert.match(tabs, /TAB_NAME_LEARNING = 'name-learning'/);
  assert.match(index, /id="tab-name-learning"[\s\S]*?Namen lernen/);
  assert.match(index, /id="name-learning-host"/);
  assert.match(main, /NAME_LEARNING_DATA_REQUEST_EVENT/);
  assert.match(bridge, /mountNameLearning/);
  assert.match(bridge, /GRADES_NAME_LEARNING_DATA_REQUEST_EVENT/);
  assert.match(bridge, /GRADES_NAME_LEARNING_REVIEW_REQUEST_EVENT/);
  assert.match(gradesApp, /type === "name-learning-data" \|\| type === "name-learning-review"/);
  assert.match(gradesApp, /handleNameLearningDataRequest\(action\.detail\)/);
  assert.match(gradesApp, /error\.code = "NAME_LEARNING_STUDENT_MISSING"/);
  assert.doesNotMatch(gradesApp, /!student \|\| !normalizeGradeStudentPortrait\(student\.portrait\)/);
  assert.match(nameLearningIndex, /sandbox: ISOLATED_MODULE_SANDBOX/);
  assert.match(nameLearningApp, /MODULE_FRAME_NONCE/);
  assert.match(nameLearningApp, /frameNonce: MODULE_FRAME_NONCE/);
  assert.match(gradesApp, /courseColor: normalizeCourseColor\(course\.color/);
});

test('name learning uses the shared module shell with its own sidebar', () => {
  assert.match(nameLearningHtml, /data-sidebar-width-scope="other"/);
  assert.match(nameLearningHtml, /<aside class="side"/);
  assert.match(nameLearningHtml, /sidebar-resize\.js/);
  assert.match(nameLearningCss, /--module-sidebar-width: 360px/);
  assert.match(nameLearningCss, /\.app > \.sidebar-resize-handle/);
  assert.match(nameLearningCss, /--sidebar-surface/);
  assert.match(nameLearningCss, /background: var\(--course-color/);
  assert.match(nameLearningHtml, /id="status" class="sidebar-status" aria-live="polite"/);
  assert.doesNotMatch(nameLearningHtml, /id="name-learning-title"/);
  assert.doesNotMatch(nameLearningHtml, /Foto ansehen, Namen überlegen/);
  assert.doesNotMatch(nameLearningHtml, /id="progress"/);
  assert.match(nameLearningHtml, /<h2 class="sidebar-section-title">Kurse<\/h2>[\s\S]*?id="setup" class="sidebar-section sidebar-mode"[\s\S]*?<h2 class="sidebar-section-title">Lernmodus<\/h2>/);
  assert.match(nameLearningHtml, /id="start-due-label">Fällige Karten \(0\) abfragen</);
  assert.doesNotMatch(nameLearningHtml, /segment-control\.css/);
  assert.doesNotMatch(nameLearningHtml, /class="segment-control"/);
  assert.match(nameLearningHtml, /id="start-due" class="mode-action" type="button"/);
  assert.match(nameLearningHtml, /id="start-random" class="mode-action" type="button"/);
  assert.match(nameLearningCss, /\.mode-actions \{ display: grid; gap: 8px; \}/);
  assert.doesNotMatch(nameLearningHtml, /id="reveal"/);
  assert.match(nameLearningHtml, /id="flip-card"[\s\S]*?aria-label="Name aufdecken"/);
  assert.match(nameLearningHtml, /id="portrait-reverse" class="portrait portrait-reverse"/);
  assert.match(nameLearningHtml, /id="flashcard-back"[\s\S]*?id="answer"[\s\S]*?id="unknown"[\s\S]*?id="known"[\s\S]*?id="review-feedback"/);
  assert.match(nameLearningHtml, /id="review-feedback" class="review-feedback" role="status" aria-live="polite"/);
  assert.match(nameLearningApp, /refs\.flipCard\.addEventListener\('click', reveal\)/);
  assert.match(nameLearningApp, /if \(mode === 'random'\) \{ renderCard\(\); return; \}/);
  assert.match(nameLearningApp, /Fällige Karten \(\$\{dueCount\}\) abfragen/);
  assert.doesNotMatch(nameLearningApp, /Karte\$\{dueCount === 1/);
  assert.match(nameLearningApp, /REVIEW_FEEDBACK_DISPLAY_MS = 2250/);
  assert.match(nameLearningApp, /showReviewFeedback\(progress, now, \(\) => renderCard\(\)\)/);
  assert.match(nameLearningApp, /function advanceAfterReviewFeedback\(\) \{/);
  assert.match(nameLearningApp, /refs\.flashcard\.addEventListener\('click', \(event\) => \{/);
  assert.match(nameLearningApp, /event\.stopPropagation\(\); review\(true\)/);
  assert.match(nameLearningApp, /refs\.portraitReverse\.src = objectUrl/);
  assert.match(nameLearningCss, /\.flashcard\.is-awaiting-next-card \{ cursor: pointer; \}/);
  assert.match(nameLearningCss, /\.portrait-reverse \{[\s\S]*?opacity: \.58/);
  assert.match(nameLearningCss, /\.flashcard\.is-revealed \.flashcard-inner \{ transform: rotateY\(180deg\); \}/);
  assert.match(nameLearningCss, /\.review-feedback\.is-visible/);
  assert.match(nameLearningCss, /\.review-feedback-slot \{[\s\S]*?min-height: 56px/);
  assert.match(nameLearningCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(nameLearningCss, /\.known-action/);
  assert.match(nameLearningCss, /\.unknown-action/);
  assert.match(nameLearningCss, /\.main \{ display: flex; align-items: center;/);
});

test('only compact progress data is stored in encrypted grade course segments', () => {
  assert.match(store, /gradeNameLearning: Array\.isArray\(source\.gradeNameLearning\)/);
  assert.match(runtime, /gradeNameLearning: \(Array\.isArray\(state\.gradeNameLearning\)/);
  assert.match(runtime, /gradeNameLearning: withCourse\(persisted\.gradeNameLearning\)/);
  assert.match(integrity, /ungültigen Namenslernfortschritt/);
  assert.match(gradesApp, /portrait,\r?\n            progress:/);
});

test('cancelling a participant portrait picker does not close its parent dialog', () => {
  assert.match(gradesApp, /courseStudentsDialog\?\.addEventListener\("cancel", \(event\) => \{\s+if \(event\.target !== this\.refs\.courseStudentsDialog\) \{\s+return;\s+\}\s+event\.preventDefault\(\);\s+this\.closeCourseStudentsDialog\(\);/);
});

test('a card removed from the roster does not interrupt name-learning feedback', () => {
  assert.match(nameLearningApp, /event\.data\.detail\?\.code !== 'NAME_LEARNING_STUDENT_MISSING'/);
  assert.match(gradesApp, /code: String\(error\?\.code \|\| ""\)/);
});

test('participant portraits can be added from the clipboard', () => {
  assert.match(gradesApp, /dataAttribute: "student-portrait-paste"/);
  assert.match(gradesApp, /async pasteCourseDialogStudentPortrait\(index\)/);
  assert.match(gradesApp, /navigator\.clipboard\.read\(\)/);
  assert.match(gradesApp, /prepareGradeStudentPortrait\(file\)/);
  assert.match(gradesApp, /In der Zwischenablage wurde kein JPEG-, PNG- oder WebP-Bild gefunden/);
});
