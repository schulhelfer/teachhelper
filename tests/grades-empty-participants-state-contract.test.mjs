import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');
const appCss = await readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8');

function extractClassMethod(name, nextName) {
  const start = appSource.indexOf(`\n  ${name}(`);
  const end = appSource.indexOf(`\n  ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} must exist before ${nextName}`);
  return appSource.slice(start, end);
}

test('empty grade entry views keep enough layout height for their message and add button', () => {
  const method = extractClassMethod('renderGradesEntryEmptyState', 'ensureGradesEntrySaveNoticeOverlay');

  assert.match(method, /classList\.add\("is-empty-state"\)/);
  assert.doesNotMatch(method, /classList\.toggle\("is-empty-state", showUnlockButton\)/);
  assert.match(method, /primaryAction === "createCourse" \|\| primaryAction === "manageStudents"/);
  assert.match(method, /class="sidebar-add-btn"[\s\S]*sidebar-add-plus/);
  assert.match(appCss, /\.grades-entry-content\.is-empty-state\s*\{[\s\S]*?min-height:\s*100%/);
});

test('rendering a populated grade entry view clears all empty-state positioning classes', () => {
  const method = extractClassMethod('renderGradesEntryView', 'renderGradesViewWithEntryModeFade');

  assert.match(method, /classList\.remove\("is-empty-state"\)/);
  assert.match(method, /classList\.remove\("has-offset-empty-state"\)/);
  assert.match(method, /"Noch keine Teilnehmenden eingetragen"[\s\S]*primaryAction: "manageStudents"/);
});

test('the grade course overview (Kursansicht) keeps its add-participants button visible and its hint unambiguous for courses without participants', () => {
  const method = extractClassMethod('renderGradesOverview', 'renderGradesEntryEmptyState');

  assert.match(method, /hasGradeParticipants\(students\)/);
  assert.match(method, /"Keine Teilnehmer zugeordnet"[\s\S]*keine Teilnehmer zugeordnet[\s\S]*primaryAction: "manageStudents"/);
  assert.match(appCss, /\.grades-subview-panel\.is-offset-empty-state[\s\S]*?\{[\s\S]*?min-height:\s*100%/);
});

test('setGradesOverviewEmptyState always reveals the overview panel and empty-state box, so every caller (including the "course still loading" placeholder) shows something instead of a blank screen', () => {
  const method = extractClassMethod('setGradesOverviewEmptyState', 'renderGradesOverview');
  const setGradesOverviewEmptyState = Function(`"use strict"; return ({${method}}).setGradesOverviewEmptyState;`)();

  function makeEl(initialHidden) {
    return {
      hidden: initialHidden,
      dataset: {},
      classList: { toggle() {}, add() {}, remove() {} },
      setAttribute() {},
      querySelector(selector) {
        if (selector === 'h3') return this._h3 || (this._h3 = { textContent: '' });
        if (selector === 'p') return this._p || (this._p = { textContent: '' });
        if (selector === '.button-row') return this._buttonRow || (this._buttonRow = makeEl(false));
        return null;
      },
    };
  }

  const gradesEmptyState = makeEl(true);
  const gradesOverviewPanel = makeEl(false);
  const gradesBookPanel = makeEl(true);
  const gradesEmptyOpenDialog = makeEl(true);
  const gradesEmptyUnlock = makeEl(true);

  const harness = {
    refs: { gradesEmptyState, gradesOverviewPanel, gradesBookPanel, gradesEmptyOpenDialog, gradesEmptyUnlock },
    locked: false,
    hasGradeVaultUnlockConfig() { return true; },
  };

  setGradesOverviewEmptyState.call(harness, 'Notenkurs wird geladen', '');

  assert.equal(gradesEmptyState.hidden, false, 'the empty-state box must become visible');
  assert.equal(gradesOverviewPanel.hidden, false, 'the overview panel must become visible');
  assert.equal(gradesBookPanel.hidden, true, 'the (empty) book panel must stay hidden');
});

test('.stack-glass spans the full .main-pane grid height instead of collapsing into the unused "auto" header row', () => {
  assert.match(appCss, /\.main-pane\s*\{[\s\S]*?grid-template-rows:\s*auto 1fr/);
  assert.match(appCss, /\.stack-glass\s*\{[\s\S]*?grid-row:\s*1\s*\/\s*-1/);
});
