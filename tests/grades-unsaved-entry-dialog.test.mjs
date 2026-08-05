import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
  'utf8',
);
const appHtml = await readFile(
  new URL('../src/modules/grades/app.html', import.meta.url),
  'utf8',
);

function extractClassMethod(name) {
  const matcher = new RegExp(`\\n  (?:async )?${name}\\(`);
  const match = matcher.exec(appSource);
  assert.ok(match, `method ${name} must exist`);
  const start = match.index + 1;
  const signatureEnd = appSource.indexOf(') {', start);
  assert.ok(signatureEnd > start, `method ${name} must have a body`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`method ${name} is incomplete`);
}

const methods = Function(
  `"use strict"; return ({${[
    '_resolveMessageDialog',
    'resolveUnsavedGradesEntryNavigation',
  ].map(extractClassMethod).join(',\n')}});`,
)();

test('choice dialogs resolve save, cancel, and discard actions distinctly', () => {
  for (const [action, expected] of [
    ['ok', 'ok'],
    ['cancel', 'cancel'],
    ['discard', 'discard'],
  ]) {
    let result = null;
    const harness = {
      pendingMessageDialogResolver(value) {
        result = value;
      },
      pendingMessageDialogMode: 'choice',
      refs: { messageDialog: {}, messageDialogInput: { value: '' } },
      closeDialog() {},
    };

    methods._resolveMessageDialog.call(harness, action);
    assert.equal(result, expected);
  }
});

test('unsaved entry navigation saves, cancels, or discards based on the selected action', async () => {
  for (const [choice, expected] of [
    ['ok', { result: true, saves: 1, discards: 0 }],
    ['cancel', { result: false, saves: 0, discards: 0 }],
    ['discard', { result: true, saves: 0, discards: 1 }],
  ]) {
    let saves = 0;
    let discards = 0;
    const harness = {
      gradesEntryDraftDirty: true,
      selectedGradesEntryAssessmentId: 7,
      selectedCourseId: 3,
      gradesEntryDraft: { courseId: 3 },
      async showChoiceMessage() {
        return choice;
      },
      async saveCurrentGradesEntry() {
        saves += 1;
        return true;
      },
      discardGradesEntryEditSession() {
        discards += 1;
      },
    };

    const result = await methods.resolveUnsavedGradesEntryNavigation.call(harness);
    assert.equal(result, expected.result);
    assert.equal(saves, expected.saves);
    assert.equal(discards, expected.discards);
  }
});

test('the unsaved-entry dialog exposes the requested single-step actions', () => {
  const method = extractClassMethod('resolveUnsavedGradesEntryNavigation');

  assert.match(method, /showChoiceMessage\(/);
  assert.match(method, /okText: "Speichern"/);
  assert.match(method, /cancelText: "Abbrechen"/);
  assert.match(method, /alternateText: "Verwerfen & Wechseln"/);
  assert.doesNotMatch(method, /Weitere Optionen|shouldDiscard/);
  assert.match(
    appHtml,
    /id="message-dialog-cancel-top"[^>]*>❌<\/button>[\s\S]*id="message-dialog-ok-top"[^>]*>💾<\/button>[\s\S]*id="message-dialog-discard-top"[^>]*>🗑️<\/button>/,
  );
  assert.doesNotMatch(appHtml, /message-dialog-alternate/);
  assert.match(appSource, /this\._resolveMessageDialog\("discard"\)/);
  assert.match(appSource, /this\.refs\.messageDialogActionsBottom\.hidden = usesTopActions/);
  assert.match(appSource, /isChoice\s*\? this\.refs\.messageDialogOkTop/);
  assert.match(appSource, /document\.__teachhelperAppTooltipsController\?\.hide\?\.\(\)/);
});

test('the synchronous navigation guard does not open a second unsaved-changes dialog', () => {
  const guard = extractClassMethod('guardUnsavedGradesEntryNavigation');

  assert.doesNotMatch(guard, /showInfoMessage|Ungespeicherte Änderungen/);
});
